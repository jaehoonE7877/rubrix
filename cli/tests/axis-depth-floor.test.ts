import { describe, expect, it } from "vitest";
import { evaluateGate } from "../src/commands/gate.ts";
import type { RubrixContract } from "../src/core/contract.ts";

function fixture(opts: {
  axisDepthSecurity?: "light" | "standard" | "deep";
  ambition?: "demo" | "mvp" | "production" | "hardened";
  calibrated?: boolean;
  scoreSecurity: number;
  scoreCorrectness: number;
  floorSecurity?: number;
}): RubrixContract {
  return {
    version: "0.1.0",
    intent: {
      summary: "x",
      brief: opts.calibrated === false
        ? { calibrated: false }
        : {
            calibrated: true,
            ambition: opts.ambition ?? "production",
            axis_depth: opts.axisDepthSecurity ? { security: opts.axisDepthSecurity } : undefined,
          },
    },
    rubric: {
      threshold: 0.5,
      criteria: [
        { id: "sec", description: "security", weight: 0.5, axis: "security", floor: opts.floorSecurity },
        { id: "cor", description: "correctness", weight: 0.5, axis: "correctness" },
      ],
    },
    matrix: { rows: [
      { id: "rs", criterion: "sec", evidence_required: "e" },
      { id: "rc", criterion: "cor", evidence_required: "e" },
    ] },
    plan: { steps: [{ id: "s", action: "a" }] },
    scores: [
      { criterion: "sec", score: opts.scoreSecurity },
      { criterion: "cor", score: opts.scoreCorrectness },
    ],
    state: "Scoring",
    locks: { rubric: true, matrix: true, plan: true },
  };
}

describe("axis-depth deep floor (Codex Q1: Option B)", () => {
  it("fails when deep-axis criterion scores < 0.7 even if total threshold is met", () => {
    const r = evaluateGate(
      fixture({ axisDepthSecurity: "deep", scoreSecurity: 0.6, scoreCorrectness: 1.0 }),
      {},
    );
    expect(r.decision).toBe("fail");
    const sec = r.perCriterion.find((p) => p.id === "sec")!;
    expect(sec.status).toBe("below_floor");
    expect(sec.effectiveFloor).toBe(0.7);
    expect(sec.axisDepth).toBe("deep");
    expect(r.reasons.some((m) => /deep-axis effective floor/.test(m))).toBe(true);
  });

  it("passes when same score is at standard depth (no floor bump)", () => {
    const r = evaluateGate(
      fixture({ axisDepthSecurity: "standard", scoreSecurity: 0.6, scoreCorrectness: 1.0 }),
      {},
    );
    expect(r.decision).toBe("pass");
    const sec = r.perCriterion.find((p) => p.id === "sec")!;
    expect(sec.status).toBe("ok");
  });

  it("ambition=demo collapses every axis to light — no floor bump", () => {
    const r = evaluateGate(
      fixture({ axisDepthSecurity: "deep", ambition: "demo", scoreSecurity: 0.4, scoreCorrectness: 1.0 }),
      {},
    );
    expect(r.decision).toBe("pass");
    const sec = r.perCriterion.find((p) => p.id === "sec")!;
    expect(sec.axisDepth).toBe("light");
  });

  it("RUBRIX_SKIP_BRIEF=1 forces all-standard fallback regardless of calibrated brief", () => {
    const r = evaluateGate(
      fixture({ axisDepthSecurity: "deep", scoreSecurity: 0.6, scoreCorrectness: 1.0 }),
      { RUBRIX_SKIP_BRIEF: "1" },
    );
    expect(r.decision).toBe("pass");
    const sec = r.perCriterion.find((p) => p.id === "sec")!;
    expect(sec.axisDepth).toBe("standard");
  });

  it("respects an explicit higher base floor over the 0.7 deep bump", () => {
    const r = evaluateGate(
      fixture({ axisDepthSecurity: "deep", scoreSecurity: 0.85, scoreCorrectness: 1.0, floorSecurity: 0.9 }),
      {},
    );
    expect(r.decision).toBe("fail");
    const sec = r.perCriterion.find((p) => p.id === "sec")!;
    expect(sec.effectiveFloor).toBe(0.9);
    expect(sec.status).toBe("below_floor");
  });

  it("does not apply a floor when criterion has no axis tag", () => {
    const c: RubrixContract = {
      version: "0.1.0",
      intent: {
        summary: "x",
        brief: { calibrated: true, ambition: "production", axis_depth: { security: "deep" } },
      },
      rubric: {
        threshold: 0.5,
        criteria: [
          { id: "untagged", description: "x", weight: 1.0 },
        ],
      },
      matrix: { rows: [{ id: "r1", criterion: "untagged", evidence_required: "e" }] },
      plan: { steps: [{ id: "s", action: "a" }] },
      scores: [{ criterion: "untagged", score: 0.6 }],
      state: "Scoring",
      locks: { rubric: true, matrix: true, plan: true },
    };
    const r = evaluateGate(c, {});
    expect(r.decision).toBe("pass");
    const row = r.perCriterion[0];
    expect(row.axis).toBeUndefined();
    expect(row.effectiveFloor).toBeUndefined();
  });

  it("uncalibrated brief means standard fallback (no deep bump)", () => {
    const r = evaluateGate(
      fixture({ calibrated: false, scoreSecurity: 0.6, scoreCorrectness: 1.0 }),
      {},
    );
    expect(r.decision).toBe("pass");
    const sec = r.perCriterion.find((p) => p.id === "sec")!;
    expect(sec.axisDepth).toBe("standard");
  });
});
