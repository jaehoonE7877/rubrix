import { ContractError, loadContract } from "../core/contract.ts";
import { isV14Plus } from "../core/version.ts";
import { DRIFT_SCORER_VERSION, computeDriftScore, isAcceptedDrift, isScorerVersionCompatible } from "../core/drift.ts";

export interface DriftOptions {
  path: string;
  json?: boolean;
}

export function driftCommand(opts: DriftOptions): number {
  try {
    const c = loadContract(opts.path);
    if (!isV14Plus(c)) {
      process.stderr.write(
        `rubrix drift requires a v1.4+ contract (this contract has version=${c.version}); v1.0~v1.3 contracts have no drift_policy and the gate is fail-open.\n`,
      );
      return 2;
    }
    if (!isScorerVersionCompatible(c)) {
      process.stderr.write(
        `drift_policy.scorer_version mismatch: contract pins '${c.drift_policy?.scorer_version}' but installed CLI is '${DRIFT_SCORER_VERSION}'. Re-lock evaluation_policy with the matching scorer_version, or upgrade the plugin.\n`,
      );
      return 2;
    }
    const result = computeDriftScore(c);
    const policy = c.drift_policy;
    const threshold = policy?.threshold ?? null;
    const hardThreshold = policy?.hard_threshold ?? null;
    const accepted = isAcceptedDrift(c, result.evidence_hash);
    const status = computeStatus(result.score, threshold, hardThreshold, accepted);
    if (opts.json) {
      process.stdout.write(
        JSON.stringify({
          status,
          score: result.score,
          scorer_version: result.scorer_version,
          evidence_hash: result.evidence_hash,
          factors: result.factors,
          drift_policy: policy ?? null,
          accepted,
        }) + "\n",
      );
      return 0;
    }
    process.stdout.write(
      `drift_score=${result.score.toFixed(3)} scorer=${result.scorer_version} hash=${result.evidence_hash.slice(0, 12)}… status=${status}\n`,
    );
    process.stdout.write(`threshold=${threshold ?? "<unset>"} hard_threshold=${hardThreshold ?? "<unset>"} accepted=${accepted}\n`);
    for (const f of result.factors) {
      process.stdout.write(`  - ${f.factor}: delta=${f.delta.toFixed(3)} (${f.rationale})\n`);
    }
    return 0;
  } catch (e) {
    process.stderr.write((e instanceof Error ? e.message : String(e)) + "\n");
    return e instanceof ContractError ? 2 : 1;
  }
}

function computeStatus(
  score: number,
  threshold: number | null,
  hardThreshold: number | null,
  accepted: boolean,
): "ok" | "soft-deny" | "hard-deny" | "accepted" {
  if (threshold === null) return "ok";
  if (hardThreshold !== null && score > hardThreshold) return "hard-deny";
  if (score > threshold) {
    return accepted ? "accepted" : "soft-deny";
  }
  return "ok";
}
