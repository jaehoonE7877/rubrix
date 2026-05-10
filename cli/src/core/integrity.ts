import type { RubrixContract } from "./contract.ts";

const DRIFT_ARTIFACTS = ["rubric", "matrix", "plan", "evaluation_policy"] as const;

export interface IntegrityIssue {
  message: string;
}

export function checkRubricIntegrity(c: RubrixContract): IntegrityIssue[] {
  const issues: IntegrityIssue[] = [];
  const criteria = c.rubric?.criteria ?? [];
  const ids = criteria.map((x) => x.id);
  const dupIds = ids.filter((id, i) => ids.indexOf(id) !== i);
  if (dupIds.length) {
    issues.push({ message: `rubric.criteria[].id has duplicates: ${[...new Set(dupIds)].join(", ")}` });
  }
  return issues;
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

export function checkDriftPolicyIntegrity(c: RubrixContract): IntegrityIssue[] {
  const issues: IntegrityIssue[] = [];
  const policy = c.drift_policy;
  if (!policy) return issues;
  if (!Number.isFinite(policy.threshold) || policy.threshold < 0 || policy.threshold > 1) {
    issues.push({ message: `drift_policy.threshold must be in [0,1], got ${policy.threshold}` });
  }
  if (policy.hard_threshold !== undefined) {
    if (!Number.isFinite(policy.hard_threshold) || policy.hard_threshold < 0 || policy.hard_threshold > 1) {
      issues.push({ message: `drift_policy.hard_threshold must be in [0,1], got ${policy.hard_threshold}` });
    } else if (policy.hard_threshold < policy.threshold) {
      issues.push({
        message: `drift_policy.hard_threshold (${policy.hard_threshold}) must be >= drift_policy.threshold (${policy.threshold}); soft gate must trip before hard deny.`,
      });
    }
  }
  if (typeof policy.scorer_version !== "string" || policy.scorer_version.trim().length === 0) {
    issues.push({ message: `drift_policy.scorer_version must be a non-empty string (pin format e.g. 'drift-scorer/1.0')` });
  }
  return issues;
}

export function checkLockHistoryIntegrity(c: RubrixContract): IntegrityIssue[] {
  const issues: IntegrityIssue[] = [];
  const history = c.lock_history ?? [];
  for (const entry of history) {
    if (!(DRIFT_ARTIFACTS as ReadonlyArray<string>).includes(entry.artifact)) {
      issues.push({ message: `lock_history[] entry has unknown artifact: ${entry.artifact}` });
    }
    if ((entry.event === "force-lock" || entry.event === "accept-drift") && (!entry.reason || entry.reason.trim().length === 0)) {
      issues.push({ message: `lock_history[] entry with event=${entry.event} requires a non-empty reason (artifact=${entry.artifact}, occurred_at=${entry.occurred_at})` });
    }
    if (entry.drift_score !== undefined && (entry.drift_score < 0 || entry.drift_score > 1)) {
      issues.push({ message: `lock_history[] entry has drift_score out of [0,1]: ${entry.drift_score} (artifact=${entry.artifact})` });
    }
  }
  const accepted = c.accepted_drift_history ?? [];
  const lockHistoryAcceptCount = new Map<string, number>();
  for (const entry of history) {
    if (entry.event === "accept-drift" && (DRIFT_ARTIFACTS as ReadonlyArray<string>).includes(entry.artifact)) {
      lockHistoryAcceptCount.set(entry.artifact, (lockHistoryAcceptCount.get(entry.artifact) ?? 0) + 1);
    }
  }
  const acceptedHistoryCount = new Map<string, number>();
  accepted.forEach((entry, idx) => {
    if (!(DRIFT_ARTIFACTS as ReadonlyArray<string>).includes(entry.artifact)) {
      issues.push({ message: `accepted_drift_history[${idx}] has unknown artifact: ${entry.artifact}` });
      return;
    }
    if (entry.drift_score < 0 || entry.drift_score > 1) {
      issues.push({ message: `accepted_drift_history[${idx}] has drift_score out of [0,1]: ${entry.drift_score}` });
    }
    acceptedHistoryCount.set(entry.artifact, (acceptedHistoryCount.get(entry.artifact) ?? 0) + 1);
  });
  const allArtifacts = new Set<string>([...lockHistoryAcceptCount.keys(), ...acceptedHistoryCount.keys()]);
  for (const art of allArtifacts) {
    const lockCount = lockHistoryAcceptCount.get(art) ?? 0;
    const acceptedCount = acceptedHistoryCount.get(art) ?? 0;
    const effective = Math.max(lockCount, acceptedCount);
    if (effective > 1) {
      issues.push({
        message: `1-shot bounded bypass: ${art} has ${effective} accept-drift entries (max of accepted_drift_history=${acceptedCount}, lock_history accept-drift=${lockCount}); only one accept per artifact is allowed.`,
      });
    }
  }
  return issues;
}
