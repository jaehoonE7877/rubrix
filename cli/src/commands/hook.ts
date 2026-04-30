import {
  dispatch,
  isHookEvent,
  HOOK_EVENTS,
  type HookDecision,
  type HookEvent,
  type HookInput,
} from "../hooks/handlers.ts";

export interface HookOptions {
  event: string;
  /** Override the stdin read timeout (ms). Tests should pass a short value. */
  readTimeoutMs?: number;
}

/**
 * Default stdin read timeout (RUB-6).
 *
 * Hooks read JSON payloads from stdin. If the upstream caller (Claude Code,
 * a CI wrapper, etc.) never closes stdin, the for-await loop hangs forever —
 * and a hung hook stalls the user's session. 5 seconds is a generous safety-net
 * (normal hooks complete in tens of ms) and lands well inside Claude Code's
 * default 60s hook timeout, so we surface a graceful, message-controlled exit
 * before Claude Code force-kills us.
 */
export const DEFAULT_READ_TIMEOUT_MS = 5_000;

export class HookTimeoutError extends Error {
  constructor(public readonly timeoutMs: number) {
    super(`stdin read timed out after ${timeoutMs}ms`);
    this.name = "HookTimeoutError";
  }
}

async function readAllStdin(): Promise<string> {
  let data = "";
  for await (const chunk of process.stdin) {
    data += typeof chunk === "string" ? chunk : Buffer.from(chunk).toString("utf8");
  }
  return data;
}

async function readStdin(timeoutMs: number): Promise<string> {
  if (process.stdin.isTTY) return "";
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      readAllStdin(),
      new Promise<string>((_, reject) => {
        timer = setTimeout(() => reject(new HookTimeoutError(timeoutMs)), timeoutMs);
        // Don't keep the event loop alive solely for this timer — the for-await
        // on stdin keeps the loop alive on its own when actually hanging.
        if (typeof (timer as { unref?: () => void }).unref === "function") {
          (timer as { unref: () => void }).unref();
        }
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

interface ParseResult {
  ok: boolean;
  input?: HookInput;
  error?: string;
}

function parseInput(raw: string): ParseResult {
  const trimmed = raw.trim();
  if (!trimmed) return { ok: true, input: {} };
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch (e) {
    return { ok: false, error: `stdin is not valid JSON: ${e instanceof Error ? e.message : String(e)}` };
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { ok: false, error: "stdin must be a JSON object" };
  }
  return { ok: true, input: parsed as HookInput };
}

function emit(payload: unknown): void {
  process.stdout.write(JSON.stringify(payload) + "\n");
}

export function emitPreToolUse(decision: HookDecision): number {
  const verdict = decision.decision === "block" ? "deny" : "allow";
  const payload: Record<string, unknown> = {
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: verdict,
    },
  };
  if (decision.reason) {
    (payload.hookSpecificOutput as Record<string, unknown>).permissionDecisionReason = decision.reason;
  }
  if (decision.additionalContext) {
    (payload.hookSpecificOutput as Record<string, unknown>).additionalContext = decision.additionalContext;
  }
  emit(payload);
  return 0;
}

export function emitContextOnly(decision: HookDecision): number {
  const payload: Record<string, unknown> = {};
  if (decision.systemMessage) payload.systemMessage = decision.systemMessage;
  if (decision.additionalContext) payload.additionalContext = decision.additionalContext;
  emit(payload);
  return 0;
}

export function emitStop(decision: HookDecision): number {
  if (decision.decision === "block") {
    const reason = decision.reason ?? "rubrix Stop hook blocked exit";
    process.stderr.write(reason + "\n");
    return 2;
  }
  return 0;
}

export function emitUserPromptExpansion(decision: HookDecision): number {
  if (decision.decision === "block") {
    const reason = decision.reason ?? "rubrix UserPromptExpansion hook blocked prompt";
    process.stderr.write(reason + "\n");
    if (decision.additionalContext) {
      process.stderr.write(decision.additionalContext + "\n");
    }
    return 2;
  }
  return emitContextOnly(decision);
}

function emitForEvent(event: HookEvent, decision: HookDecision): number {
  switch (event) {
    case "PreToolUse":
      return emitPreToolUse(decision);
    case "Stop":
      return emitStop(decision);
    case "UserPromptExpansion":
      return emitUserPromptExpansion(decision);
    case "SessionStart":
    case "PostToolUse":
    case "PostToolBatch":
    case "SubagentStop":
      return emitContextOnly(decision);
  }
}

/**
 * Event-specific fail-mode for stdin timeouts (RUB-6).
 *
 * - PreToolUse / Stop are lifecycle gates — fail-CLOSED so the gate isn't
 *   bypassed by a stuck stdin.
 * - UserPromptExpansion / SessionStart / PostToolUse / PostToolBatch /
 *   SubagentStop are informational — fail-OPEN with a stderr warning so a
 *   slow hook doesn't lock the user out of the session.
 */
function emitTimeoutFailure(event: HookEvent, err: HookTimeoutError): number {
  switch (event) {
    case "PreToolUse":
      return emitPreToolUse({
        decision: "block",
        reason: `rubrix hook stdin timeout (${err.timeoutMs}ms) — refusing tool to preserve lifecycle gate`,
      });
    case "Stop":
      return emitStop({
        decision: "block",
        reason: `rubrix Stop hook stdin timeout (${err.timeoutMs}ms) — blocking to force iteration`,
      });
    case "UserPromptExpansion":
    case "SessionStart":
    case "PostToolUse":
    case "PostToolBatch":
    case "SubagentStop":
      process.stderr.write(
        `[rubrix] hook ${event} stdin timeout (${err.timeoutMs}ms) — proceeding without contract context\n`,
      );
      return 0;
  }
}

export async function hookCommand(opts: HookOptions): Promise<number> {
  if (!isHookEvent(opts.event)) {
    const reason = `unknown hook event: ${opts.event} (expected one of ${HOOK_EVENTS.join(", ")})`;
    process.stderr.write(reason + "\n");
    return 2;
  }
  const event = opts.event as HookEvent;
  const timeoutMs = opts.readTimeoutMs ?? DEFAULT_READ_TIMEOUT_MS;
  let raw: string;
  try {
    raw = await readStdin(timeoutMs);
  } catch (e) {
    if (e instanceof HookTimeoutError) {
      return emitTimeoutFailure(event, e);
    }
    throw e;
  }
  const parsed = parseInput(raw);
  if (!parsed.ok) {
    const reason = `rubrix hook ${event}: ${parsed.error}`;
    process.stderr.write(reason + "\n");
    return 2;
  }
  const decision = dispatch(event, parsed.input ?? {});
  return emitForEvent(event, decision);
}
