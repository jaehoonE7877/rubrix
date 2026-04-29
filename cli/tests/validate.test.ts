import { describe, expect, it } from "vitest";
import { validateContract } from "../src/core/contract.ts";

describe("validateContract", () => {
  it("accepts a minimal IntentDrafted contract", () => {
    const r = validateContract({
      version: "0.1.0",
      intent: { summary: "x" },
      state: "IntentDrafted",
      locks: { rubric: false, matrix: false, plan: false },
    });
    expect(r.ok).toBe(true);
  });

  it("rejects PlanLocked with plan=false", () => {
    const r = validateContract({
      version: "0.1.0",
      intent: { summary: "x" },
      rubric: { threshold: 0.5, criteria: [{ id: "c", description: "d", weight: 1 }] },
      matrix: { rows: [{ id: "r", criterion: "c", evidence_required: "e" }] },
      plan: { steps: [{ id: "s", action: "a" }] },
      state: "PlanLocked",
      locks: { rubric: true, matrix: true, plan: false },
    });
    expect(r.ok).toBe(false);
  });

  it("rejects rubric without threshold", () => {
    const r = validateContract({
      version: "0.1.0",
      intent: { summary: "x" },
      rubric: { criteria: [{ id: "c", description: "d", weight: 1 }] },
      state: "RubricDrafted",
      locks: { rubric: false, matrix: false, plan: false },
    });
    expect(r.ok).toBe(false);
  });

  it("rejects Passed without scores", () => {
    const r = validateContract({
      version: "0.1.0",
      intent: { summary: "x" },
      rubric: { threshold: 0.5, criteria: [{ id: "c", description: "d", weight: 1 }] },
      matrix: { rows: [{ id: "r", criterion: "c", evidence_required: "e" }] },
      plan: { steps: [{ id: "s", action: "a" }] },
      state: "Passed",
      locks: { rubric: true, matrix: true, plan: true },
    });
    expect(r.ok).toBe(false);
  });

  it("accepts the verify field on rubric.criteria[]", () => {
    const r = validateContract({
      version: "0.1.0",
      intent: { summary: "x" },
      rubric: {
        threshold: 0.5,
        criteria: [{ id: "c", description: "d", weight: 1, verify: "agent:output-judge" }],
      },
      state: "RubricDrafted",
      locks: { rubric: false, matrix: false, plan: false },
    });
    expect(r.ok).toBe(true);
  });

  it("accepts the verify field on matrix.rows[]", () => {
    const r = validateContract({
      version: "0.1.0",
      intent: { summary: "x" },
      rubric: { threshold: 0.5, criteria: [{ id: "c", description: "d", weight: 1 }] },
      matrix: {
        rows: [{ id: "r", criterion: "c", evidence_required: "e", verify: "vitest --coverage" }],
      },
      state: "MatrixDrafted",
      locks: { rubric: true, matrix: false, plan: false },
    });
    expect(r.ok).toBe(true);
  });

  it("rejects the deprecated method field on matrix.rows[]", () => {
    const r = validateContract({
      version: "0.1.0",
      intent: { summary: "x" },
      rubric: { threshold: 0.5, criteria: [{ id: "c", description: "d", weight: 1 }] },
      matrix: {
        rows: [{ id: "r", criterion: "c", evidence_required: "e", method: "agent:output-judge" }],
      },
      state: "MatrixDrafted",
      locks: { rubric: true, matrix: false, plan: false },
    });
    expect(r.ok).toBe(false);
  });
});
