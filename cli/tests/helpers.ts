import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import type { Clarity, RubrixContract } from "../src/core/contract.ts";
import { canonicalize } from "../src/core/clarity.ts";

export function tempContractFile(c: RubrixContract): string {
  const dir = mkdtempSync(join(tmpdir(), "rubrix-test-"));
  const path = join(dir, "rubrix.json");
  writeFileSync(path, JSON.stringify(c, null, 2), "utf8");
  return path;
}

export function baseDrafted(): RubrixContract {
  return {
    version: "0.1.0",
    intent: { summary: "test" },
    rubric: { threshold: 0.5, criteria: [{ id: "c1", description: "d", weight: 1 }] },
    state: "RubricDrafted",
    locks: { rubric: false, matrix: false, plan: false },
  };
}

export function baseV12Drafted(): RubrixContract {
  return {
    version: "1.2.0",
    intent: {
      summary: "test v1.2",
      brief: {
        calibrated: true,
        project_type: "brownfield_feature",
        situation: "internal_tool",
        ambition: "production",
        axis_depth: { security: "standard", data: "standard", correctness: "standard", ux: "standard", perf: "standard" },
      },
    },
    rubric: { threshold: 0.5, criteria: [{ id: "c1", description: "d", weight: 1, axis: "correctness" }] },
    state: "RubricDrafted",
    locks: { rubric: false, matrix: false, plan: false },
  };
}

export function clarity(score: number, threshold: number, extra: Partial<Clarity> = {}): Clarity {
  return {
    score,
    threshold,
    deductions: [],
    scored_at: "2026-05-01T00:00:00.000Z",
    scorer_version: "clarity-scorer/1.0",
    artifact_hash: "0".repeat(64),
    forced: false,
    ...extra,
  };
}

export function stampDerivedHashes(c: RubrixContract): RubrixContract {
  if (!c.intent.brief || !c.evaluation_policy) return c;
  const briefHash = createHash("sha256").update(canonicalize(c.intent.brief)).digest("hex");
  c.evaluation_policy.derived_from_brief_hash = briefHash;
  const selfBody: Record<string, unknown> = { ...c.evaluation_policy };
  delete selfBody.locked_at;
  delete selfBody.derived_from_brief_hash;
  delete selfBody.derived_from_policy_hash;
  const policyHash = createHash("sha256").update(canonicalize(selfBody)).digest("hex");
  c.evaluation_policy.derived_from_policy_hash = policyHash;
  return c;
}

export function baseV14Passed(): RubrixContract {
  const c = baseV12Drafted();
  c.version = "1.4.0";
  c.state = "Passed";
  c.locks = { rubric: true, matrix: true, plan: true };
  c.rubric!.clarity = clarity(0.9, 0.75);
  c.matrix = { rows: [{ id: "r1", criterion: "c1", evidence_required: "x" }], clarity: clarity(0.9, 0.8) };
  c.plan = { steps: [{ id: "s1", action: "do", covers: ["r1"] }], clarity: clarity(0.9, 0.7) };
  c.scores = [
    {
      criterion: "c1",
      score: 0.9,
      evaluators: [{ evaluator_id: "semantic-judge", stage: 2 }],
      stage_history: [
        {
          stage: 2,
          score: 0.9,
          self_reported_confidence: 0.85,
          model: "claude-sonnet-4-6",
          model_version: "claude-sonnet-4-6-20260301",
          prompt_version: "semantic-judge/1.0",
        },
      ],
    },
  ];
  c.evaluation_policy = {
    source: "brief",
    locked_at: "2026-05-06T00:00:00.000Z",
    approved_by: "rubrix",
    derived_from_brief_hash: "a".repeat(64),
    derived_from_policy_hash: "b".repeat(64),
    stage1_required: true,
    stage3_threshold: 0.7,
    stage3_axes: ["security"],
    max_stage3_criteria: 5,
    max_frontier_votes: 3,
    estimated_cost_ceiling: 5.0,
    frontier_models: ["claude-opus-4-7", "claude-sonnet-4-6", "claude-sonnet-4-6"],
  };
  c.drift_policy = {
    scorer_version: "drift-scorer/1.0",
    threshold: 0.3,
    hard_threshold: 0.5,
  };
  return c;
}
