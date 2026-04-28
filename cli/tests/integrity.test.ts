import { describe, it, expect } from "vitest";
import { checkMatrixIntegrity, checkPlanIntegrity } from "../src/core/integrity.ts";
import type { RubrixContract } from "../src/core/contract.ts";

function clean(): RubrixContract {
  return {
    version: "0.1.0",
    intent: { summary: "t" },
    rubric: {
      threshold: 0.5,
      criteria: [
        { id: "c1", description: "d1", weight: 0.5 },
        { id: "c2", description: "d2", weight: 0.5 },
      ],
    },
    matrix: {
      rows: [
        { id: "m1", criterion: "c1", evidence_required: "e1" },
        { id: "m2", criterion: "c2", evidence_required: "e2" },
      ],
    },
    plan: {
      steps: [
        { id: "p1", action: "a1", covers: ["m1"] },
        { id: "p2", action: "a2", covers: ["m2"] },
      ],
    },
    state: "PlanDrafted",
    locks: { rubric: true, matrix: true, plan: false },
  };
}

describe("checkMatrixIntegrity", () => {
  it("returns no issues on a clean matrix", () => {
    expect(checkMatrixIntegrity(clean())).toEqual([]);
  });

  it("flags matrix rows referencing unknown criteria", () => {
    const c = clean();
    c.matrix!.rows.push({ id: "mX", criterion: "c99", evidence_required: "e" });
    const issues = checkMatrixIntegrity(c);
    expect(issues.some((i) => i.message.includes("unknown criteria"))).toBe(true);
    expect(issues.some((i) => i.message.includes("c99"))).toBe(true);
  });

  it("flags rubric criteria not covered by any matrix row", () => {
    const c = clean();
    c.matrix!.rows = c.matrix!.rows.filter((r) => r.criterion !== "c2");
    const issues = checkMatrixIntegrity(c);
    expect(issues.some((i) => i.message.includes("not covered") && i.message.includes("c2"))).toBe(true);
  });

  it("flags duplicate matrix row ids", () => {
    const c = clean();
    c.matrix!.rows.push({ id: "m1", criterion: "c2", evidence_required: "e3" });
    const issues = checkMatrixIntegrity(c);
    expect(issues.some((i) => i.message.includes("duplicates"))).toBe(true);
  });
});

describe("checkPlanIntegrity", () => {
  it("returns no issues on a clean plan", () => {
    expect(checkPlanIntegrity(clean())).toEqual([]);
  });

  it("flags plan steps with covers referencing unknown matrix rows", () => {
    const c = clean();
    c.plan!.steps.push({ id: "p9", action: "a", covers: ["m99"] });
    const issues = checkPlanIntegrity(c);
    expect(issues.some((i) => i.message.includes("unknown matrix rows") && i.message.includes("m99"))).toBe(true);
  });

  it("flags matrix rows not covered by any plan step", () => {
    const c = clean();
    c.plan!.steps = c.plan!.steps.filter((s) => s.id !== "p2");
    const issues = checkPlanIntegrity(c);
    expect(issues.some((i) => i.message.includes("not covered") && i.message.includes("m2"))).toBe(true);
  });

  it("flags duplicate plan step ids", () => {
    const c = clean();
    c.plan!.steps.push({ id: "p1", action: "a3", covers: ["m1"] });
    const issues = checkPlanIntegrity(c);
    expect(issues.some((i) => i.message.includes("duplicates"))).toBe(true);
  });
});
