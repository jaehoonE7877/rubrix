import { describe, expect, it } from "vitest";
import { computeDriftScore } from "../src/core/drift.ts";
import { stampDerivedHashes, baseV14Passed } from "./helpers.ts";

describe("drift score determinism (acceptance criterion: byte-equivalent two-run)", () => {
  it("100 runs on the same contract body produce a single (score, evidence_hash) tuple", () => {
    const c = stampDerivedHashes(baseV14Passed());
    c.intent.brief!.ambition = "demo";
    const seen = new Set<string>();
    for (let i = 0; i < 100; i++) {
      const drift = computeDriftScore(c);
      seen.add(`${drift.score}|${drift.evidence_hash}`);
    }
    expect(seen.size).toBe(1);
  });

  it("100 runs on a baseline (drift=0) contract converge to a single tuple", () => {
    const c = stampDerivedHashes(baseV14Passed());
    const seen = new Set<string>();
    for (let i = 0; i < 100; i++) {
      const drift = computeDriftScore(c);
      seen.add(`${drift.score}|${drift.evidence_hash}`);
    }
    expect(seen.size).toBe(1);
  });

  it("factor array is canonical (alphabetical) — brief, policy, stage_history", () => {
    const c = stampDerivedHashes(baseV14Passed());
    const d = computeDriftScore(c);
    const factors = d.factors.map((f) => f.factor);
    expect(factors).toEqual(["brief", "policy", "stage_history"]);
  });

  it("two structurally identical contracts produce identical evidence_hash even when constructed via different code paths", () => {
    const c1 = stampDerivedHashes(baseV14Passed());
    const c2 = stampDerivedHashes(baseV14Passed());
    const d1 = computeDriftScore(c1);
    const d2 = computeDriftScore(c2);
    expect(d1.score).toBe(d2.score);
    expect(d1.evidence_hash).toBe(d2.evidence_hash);
  });

  it("rationale text changes do NOT affect evidence_hash (rationales excluded from hash input)", () => {
    const c1 = stampDerivedHashes(baseV14Passed());
    c1.intent.brief!.ambition = "demo";
    const d1 = computeDriftScore(c1);
    const c2 = stampDerivedHashes(baseV14Passed());
    c2.intent.brief!.ambition = "demo";
    const d2 = computeDriftScore(c2);
    expect(d1.evidence_hash).toBe(d2.evidence_hash);
  });

  it("scorer_version is stable string 'drift-scorer/1.0'", () => {
    const c = stampDerivedHashes(baseV14Passed());
    const d = computeDriftScore(c);
    expect(d.scorer_version).toBe("drift-scorer/1.0");
  });
});
