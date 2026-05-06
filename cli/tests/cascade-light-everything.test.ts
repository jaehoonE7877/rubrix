import { describe, expect, it } from "vitest";
import { makeBudgetState, runCascade } from "../src/core/cascade.ts";
import { defaultPolicy, lightBriefContract, makeCriterion, makeRecordingStubs } from "./helpers-cascade.ts";

describe("light-everything brief never fires Stage 3", () => {
  it("axis_depth all-light + 10 criteria with every Stage 3 trigger possible → zero Stage 3 invocations", () => {
    const stubs = makeRecordingStubs(
      { pass: false, confidence: 0, matched_anchors: ["a"], conflict_signal: true },
      { evaluator: "semantic-judge", criterion: "c", verdict: "pass", score: 0.4, confidence: 0.4, self_reported_confidence: 0.2, rationale: "", evidence: [], evidence_conflict: true },
      {
        score: 0.5,
        rationale_hash: "0".repeat(64),
        dissent_flag: true,
        individual_entries: [
          { stage: 3, score: 0.5, self_reported_confidence: 0.5, model: "claude-opus-4-7", model_version: "v", prompt_version: "consensus-panel/1.0" },
        ],
      },
    );
    const policy = defaultPolicy({ stage3_axes: ["security", "correctness", "data", "ux", "perf"], stage3_threshold: 0.9, max_stage3_criteria: 100 });
    const contract = lightBriefContract();
    const budget = makeBudgetState();

    for (let i = 0; i < 10; i++) {
      runCascade(makeCriterion({ id: `c${i}`, axis: "security" }), policy, contract, {
        mechanicalChecker: stubs.mechanicalChecker,
        semanticJudge: stubs.semanticJudge,
        consensusPanel: stubs.consensusPanel,
        budgetState: budget,
      });
    }

    expect(stubs.conCalls).toBe(0);
  });

  it("light brief still runs Stage 1 and Stage 2 normally (only Stage 3 is suppressed)", () => {
    const stubs = makeRecordingStubs(
      { pass: false, confidence: 0, matched_anchors: [] },
      { evaluator: "semantic-judge", criterion: "c", verdict: "pass", score: 0.6, confidence: 0.6, self_reported_confidence: 0.6, rationale: "", evidence: [] },
      {
        score: 0.6,
        rationale_hash: "0".repeat(64),
        dissent_flag: false,
        individual_entries: [],
      },
    );
    const policy = defaultPolicy({ stage3_axes: ["security"], stage3_threshold: 0.9 });
    runCascade(makeCriterion(), policy, lightBriefContract(), {
      mechanicalChecker: stubs.mechanicalChecker,
      semanticJudge: stubs.semanticJudge,
      consensusPanel: stubs.consensusPanel,
    });
    expect(stubs.mechCalls).toBe(1);
    expect(stubs.semCalls).toBe(1);
    expect(stubs.conCalls).toBe(0);
  });
});
