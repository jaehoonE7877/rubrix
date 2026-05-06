import { describe, expect, it } from "vitest";
import { runCascade } from "../src/core/cascade.ts";
import { defaultPolicy, deepBriefContract, makeCriterion, makeRecordingStubs } from "./helpers-cascade.ts";

describe("Stage 3 multi-trigger logic (Codex critical #2)", () => {
  function ambiguousStage1() {
    return { pass: false as const, confidence: 0 as const, matched_anchors: [] as string[] };
  }
  function highConfidenceStage1() {
    return { pass: true as const, confidence: 1 as const, matched_anchors: ["a"] as string[] };
  }

  it("trigger (a): stage2 self_reported_confidence < threshold AND stage1 ambiguous → fires", () => {
    const stubs = makeRecordingStubs(
      ambiguousStage1(),
      { evaluator: "semantic-judge", criterion: "c1", verdict: "pass", score: 0.6, confidence: 0.6, self_reported_confidence: 0.5, rationale: "", evidence: [] },
      { score: 0.6, rationale_hash: "0".repeat(64), dissent_flag: false, individual_entries: [{ stage: 3, score: 0.6, self_reported_confidence: 0.6, model: "claude-opus-4-7", model_version: "v", prompt_version: "consensus-panel/1.0" }] },
    );
    runCascade(makeCriterion({ axis: "data" }), defaultPolicy({ stage3_threshold: 0.7, stage3_axes: [] }), deepBriefContract({ axis_depth: { security: "standard", data: "standard", correctness: "standard", ux: "standard", perf: "standard" } }), {
      mechanicalChecker: stubs.mechanicalChecker,
      semanticJudge: stubs.semanticJudge,
      consensusPanel: stubs.consensusPanel,
    });
    expect(stubs.conCalls).toBe(1);
  });

  it("trigger (b): criterion axis in stage3_axes AND axis_depth=deep → fires", () => {
    const stubs = makeRecordingStubs(
      ambiguousStage1(),
      { evaluator: "semantic-judge", criterion: "c1", verdict: "pass", score: 0.95, confidence: 0.95, self_reported_confidence: 0.95, rationale: "", evidence: [] },
      { score: 0.95, rationale_hash: "0".repeat(64), dissent_flag: false, individual_entries: [{ stage: 3, score: 0.95, self_reported_confidence: 0.95, model: "claude-opus-4-7", model_version: "v", prompt_version: "consensus-panel/1.0" }] },
    );
    runCascade(makeCriterion({ axis: "security" }), defaultPolicy({ stage3_axes: ["security"], stage3_threshold: 0.5 }), deepBriefContract(), {
      mechanicalChecker: stubs.mechanicalChecker,
      semanticJudge: stubs.semanticJudge,
      consensusPanel: stubs.consensusPanel,
    });
    expect(stubs.conCalls).toBe(1);
  });

  it("trigger (c): stage1 emits explicit conflict_signal → fires", () => {
    const stubs = makeRecordingStubs(
      { pass: false, confidence: 0, matched_anchors: ["a"], conflict_signal: true },
      { evaluator: "semantic-judge", criterion: "c1", verdict: "pass", score: 0.95, confidence: 0.95, self_reported_confidence: 0.95, rationale: "", evidence: [] },
      { score: 0.95, rationale_hash: "0".repeat(64), dissent_flag: false, individual_entries: [{ stage: 3, score: 0.95, self_reported_confidence: 0.95, model: "claude-opus-4-7", model_version: "v", prompt_version: "consensus-panel/1.0" }] },
    );
    runCascade(makeCriterion({ axis: "data" }), defaultPolicy({ stage3_axes: [], stage3_threshold: 0.5 }), deepBriefContract({ axis_depth: { security: "standard", data: "standard", correctness: "standard", ux: "standard", perf: "standard" } }), {
      mechanicalChecker: stubs.mechanicalChecker,
      semanticJudge: stubs.semanticJudge,
      consensusPanel: stubs.consensusPanel,
    });
    expect(stubs.conCalls).toBe(1);
  });

  it("trigger (d): stage2 evidence_conflict=true → fires", () => {
    const stubs = makeRecordingStubs(
      ambiguousStage1(),
      { evaluator: "semantic-judge", criterion: "c1", verdict: "pass", score: 0.95, confidence: 0.95, self_reported_confidence: 0.95, rationale: "", evidence: [], evidence_conflict: true },
      { score: 0.95, rationale_hash: "0".repeat(64), dissent_flag: false, individual_entries: [{ stage: 3, score: 0.95, self_reported_confidence: 0.95, model: "claude-opus-4-7", model_version: "v", prompt_version: "consensus-panel/1.0" }] },
    );
    runCascade(makeCriterion({ axis: "data" }), defaultPolicy({ stage3_axes: [], stage3_threshold: 0.5 }), deepBriefContract({ axis_depth: { security: "standard", data: "standard", correctness: "standard", ux: "standard", perf: "standard" } }), {
      mechanicalChecker: stubs.mechanicalChecker,
      semanticJudge: stubs.semanticJudge,
      consensusPanel: stubs.consensusPanel,
    });
    expect(stubs.conCalls).toBe(1);
  });

  it("NEGATIVE: low self_reported_confidence ALONE (no stage1 ambiguity, no other signal) does NOT trigger Stage 3", () => {
    const stubs = makeRecordingStubs(
      highConfidenceStage1(),
      { evaluator: "semantic-judge", criterion: "c1", verdict: "pass", score: 0.6, confidence: 0.6, self_reported_confidence: 0.4, rationale: "", evidence: [] },
      { score: 0.6, rationale_hash: "0".repeat(64), dissent_flag: false, individual_entries: [{ stage: 3, score: 0.6, self_reported_confidence: 0.6, model: "claude-opus-4-7", model_version: "v", prompt_version: "consensus-panel/1.0" }] },
    );
    const result = runCascade(makeCriterion({ axis: "data" }), defaultPolicy({ stage3_threshold: 0.7, stage3_axes: [] }), deepBriefContract({ axis_depth: { security: "standard", data: "standard", correctness: "standard", ux: "standard", perf: "standard" } }), {
      mechanicalChecker: stubs.mechanicalChecker,
      semanticJudge: stubs.semanticJudge,
      consensusPanel: stubs.consensusPanel,
    });
    expect(stubs.conCalls).toBe(0);
    expect(result.record.triggered_stage3).toBe(false);
  });

  it("NEGATIVE: stage 2 with high confidence and no other signal does NOT trigger Stage 3", () => {
    const stubs = makeRecordingStubs(
      ambiguousStage1(),
      { evaluator: "semantic-judge", criterion: "c1", verdict: "pass", score: 0.95, confidence: 0.95, self_reported_confidence: 0.95, rationale: "", evidence: [] },
      { score: 0.95, rationale_hash: "0".repeat(64), dissent_flag: false, individual_entries: [{ stage: 3, score: 0.95, self_reported_confidence: 0.95, model: "claude-opus-4-7", model_version: "v", prompt_version: "consensus-panel/1.0" }] },
    );
    runCascade(
      makeCriterion({ axis: "data" }),
      defaultPolicy({ stage3_axes: [], stage3_threshold: 0.5 }),
      deepBriefContract({ axis_depth: { security: "standard", data: "standard", correctness: "standard", ux: "standard", perf: "standard" } }),
      { mechanicalChecker: stubs.mechanicalChecker, semanticJudge: stubs.semanticJudge, consensusPanel: stubs.consensusPanel },
    );
    expect(stubs.conCalls).toBe(0);
  });
});
