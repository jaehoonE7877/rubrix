import { describe, expect, it } from "vitest";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  HOOK_EVENTS,
  dispatch,
  handlePreToolUse,
  handleSessionStart,
  handleStop,
  isHookEvent,
} from "../src/hooks/handlers.ts";
import type { RubrixContract } from "../src/core/contract.ts";

function tmpContract(c: RubrixContract): { dir: string; path: string } {
  const dir = mkdtempSync(join(tmpdir(), "rubrix-hook-"));
  const path = join(dir, "rubrix.json");
  writeFileSync(path, JSON.stringify(c), "utf8");
  return { dir, path };
}

function intentDrafted(): RubrixContract {
  return {
    version: "0.1.0",
    intent: { summary: "x" },
    state: "IntentDrafted",
    locks: { rubric: false, matrix: false, plan: false },
  };
}

function fullyLocked(state: RubrixContract["state"] = "PlanLocked"): RubrixContract {
  return {
    version: "0.1.0",
    intent: { summary: "x" },
    rubric: { threshold: 0.5, criteria: [{ id: "c", description: "d", weight: 1 }] },
    matrix: { rows: [{ id: "r", criterion: "c", evidence_required: "e" }] },
    plan: { steps: [{ id: "s", action: "a" }] },
    state,
    locks: { rubric: true, matrix: true, plan: true },
  };
}

describe("hook event metadata", () => {
  it("HOOK_EVENTS lists the 7 documented events", () => {
    expect(HOOK_EVENTS).toEqual([
      "SessionStart",
      "UserPromptExpansion",
      "PreToolUse",
      "PostToolUse",
      "PostToolBatch",
      "SubagentStop",
      "Stop",
    ]);
  });

  it("isHookEvent narrows correctly", () => {
    expect(isHookEvent("SessionStart")).toBe(true);
    expect(isHookEvent("Bogus")).toBe(false);
  });
});

describe("PreToolUse blocking", () => {
  it("blocks Edit when locks.rubric=false", () => {
    const { dir, path } = tmpContract(intentDrafted());
    const r = handlePreToolUse({ cwd: dir, contract_path: path, tool_name: "Edit" });
    expect(r.decision).toBe("block");
    expect(r.reason).toContain("locks.rubric=false");
  });

  it("blocks Write when locks.matrix=false (rubric locked)", () => {
    const c = intentDrafted();
    c.rubric = { threshold: 0.5, criteria: [{ id: "c", description: "d", weight: 1 }] };
    c.state = "RubricLocked";
    c.locks = { rubric: true, matrix: false, plan: false };
    const { dir, path } = tmpContract(c);
    const r = handlePreToolUse({ cwd: dir, contract_path: path, tool_name: "Write" });
    expect(r.decision).toBe("block");
    expect(r.reason).toContain("locks.matrix=false");
  });

  it("blocks Edit when plan is not locked, even after rubric+matrix are locked", () => {
    const c = fullyLocked("MatrixLocked");
    c.locks.plan = false;
    const { dir, path } = tmpContract(c);
    const r = handlePreToolUse({ cwd: dir, contract_path: path, tool_name: "Edit" });
    expect(r.decision).toBe("block");
    expect(r.reason).toContain("locks.plan=false");
  });

  it("allows Edit only after all three locks (rubric, matrix, plan) are true", () => {
    const { dir, path } = tmpContract(fullyLocked("PlanLocked"));
    const r = handlePreToolUse({ cwd: dir, contract_path: path, tool_name: "Edit" });
    expect(r.decision).toBe("allow");
  });

  it("blocks /score when plan is not locked", () => {
    const c = fullyLocked("MatrixLocked");
    c.locks.plan = false;
    const { dir, path } = tmpContract(c);
    const r = handlePreToolUse({ cwd: dir, contract_path: path, tool_name: "SlashCommand", prompt: "/score" });
    expect(r.decision).toBe("block");
    expect(r.reason).toContain("locks.plan=false");
  });

  it("allows /score when plan is locked", () => {
    const { dir, path } = tmpContract(fullyLocked("PlanLocked"));
    const r = handlePreToolUse({ cwd: dir, contract_path: path, tool_name: "SlashCommand", prompt: "/score" });
    expect(r.decision).toBe("allow");
  });

  it("allows when rubrix.json is missing", () => {
    const dir = mkdtempSync(join(tmpdir(), "rubrix-hook-empty-"));
    const r = handlePreToolUse({ cwd: dir, tool_name: "Edit" });
    expect(r.decision).toBe("allow");
  });

  it("allows non-editing tools regardless of lock state", () => {
    const { dir, path } = tmpContract(intentDrafted());
    const r = handlePreToolUse({ cwd: dir, contract_path: path, tool_name: "Read" });
    expect(r.decision).toBe("allow");
  });

  it("allows Edit/Write when target file is rubrix.json itself (lock-free contract authoring)", () => {
    const { dir, path } = tmpContract(intentDrafted());
    const r = handlePreToolUse({
      cwd: dir,
      contract_path: path,
      tool_name: "Edit",
      tool_input: { file_path: path },
    });
    expect(r.decision).toBe("allow");
  });

  it("blocks Edit on other files even when target field is set", () => {
    const { dir, path } = tmpContract(intentDrafted());
    const r = handlePreToolUse({
      cwd: dir,
      contract_path: path,
      tool_name: "Edit",
      tool_input: { file_path: join(dir, "src/main.ts") },
    });
    expect(r.decision).toBe("block");
  });
});

describe("SessionStart", () => {
  it("emits a system message with state and locks", () => {
    const { dir, path } = tmpContract(intentDrafted());
    const r = handleSessionStart({ cwd: dir, contract_path: path });
    expect(r.systemMessage).toContain("state=IntentDrafted");
    expect(r.systemMessage).toContain("rubric:false");
  });

  it("nudges to bootstrap when no contract exists", () => {
    const dir = mkdtempSync(join(tmpdir(), "rubrix-hook-nostate-"));
    const r = handleSessionStart({ cwd: dir });
    expect(r.systemMessage).toContain("no rubrix.json");
  });
});

describe("Stop", () => {
  it("blocks Stop when state=Failed (force iteration)", () => {
    const c = fullyLocked("Failed");
    c.scores = [{ criterion: "c", score: 0.1 }];
    const { dir, path } = tmpContract(c);
    const r = handleStop({ cwd: dir, contract_path: path });
    expect(r.decision).toBe("block");
    expect(r.reason).toContain("iterate");
  });

  it("does not block Stop when state=Passed", () => {
    const c = fullyLocked("Passed");
    c.scores = [{ criterion: "c", score: 0.9 }];
    const { dir, path } = tmpContract(c);
    const r = handleStop({ cwd: dir, contract_path: path });
    expect(r.decision).toBeUndefined();
  });
});

describe("dispatch", () => {
  it("routes each event to its handler", () => {
    const { dir, path } = tmpContract(intentDrafted());
    expect(dispatch("SessionStart", { cwd: dir, contract_path: path }).systemMessage).toContain("[rubrix]");
    expect(dispatch("PreToolUse", { cwd: dir, contract_path: path, tool_name: "Edit" }).decision).toBe("block");
    expect(dispatch("PostToolBatch", {}).decision).toBeUndefined();
  });
});

describe("hookCommand stdin contract", () => {
  it("fails closed with block decision on malformed JSON stdin", async () => {
    const { hookCommand } = await import("../src/commands/hook.ts");
    const origIsTTY = (process.stdin as { isTTY?: boolean }).isTTY;
    let stdoutBuf = "";
    let stderrBuf = "";
    const origOut = process.stdout.write.bind(process.stdout);
    const origErr = process.stderr.write.bind(process.stderr);
    process.stdout.write = ((s: string | Uint8Array) => {
      stdoutBuf += typeof s === "string" ? s : Buffer.from(s).toString();
      return true;
    }) as typeof process.stdout.write;
    process.stderr.write = ((s: string | Uint8Array) => {
      stderrBuf += typeof s === "string" ? s : Buffer.from(s).toString();
      return true;
    }) as typeof process.stderr.write;
    (process.stdin as { isTTY?: boolean }).isTTY = false;
    const origRead = (process.stdin as unknown as { [Symbol.asyncIterator]: () => AsyncIterator<string> })[Symbol.asyncIterator];
    (process.stdin as unknown as { [Symbol.asyncIterator]: () => AsyncIterator<string> })[Symbol.asyncIterator] = async function* () {
      yield "{not valid json";
    };
    try {
      const code = await hookCommand({ event: "PreToolUse" });
      expect(code).toBe(2);
      expect(stdoutBuf).toBe("");
      expect(stderrBuf).toContain("not valid JSON");
    } finally {
      process.stdout.write = origOut;
      process.stderr.write = origErr;
      (process.stdin as { isTTY?: boolean }).isTTY = origIsTTY;
      (process.stdin as unknown as { [Symbol.asyncIterator]: () => AsyncIterator<string> })[Symbol.asyncIterator] = origRead;
    }
  });

  it("emits a block JSON decision (and stderr) for unknown event names", async () => {
    const { hookCommand } = await import("../src/commands/hook.ts");
    let stdoutBuf = "";
    let stderrBuf = "";
    const origOut = process.stdout.write.bind(process.stdout);
    const origErr = process.stderr.write.bind(process.stderr);
    process.stdout.write = ((s: string | Uint8Array) => {
      stdoutBuf += typeof s === "string" ? s : Buffer.from(s).toString();
      return true;
    }) as typeof process.stdout.write;
    process.stderr.write = ((s: string | Uint8Array) => {
      stderrBuf += typeof s === "string" ? s : Buffer.from(s).toString();
      return true;
    }) as typeof process.stderr.write;
    try {
      const code = await hookCommand({ event: "Bogus" });
      expect(code).toBe(2);
      expect(stdoutBuf).toBe("");
      expect(stderrBuf).toContain("unknown hook event");
    } finally {
      process.stdout.write = origOut;
      process.stderr.write = origErr;
    }
  });
});
