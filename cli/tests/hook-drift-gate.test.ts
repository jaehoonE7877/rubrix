import { describe, expect, it } from "vitest";
import { handlePreToolUse } from "../src/hooks/handlers.ts";
import { computeDriftScore } from "../src/core/drift.ts";
import { stampDerivedHashes, baseV14Passed, tempContractFile } from "./helpers.ts";
import type { RubrixContract } from "../src/core/contract.ts";

function v14PlanLocked(): RubrixContract {
  const c = stampDerivedHashes(baseV14Passed());
  c.state = "PlanLocked";
  c.locks = { rubric: true, matrix: true, plan: true };
  delete c.scores;
  return c;
}

describe("PreToolUse drift gate (v1.4)", () => {
  it("v1.4 baseline (drift=0): /rubrix:score is allowed", () => {
    const path = tempContractFile(v14PlanLocked());
    const result = handlePreToolUse({ contract_path: path, prompt: "/rubrix:score", tool_name: "Bash" });
    expect(result.decision).toBe("allow");
  });

  it("v1.4 brief drift (score≈0.4): /rubrix:score is soft-denied with --accept-drift hint", () => {
    const c = v14PlanLocked();
    c.intent.brief!.ambition = "demo";
    const path = tempContractFile(c);
    const result = handlePreToolUse({ contract_path: path, prompt: "/rubrix:score", tool_name: "Bash" });
    expect(result.decision).toBe("block");
    expect(result.reason).toMatch(/drift gate/);
    expect(result.reason).toMatch(/threshold 0\.3/);
    expect(result.reason).toMatch(/--accept-drift/);
    expect(result.reason).toMatch(/1-shot bounded/);
  });

  it("v1.4 hard drift (score=1.0 > hard_threshold 0.5): /rubrix:score is hard-denied (no --accept-drift hint)", () => {
    const c = v14PlanLocked();
    c.intent.brief!.ambition = "demo";
    c.evaluation_policy!.estimated_cost_ceiling = 99;
    c.evaluation_policy!.frontier_models = ["different-model"];
    const path = tempContractFile(c);
    const result = handlePreToolUse({ contract_path: path, prompt: "/rubrix:score", tool_name: "Bash" });
    expect(result.decision).toBe("block");
    expect(result.reason).toMatch(/hard_threshold/);
    expect(result.reason).not.toMatch(/rubrix lock .* --accept-drift/);
  });

  it("v1.4 brief drift + accepted entry matching evidence_hash → /rubrix:score is allowed (accepted-drift bypass)", () => {
    const c = v14PlanLocked();
    c.intent.brief!.ambition = "demo";
    const drift = computeDriftScore(c);
    c.accepted_drift_history = [
      {
        artifact: "plan",
        drift_score: drift.score,
        accepted_at: "2026-05-10T00:00:00.000Z",
        reason: "manual",
        scorer_version: "drift-scorer/1.0",
        evidence_hash: drift.evidence_hash,
      },
    ];
    const path = tempContractFile(c);
    const result = handlePreToolUse({ contract_path: path, prompt: "/rubrix:score", tool_name: "Bash" });
    expect(result.decision).toBe("allow");
  });

  it("v1.4 brief drift + accepted entry but evidence_hash MISMATCH → /rubrix:score is still soft-denied", () => {
    const c = v14PlanLocked();
    c.intent.brief!.ambition = "demo";
    c.accepted_drift_history = [
      {
        artifact: "plan",
        drift_score: 0.4,
        accepted_at: "2026-05-10T00:00:00.000Z",
        reason: "stale evidence",
        scorer_version: "drift-scorer/1.0",
        evidence_hash: "0".repeat(64),
      },
    ];
    const path = tempContractFile(c);
    const result = handlePreToolUse({ contract_path: path, prompt: "/rubrix:score", tool_name: "Bash" });
    expect(result.decision).toBe("block");
    expect(result.reason).toMatch(/drift gate/);
  });

  it("v1.3 contract: drift gate is fail-open (no drift_policy → no enforcement)", () => {
    const c = v14PlanLocked();
    c.version = "1.3.0";
    delete c.evaluation_policy!.derived_from_policy_hash;
    delete (c as unknown as Record<string, unknown>).drift_policy;
    c.intent.brief!.ambition = "demo";
    const path = tempContractFile(c);
    const result = handlePreToolUse({ contract_path: path, prompt: "/rubrix:score", tool_name: "Bash" });
    expect(result.decision).toBe("allow");
  });

  it("drift gate does not fire on non-score prompts", () => {
    const c = v14PlanLocked();
    c.intent.brief!.ambition = "demo";
    const path = tempContractFile(c);
    const result = handlePreToolUse({ contract_path: path, prompt: "hello world", tool_name: "Read" });
    expect(result.decision).toBe("allow");
  });

  it("drift gate does not fire when plan is not locked (score gate already blocks earlier)", () => {
    const c = v14PlanLocked();
    c.locks = { rubric: true, matrix: true, plan: false };
    c.state = "PlanDrafted";
    c.intent.brief!.ambition = "demo";
    const path = tempContractFile(c);
    const result = handlePreToolUse({ contract_path: path, prompt: "/rubrix:score", tool_name: "Bash" });
    expect(result.decision).toBe("block");
    expect(result.reason).not.toMatch(/drift gate/);
  });

  it("drift gate surfaces evidence_hash + factor breakdown in the deny reason", () => {
    const c = v14PlanLocked();
    c.intent.brief!.ambition = "demo";
    const path = tempContractFile(c);
    const result = handlePreToolUse({ contract_path: path, prompt: "/rubrix:score", tool_name: "Bash" });
    expect(result.decision).toBe("block");
    expect(result.reason).toMatch(/evidence_hash:/);
    expect(result.reason).toMatch(/factors: brief=1\.00, policy=0\.00, stage_history=0\.00/);
  });

  it("soft-deny remediation includes the resolved contract path (codex P2 #6)", () => {
    const c = v14PlanLocked();
    c.intent.brief!.ambition = "demo";
    const path = tempContractFile(c);
    const result = handlePreToolUse({ contract_path: path, prompt: "/rubrix:score", tool_name: "Bash" });
    expect(result.decision).toBe("block");
    expect(result.reason).toContain(`rubrix drift ${path}`);
    expect(result.reason).toContain(`rubrix lock plan ${path} --accept-drift`);
  });

  it("v1.4 PlanLocked + no drift_policy → /rubrix:score is fail-closed (codex P2 #2 — gate predicate missing)", () => {
    const c = v14PlanLocked();
    delete (c as unknown as Record<string, unknown>).drift_policy;
    const path = tempContractFile(c);
    const result = handlePreToolUse({ contract_path: path, prompt: "/rubrix:score", tool_name: "Bash" });
    expect(result.decision).toBe("block");
    expect(result.reason).toMatch(/v1\.4\+ contracts require drift_policy/);
  });

  it("v1.4 + drift_policy.scorer_version mismatch → /rubrix:score is fail-closed (codex P2 #8)", () => {
    const c = v14PlanLocked();
    c.drift_policy!.scorer_version = "drift-scorer/0.9";
    const path = tempContractFile(c);
    const result = handlePreToolUse({ contract_path: path, prompt: "/rubrix:score", tool_name: "Bash" });
    expect(result.decision).toBe("block");
    expect(result.reason).toMatch(/scorer_version mismatch/);
    expect(result.reason).toMatch(/drift-scorer\/0\.9/);
  });

  it("evidence_hash binds to current brief — accepted entry on brief=B does NOT silently apply when brief mutates to C (codex P2 #5)", () => {
    const cB = v14PlanLocked();
    cB.intent.brief!.ambition = "demo";
    const driftB = computeDriftScore(cB);
    cB.accepted_drift_history = [
      {
        artifact: "plan",
        drift_score: driftB.score,
        accepted_at: "2026-05-10T00:00:00.000Z",
        reason: "first accept",
        scorer_version: "drift-scorer/1.0",
        evidence_hash: driftB.evidence_hash,
      },
    ];
    cB.intent.brief!.ambition = "production";
    cB.intent.brief!.situation = "regulated";
    const cC = cB;
    const path = tempContractFile(cC);
    const result = handlePreToolUse({ contract_path: path, prompt: "/rubrix:score", tool_name: "Bash" });
    expect(result.decision).toBe("block");
    expect(result.reason).toMatch(/drift gate/);
  });
});
