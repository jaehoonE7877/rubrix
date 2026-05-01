import { ContractError, loadContract, saveContract, type ArtifactKey } from "../core/contract.ts";
import { checkMatrixIntegrity, checkPlanIntegrity, checkRubricIntegrity } from "../core/integrity.ts";
import { lockTarget, type LockKey } from "../core/state.ts";
import { isV12Plus } from "../core/version.ts";
import { scoreClarity } from "../core/clarity.ts";
import { resolveClarityThreshold } from "../core/brief.ts";
import { checkClarityInvariants } from "../core/clarity-gate.ts";

export interface LockOptions {
  path: string;
  key: string;
  threshold?: number;
  force?: string;
  env?: NodeJS.ProcessEnv;
}

const LOCK_KEYS: ReadonlyArray<LockKey> = ["rubric", "matrix", "plan"];

export function isLockKey(value: string): value is LockKey {
  return (LOCK_KEYS as ReadonlyArray<string>).includes(value);
}

export function lockCommand(opts: LockOptions): number {
  if (!isLockKey(opts.key)) {
    process.stderr.write(`unknown lock key: ${opts.key} (expected rubric|matrix|plan)\n`);
    return 2;
  }
  try {
    const c = loadContract(opts.path);
    const { from, to } = lockTarget(opts.key);
    const isReLock = c.locks[opts.key] === true;
    if (!isReLock && c.state !== from) {
      process.stderr.write(`cannot lock ${opts.key}: state is ${c.state}, expected ${from}\n`);
      return 3;
    }
    const requiredArtifact = c[opts.key];
    if (!requiredArtifact) {
      process.stderr.write(`cannot lock ${opts.key}: ${opts.key} artifact is missing\n`);
      return 3;
    }
    if (opts.key === "rubric") {
      const issues = checkRubricIntegrity(c);
      if (issues.length) {
        process.stderr.write(`cannot lock rubric: semantic integrity failed:\n${issues.map((i) => "  " + i.message).join("\n")}\n`);
        return 3;
      }
    }
    if (opts.key === "matrix") {
      const issues = checkMatrixIntegrity(c);
      if (issues.length) {
        process.stderr.write(`cannot lock matrix: semantic integrity failed:\n${issues.map((i) => "  " + i.message).join("\n")}\n`);
        return 3;
      }
    }
    if (opts.key === "plan") {
      const issues = checkPlanIntegrity(c);
      if (issues.length) {
        process.stderr.write(`cannot lock plan: semantic integrity failed:\n${issues.map((i) => "  " + i.message).join("\n")}\n`);
        return 3;
      }
    }
    if (opts.force !== undefined) {
      const trimmed = opts.force.trim();
      if (trimmed.length === 0) {
        process.stderr.write(`cannot lock ${opts.key}: --force requires a non-empty reason (e.g. --force "vendor freeze blocking refactor")\n`);
        return 2;
      }
      if (!isV12Plus(c)) {
        process.stderr.write(
          `cannot lock ${opts.key}: --force is only supported on v1.2+ contracts (this contract has version=${c.version}); --force needs the clarity audit trail to be meaningful.\n`,
        );
        return 2;
      }
    }
    if (isV12Plus(c)) {
      const upstreamKeys: ArtifactKey[] = upstreamOf(opts.key);
      const upstreamCheck = checkClarityInvariants({ ...c, locks: pickLocks(c.locks, upstreamKeys) });
      if (!upstreamCheck.ok) {
        process.stderr.write(
          `cannot lock ${opts.key}: upstream clarity invariant breach blocks lifecycle advance:\n${upstreamCheck.errors.join("\n")}\n  hint: re-lock the upstream artifact (with --force <reason> if needed) before advancing.\n`,
        );
        return 3;
      }
      const force = typeof opts.force === "string" ? opts.force.trim() : undefined;
      const env = opts.env ?? process.env;
      const threshold = resolveClarityThreshold(c, opts.key, {
        override: opts.threshold,
        env,
      });
      const result = scoreClarity({ contract: c, key: opts.key, threshold, env });
      if (!result.ok && force === undefined) {
        process.stderr.write(
          `cannot lock ${opts.key}: clarity ${result.clarity.score} below threshold ${result.clarity.threshold}\n` +
            result.clarity.deductions
              .map((d) => `  - [${d.code}] ${d.message} (weight ${d.weight})`)
              .join("\n") +
            `\n  hint: refine the ${opts.key} and re-lock, or run \`rubrix lock ${opts.key} ${opts.path} --force "<reason>"\` to audit a forced lock.\n`,
        );
        return 3;
      }
      const clarity = result.clarity;
      if (force !== undefined) {
        clarity.forced = true;
        clarity.forced_at = new Date().toISOString();
        clarity.force_reason = force;
        process.stderr.write(
          `!! forced lock: ${opts.key} score=${clarity.score} threshold=${clarity.threshold} reason="${force}"\n` +
            `   audit trail persisted at c.${opts.key}.clarity (forced=true, forced_at=${clarity.forced_at}). Use \`rubrix report\` to review forced locks.\n`,
        );
      }
      c[opts.key]!.clarity = clarity;
    }
    c.locks[opts.key] = true;
    if (!isReLock) c.state = to;
    saveContract(opts.path, c);
    process.stdout.write(isReLock ? `${opts.key} re-locked (state=${c.state})\n` : `${opts.key} locked -> ${to}\n`);
    return 0;
  } catch (e) {
    process.stderr.write((e instanceof Error ? e.message : String(e)) + "\n");
    return e instanceof ContractError ? 2 : 1;
  }
}

function upstreamOf(key: LockKey): ArtifactKey[] {
  if (key === "rubric") return [];
  if (key === "matrix") return ["rubric"];
  return ["rubric", "matrix"];
}

function pickLocks(locks: { rubric: boolean; matrix: boolean; plan: boolean }, keys: ArtifactKey[]): { rubric: boolean; matrix: boolean; plan: boolean } {
  const out = { rubric: false, matrix: false, plan: false };
  for (const k of keys) out[k] = locks[k];
  return out;
}
