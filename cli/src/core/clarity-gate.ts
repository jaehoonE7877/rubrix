import type { ArtifactKey, RubrixContract } from "./contract.ts";
import { isV12Plus } from "./version.ts";

const ARTIFACT_KEYS: ReadonlyArray<ArtifactKey> = ["rubric", "matrix", "plan"];

export interface ClarityInvariantResult {
  ok: boolean;
  errors: string[];
}

export function checkClarityInvariants(c: RubrixContract): ClarityInvariantResult {
  if (!isV12Plus(c)) return { ok: true, errors: [] };
  const errors: string[] = [];
  for (const key of ARTIFACT_KEYS) {
    if (!c.locks[key]) continue;
    const body = c[key];
    const clarity = body?.clarity;
    if (!clarity) {
      errors.push(
        `  /${key}/clarity v1.2 contract requires ${key}.clarity at locks.${key}=true (run \`rubrix lock ${key} <path>\` on a v1.2 contract — or \`--force <reason>\` to audit a forced lock)`,
      );
      continue;
    }
    if (!clarity.forced && clarity.score < clarity.threshold) {
      errors.push(
        `  /${key}/clarity score ${clarity.score} < threshold ${clarity.threshold} (lock should have refused — re-lock or use \`--force <reason>\`)`,
      );
    }
  }
  return { ok: errors.length === 0, errors };
}

export function firstClarityViolation(c: RubrixContract): string | null {
  const r = checkClarityInvariants(c);
  if (r.ok) return null;
  const first = r.errors[0]?.trim() ?? "v1.2 clarity invariant breached";
  return first.replace(/^\s+/, "");
}
