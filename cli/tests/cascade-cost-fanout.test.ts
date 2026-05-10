import { describe, expect, it } from "vitest";
import { makeBudgetState } from "../src/core/cascade.ts";
import {
  defaultPolicy,
  deepBriefContract,
  makeCriterion,
  makeRecordingStubs,
  runCascadeForTest,
} from "./helpers-cascade.ts";

describe("cascade Stage 3 cost fanout (v1.3.2 Fix 4)", () => {
  function ambiguousStubs() {
    return makeRecordingStubs(
      { pass: false, confidence: 0, matched_anchors: ["a"], conflict_signal: true },
      {
        evaluator: "semantic-judge",
        criterion: "x",
        verdict: "pass",
        score: 0.5,
        confidence: 0.5,
        self_reported_confidence: 0.5,
        rationale: "",
        evidence: [],
      },
      {
        score: 0.8,
        rationale_hash: "0".repeat(64),
        dissent_flag: false,
        individual_entries: [
          {
            stage: 3,
            score: 0.8,
            self_reported_confidence: 0.8,
            model: "claude-opus-4-7",
            model_version: "v",
            prompt_version: "consensus-panel/1.0",
          },
        ],
      },
    );
  }

  it("fanout=3 ensemble multiplies cumulative_cost by ensemble size per Stage 3 invocation", () => {
    const stubs = ambiguousStubs();
    const policy = defaultPolicy({
      max_stage3_criteria: 5,
      stage3_axes: ["security"],
      stage3_threshold: 0.5,
      estimated_cost_ceiling: 10.0,
      frontier_models: ["m1", "m2", "m3"],
    });
    const contract = deepBriefContract();
    const budget = makeBudgetState();

    runCascadeForTest(makeCriterion({ id: "c1", axis: "security" }), policy, contract, {
      mechanicalChecker: stubs.mechanicalChecker,
      semanticJudge: stubs.semanticJudge,
      consensusPanel: stubs.consensusPanel,
      budgetState: budget,
    });

    expect(budget.cumulative_cost).toBeCloseTo(6.0, 6);
    expect(budget.stage3_used).toBe(1);
  });

  it("fanout=1 single-model ensemble keeps cumulative_cost equal to per-criterion budget", () => {
    const stubs = ambiguousStubs();
    const policy = defaultPolicy({
      max_stage3_criteria: 5,
      stage3_axes: ["security"],
      stage3_threshold: 0.5,
      estimated_cost_ceiling: 10.0,
      frontier_models: ["solo"],
    });
    const contract = deepBriefContract();
    const budget = makeBudgetState();

    runCascadeForTest(makeCriterion({ id: "c1", axis: "security" }), policy, contract, {
      mechanicalChecker: stubs.mechanicalChecker,
      semanticJudge: stubs.semanticJudge,
      consensusPanel: stubs.consensusPanel,
      budgetState: budget,
    });

    expect(budget.cumulative_cost).toBeCloseTo(2.0, 6);
  });

  it("fanout treats empty frontier_models as 1 (Math.max guard)", () => {
    const stubs = ambiguousStubs();
    const policy = defaultPolicy({
      max_stage3_criteria: 5,
      stage3_axes: ["security"],
      stage3_threshold: 0.5,
      estimated_cost_ceiling: 10.0,
      frontier_models: [],
    });
    const contract = deepBriefContract();
    const budget = makeBudgetState();

    runCascadeForTest(makeCriterion({ id: "c1", axis: "security" }), policy, contract, {
      mechanicalChecker: stubs.mechanicalChecker,
      semanticJudge: stubs.semanticJudge,
      consensusPanel: stubs.consensusPanel,
      budgetState: budget,
    });

    expect(budget.cumulative_cost).toBeCloseTo(2.0, 6);
  });

  it("ceiling soaks faster under fanout (3-ensemble exhausts budget at 2 invocations vs 5 single-model)", () => {
    const stubs = ambiguousStubs();
    const policy = defaultPolicy({
      max_stage3_criteria: 10,
      stage3_axes: ["security"],
      stage3_threshold: 0.5,
      estimated_cost_ceiling: 10.0,
      frontier_models: ["m1", "m2", "m3"],
    });
    const contract = deepBriefContract();
    const budget = makeBudgetState();

    let stage3Invocations = 0;
    for (let i = 0; i < 10; i += 1) {
      const before = budget.stage3_used;
      runCascadeForTest(makeCriterion({ id: `c${i}`, axis: "security" }), policy, contract, {
        mechanicalChecker: stubs.mechanicalChecker,
        semanticJudge: stubs.semanticJudge,
        consensusPanel: stubs.consensusPanel,
        budgetState: budget,
      });
      if (budget.stage3_used > before) stage3Invocations += 1;
    }

    expect(stage3Invocations).toBeLessThan(5);
    expect(budget.over_budget).toBe(true);
  });
});
