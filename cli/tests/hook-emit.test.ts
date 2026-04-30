import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { hookCommand, emitPreToolUse, emitContextOnly, emitStop, emitUserPromptExpansion } from "../src/commands/hook.ts";
import type { RubrixContract } from "../src/core/contract.ts";

function fullyLocked(state: RubrixContract["state"]): RubrixContract {
  return {
    version: "0.1.0",
    intent: { summary: "test" },
    rubric: { threshold: 0.5, criteria: [{ id: "c1", description: "d", weight: 1 }] },
    matrix: { rows: [{ id: "m1", criterion: "c1", evidence_required: "e" }] },
    plan: { steps: [{ id: "p1", action: "do", covers: ["m1"] }] },
    state,
    locks: { rubric: true, matrix: true, plan: true },
  };
}

function tmpContract(c: RubrixContract): { dir: string; path: string } {
  const dir = mkdtempSync(join(tmpdir(), "rubrix-emit-"));
  const path = join(dir, "rubrix.json");
  writeFileSync(path, JSON.stringify(c, null, 2), "utf8");
  return { dir, path };
}

interface IO {
  stdoutBuf: string;
  stderrBuf: string;
  restore: () => void;
}

function captureIO(): IO {
  const buf = { stdoutBuf: "", stderrBuf: "" };
  const origOut = process.stdout.write.bind(process.stdout);
  const origErr = process.stderr.write.bind(process.stderr);
  process.stdout.write = ((s: string | Uint8Array) => {
    buf.stdoutBuf += typeof s === "string" ? s : Buffer.from(s).toString();
    return true;
  }) as typeof process.stdout.write;
  process.stderr.write = ((s: string | Uint8Array) => {
    buf.stderrBuf += typeof s === "string" ? s : Buffer.from(s).toString();
    return true;
  }) as typeof process.stderr.write;
  return {
    get stdoutBuf() { return buf.stdoutBuf; },
    get stderrBuf() { return buf.stderrBuf; },
    restore: () => {
      process.stdout.write = origOut;
      process.stderr.write = origErr;
    },
  };
}

describe("emitPreToolUse — Claude Code hookSpecificOutput contract", () => {
  let io: IO;
  beforeEach(() => { io = captureIO(); });
  afterEach(() => { io.restore(); });

  it("emits permissionDecision=deny on block, exit 0", () => {
    const code = emitPreToolUse({ decision: "block", reason: "locks.plan=false" });
    expect(code).toBe(0);
    const payload = JSON.parse(io.stdoutBuf.trim());
    expect(payload.hookSpecificOutput.hookEventName).toBe("PreToolUse");
    expect(payload.hookSpecificOutput.permissionDecision).toBe("deny");
    expect(payload.hookSpecificOutput.permissionDecisionReason).toBe("locks.plan=false");
  });

  it("emits permissionDecision=allow on allow, exit 0", () => {
    const code = emitPreToolUse({ decision: "allow" });
    expect(code).toBe(0);
    const payload = JSON.parse(io.stdoutBuf.trim());
    expect(payload.hookSpecificOutput.permissionDecision).toBe("allow");
  });

  it("treats undefined decision as allow", () => {
    const code = emitPreToolUse({});
    expect(code).toBe(0);
    const payload = JSON.parse(io.stdoutBuf.trim());
    expect(payload.hookSpecificOutput.permissionDecision).toBe("allow");
  });

  // RUB-5: additionalContext propagation through emit layer
  it("forwards both permissionDecisionReason and additionalContext on block", () => {
    const code = emitPreToolUse({
      decision: "block",
      reason: "Edit blocked: rubric is not yet locked. Run /rubrix:rubric and lock it before editing.",
      additionalContext: "[rubrix] state=IntentDrafted\nlocks: rubric ❌ ← next  matrix ❌  plan ❌\nnext: /rubrix:rubric",
    });
    expect(code).toBe(0);
    const payload = JSON.parse(io.stdoutBuf.trim());
    expect(payload.hookSpecificOutput.permissionDecisionReason).toContain("rubric is not yet locked");
    expect(payload.hookSpecificOutput.additionalContext).toContain("rubric ❌ ← next");
    expect(payload.hookSpecificOutput.additionalContext).toContain("next: /rubrix:rubric");
  });
});

describe("emitContextOnly — context events", () => {
  let io: IO;
  beforeEach(() => { io = captureIO(); });
  afterEach(() => { io.restore(); });

  it("emits systemMessage when present, exit 0", () => {
    const code = emitContextOnly({ systemMessage: "[rubrix] state=RubricLocked" });
    expect(code).toBe(0);
    const payload = JSON.parse(io.stdoutBuf.trim());
    expect(payload.systemMessage).toContain("RubricLocked");
  });

  it("emits empty payload when nothing to add", () => {
    const code = emitContextOnly({});
    expect(code).toBe(0);
    expect(JSON.parse(io.stdoutBuf.trim())).toEqual({});
  });
});

describe("emitStop — exit-code path", () => {
  let io: IO;
  beforeEach(() => { io = captureIO(); });
  afterEach(() => { io.restore(); });

  it("exits 2 with stderr reason when blocked, stdout stays empty", () => {
    const code = emitStop({ decision: "block", reason: "Failed state, iterate" });
    expect(code).toBe(2);
    expect(io.stdoutBuf).toBe("");
    expect(io.stderrBuf).toContain("Failed state");
  });

  it("exits 0 with empty output when allowed", () => {
    const code = emitStop({});
    expect(code).toBe(0);
    expect(io.stdoutBuf).toBe("");
    expect(io.stderrBuf).toBe("");
  });
});

describe("hookCommand integration — PreToolUse permissionDecision", () => {
  let io: IO;
  let origIsTTY: boolean | undefined;
  let origIter: unknown;

  beforeEach(() => {
    io = captureIO();
    origIsTTY = (process.stdin as { isTTY?: boolean }).isTTY;
    origIter = (process.stdin as unknown as { [Symbol.asyncIterator]: unknown })[Symbol.asyncIterator];
    (process.stdin as { isTTY?: boolean }).isTTY = false;
  });
  afterEach(() => {
    io.restore();
    (process.stdin as { isTTY?: boolean }).isTTY = origIsTTY;
    (process.stdin as unknown as { [Symbol.asyncIterator]: unknown })[Symbol.asyncIterator] = origIter;
  });

  it("blocks Edit on PlanDrafted with permissionDecision=deny", async () => {
    const c = fullyLocked("PlanLocked");
    c.state = "PlanDrafted";
    c.locks.plan = false;
    const { dir, path } = tmpContract(c);
    const stdinPayload = JSON.stringify({ cwd: dir, contract_path: path, tool_name: "Edit" });
    (process.stdin as unknown as { [Symbol.asyncIterator]: () => AsyncIterator<string> })[Symbol.asyncIterator] = async function* () {
      yield stdinPayload;
    };
    const code = await hookCommand({ event: "PreToolUse" });
    expect(code).toBe(0);
    const payload = JSON.parse(io.stdoutBuf.trim());
    expect(payload.hookSpecificOutput.permissionDecision).toBe("deny");
    expect(payload.hookSpecificOutput.permissionDecisionReason).toContain("plan is not yet locked");
    expect(payload.hookSpecificOutput.permissionDecisionReason).toContain("/rubrix:plan");
    // RUB-5: lifecycle additionalContext is forwarded on the wire
    expect(payload.hookSpecificOutput.additionalContext).toContain("plan ❌ ← next");
    expect(payload.hookSpecificOutput.additionalContext).toContain("next: /rubrix:plan");
  });

  it("allows Edit on PlanLocked with permissionDecision=allow", async () => {
    const { dir, path } = tmpContract(fullyLocked("PlanLocked"));
    const stdinPayload = JSON.stringify({ cwd: dir, contract_path: path, tool_name: "Edit" });
    (process.stdin as unknown as { [Symbol.asyncIterator]: () => AsyncIterator<string> })[Symbol.asyncIterator] = async function* () {
      yield stdinPayload;
    };
    const code = await hookCommand({ event: "PreToolUse" });
    expect(code).toBe(0);
    const payload = JSON.parse(io.stdoutBuf.trim());
    expect(payload.hookSpecificOutput.permissionDecision).toBe("allow");
  });
});

describe("emitUserPromptExpansion — block via exit-code path", () => {
  let io: IO;
  beforeEach(() => { io = captureIO(); });
  afterEach(() => { io.restore(); });

  it("exits 2 with stderr reason when blocked, stdout stays empty", () => {
    const code = emitUserPromptExpansion({ decision: "block", reason: "locks.plan=false" });
    expect(code).toBe(2);
    expect(io.stdoutBuf).toBe("");
    expect(io.stderrBuf).toContain("locks.plan=false");
  });

  it("emits additionalContext as JSON when not blocked, exit 0", () => {
    const code = emitUserPromptExpansion({ additionalContext: "[rubrix] state=PlanDrafted" });
    expect(code).toBe(0);
    expect(io.stderrBuf).toBe("");
    const payload = JSON.parse(io.stdoutBuf.trim());
    expect(payload.additionalContext).toContain("PlanDrafted");
  });

  it("emits empty payload when nothing to add", () => {
    const code = emitUserPromptExpansion({});
    expect(code).toBe(0);
    expect(JSON.parse(io.stdoutBuf.trim())).toEqual({});
  });
});

describe("hookCommand integration — UserPromptExpansion blocks /rubrix:score before plan lock", () => {
  let io: IO;
  let origIsTTY: boolean | undefined;
  let origIter: unknown;

  beforeEach(() => {
    io = captureIO();
    origIsTTY = (process.stdin as { isTTY?: boolean }).isTTY;
    origIter = (process.stdin as unknown as { [Symbol.asyncIterator]: unknown })[Symbol.asyncIterator];
    (process.stdin as { isTTY?: boolean }).isTTY = false;
  });
  afterEach(() => {
    io.restore();
    (process.stdin as { isTTY?: boolean }).isTTY = origIsTTY;
    (process.stdin as unknown as { [Symbol.asyncIterator]: unknown })[Symbol.asyncIterator] = origIter;
  });

  it("exits 2 and writes block reason to stderr when /rubrix:score runs before plan lock", async () => {
    const c = fullyLocked("PlanDrafted");
    c.locks.plan = false;
    const { dir, path } = tmpContract(c);
    const stdinPayload = JSON.stringify({ cwd: dir, contract_path: path, prompt: "/rubrix:score" });
    (process.stdin as unknown as { [Symbol.asyncIterator]: () => AsyncIterator<string> })[Symbol.asyncIterator] = async function* () {
      yield stdinPayload;
    };
    const code = await hookCommand({ event: "UserPromptExpansion" });
    expect(code).toBe(2);
    expect(io.stdoutBuf).toBe("");
    expect(io.stderrBuf).toContain("/rubrix:score blocked");
    expect(io.stderrBuf).toContain("plan is not yet locked");
    // additionalContext (lifecycle chart) is also forwarded to stderr on block path (RUB-5)
    expect(io.stderrBuf).toContain("locks: rubric");
    expect(io.stderrBuf).toContain("next:");
  });

  it("exits 0 with state context when /rubrix:score runs after plan lock", async () => {
    const { dir, path } = tmpContract(fullyLocked("PlanLocked"));
    const stdinPayload = JSON.stringify({ cwd: dir, contract_path: path, prompt: "/rubrix:score" });
    (process.stdin as unknown as { [Symbol.asyncIterator]: () => AsyncIterator<string> })[Symbol.asyncIterator] = async function* () {
      yield stdinPayload;
    };
    const code = await hookCommand({ event: "UserPromptExpansion" });
    expect(code).toBe(0);
    expect(io.stderrBuf).toBe("");
    const payload = JSON.parse(io.stdoutBuf.trim());
    expect(payload.additionalContext).toContain("PlanLocked");
  });
});
