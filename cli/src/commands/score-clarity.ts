import { ContractError, loadContract, type ArtifactKey } from "../core/contract.ts";
import { hashArtifact } from "../core/clarity.ts";
import { resolveClarityThreshold, THRESHOLD_POLICY_VERSION } from "../core/brief.ts";

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
  score: number | null;
  deductions: Array<{ code: string; message: string; weight: number }>;
  scored_at: string;
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

  const threshold = resolveClarityThreshold(contract, key, {
    override: opts.threshold,
    env: opts.env,
  });

  const output: ScoreClarityOutput = {
    artifact: key,
    artifact_hash: hashArtifact(contract, key),
    threshold,
    threshold_policy_version: THRESHOLD_POLICY_VERSION,
    scorer_version: "placeholder/1.0",
    score: null,
    deductions: [],
    scored_at: new Date().toISOString(),
    note: "v1.2/PR #1: scorer not yet wired — placeholder hash + threshold only. Real scoring lands in v1.2/PR #2.",
  };

  process.stdout.write(JSON.stringify(output, null, 2) + "\n");
  return 0;
}
