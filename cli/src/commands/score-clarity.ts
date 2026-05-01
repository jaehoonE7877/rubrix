import { ContractError, loadContract, type ArtifactKey } from "../core/contract.ts";
import { hashArtifact, scoreClarity, SCORER_VERSION } from "../core/clarity.ts";
import { resolveClarityThreshold, THRESHOLD_POLICY_VERSION } from "../core/brief.ts";
import { isV12Plus } from "../core/version.ts";

const ARTIFACT_KEYS: ReadonlyArray<ArtifactKey> = ["rubric", "matrix", "plan"];

export interface ScoreClarityOptions {
  key: string;
  path: string;
  threshold?: number;
  json?: boolean;
  env?: NodeJS.ProcessEnv;
}

export interface ScoreClarityOutput {
  artifact: ArtifactKey;
  artifact_hash: string;
  threshold: number;
  threshold_policy_version: string;
  scorer_version: string;
  score: number;
  deductions: Array<{ code: string; message: string; weight: number }>;
  scored_at: string;
  ok: boolean;
  scorer_active: boolean;
  note?: string;
}

export function scoreClarityCommand(opts: ScoreClarityOptions): number {
  if (!ARTIFACT_KEYS.includes(opts.key as ArtifactKey)) {
    process.stderr.write(`score-clarity: invalid key '${opts.key}' (allowed: ${ARTIFACT_KEYS.join(", ")})\n`);
    return 2;
  }
  const key = opts.key as ArtifactKey;

  let contract;
  try {
    contract = loadContract(opts.path);
  } catch (e) {
    if (e instanceof ContractError) {
      process.stderr.write(e.message + "\n");
      return 2;
    }
    throw e;
  }

  if (contract[key] === undefined) {
    process.stderr.write(`score-clarity: ${key} not present in ${opts.path} (current state=${contract.state})\n`);
    return 3;
  }

  const env = opts.env ?? process.env;
  const threshold = resolveClarityThreshold(contract, key, {
    override: opts.threshold,
    env,
  });

  if (!isV12Plus(contract)) {
    const out: ScoreClarityOutput = {
      artifact: key,
      artifact_hash: hashArtifact(contract, key, env),
      threshold,
      threshold_policy_version: THRESHOLD_POLICY_VERSION,
      scorer_version: SCORER_VERSION,
      score: 1,
      deductions: [],
      scored_at: new Date().toISOString(),
      ok: true,
      scorer_active: false,
      note: "contract version < 1.2.0; clarity gate is inactive (read-compat). Bump version to 1.2.0 to engage scoring.",
    };
    process.stdout.write(JSON.stringify(out, null, 2) + "\n");
    return 0;
  }

  const result = scoreClarity({ contract, key, threshold, env });
  const out: ScoreClarityOutput = {
    artifact: key,
    artifact_hash: result.clarity.artifact_hash,
    threshold: result.clarity.threshold,
    threshold_policy_version: THRESHOLD_POLICY_VERSION,
    scorer_version: result.clarity.scorer_version,
    score: result.clarity.score,
    deductions: result.clarity.deductions,
    scored_at: result.clarity.scored_at,
    ok: result.ok,
    scorer_active: true,
  };
  process.stdout.write(JSON.stringify(out, null, 2) + "\n");
  return 0;
}
