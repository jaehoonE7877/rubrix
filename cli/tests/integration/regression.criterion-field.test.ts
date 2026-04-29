import { describe, expect, it } from "vitest";
import { validateContract } from "../../src/core/contract.ts";

describe("iteration-5 회귀 가드 — schema는 criterion_id (skill 환각 필드)를 거부해야 한다", () => {
  it("matrix.rows[]에 criterion 대신 criterion_id가 오면 reject", () => {
    const r = validateContract({
      version: "0.1.0",
      intent: { summary: "x" },
      rubric: { threshold: 0.5, criteria: [{ id: "c1", description: "d", weight: 1 }] },
      matrix: { rows: [{ id: "m1", criterion_id: "c1", evidence_required: "e" }] },
      state: "MatrixDrafted",
      locks: { rubric: true, matrix: false, plan: false },
    });
    expect(r.ok).toBe(false);
  });

  it("matrix.rows[]에 criterion + criterion_id가 함께 와도 reject (additionalProperties=false)", () => {
    const r = validateContract({
      version: "0.1.0",
      intent: { summary: "x" },
      rubric: { threshold: 0.5, criteria: [{ id: "c1", description: "d", weight: 1 }] },
      matrix: {
        rows: [{ id: "m1", criterion: "c1", criterion_id: "c1", evidence_required: "e" }],
      },
      state: "MatrixDrafted",
      locks: { rubric: true, matrix: false, plan: false },
    });
    expect(r.ok).toBe(false);
  });

  it("scores[]에 criterion 대신 criterion_id가 오면 reject", () => {
    const r = validateContract({
      version: "0.1.0",
      intent: { summary: "x" },
      rubric: { threshold: 0.5, criteria: [{ id: "c1", description: "d", weight: 1 }] },
      matrix: { rows: [{ id: "m1", criterion: "c1", evidence_required: "e" }] },
      plan: { steps: [{ id: "s1", action: "a" }] },
      state: "Scoring",
      locks: { rubric: true, matrix: true, plan: true },
      scores: [{ criterion_id: "c1", score: 0.9 }],
    });
    expect(r.ok).toBe(false);
  });

  it("정상 criterion 필드는 accept (negative-test의 negative)", () => {
    const r = validateContract({
      version: "0.1.0",
      intent: { summary: "x" },
      rubric: { threshold: 0.5, criteria: [{ id: "c1", description: "d", weight: 1 }] },
      matrix: { rows: [{ id: "m1", criterion: "c1", evidence_required: "e" }] },
      plan: { steps: [{ id: "s1", action: "a" }] },
      state: "Scoring",
      locks: { rubric: true, matrix: true, plan: true },
      scores: [{ criterion: "c1", score: 0.9 }],
    });
    expect(r.ok).toBe(true);
  });
});
