import type { RubrixContract } from "./contract.ts";

export interface IntegrityIssue {
  message: string;
}

export function checkMatrixIntegrity(c: RubrixContract): IntegrityIssue[] {
  const issues: IntegrityIssue[] = [];
  const criteriaIds = new Set((c.rubric?.criteria ?? []).map((x) => x.id));
  const rows = c.matrix?.rows ?? [];
  const rowIds = rows.map((r) => r.id);
  const dupRowIds = rowIds.filter((id, i) => rowIds.indexOf(id) !== i);
  if (dupRowIds.length) {
    issues.push({ message: `matrix.rows[].id has duplicates: ${[...new Set(dupRowIds)].join(", ")}` });
  }
  const dangling = rows.filter((r) => !criteriaIds.has(r.criterion));
  if (dangling.length) {
    const list = dangling.map((r) => `${r.id}->${r.criterion}`).join(", ");
    issues.push({ message: `matrix.rows[] reference unknown criteria: ${list}` });
  }
  const referencedCriteria = new Set(rows.map((r) => r.criterion));
  const uncovered = [...criteriaIds].filter((id) => !referencedCriteria.has(id));
  if (uncovered.length) {
    issues.push({ message: `rubric.criteria[] not covered by any matrix row: ${uncovered.join(", ")}` });
  }
  return issues;
}

export function checkPlanIntegrity(c: RubrixContract): IntegrityIssue[] {
  const issues: IntegrityIssue[] = [];
  const matrixRowIds = new Set((c.matrix?.rows ?? []).map((r) => r.id));
  const steps = c.plan?.steps ?? [];
  const stepIds = steps.map((s) => s.id);
  const dupStepIds = stepIds.filter((id, i) => stepIds.indexOf(id) !== i);
  if (dupStepIds.length) {
    issues.push({ message: `plan.steps[].id has duplicates: ${[...new Set(dupStepIds)].join(", ")}` });
  }
  const allCovers = steps.flatMap((s) => s.covers ?? []);
  const dangling = [...new Set(allCovers)].filter((id) => !matrixRowIds.has(id));
  if (dangling.length) {
    issues.push({ message: `plan.steps[].covers[] reference unknown matrix rows: ${dangling.join(", ")}` });
  }
  const coveredSet = new Set(allCovers);
  const uncovered = [...matrixRowIds].filter((id) => !coveredSet.has(id));
  if (uncovered.length) {
    issues.push({ message: `matrix.rows[] not covered by any plan step: ${uncovered.join(", ")}` });
  }
  return issues;
}
