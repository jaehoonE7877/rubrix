import { createHash } from "node:crypto";
import type { RubrixContract } from "./contract.ts";
import { canonicalize } from "./clarity.ts";

export const DRIFT_SCORER_VERSION = "drift-scorer/1.0";

export type DriftFactor = "brief" | "policy" | "stage_history";

export interface DriftFactorEntry {
  factor: DriftFactor;
  delta: number;
  rationale: string;
}

export interface DriftScore {
  score: number;
  scorer_version: string;
  evidence_hash: string;
  factors: DriftFactorEntry[];
}

const FACTOR_WEIGHTS: Record<DriftFactor, number> = {
  brief: 0.4,
  policy: 0.4,
  stage_history: 0.2,
};

function hashHex(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

function briefFactor(c: RubrixContract): DriftFactorEntry {
  const brief = c.intent.brief;
  const policy = c.evaluation_policy;
  if (!brief || !policy) {
    return { factor: "brief", delta: 0, rationale: "no intent.brief or no evaluation_policy — comparison skipped" };
  }
  const briefHash = hashHex(canonicalize(brief));
  if (briefHash === policy.derived_from_brief_hash) {
    return {
      factor: "brief",
      delta: 0,
      rationale: "intent.brief canonical hash matches evaluation_policy.derived_from_brief_hash",
    };
  }
  return {
    factor: "brief",
    delta: 1.0,
    rationale: `intent.brief canonical hash differs from derived_from_brief_hash (current ${briefHash.slice(0, 8)}…, stamped ${policy.derived_from_brief_hash.slice(0, 8)}…)`,
  };
}

function policyFactor(c: RubrixContract): DriftFactorEntry {
  const policy = c.evaluation_policy;
  if (!policy) {
    return { factor: "policy", delta: 0, rationale: "no evaluation_policy — comparison skipped" };
  }
  if (policy.derived_from_policy_hash === undefined) {
    return { factor: "policy", delta: 0, rationale: "no derived_from_policy_hash stamp (v1.3 fail-open)" };
  }
  const selfBody: Record<string, unknown> = { ...policy };
  delete selfBody.locked_at;
  delete selfBody.derived_from_brief_hash;
  delete selfBody.derived_from_policy_hash;
  const policyHash = hashHex(canonicalize(selfBody));
  if (policyHash === policy.derived_from_policy_hash) {
    return {
      factor: "policy",
      delta: 0,
      rationale: "evaluation_policy self-hash matches derived_from_policy_hash",
    };
  }
  return {
    factor: "policy",
    delta: 1.0,
    rationale: `evaluation_policy self-hash differs (current ${policyHash.slice(0, 8)}…, stamped ${policy.derived_from_policy_hash.slice(0, 8)}…)`,
  };
}

function stageHistoryFactor(c: RubrixContract): DriftFactorEntry {
  const policy = c.evaluation_policy;
  if (!policy) {
    return { factor: "stage_history", delta: 0, rationale: "no evaluation_policy" };
  }
  const frontierModels = (policy.frontier_models ?? []).map((m) => m.toLowerCase());
  let total = 0;
  let stale = 0;
  for (const score of c.scores ?? []) {
    for (const entry of score.stage_history ?? []) {
      if (entry.stage === 1) continue;
      total++;
      const modelLower = (entry.model_version ?? "").toLowerCase();
      const matched = frontierModels.some(
        (fm) => fm.length > 0 && (modelLower.startsWith(fm) || fm.startsWith(modelLower)),
      );
      if (!matched) stale++;
    }
  }
  if (total === 0) {
    return { factor: "stage_history", delta: 0, rationale: "no stage 2/3 stage_history entries to compare (stage 1 mechanical-checker is local-deterministic and excluded)" };
  }
  const delta = stale / total;
  return {
    factor: "stage_history",
    delta,
    rationale: `${stale}/${total} stage 2/3 stage_history entries use models outside evaluation_policy.frontier_models (stage 1 excluded)`,
  };
}

export function computeDriftScore(c: RubrixContract): DriftScore {
  const factors: DriftFactorEntry[] = [briefFactor(c), policyFactor(c), stageHistoryFactor(c)];
  const weighted = factors.reduce((acc, f) => acc + f.delta * FACTOR_WEIGHTS[f.factor], 0);
  const score = clamp01(weighted);
  const sortedFactors = [...factors]
    .map((f) => ({ factor: f.factor, delta: f.delta }))
    .sort((a, b) => a.factor.localeCompare(b.factor));
  const policy = c.evaluation_policy;
  const briefStamp = policy?.derived_from_brief_hash ?? "";
  const policyStamp = policy?.derived_from_policy_hash ?? "";
  const briefCurrent = c.intent.brief ? hashHex(canonicalize(c.intent.brief)) : "";
  let policyCurrent = "";
  if (policy) {
    const selfBody: Record<string, unknown> = { ...policy };
    delete selfBody.locked_at;
    delete selfBody.derived_from_brief_hash;
    delete selfBody.derived_from_policy_hash;
    policyCurrent = hashHex(canonicalize(selfBody));
  }
  const evidenceCanonical = canonicalize({
    scorer_version: DRIFT_SCORER_VERSION,
    derived_from_brief_hash: briefStamp,
    derived_from_policy_hash: policyStamp,
    current_brief_hash: briefCurrent,
    current_policy_hash: policyCurrent,
    factors: sortedFactors,
  });
  const evidence_hash = hashHex(evidenceCanonical);
  return { score, scorer_version: DRIFT_SCORER_VERSION, evidence_hash, factors };
}

export function isAcceptedDrift(c: RubrixContract, evidenceHash: string): boolean {
  const accepted = c.accepted_drift_history ?? [];
  return accepted.some((e) => e.evidence_hash === evidenceHash);
}

export function isScorerVersionCompatible(c: RubrixContract): boolean {
  const pinned = c.drift_policy?.scorer_version;
  if (!pinned) return true;
  return pinned === DRIFT_SCORER_VERSION;
}
