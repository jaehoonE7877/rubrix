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
}

async function readStdin(): Promise<string> {
  if (process.stdin.isTTY) return "";
  let data = "";
  for await (const chunk of process.stdin) {
    data += typeof chunk === "string" ? chunk : Buffer.from(chunk).toString("utf8");
  }
  return data;
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

function emitForEvent(event: HookEvent, decision: HookDecision): number {
  switch (event) {
    case "PreToolUse":
      return emitPreToolUse(decision);
    case "Stop":
      return emitStop(decision);
    case "SessionStart":
    case "UserPromptExpansion":
    case "PostToolUse":
    case "PostToolBatch":
    case "SubagentStop":
      return emitContextOnly(decision);
  }
}

export async function hookCommand(opts: HookOptions): Promise<number> {
  if (!isHookEvent(opts.event)) {
    const reason = `unknown hook event: ${opts.event} (expected one of ${HOOK_EVENTS.join(", ")})`;
    process.stderr.write(reason + "\n");
    return 2;
  }
  const event = opts.event as HookEvent;
  const raw = await readStdin();
  const parsed = parseInput(raw);
  if (!parsed.ok) {
    const reason = `rubrix hook ${event}: ${parsed.error}`;
    process.stderr.write(reason + "\n");
    return 2;
  }
  const decision = dispatch(event, parsed.input ?? {});
  return emitForEvent(event, decision);
}
