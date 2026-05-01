import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { ContractError, loadContract, type ArtifactKey, type RubrixContract } from "../core/contract.ts";
import type { State } from "../core/state.ts";
import { isBriefSkipEnv, isCalibrated } from "../core/brief.ts";
import { firstClarityViolation, recoveryCliPrefixForEnv } from "../core/clarity-gate.ts";
import { isV12Plus } from "../core/version.ts";

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
const READ_ONLY_TOOLS = new Set(["Read", "Glob", "Grep", "LS", "NotebookRead"]);
const SCORE_TRIGGERS = new Set(["/score", "score", "/rubrix:score"]);
const RUBRIC_TRIGGERS = new Set(["/rubric", "rubric", "/rubrix:rubric"]);
const RUBRIX_RECOVERY_SUBCMDS = new Set([
  "lock", "report", "validate", "score-clarity",
]);
const BUNDLED_RUBRIX_JS_PATHS = new Set(["cli/bin/rubrix.js", "./cli/bin/rubrix.js"]);

function isBundledRubrixScriptPath(scriptPath: string): boolean {
  const root = process.env.CLAUDE_PLUGIN_ROOT;
  if (root) {
    const expected = root.replace(/\/+$/, "") + "/cli/bin/rubrix.js";
    return scriptPath === expected;
  }
  return BUNDLED_RUBRIX_JS_PATHS.has(scriptPath);
}

const PLUGIN_ROOT_VAR = "CLAUDE_PLUGIN_ROOT";

function tryExpandPluginRoot(cmd: string, dollarIdx: number): { value: string; advance: number } | null {
  if (cmd.slice(dollarIdx + 1, dollarIdx + 1 + PLUGIN_ROOT_VAR.length) !== PLUGIN_ROOT_VAR) return null;
  const after = cmd[dollarIdx + 1 + PLUGIN_ROOT_VAR.length];
  if (after !== undefined && !/[\/"\s]/.test(after)) return null;
  const root = process.env[PLUGIN_ROOT_VAR];
  if (!root) return null;
  return { value: root.replace(/\/+$/, ""), advance: PLUGIN_ROOT_VAR.length };
}

function tokenizeShellSafe(cmd: string): string[] | null {
  const tokens: string[] = [];
  let cur = "";
  let inSingle = false;
  let inDouble = false;
  let hasContent = false;
  for (let i = 0; i < cmd.length; i++) {
    const ch = cmd[i] as string;
    if (inSingle) {
      if (ch === "'") { inSingle = false; continue; }
      cur += ch;
      hasContent = true;
      continue;
    }
    if (inDouble) {
      if (ch === '"') { inDouble = false; continue; }
      if (ch === "\\" && i + 1 < cmd.length) {
        const next = cmd[i + 1] as string;
        if (next === "\n" || next === "\r") return null;
        cur += next;
        i++;
        hasContent = true;
        continue;
      }
      if (ch === "$") {
        const sub = tryExpandPluginRoot(cmd, i);
        if (!sub) return null;
        cur += sub.value;
        i += sub.advance;
        hasContent = true;
        continue;
      }
      if (ch === "`") return null;
      cur += ch;
      hasContent = true;
      continue;
    }
    if (ch === "'") { inSingle = true; hasContent = true; continue; }
    if (ch === '"') { inDouble = true; hasContent = true; continue; }
    if (ch === "\\") {
      if (i + 1 >= cmd.length) return null;
      const next = cmd[i + 1] as string;
      if (next === "\n" || next === "\r") return null;
      cur += next;
      hasContent = true;
      i++;
      continue;
    }
    if (ch === "$") {
      const sub = tryExpandPluginRoot(cmd, i);
      if (!sub) return null;
      cur += sub.value;
      i += sub.advance;
      hasContent = true;
      continue;
    }
    if (ch === "`" || ch === "{" || ch === "}" || ch === "~" || ch === "*" || ch === "?" || ch === "[" || ch === "]") return null;
    if (ch === ";" || ch === "&" || ch === "|" || ch === "<" || ch === ">" || ch === "\n" || ch === "\r") return null;
    if (ch === " " || ch === "\t") {
      if (hasContent) { tokens.push(cur); cur = ""; hasContent = false; }
      continue;
    }
    cur += ch;
    hasContent = true;
  }
  if (inSingle || inDouble) return null;
  if (hasContent) tokens.push(cur);
  return tokens;
}

const SAFE_ENV_PREFIX = "RUBRIX_SKIP_BRIEF=1";

function isRubrixRecoveryBash(input: HookInput): boolean {
  if (input.tool_name !== "Bash") return false;
  const ti = input.tool_input as Record<string, unknown> | undefined;
  const raw = typeof ti?.command === "string" ? ti.command.trim() : "";
  if (!raw) return false;
  const tokens = tokenizeShellSafe(raw);
  if (!tokens || tokens.length < 2) return false;
  const argv = tokens[0] === SAFE_ENV_PREFIX ? tokens.slice(1) : tokens;
  if (argv.length < 2) return false;
  if (/^[A-Z_][A-Z0-9_]*=/.test(argv[0] as string)) return false;
  if (argv[0] !== "node" || argv.length < 3) return false;
  const scriptPath = argv[1] as string;
  if (!isBundledRubrixScriptPath(scriptPath)) return false;
  const subCmdIdx = 2;
  const sub = argv[subCmdIdx];
  if (typeof sub !== "string") return false;
  if (sub === "state") {
    return argv[subCmdIdx + 1] === "set" && argv[subCmdIdx + 3] === "PlanDrafted";
  }
  if (!RUBRIX_RECOVERY_SUBCMDS.has(sub)) return false;
  for (const arg of argv.slice(subCmdIdx + 1)) {
    if (arg === "--out" || arg.startsWith("--out=")) return false;
  }
  return true;
}

function promptInvokesScore(prompt: string): boolean {
  return promptInvokes(prompt, SCORE_TRIGGERS);
}

function promptInvokesRubric(prompt: string): boolean {
  return promptInvokes(prompt, RUBRIC_TRIGGERS);
}

function promptInvokes(prompt: string, triggers: Set<string>): boolean {
  if (!prompt) return false;
  if (triggers.has(prompt)) return true;
  const head = prompt.split(/\s+/, 1)[0] ?? "";
  return triggers.has(head);
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

function reasonForRubricBlocked(): string {
  return "/rubrix:rubric blocked: intent.brief is not yet calibrated. Run /rubrix:brief first to calibrate intent (or set RUBRIX_SKIP_BRIEF=1).";
}

function reasonForClarityBreach(violation: string): string {
  const cli = recoveryCliPrefixForEnv();
  return `rubrix.json v1.2 clarity invariant breached: ${violation}. Re-lock the offending artifact (run \`${cli} lock <key> <path>\`) or audit a forced lock (\`${cli} lock <key> <path> --force <reason>\`) before continuing.`;
}

function suggestionForBrief(): string {
  return "<rubrix-suggestion>intent.brief is not calibrated yet — run /rubrix:brief before /rubrix:rubric (or export RUBRIX_SKIP_BRIEF=1 to bypass).</rubrix-suggestion>";
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
  let needsBriefHint = false;
  let clarityBreach: string | null = null;
  try {
    const c = loadContract(path);
    ctx = buildLifecycleContext(c.state, c.locks);
    locksPlan = c.locks.plan;
    needsBriefHint = c.state === "IntentDrafted" && !isCalibrated(c) && !isBriefSkipEnv();
    clarityBreach = firstClarityViolation(c);
  } catch {
    return {};
  }
  const prompt = typeof input.prompt === "string" ? input.prompt.trim().toLowerCase() : "";
  if (clarityBreach && (promptInvokesScore(prompt) || promptInvokesRubric(prompt))) {
    return {
      decision: "block",
      reason: reasonForClarityBreach(clarityBreach),
      additionalContext: ctx,
    };
  }
  if (promptInvokesScore(prompt) && locksPlan === false) {
    return {
      decision: "block",
      reason: reasonForScoreBlocked(),
      additionalContext: ctx,
    };
  }
  const suffix = needsBriefHint ? `\n${suggestionForBrief()}` : "";
  return { additionalContext: `${ctx}${suffix}` };
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
  let calibrated = false;
  let contract: RubrixContract;
  try {
    contract = loadContract(path);
    state = contract.state;
    locks = contract.locks;
    calibrated = isCalibrated(contract);
  } catch (e) {
    return { decision: "block", reason: `rubrix.json invalid: ${e instanceof Error ? e.message : String(e)}` };
  }
  const ctx = buildLifecycleContext(state, locks);
  const tool = typeof input.tool_name === "string" ? input.tool_name : "";
  const prompt = typeof input.prompt === "string" ? input.prompt.trim().toLowerCase() : "";
  const isCodeEdit = CODE_EDITING_TOOLS.has(tool);
  const editingContractItself = isCodeEdit && targetsContract(input, path);
  const violation = firstClarityViolation(contract);
  if (violation !== null) {
    const isReadOnlyTool = READ_ONLY_TOOLS.has(tool);
    const isRecoveryBash = isRubrixRecoveryBash(input);
    const isExemptFromBreachGate = editingContractItself || isReadOnlyTool || isRecoveryBash;
    const triggersGatedSkill = !isCodeEdit && (promptInvokesRubric(prompt) || promptInvokesScore(prompt));
    if (!isExemptFromBreachGate || triggersGatedSkill) {
      return { decision: "block", reason: reasonForClarityBreach(violation), additionalContext: ctx };
    }
  }
  if (!isCodeEdit && promptInvokesRubric(prompt)) {
    if (!calibrated && !isBriefSkipEnv()) {
      return { decision: "block", reason: reasonForRubricBlocked(), additionalContext: ctx };
    }
    return { decision: "allow" };
  }
  if (!isCodeEdit && promptInvokesScore(prompt)) {
    if (!locks.plan) {
      return { decision: "block", reason: reasonForScoreBlocked(), additionalContext: ctx };
    }
    return { decision: "allow" };
  }
  if (isCodeEdit) {
    if (editingContractItself) {
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

const DEDUCTION_PATTERN = /\[(vague_description|missing_evidence|unmeasurable_floor|dangling_reference|uncovered_axis)\][^\n]*/g;

export function handlePostToolUse(input: HookInput): HookDecision {
  const path = defaultContractPath(input);
  if (!existsSync(path)) return {};
  let contract: RubrixContract;
  try {
    contract = loadContract(path);
  } catch (e) {
    if (e instanceof ContractError) {
      return { systemMessage: `[rubrix] contract drifted from schema after tool run: ${e.message}` };
    }
    return {};
  }
  const blocks: string[] = [];
  if (isV12Plus(contract)) {
    const lockFailLines = extractLockFailDeductions(input);
    if (lockFailLines.length > 0) {
      blocks.push(
        `<rubrix-suggestion>v1.2 lock refused — clarity below threshold. Address each deduction or audit a forced lock with \`${recoveryCliPrefixForEnv()} lock <key> <path> --force "<reason>"\`:\n${lockFailLines
          .map((l) => `  - ${l}`)
          .join("\n")}\n</rubrix-suggestion>`,
      );
    }
    const forced = listForcedArtifacts(contract);
    if (forced.length > 0) {
      blocks.push(
        `<rubrix-suggestion>${forced.length} forced lock${forced.length > 1 ? "s" : ""} on this contract (${forced.join(", ")}). Review with \`${recoveryCliPrefixForEnv()} report <path>\` before /rubrix:score; the audit trail is at c.<key>.clarity.{forced,forced_at,force_reason}.</rubrix-suggestion>`,
      );
    }
  }
  if (blocks.length === 0) return {};
  return { additionalContext: blocks.join("\n") };
}

function extractLockFailDeductions(input: HookInput): string[] {
  const tool = typeof input.tool_name === "string" ? input.tool_name : "";
  if (tool !== "Bash") return [];
  const ti = input.tool_input as Record<string, unknown> | undefined;
  const cmd = typeof ti?.command === "string" ? ti.command : "";
  if (!cmd.includes("rubrix") || !/\block\b/.test(cmd)) return [];
  const tr = (input as Record<string, unknown>).tool_response;
  const stderr = collectStderr(tr);
  if (!stderr) return [];
  if (!stderr.includes("below threshold")) return [];
  const out: string[] = [];
  let match: RegExpExecArray | null;
  DEDUCTION_PATTERN.lastIndex = 0;
  while ((match = DEDUCTION_PATTERN.exec(stderr)) !== null) {
    out.push(match[0].trim());
  }
  return out;
}

function collectStderr(tr: unknown): string | null {
  if (typeof tr === "string") return tr;
  if (tr === null || typeof tr !== "object") return null;
  const obj = tr as Record<string, unknown>;
  for (const field of ["stderr", "error", "output", "content"]) {
    const v = obj[field];
    if (typeof v === "string") return v;
  }
  return null;
}

function listForcedArtifacts(c: RubrixContract): ArtifactKey[] {
  const out: ArtifactKey[] = [];
  const keys: ArtifactKey[] = ["rubric", "matrix", "plan"];
  for (const k of keys) if (c[k]?.clarity?.forced === true) out.push(k);
  return out;
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
