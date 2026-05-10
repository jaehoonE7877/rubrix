import { ContractError, loadContract, saveContract, type AcceptedDriftEntry, type ArtifactKey, type DriftArtifactKey, type LockHistoryEntry } from "../core/contract.ts";
import { checkLockHistoryIntegrity, checkMatrixIntegrity, checkPlanIntegrity, checkRubricIntegrity } from "../core/integrity.ts";
import { lockTarget, type LockKey } from "../core/state.ts";
import { isV12Plus, isV14Plus } from "../core/version.ts";
import { scoreClarity } from "../core/clarity.ts";
import { resolveClarityThreshold } from "../core/brief.ts";
import { checkClarityInvariants, recoveryCliPrefixForEnv } from "../core/clarity-gate.ts";
import { DRIFT_SCORER_VERSION, computeDriftScore, isScorerVersionCompatible, type DriftScore } from "../core/drift.ts";

export interface LockOptions {
  path: string;
  key: string;
  threshold?: number;
  force?: string;
  acceptDrift?: string;
  env?: NodeJS.ProcessEnv;
}

const DEFAULT_DRIFT_HARD_THRESHOLD = 0.5;

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
    if (isReLock && c.state === "Failed") {
      process.stderr.write(
        `cannot lock ${opts.key}: state is Failed; use the documented recovery loop \`${recoveryCliPrefixForEnv(opts.env)} state set ${opts.path} PlanDrafted\` first, then re-lock.\n`,
      );
      return 3;
    }
    if (isReLock && (c.state === "Scoring" || c.state === "Passed")) {
      process.stderr.write(
        `cannot lock ${opts.key}: state is ${c.state}; this terminal/in-flight state has no documented rollback. Edit rubrix.json directly to roll the contract back to PlanDrafted (rubrix.json edits are exempt from the v1.2 lock gate), then re-lock.\n`,
      );
      return 3;
    }
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
            `\n  hint: refine the ${opts.key} and re-lock, or run \`${recoveryCliPrefixForEnv(opts.env)} lock ${opts.key} ${opts.path} --force "<reason>"\` to audit a forced lock.\n`,
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
            `   audit trail persisted at c.${opts.key}.clarity (forced=true, forced_at=${clarity.forced_at}). Use \`${recoveryCliPrefixForEnv(opts.env)} report ${opts.path}\` to review forced locks.\n`,
        );
      }
      c[opts.key]!.clarity = clarity;
    }
    let driftEntry: AcceptedDriftEntry | null = null;
    let driftLockHistory: LockHistoryEntry | null = null;
    if (opts.acceptDrift !== undefined) {
      const trimmed = opts.acceptDrift.trim();
      if (trimmed.length === 0) {
        process.stderr.write(`cannot lock ${opts.key}: --accept-drift requires a non-empty reason (e.g. --accept-drift "policy refresh after upstream brief change")\n`);
        return 2;
      }
      if (!isV14Plus(c)) {
        process.stderr.write(
          `cannot lock ${opts.key}: --accept-drift is only supported on v1.4+ contracts (this contract has version=${c.version}); the drift gate is fail-open below v1.4.\n`,
        );
        return 2;
      }
      if (!c.drift_policy) {
        process.stderr.write(`cannot lock ${opts.key}: --accept-drift requires a drift_policy on the contract.\n`);
        return 2;
      }
      if (!isScorerVersionCompatible(c)) {
        process.stderr.write(
          `cannot lock ${opts.key}: drift_policy.scorer_version mismatch — contract pins '${c.drift_policy.scorer_version}' but installed CLI is '${DRIFT_SCORER_VERSION}'. Re-lock evaluation_policy with the matching scorer_version, or upgrade the plugin.\n`,
        );
        return 2;
      }
      const drift: DriftScore = computeDriftScore(c);
      const hardThreshold = c.drift_policy.hard_threshold ?? DEFAULT_DRIFT_HARD_THRESHOLD;
      if (drift.score > hardThreshold) {
        process.stderr.write(
          `cannot lock ${opts.key}: drift score ${drift.score.toFixed(3)} exceeds drift_policy.hard_threshold ${hardThreshold}; --accept-drift cannot bypass. Re-lock evaluation_policy or refresh intent.brief instead.\n`,
        );
        return 3;
      }
      const acceptedEntries = (c.accepted_drift_history ?? []).filter((e) => e.artifact === opts.key);
      const lockHistoryAccepts = (c.lock_history ?? []).filter(
        (e) => e.event === "accept-drift" && e.artifact === opts.key,
      );
      if (acceptedEntries.length + lockHistoryAccepts.length >= 1) {
        const priorAt = acceptedEntries[0]?.accepted_at ?? lockHistoryAccepts[0]?.occurred_at ?? "<unknown>";
        process.stderr.write(
          `cannot lock ${opts.key}: --accept-drift is 1-shot bounded; ${opts.key} already accepted drift at ${priorAt} (audited via accepted_drift_history and lock_history). Refresh evaluation_policy or intent.brief; further --accept-drift on the same artifact is denied.\n`,
        );
        return 3;
      }
      const occurredAt = new Date().toISOString();
      driftEntry = {
        artifact: opts.key as DriftArtifactKey,
        drift_score: drift.score,
        accepted_at: occurredAt,
        reason: trimmed,
        scorer_version: drift.scorer_version,
        evidence_hash: drift.evidence_hash,
      };
      driftLockHistory = {
        artifact: opts.key as DriftArtifactKey,
        event: "accept-drift",
        occurred_at: occurredAt,
        reason: trimmed,
        drift_score: drift.score,
      };
    }
    if (driftEntry) {
      if (!c.accepted_drift_history) c.accepted_drift_history = [];
      c.accepted_drift_history.push(driftEntry);
      if (!c.lock_history) c.lock_history = [];
      if (driftLockHistory) c.lock_history.push(driftLockHistory);
      const integrityIssues = checkLockHistoryIntegrity(c);
      if (integrityIssues.length) {
        process.stderr.write(
          `cannot lock ${opts.key}: --accept-drift integrity check failed:\n${integrityIssues.map((i) => "  " + i.message).join("\n")}\n`,
        );
        return 3;
      }
      process.stderr.write(
        `!! drift accepted: ${opts.key} score=${driftEntry.drift_score.toFixed(3)} hash=${driftEntry.evidence_hash!.slice(0, 12)}… reason="${driftEntry.reason}"\n` +
          `   1-shot bounded — further --accept-drift on ${opts.key} will be denied. Re-lock evaluation_policy / intent.brief if drift recurs.\n`,
      );
    }
    c.locks[opts.key] = true;
    if (isReLock) {
      const downstream = downstreamOf(opts.key);
      const invalidated: ArtifactKey[] = [];
      for (const dk of downstream) {
        if (c.locks[dk]) invalidated.push(dk);
        c.locks[dk] = false;
        if (c[dk]?.clarity) delete c[dk]!.clarity;
      }
      c.state = to;
      if (invalidated.length) {
        process.stderr.write(
          `!! re-lock cascade: ${opts.key} re-locked invalidated downstream locks (${invalidated.join(", ")}); re-lock those before /rubrix:score.\n`,
        );
      }
    } else {
      c.state = to;
    }
    if (c.scores) delete c.scores;
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

function downstreamOf(key: LockKey): ArtifactKey[] {
  if (key === "rubric") return ["matrix", "plan"];
  if (key === "matrix") return ["plan"];
  return [];
}

function pickLocks(locks: { rubric: boolean; matrix: boolean; plan: boolean }, keys: ArtifactKey[]): { rubric: boolean; matrix: boolean; plan: boolean } {
  const out = { rubric: false, matrix: false, plan: false };
  for (const k of keys) out[k] = locks[k];
  return out;
}
