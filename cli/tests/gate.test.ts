import { describe, expect, it } from "vitest";
import { readFileSync, writeFileSync } from "node:fs";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { evaluateGate, gateCommand } from "../src/commands/gate.ts";
import type { RubrixContract } from "../src/core/contract.ts";

function scoringContract(scores: Array<{ criterion: string; score: number }>, criteria = [
  { id: "a", description: "d", weight: 0.5, floor: 0.4 },
  { id: "b", description: "d", weight: 0.5 },
]): RubrixContract {
  return {
    version: "0.1.0",
    intent: { summary: "x" },
    rubric: { threshold: 0.7, criteria },
    matrix: { rows: [{ id: "r", criterion: "a", evidence_required: "e" }] },
    plan: { steps: [{ id: "s", action: "a" }] },
    state: "Scoring",
    locks: { rubric: true, matrix: true, plan: true },
    scores,
  };
}

describe("evaluateGate", () => {
  it("passes when total >= threshold and no floor missed", () => {
    const r = evaluateGate(scoringContract([{ criterion: "a", score: 0.8 }, { criterion: "b", score: 0.7 }]));
    expect(r.decision).toBe("pass");
    expect(r.reasons).toEqual([]);
  });

  it("fails when total below threshold", () => {
    const r = evaluateGate(scoringContract([{ criterion: "a", score: 0.5 }, { criterion: "b", score: 0.5 }]));
    expect(r.decision).toBe("fail");
    expect(r.reasons.some((x) => x.includes("below threshold"))).toBe(true);
  });

  it("fails when any criterion below its floor even if total ok", () => {
    const r = evaluateGate(scoringContract([
      { criterion: "a", score: 0.3 },
      { criterion: "b", score: 1.0 },
    ]));
    expect(r.decision).toBe("fail");
    expect(r.reasons.some((x) => x.includes("below floor"))).toBe(true);
  });

  it("fails when a criterion has no score", () => {
    const r = evaluateGate(scoringContract([{ criterion: "a", score: 0.9 }]));
    expect(r.decision).toBe("fail");
    expect(r.reasons.some((x) => x.includes("no score"))).toBe(true);
  });

  it("uses the lowest score when multiple evaluators score the same criterion", () => {
    const r = evaluateGate(scoringContract([
      { criterion: "a", score: 0.9 },
      { criterion: "a", score: 0.3 },
      { criterion: "b", score: 0.9 },
    ]));
    expect(r.decision).toBe("fail");
  });
});

function captureStderr(fn: () => number): { code: number; err: string } {
  const orig = process.stderr.write.bind(process.stderr);
  let buf = "";
  process.stderr.write = ((s: string | Uint8Array) => {
    buf += typeof s === "string" ? s : Buffer.from(s).toString();
    return true;
  }) as typeof process.stderr.write;
  const orig2 = process.stdout.write.bind(process.stdout);
  process.stdout.write = (() => true) as typeof process.stdout.write;
  try {
    const code = fn();
    return { code, err: buf };
  } finally {
    process.stderr.write = orig;
    process.stdout.write = orig2;
  }
}

describe("gateCommand --apply edge cases", () => {
  it("returns exit 4 and skips persistence when contract is incomplete", () => {
    const c: RubrixContract = {
      version: "0.1.0",
      intent: { summary: "x" },
      rubric: { threshold: 0.5, criteria: [{ id: "c", description: "d", weight: 1 }] },
      matrix: { rows: [{ id: "r", criterion: "c", evidence_required: "e" }] },
      plan: { steps: [{ id: "s", action: "a" }] },
      state: "Scoring",
      locks: { rubric: true, matrix: true, plan: true },
    };
    const dir = mkdtempSync(join(tmpdir(), "rubrix-gate-"));
    const path = join(dir, "rubrix.json");
    writeFileSync(path, JSON.stringify(c), "utf8");
    const { code, err } = captureStderr(() => gateCommand({ path, apply: true }));
    expect(code).toBe(4);
    expect(err).toContain("refusing to persist");
    const after = JSON.parse(readFileSync(path, "utf8"));
    expect(after.state).toBe("Scoring");
  });

  it("persists Passed when --apply succeeds", () => {
    const c: RubrixContract = {
      version: "0.1.0",
      intent: { summary: "x" },
      rubric: { threshold: 0.5, criteria: [{ id: "c", description: "d", weight: 1 }] },
      matrix: { rows: [{ id: "r", criterion: "c", evidence_required: "e" }] },
      plan: { steps: [{ id: "s", action: "a" }] },
      state: "Scoring",
      locks: { rubric: true, matrix: true, plan: true },
      scores: [{ criterion: "c", score: 0.9 }],
    };
    const dir = mkdtempSync(join(tmpdir(), "rubrix-gate-"));
    const path = join(dir, "rubrix.json");
    writeFileSync(path, JSON.stringify(c), "utf8");
    const { code } = captureStderr(() => gateCommand({ path, apply: true }));
    expect(code).toBe(0);
    expect(JSON.parse(readFileSync(path, "utf8")).state).toBe("Passed");
  });
});
