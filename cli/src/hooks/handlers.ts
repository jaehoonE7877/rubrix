import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { ContractError, loadContract } from "../core/contract.ts";
import type { State } from "../core/state.ts";

export type HookEvent =
  | "SessionStart"
  | "UserPromptExpansion"
  | "PreToolUse"
  | "PostToolUse"
  | "PostToolBatch"
  | "SubagentStop"
  | "Stop";

export const HOOK_EVENTS: ReadonlyArray<HookEvent> = [
  "SessionStart",
  "UserPromptExpansion",
  "PreToolUse",
  "PostToolUse",
  "PostToolBatch",
  "SubagentStop",
  "Stop",
];

export function isHookEvent(value: string): value is HookEvent {
  return (HOOK_EVENTS as ReadonlyArray<string>).includes(value);
}

export interface HookInput {
  cwd?: string;
  contract_path?: string;
  tool_name?: string;
  tool_input?: Record<string, unknown>;
  prompt?: string;
  subagent_name?: string;
  [key: string]: unknown;
}

export interface HookDecision {
  decision?: "allow" | "block";
  reason?: string;
  systemMessage?: string;
  additionalContext?: string;
}

const CODE_EDITING_TOOLS = new Set(["Edit", "Write", "MultiEdit", "NotebookEdit"]);
const SCORE_TRIGGERS = new Set(["/score", "score", "/rubrix:score"]);

function promptInvokesScore(prompt: string): boolean {
  if (!prompt) return false;
  if (SCORE_TRIGGERS.has(prompt)) return true;
  const head = prompt.split(/\s+/, 1)[0] ?? "";
  return SCORE_TRIGGERS.has(head);
}

function defaultContractPath(input: HookInput): string {
  const cwd = input.cwd && typeof input.cwd === "string" ? input.cwd : process.cwd();
  return input.contract_path && typeof input.contract_path === "string"
    ? resolve(cwd, input.contract_path)
    : resolve(cwd, "rubrix.json");
}

// --- v1.0.1: humane lifecycle messages (RUB-5) ---

type LockKey = "rubric" | "matrix" | "plan";
type Locks = { rubric: boolean; matrix: boolean; plan: boolean };

const LOCK_ORDER: ReadonlyArray<LockKey> = ["rubric", "matrix", "plan"];

const SKILL_FOR_LOCK: Readonly<Record<LockKey, string>> = {
  rubric: "/rubrix:rubric",
  matrix: "/rubrix:matrix",
  plan: "/rubrix:plan",
};

/** First lock that has not been acquired yet, in rubric → matrix → plan order. */
function nextMissingLock(locks: Locks): LockKey | null {
  for (const k of LOCK_ORDER) if (!locks[k]) return k;
  return null;
}

/**
 * Build the shared lifecycle context block.
 * Three lines: state, lock chart with ✅/❌ and ← next marker, next skill.
 * Used as `additionalContext` on every PreToolUse / UserPromptExpansion path.
 */
export function buildLifecycleContext(state: State, locks: Locks): string {
  const next = nextMissingLock(locks);
  const cell = (k: LockKey) => {
    const mark = locks[k] ? "✅" : "❌";
    return next === k ? `${k} ${mark} ← next` : `${k} ${mark}`;
  };
  const nextLine = next ? SKILL_FOR_LOCK[next] : "(all locked — proceed)";
  return [
    `[rubrix] state=${state}`,
    `locks: ${cell("rubric")}  ${cell("matrix")}  ${cell("plan")}`,
    `next: ${nextLine}`,
  ].join("\n");
}

function reasonForToolBlocked(tool: string, missing: LockKey): string {
  return `${tool} blocked: ${missing} is not yet locked. Run ${SKILL_FOR_LOCK[missing]} and lock it before editing.`;
}

function reasonForScoreBlocked(): string {
  return `/rubrix:score blocked: plan is not yet locked. Run /rubrix:plan and lock it before scoring.`;
}

export function handleSessionStart(input: HookInput): HookDecision {
  const path = defaultContractPath(input);
  if (!existsSync(path)) {
    return { systemMessage: `[rubrix] no rubrix.json at ${path}; run /rubric to bootstrap.` };
  }
  try {
    const c = loadContract(path);
    return {
      systemMessage: `[rubrix] state=${c.state} locks=rubric:${c.locks.rubric} matrix:${c.locks.matrix} plan:${c.locks.plan}`,
    };
  } catch (e) {
    return {
      systemMessage: `[rubrix] failed to read contract at ${path}: ${e instanceof Error ? e.message : String(e)}`,
    };
  }
}

export function handleUserPromptExpansion(input: HookInput): HookDecision {
  const path = defaultContractPath(input);
  if (!existsSync(path)) return {};
  let ctx = "";
  let locksPlan: boolean | null = null;
  try {
    const c = loadContract(path);
    ctx = buildLifecycleContext(c.state, c.locks);
    locksPlan = c.locks.plan;
  } catch {
    return {};
  }
  const prompt = typeof input.prompt === "string" ? input.prompt.trim().toLowerCase() : "";
  if (promptInvokesScore(prompt) && locksPlan === false) {
    return {
      decision: "block",
      reason: reasonForScoreBlocked(),
      additionalContext: ctx,
    };
  }
  return { additionalContext: ctx };
}

function targetsContract(input: HookInput, contractPath: string): boolean {
  const ti = input.tool_input;
  if (!ti || typeof ti !== "object") return false;
  const candidate = (ti as Record<string, unknown>).file_path ?? (ti as Record<string, unknown>).path;
  if (typeof candidate !== "string") return false;
  const cwd = typeof input.cwd === "string" ? input.cwd : process.cwd();
  return resolve(cwd, candidate) === resolve(contractPath);
}

export function handlePreToolUse(input: HookInput): HookDecision {
  const path = defaultContractPath(input);
  if (!existsSync(path)) return { decision: "allow" };
  let state: State;
  let locks: Locks;
  try {
    const c = loadContract(path);
    state = c.state;
    locks = c.locks;
  } catch (e) {
    return { decision: "block", reason: `rubrix.json invalid: ${e instanceof Error ? e.message : String(e)}` };
  }
  const ctx = buildLifecycleContext(state, locks);
  const tool = typeof input.tool_name === "string" ? input.tool_name : "";
  const prompt = typeof input.prompt === "string" ? input.prompt.trim().toLowerCase() : "";
  if (promptInvokesScore(prompt)) {
    if (!locks.plan) {
      return { decision: "block", reason: reasonForScoreBlocked(), additionalContext: ctx };
    }
    return { decision: "allow" };
  }
  if (CODE_EDITING_TOOLS.has(tool)) {
    if (targetsContract(input, path)) {
      return { decision: "allow", reason: "editing rubrix.json contract itself is exempt from code-edit gate" };
    }
    if (!locks.rubric) {
      return { decision: "block", reason: reasonForToolBlocked(tool, "rubric"), additionalContext: ctx };
    }
    if (!locks.matrix) {
      return { decision: "block", reason: reasonForToolBlocked(tool, "matrix"), additionalContext: ctx };
    }
    if (!locks.plan) {
      return { decision: "block", reason: reasonForToolBlocked(tool, "plan"), additionalContext: ctx };
    }
  }
  return { decision: "allow" };
}

export function handlePostToolUse(input: HookInput): HookDecision {
  const path = defaultContractPath(input);
  if (!existsSync(path)) return {};
  try {
    loadContract(path);
    return {};
  } catch (e) {
    if (e instanceof ContractError) {
      return { systemMessage: `[rubrix] contract drifted from schema after tool run: ${e.message}` };
    }
    return {};
  }
}

export function handlePostToolBatch(_input: HookInput): HookDecision {
  return {};
}

export function handleSubagentStop(_input: HookInput): HookDecision {
  return {};
}

export function handleStop(input: HookInput): HookDecision {
  const path = defaultContractPath(input);
  if (!existsSync(path)) return {};
  try {
    const c = loadContract(path);
    if (c.state === "Failed") {
      return { decision: "block", reason: "rubrix gate failed; iterate (revise plan and re-score) instead of stopping" };
    }
    return {};
  } catch {
    return {};
  }
}

export function dispatch(event: HookEvent, input: HookInput): HookDecision {
  switch (event) {
    case "SessionStart":
      return handleSessionStart(input);
    case "UserPromptExpansion":
      return handleUserPromptExpansion(input);
    case "PreToolUse":
      return handlePreToolUse(input);
    case "PostToolUse":
      return handlePostToolUse(input);
    case "PostToolBatch":
      return handlePostToolBatch(input);
    case "SubagentStop":
      return handleSubagentStop(input);
    case "Stop":
      return handleStop(input);
  }
}
