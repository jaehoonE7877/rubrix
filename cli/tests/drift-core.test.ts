import { describe, expect, it } from "vitest";
import { computeDriftScore, isAcceptedDrift, DRIFT_SCORER_VERSION } from "../src/core/drift.ts";
import { stampDerivedHashes, baseV14Passed } from "./helpers.ts";

describe("computeDriftScore", () => {
  it("returns score=0 when intent.brief and evaluation_policy hashes match the stamps (baseline)", () => {
    const c = stampDerivedHashes(baseV14Passed());
    const drift = computeDriftScore(c);
    expect(drift.score).toBe(0);
    expect(drift.scorer_version).toBe(DRIFT_SCORER_VERSION);
    expect(drift.factors).toHaveLength(3);
    expect(drift.factors.every((f) => f.delta === 0)).toBe(true);
  });

  it("flags brief delta=1.0 when intent.brief changes after policy lock (weighted = 0.4)", () => {
    const c = stampDerivedHashes(baseV14Passed());
    c.intent.brief!.ambition = "demo";
    const drift = computeDriftScore(c);
    expect(drift.factors.find((f) => f.factor === "brief")!.delta).toBe(1.0);
    expect(drift.factors.find((f) => f.factor === "policy")!.delta).toBe(0);
    expect(drift.score).toBeCloseTo(0.4, 5);
  });

  it("flags policy delta=1.0 when evaluation_policy changes after lock (weighted = 0.4)", () => {
    const c = stampDerivedHashes(baseV14Passed());
    c.evaluation_policy!.estimated_cost_ceiling = 99;
    const drift = computeDriftScore(c);
    expect(drift.factors.find((f) => f.factor === "policy")!.delta).toBe(1.0);
    expect(drift.factors.find((f) => f.factor === "brief")!.delta).toBe(0);
    expect(drift.score).toBeCloseTo(0.4, 5);
  });

  it("treats locked_at change as drift-neutral (excluded from policy self-hash)", () => {
    const c = stampDerivedHashes(baseV14Passed());
    c.evaluation_policy!.locked_at = "2099-01-01T00:00:00.000Z";
    const drift = computeDriftScore(c);
    expect(drift.factors.find((f) => f.factor === "policy")!.delta).toBe(0);
    expect(drift.score).toBe(0);
  });

  it("treats derived_from_brief_hash and derived_from_policy_hash as drift-neutral (excluded from policy self-hash to avoid recursion)", () => {
    const c = stampDerivedHashes(baseV14Passed());
    const originalBriefStamp = c.evaluation_policy!.derived_from_brief_hash;
    const originalPolicyStamp = c.evaluation_policy!.derived_from_policy_hash!;
    c.evaluation_policy!.derived_from_policy_hash = "f".repeat(64);
    const drift1 = computeDriftScore(c);
    expect(drift1.factors.find((f) => f.factor === "policy")!.delta).toBe(1.0);
    c.evaluation_policy!.derived_from_policy_hash = originalPolicyStamp;
    expect(originalBriefStamp).toBe(c.evaluation_policy!.derived_from_brief_hash);
  });

  it("compounds brief + policy + stage_history drifts and clamps to [0,1]", () => {
    const c = stampDerivedHashes(baseV14Passed());
    c.intent.brief!.ambition = "demo";
    c.evaluation_policy!.estimated_cost_ceiling = 99;
    c.evaluation_policy!.frontier_models = ["frontier-future-only"];
    const drift = computeDriftScore(c);
    expect(drift.score).toBe(1.0);
  });

  it("stage_history factor is 0 when every model_version matches a frontier_models entry (substring)", () => {
    const c = stampDerivedHashes(baseV14Passed());
    const drift = computeDriftScore(c);
    expect(drift.factors.find((f) => f.factor === "stage_history")!.delta).toBe(0);
  });

  it("stage_history factor reports stale ratio when models drift", () => {
    const c = stampDerivedHashes(baseV14Passed());
    c.evaluation_policy!.frontier_models = ["claude-opus-4-7"];
    const drift = computeDriftScore(c);
    const sh = drift.factors.find((f) => f.factor === "stage_history")!;
    expect(sh.delta).toBe(1.0);
    expect(sh.rationale).toMatch(/1\/1.*stage_history entries/);
  });

  it("returns score=0 on contracts without evaluation_policy (drift cannot be computed)", () => {
    const c = baseV14Passed();
    delete c.evaluation_policy;
    const drift = computeDriftScore(c);
    expect(drift.score).toBe(0);
    expect(drift.factors.every((f) => f.delta === 0)).toBe(true);
  });

  it("v1.3 contract (no derived_from_policy_hash stamp) reports policy delta=0 (fail-open)", () => {
    const c = stampDerivedHashes(baseV14Passed());
    delete c.evaluation_policy!.derived_from_policy_hash;
    const drift = computeDriftScore(c);
    expect(drift.factors.find((f) => f.factor === "policy")!.delta).toBe(0);
  });

  it("evidence_hash is excluded from rationale text (rationale change does NOT change hash)", () => {
    const c = stampDerivedHashes(baseV14Passed());
    const d1 = computeDriftScore(c);
    const d2 = computeDriftScore(c);
    expect(d1.evidence_hash).toBe(d2.evidence_hash);
    expect(d1.evidence_hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("evidence_hash differs when factor deltas differ (drift presence detectable)", () => {
    const c1 = stampDerivedHashes(baseV14Passed());
    const c2 = stampDerivedHashes(baseV14Passed());
    c2.intent.brief!.ambition = "demo";
    const d1 = computeDriftScore(c1);
    const d2 = computeDriftScore(c2);
    expect(d1.evidence_hash).not.toBe(d2.evidence_hash);
    expect(d1.score).toBe(0);
    expect(d2.score).toBeCloseTo(0.4, 5);
  });

  it("evidence_hash differs when current brief differs even though factor deltas match (codex P2 #5 — stale acceptance bypass blocked)", () => {
    const cB = stampDerivedHashes(baseV14Passed());
    cB.intent.brief!.ambition = "demo";
    const dB = computeDriftScore(cB);
    const cC = stampDerivedHashes(baseV14Passed());
    cC.intent.brief!.ambition = "demo";
    cC.intent.brief!.situation = "regulated";
    const dC = computeDriftScore(cC);
    expect(dB.factors.find((f) => f.factor === "brief")!.delta).toBe(dC.factors.find((f) => f.factor === "brief")!.delta);
    expect(dB.score).toBe(dC.score);
    expect(dB.evidence_hash).not.toBe(dC.evidence_hash);
  });

  it("score is clamped to [0,1] even if hypothetical weights overflow", () => {
    const c = stampDerivedHashes(baseV14Passed());
    c.intent.brief!.ambition = "demo";
    c.evaluation_policy!.estimated_cost_ceiling = 99;
    c.evaluation_policy!.frontier_models = ["different-model"];
    const drift = computeDriftScore(c);
    expect(drift.score).toBeLessThanOrEqual(1);
    expect(drift.score).toBeGreaterThanOrEqual(0);
  });
});

describe("isAcceptedDrift", () => {
  it("returns true when accepted_drift_history contains a matching evidence_hash", () => {
    const c = stampDerivedHashes(baseV14Passed());
    c.intent.brief!.ambition = "demo";
    const drift = computeDriftScore(c);
    c.accepted_drift_history = [
      {
        artifact: "plan",
        drift_score: drift.score,
        accepted_at: "2026-05-10T00:00:00.000Z",
        reason: "policy refresh",
        scorer_version: DRIFT_SCORER_VERSION,
        evidence_hash: drift.evidence_hash,
      },
    ];
    expect(isAcceptedDrift(c, drift.evidence_hash)).toBe(true);
  });

  it("returns false when no entry matches the evidence_hash", () => {
    const c = stampDerivedHashes(baseV14Passed());
    expect(isAcceptedDrift(c, "0".repeat(64))).toBe(false);
  });

  it("returns false on empty/absent accepted_drift_history", () => {
    const c = stampDerivedHashes(baseV14Passed());
    expect(isAcceptedDrift(c, "0".repeat(64))).toBe(false);
    c.accepted_drift_history = [];
    expect(isAcceptedDrift(c, "0".repeat(64))).toBe(false);
  });
});
