import type { RubrixContract } from "./contract.ts";

export interface SemverParts {
  major: number;
  minor: number;
  patch: number;
}

export function parseVersion(input: string): SemverParts {
  const m = /^(\d+)\.(\d+)(?:\.(\d+))?$/.exec(input);
  if (!m) {
    throw new Error(`invalid semver-like version: ${input}`);
  }
  return {
    major: Number(m[1]),
    minor: Number(m[2]),
    patch: m[3] !== undefined ? Number(m[3]) : 0,
  };
}

export function compareVersions(a: string, b: string): number {
  const av = parseVersion(a);
  const bv = parseVersion(b);
  if (av.major !== bv.major) return av.major - bv.major;
  if (av.minor !== bv.minor) return av.minor - bv.minor;
  return av.patch - bv.patch;
}

export function isAtLeast(version: string, target: string): boolean {
  return compareVersions(version, target) >= 0;
}

const V1_2 = "1.2.0";

export function isV12Plus(c: Pick<RubrixContract, "version">): boolean {
  try {
    return isAtLeast(c.version, V1_2);
  } catch {
    return false;
  }
}
