import { describe, expect, it } from "vitest";
import { validateContract } from "../../src/core/contract.ts";

describe("output-judge historical read compat (legacy v1.0/v1.1/v1.2 contracts)", () => {
  it("v1.0 contract with scores[].evaluator='output-judge' string form validates clean", () => {
    const c = {
      version: "0.1.0",
      intent: { summary: "legacy" },
      state: "Passed",
      locks: { rubric: true, matrix: true, plan: true },
      rubric: {
        threshold: 0.8,
        criteria: [{ id: "c1", description: "criterion description that is at least sixty chars long for clarity", weight: 1 }],
      },
      matrix: { rows: [{ id: "r1", criterion: "c1", evidence_required: "manual review of legacy artifact ensuring sixty plus characters present" }] },
      plan: { steps: [{ id: "s1", action: "implement criterion c1 using legacy single-evaluator pipeline as designed" }] },
      scores: [
        {
          criterion: "c1",
          score: 0.9,
          evaluator: "output-judge",
          confidence: 0.85,
          notes: "legacy single-evaluator score",
        },
      ],
    };
    const r = validateContract(c);
    expect(r.ok).toBe(true);
  });

  it("v1.2 contract with evaluator='output-judge' + clarity validates clean (read-compat)", () => {
    const c = {
      version: "1.2.0",
      intent: {
        summary: "v1.2 legacy",
        brief: {
          calibrated: true,
          project_type: "brownfield_feature",
          situation: "internal_tool",
          ambition: "production",
          axis_depth: { security: "standard", correctness: "standard" },
        },
      },
      state: "Passed",
      locks: { rubric: true, matrix: true, plan: true },
      rubric: {
        threshold: 0.8,
        criteria: [{ id: "c1", description: "criterion description that is at least sixty chars long for clarity", weight: 1, axis: "correctness" }],
        clarity: { score: 0.9, threshold: 0.8, deductions: [], scored_at: "2026-04-30T10:00:00.000Z", scorer_version: "clarity-scorer/1.0", artifact_hash: "a".repeat(64), forced: false },
      },
      matrix: {
        rows: [{ id: "r1", criterion: "c1", evidence_required: "manual review of legacy artifact ensuring sixty plus characters present" }],
        clarity: { score: 0.92, threshold: 0.85, deductions: [], scored_at: "2026-04-30T10:00:00.000Z", scorer_version: "clarity-scorer/1.0", artifact_hash: "b".repeat(64), forced: false },
      },
      plan: {
        steps: [{ id: "s1", action: "implement criterion c1 using legacy single-evaluator pipeline as designed" }],
        clarity: { score: 0.95, threshold: 0.7, deductions: [], scored_at: "2026-04-30T10:00:00.000Z", scorer_version: "clarity-scorer/1.0", artifact_hash: "c".repeat(64), forced: false },
      },
      scores: [{ criterion: "c1", score: 0.9, evaluator: "output-judge", confidence: 0.9 }],
    };
    const r = validateContract(c);
    expect(r.ok).toBe(true);
  });

  it("v1.2 contract WITHOUT evaluation_policy still validates (fail-open for legacy versions)", () => {
    const c = {
      version: "1.2.0",
      intent: { summary: "legacy without eval policy" },
      state: "IntentDrafted",
      locks: { rubric: false, matrix: false, plan: false },
    };
    const r = validateContract(c);
    expect(r.ok).toBe(true);
  });
});
