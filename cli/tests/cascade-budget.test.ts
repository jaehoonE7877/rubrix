import { describe, expect, it } from "vitest";
import { makeBudgetState,  } from "../src/core/cascade.ts";
import { defaultPolicy, deepBriefContract, makeCriterion, makeRecordingStubs , runCascadeForTest} from "./helpers-cascade.ts";

describe("cascade budget enforcement (max_stage3_criteria)", () => {
  it("with max_stage3_criteria=5 across 10 trigger-eligible criteria, exactly 5 invoke Stage 3 and the other 5 fall back with reason='budget'", () => {
    const stubs = makeRecordingStubs(
      { pass: false, confidence: 0, matched_anchors: ["a"], conflict_signal: true },
      { evaluator: "semantic-judge", criterion: "x", verdict: "pass", score: 0.8, confidence: 0.8, self_reported_confidence: 0.8, rationale: "", evidence: [] },
      {
        score: 0.85,
        rationale_hash: "0".repeat(64),
        dissent_flag: false,
        individual_entries: [
          { stage: 3, score: 0.85, self_reported_confidence: 0.85, model: "claude-opus-4-7", model_version: "v", prompt_version: "consensus-panel/1.0" },
        ],
      },
    );

    const policy = defaultPolicy({
      max_stage3_criteria: 5,
      stage3_axes: ["security"],
      stage3_threshold: 0.5,
      frontier_models: ["solo"],
    });
    const contract = deepBriefContract();
    const budget = makeBudgetState();

    const skippedDueToBudget: boolean[] = [];
    for (let i = 0; i < 10; i++) {
      const r = runCascadeForTest(makeCriterion({ id: `c${i}`, axis: "security" }), policy, contract, {
        mechanicalChecker: stubs.mechanicalChecker,
        semanticJudge: stubs.semanticJudge,
        consensusPanel: stubs.consensusPanel,
        budgetState: budget,
      });
      skippedDueToBudget.push(r.record.skipped_stage3_due_to_budget);
    }

    expect(stubs.conCalls).toBe(5);
    expect(skippedDueToBudget.filter((b) => b === true)).toHaveLength(5);
    expect(skippedDueToBudget.filter((b) => b === false)).toHaveLength(5);
    expect(skippedDueToBudget.slice(0, 5).every((b) => b === false)).toBe(true);
    expect(skippedDueToBudget.slice(5).every((b) => b === true)).toBe(true);
  });

  it("budget-skipped criteria carry stage_history entry with reason='budget'", () => {
    const stubs = makeRecordingStubs(
      { pass: false, confidence: 0, matched_anchors: ["a"], conflict_signal: true },
      { evaluator: "semantic-judge", criterion: "x", verdict: "pass", score: 0.8, confidence: 0.8, self_reported_confidence: 0.8, rationale: "", evidence: [] },
      {
        score: 0.9,
        rationale_hash: "0".repeat(64),
        dissent_flag: false,
        individual_entries: [
          { stage: 3, score: 0.9, self_reported_confidence: 0.9, model: "claude-opus-4-7", model_version: "v", prompt_version: "consensus-panel/1.0" },
        ],
      },
    );
    const policy = defaultPolicy({
      max_stage3_criteria: 1,
      stage3_axes: ["security"],
      stage3_threshold: 0.5,
      frontier_models: ["solo"],
    });
    const contract = deepBriefContract();
    const budget = makeBudgetState();

    runCascadeForTest(makeCriterion({ id: "first" }), policy, contract, {
      mechanicalChecker: stubs.mechanicalChecker,
      semanticJudge: stubs.semanticJudge,
      consensusPanel: stubs.consensusPanel,
      budgetState: budget,
    });
    const second = runCascadeForTest(makeCriterion({ id: "second" }), policy, contract, {
      mechanicalChecker: stubs.mechanicalChecker,
      semanticJudge: stubs.semanticJudge,
      consensusPanel: stubs.consensusPanel,
      budgetState: budget,
    });

    expect(second.record.skipped_stage3_due_to_budget).toBe(true);
    const budgetEntry = second.record.stage_history.find((e) => e.reason === "budget");
    expect(budgetEntry).toBeDefined();
    expect(budgetEntry!.stage).toBe(2);
  });

  it("budget-skipped fallback uses Stage 2 score as final caller-visible score", () => {
    const stubs = makeRecordingStubs(
      { pass: false, confidence: 0, matched_anchors: ["a"], conflict_signal: true },
      { evaluator: "semantic-judge", criterion: "x", verdict: "pass", score: 0.73, confidence: 0.73, self_reported_confidence: 0.73, rationale: "", evidence: [] },
      {
        score: 0.99,
        rationale_hash: "0".repeat(64),
        dissent_flag: false,
        individual_entries: [
          { stage: 3, score: 0.99, self_reported_confidence: 0.99, model: "claude-opus-4-7", model_version: "v", prompt_version: "consensus-panel/1.0" },
        ],
      },
    );
    const policy = defaultPolicy({ max_stage3_criteria: 0, stage3_axes: ["security"], stage3_threshold: 0.5 });
    const contract = deepBriefContract();
    const budget = makeBudgetState();

    const r = runCascadeForTest(makeCriterion(), policy, contract, {
      mechanicalChecker: stubs.mechanicalChecker,
      semanticJudge: stubs.semanticJudge,
      consensusPanel: stubs.consensusPanel,
      budgetState: budget,
    });

    expect(r.caller.score).toBe(0.73);
    expect(r.record.skipped_stage3_due_to_budget).toBe(true);
    expect(stubs.conCalls).toBe(0);
  });
});
