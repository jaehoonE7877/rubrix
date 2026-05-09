import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { validateContract, type RubrixContract } from "../src/core/contract.ts";
import { baseV12Drafted, clarity } from "./helpers.ts";

const here = dirname(fileURLToPath(import.meta.url));
const SCHEMA_PATH = resolve(here, "../schemas/rubrix.schema.json");
const SCHEMA_TEXT = readFileSync(SCHEMA_PATH, "utf8");

function v13PassedWithPolicy(): RubrixContract {
  const c = baseV12Drafted();
  c.version = "1.3.0";
  c.state = "Passed";
  c.locks = { rubric: true, matrix: true, plan: true };
  c.rubric!.clarity = clarity(0.9, 0.75);
  c.matrix = { rows: [{ id: "r1", criterion: "c1", evidence_required: "x" }], clarity: clarity(0.9, 0.8) };
  c.plan = { steps: [{ id: "s1", action: "do" }], clarity: clarity(0.9, 0.7) };
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
  ] as RubrixContract["scores"];
  (c as RubrixContract & { evaluation_policy: Record<string, unknown> }).evaluation_policy = {
    source: "brief",
    locked_at: "2026-05-06T00:00:00.000Z",
    approved_by: "rubrix",
    derived_from_brief_hash: "a".repeat(64),
    stage1_required: true,
    stage3_threshold: 0.7,
    stage3_axes: ["security"],
    max_stage3_criteria: 5,
    max_frontier_votes: 3,
    estimated_cost_ceiling: 5.0,
    frontier_models: ["claude-opus-4-7", "claude-sonnet-4-6", "claude-sonnet-4-6"],
  };
  return c;
}

describe("evaluation_policy schema (v1.3 PR #1)", () => {
  it("accepts a complete evaluation_policy", () => {
    expect(validateContract(v13PassedWithPolicy()).ok).toBe(true);
  });

  it("rejects v1.3 contract WITHOUT evaluation_policy (fail-closed for v1.3.x)", () => {
    const c = v13PassedWithPolicy();
    delete (c as unknown as Record<string, unknown>).evaluation_policy;
    expect(validateContract(c).ok).toBe(false);
  });

  const requiredFields = [
    "source",
    "locked_at",
    "approved_by",
    "derived_from_brief_hash",
    "stage1_required",
    "stage3_threshold",
    "stage3_axes",
    "max_stage3_criteria",
    "max_frontier_votes",
    "estimated_cost_ceiling",
    "frontier_models",
  ];
  for (const field of requiredFields) {
    it(`rejects evaluation_policy with missing required field: ${field}`, () => {
      const c = v13PassedWithPolicy();
      const policy = (c as RubrixContract & { evaluation_policy: Record<string, unknown> }).evaluation_policy;
      delete policy[field];
      expect(validateContract(c).ok).toBe(false);
    });
  }

  it("rejects evaluation_policy.source outside enum {brief,user,cli-default}", () => {
    const c = v13PassedWithPolicy();
    (c as RubrixContract & { evaluation_policy: Record<string, unknown> }).evaluation_policy.source = "automation" as unknown as "brief" | "user" | "cli-default";
    expect(validateContract(c).ok).toBe(false);
  });

  it("rejects empty frontier_models array (minItems: 1)", () => {
    const c = v13PassedWithPolicy();
    (c as RubrixContract & { evaluation_policy: Record<string, unknown> }).evaluation_policy.frontier_models = [];
    expect(validateContract(c).ok).toBe(false);
  });

  it("accepts custom frontier_models (default is documented but not enforced)", () => {
    const c = v13PassedWithPolicy();
    (c as RubrixContract & { evaluation_policy: Record<string, unknown> }).evaluation_policy.frontier_models = ["custom-model-x"];
    expect(validateContract(c).ok).toBe(true);
  });

  it("schema documents the Stage 3 ensemble default in evaluation_policy.frontier_models description", () => {
    expect(SCHEMA_TEXT).toContain("claude-opus-4-7");
    expect(SCHEMA_TEXT).toContain("claude-sonnet-4-6");
  });

  it("rejects derived_from_brief_hash that is not 64 hex chars", () => {
    const c = v13PassedWithPolicy();
    (c as RubrixContract & { evaluation_policy: Record<string, unknown> }).evaluation_policy.derived_from_brief_hash = "short";
    expect(validateContract(c).ok).toBe(false);
  });

  it("rejects negative estimated_cost_ceiling", () => {
    const c = v13PassedWithPolicy();
    (c as RubrixContract & { evaluation_policy: Record<string, unknown> }).evaluation_policy.estimated_cost_ceiling = -1;
    expect(validateContract(c).ok).toBe(false);
  });
});
