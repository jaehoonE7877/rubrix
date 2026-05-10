import { describe, expect, it } from "vitest";
import { lockCommand } from "../src/commands/lock.ts";
import { loadContract, type RubrixContract } from "../src/core/contract.ts";
import { computeDriftScore } from "../src/core/drift.ts";
import { stampDerivedHashes, baseV14Passed, tempContractFile } from "./helpers.ts";

function v14PlanLockedWithDrift(): RubrixContract {
  const c = stampDerivedHashes(baseV14Passed());
  c.state = "PlanLocked";
  c.locks = { rubric: true, matrix: true, plan: true };
  delete c.scores;
  c.intent.brief!.ambition = "demo";
  return c;
}

describe("rubrix lock --accept-drift (1-shot bounded bypass)", () => {
  it("rejects empty reason", () => {
    const path = tempContractFile(v14PlanLockedWithDrift());
    const code = lockCommand({ key: "plan", path, acceptDrift: "  " });
    expect(code).toBe(2);
  });

  it("rejects on v1.3 contract (drift gate is fail-open below v1.4)", () => {
    const c = v14PlanLockedWithDrift();
    c.version = "1.3.0";
    delete c.evaluation_policy!.derived_from_policy_hash;
    delete (c as unknown as Record<string, unknown>).drift_policy;
    const path = tempContractFile(c);
    const code = lockCommand({ key: "plan", path, acceptDrift: "x" });
    expect(code).toBe(2);
  });

  it("rejects when contract has no drift_policy (v1.4 fail-closed below state=Scoring)", () => {
    const c = v14PlanLockedWithDrift();
    delete (c as unknown as Record<string, unknown>).drift_policy;
    const path = tempContractFile(c);
    const code = lockCommand({ key: "plan", path, acceptDrift: "x" });
    expect(code).toBe(2);
  });

  it("appends accepted_drift_history + lock_history on drift > threshold (1-shot)", () => {
    const c = v14PlanLockedWithDrift();
    const beforeDrift = computeDriftScore(c);
    expect(beforeDrift.score).toBeGreaterThan(0.3);
    expect(beforeDrift.score).toBeLessThan(0.5);
    const path = tempContractFile(c);
    const code = lockCommand({ key: "plan", path, acceptDrift: "manual policy refresh" });
    expect(code).toBe(0);
    const after = loadContract(path);
    expect(after.accepted_drift_history).toHaveLength(1);
    const entry = after.accepted_drift_history![0]!;
    expect(entry.artifact).toBe("plan");
    expect(entry.reason).toBe("manual policy refresh");
    expect(entry.scorer_version).toBe("drift-scorer/1.0");
    expect(entry.evidence_hash).toBe(beforeDrift.evidence_hash);
    expect(after.lock_history).toBeDefined();
    expect(after.lock_history!.find((h) => h.event === "accept-drift")).toBeDefined();
  });

  it("denies a second --accept-drift on the same artifact (1-shot bounded)", () => {
    const c = v14PlanLockedWithDrift();
    c.accepted_drift_history = [
      {
        artifact: "plan",
        drift_score: 0.4,
        accepted_at: "2026-05-10T00:00:00.000Z",
        reason: "first",
        scorer_version: "drift-scorer/1.0",
      },
    ];
    const path = tempContractFile(c);
    const code = lockCommand({ key: "plan", path, acceptDrift: "second attempt" });
    expect(code).toBe(3);
  });

  it("denies --accept-drift when drift > hard_threshold (cannot bypass even with reason)", () => {
    const c = v14PlanLockedWithDrift();
    c.evaluation_policy!.estimated_cost_ceiling = 99;
    c.evaluation_policy!.frontier_models = ["different-model"];
    const path = tempContractFile(c);
    const code = lockCommand({ key: "plan", path, acceptDrift: "trying anyway" });
    expect(code).toBe(3);
  });

  it("allows --accept-drift on a different artifact even after one was accepted on a sibling", () => {
    const c = v14PlanLockedWithDrift();
    c.accepted_drift_history = [
      {
        artifact: "rubric",
        drift_score: 0.4,
        accepted_at: "2026-05-10T00:00:00.000Z",
        reason: "first on rubric",
        scorer_version: "drift-scorer/1.0",
      },
    ];
    const path = tempContractFile(c);
    const code = lockCommand({ key: "plan", path, acceptDrift: "now plan" });
    expect(code).toBe(0);
    const after = loadContract(path);
    expect(after.accepted_drift_history).toHaveLength(2);
  });

  it("denies a second --accept-drift even when accepted_drift_history was deleted but lock_history retains the audit (codex P2 #3)", () => {
    const c = v14PlanLockedWithDrift();
    c.lock_history = [
      {
        artifact: "plan",
        event: "accept-drift",
        occurred_at: "2026-05-10T00:00:00.000Z",
        reason: "prior accept",
        drift_score: 0.4,
      },
    ];
    const path = tempContractFile(c);
    const code = lockCommand({ key: "plan", path, acceptDrift: "second attempt after history scrub" });
    expect(code).toBe(3);
  });

  it("denies --accept-drift when drift_policy.scorer_version mismatches installed CLI (codex P2 #8)", () => {
    const c = v14PlanLockedWithDrift();
    c.drift_policy!.scorer_version = "drift-scorer/0.9";
    const path = tempContractFile(c);
    const code = lockCommand({ key: "plan", path, acceptDrift: "trying with wrong scorer" });
    expect(code).toBe(2);
  });
});
