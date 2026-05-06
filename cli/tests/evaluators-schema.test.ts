import { describe, expect, it } from "vitest";
import { validateContract, type RubrixContract } from "../src/core/contract.ts";
import { baseV12Drafted, clarity } from "./helpers.ts";

function v12Passed(): RubrixContract {
  const c = baseV12Drafted();
  c.state = "Passed";
  c.locks = { rubric: true, matrix: true, plan: true };
  c.rubric!.clarity = clarity(0.9, 0.75);
  c.matrix = { rows: [{ id: "r1", criterion: "c1", evidence_required: "x" }], clarity: clarity(0.9, 0.8) };
  c.plan = { steps: [{ id: "s1", action: "do" }], clarity: clarity(0.9, 0.7) };
  c.scores = [{ criterion: "c1", score: 0.9 }];
  return c;
}

function v13Passed(): RubrixContract {
  const c = v12Passed();
  c.version = "1.3.0";
  (c as unknown as RubrixContract & { evaluation_policy: unknown }).evaluation_policy = {
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
  c.scores = [
    {
      criterion: "c1",
      score: 0.9,
      evaluators: [
        { evaluator_id: "mechanical-checker", stage: 1 },
        { evaluator_id: "semantic-judge", stage: 2 },
      ],
      stage_history: [
        {
          stage: 1,
          score: 1.0,
          self_reported_confidence: 1.0,
          model: "deterministic",
          model_version: "mechanical-checker/1.0",
          prompt_version: "n/a",
        },
        {
          stage: 2,
          score: 0.9,
          self_reported_confidence: 0.85,
          model: "claude-sonnet-4-6",
          model_version: "claude-sonnet-4-6-20260301",
          prompt_version: "semantic-judge/1.0",
          latency_ms: 1234,
        },
      ],
    },
  ] as RubrixContract["scores"];
  return c;
}

describe("evaluators[] + stage_history schema (v1.3 PR #1)", () => {
  it("accepts v1.2 contract with legacy evaluator: string field", () => {
    const c = v12Passed();
    c.scores = [{ criterion: "c1", score: 0.9, evaluator: "output-judge" }];
    expect(validateContract(c).ok).toBe(true);
  });

  it("accepts v1.2 contract WITHOUT evaluators[] / stage_history (additive optional)", () => {
    const c = v12Passed();
    expect(validateContract(c).ok).toBe(true);
  });

  it("accepts v1.3 contract with evaluators[] (new write form)", () => {
    expect(validateContract(v13Passed()).ok).toBe(true);
  });

  it("accepts v1.3 contract with full stage_history including budget reason", () => {
    const c = v13Passed();
    ((c.scores as NonNullable<RubrixContract["scores"]>)[0] as NonNullable<RubrixContract["scores"]>[number] & { stage_history: unknown[] }).stage_history = [
      {
        stage: 2,
        score: 0.85,
        self_reported_confidence: 0.85,
        model: "claude-sonnet-4-6",
        model_version: "claude-sonnet-4-6-20260301",
        prompt_version: "semantic-judge/1.0",
        reason: "budget",
      },
    ];
    expect(validateContract(c).ok).toBe(true);
  });

  it("rejects stage_history entry missing model_version (v1.4 drift input gate)", () => {
    const c = v13Passed();
    const bad = JSON.parse(JSON.stringify((c.scores as NonNullable<RubrixContract["scores"]>)[0])) as Record<string, unknown>;
    ((bad.stage_history as Array<Record<string, unknown>>)[0] as Record<string, unknown>).model_version = undefined;
    delete ((bad.stage_history as Array<Record<string, unknown>>)[0] as Record<string, unknown>).model_version;
    c.scores = [bad as unknown as NonNullable<RubrixContract["scores"]>[number]];
    expect(validateContract(c).ok).toBe(false);
  });

  it("rejects stage_history entry missing prompt_version", () => {
    const c = v13Passed();
    const bad = JSON.parse(JSON.stringify((c.scores as NonNullable<RubrixContract["scores"]>)[0])) as Record<string, unknown>;
    delete ((bad.stage_history as Array<Record<string, unknown>>)[0] as Record<string, unknown>).prompt_version;
    c.scores = [bad as unknown as NonNullable<RubrixContract["scores"]>[number]];
    expect(validateContract(c).ok).toBe(false);
  });

  it("rejects evaluators[] entry with stage outside {1,2,3}", () => {
    const c = v13Passed();
    ((c.scores as NonNullable<RubrixContract["scores"]>)[0] as Record<string, unknown>).evaluators = [
      { evaluator_id: "x", stage: 4 },
    ];
    expect(validateContract(c).ok).toBe(false);
  });

  it("accepts both evaluator (string) and evaluators[] on the same score item (read-compat)", () => {
    const c = v13Passed();
    ((c.scores as NonNullable<RubrixContract["scores"]>)[0] as Record<string, unknown>).evaluator = "legacy-output-judge";
    expect(validateContract(c).ok).toBe(true);
  });
});
