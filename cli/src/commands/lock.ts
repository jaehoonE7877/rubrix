import { ContractError, loadContract, saveContract } from "../core/contract.ts";
import { checkMatrixIntegrity, checkPlanIntegrity } from "../core/integrity.ts";
import { lockTarget, type LockKey } from "../core/state.ts";

export interface LockOptions {
  path: string;
  key: string;
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
    if (c.state !== from) {
      process.stderr.write(`cannot lock ${opts.key}: state is ${c.state}, expected ${from}\n`);
      return 3;
    }
    const requiredArtifact = c[opts.key];
    if (!requiredArtifact) {
      process.stderr.write(`cannot lock ${opts.key}: ${opts.key} artifact is missing\n`);
      return 3;
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
    c.locks[opts.key] = true;
    c.state = to;
    saveContract(opts.path, c);
    process.stdout.write(`${opts.key} locked -> ${to}\n`);
    return 0;
  } catch (e) {
    process.stderr.write((e instanceof Error ? e.message : String(e)) + "\n");
    return e instanceof ContractError ? 2 : 1;
  }
}
