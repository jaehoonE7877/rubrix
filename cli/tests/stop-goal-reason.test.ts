import { describe, expect, it } from "vitest";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { handleStop } from "../src/hooks/handlers.ts";
import type { RubrixContract } from "../src/core/contract.ts";

function tmpContract(c: RubrixContract): { dir: string; path: string } {
  const dir = mkdtempSync(join(tmpdir(), "rubrix-stop-goal-"));
  const path = join(dir, "rubrix.json");
  writeFileSync(path, JSON.stringify(c), "utf8");
  return { dir, path };
}

function failedContract(opts: { withGoal: boolean }): RubrixContract {
  const c: RubrixContract = {
    version: "0.1.0",
    intent: { summary: "x" },
    rubric: { threshold: 0.5, criteria: [{ id: "c", description: "d", weight: 1 }] },
    matrix: { rows: [{ id: "r", criterion: "c", evidence_required: "e" }] },
    plan: { steps: [{ id: "s", action: "a" }] },
    state: "Failed",
    locks: { rubric: true, matrix: true, plan: true },
    scores: [{ criterion: "c", score: 0.1 }],
  };
  if (opts.withGoal) {
    c.goal = {
      condition: "Run `rubrix gate rubrix.json --json` and check overall_pass: true and state: \"Passed\".",
      max_chars: 4000,
    };
  }
  return c;
}

describe("handleStop /goal-aware reason", () => {
  it("blocks Failed without a /goal — reason carries no /goal mention", () => {
    const { dir, path } = tmpContract(failedContract({ withGoal: false }));
    const r = handleStop({ cwd: dir, contract_path: path });
    expect(r.decision).toBe("block");
    expect(r.reason).toContain("iterate");
    expect(r.reason).not.toContain("/goal");
  });

  it("blocks Failed WITH a /goal — reason mentions /goal evaluator auto-iteration", () => {
    const { dir, path } = tmpContract(failedContract({ withGoal: true }));
    const r = handleStop({ cwd: dir, contract_path: path });
    expect(r.decision).toBe("block");
    expect(r.reason).toContain("iterate");
    expect(r.reason).toContain("/goal");
    expect(r.reason).toContain("overall_pass: false");
    expect(r.reason).toContain("auto-trigger");
  });

  it("does not block on Passed regardless of /goal", () => {
    const passed: RubrixContract = {
      ...failedContract({ withGoal: true }),
      state: "Passed",
      scores: [{ criterion: "c", score: 0.9 }],
    };
    const { dir, path } = tmpContract(passed);
    const r = handleStop({ cwd: dir, contract_path: path });
    expect(r.decision).toBeUndefined();
  });

  it("does not block when contract is missing", () => {
    const r = handleStop({ cwd: "/tmp", contract_path: "/tmp/does-not-exist-rubrix.json" });
    expect(r.decision).toBeUndefined();
  });
});
