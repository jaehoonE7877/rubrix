import { describe, expect, it } from "vitest";
import { defaultPolicy, deepBriefContract, makeCriterion, makeRecordingStubs , runCascadeForTest} from "./helpers-cascade.ts";

describe("stage_history records v1.4 drift inputs", () => {
  it("Stage 1 entry carries model, model_version, prompt_version", () => {
    const stubs = makeRecordingStubs(
      { pass: true, confidence: 1, matched_anchors: ["a"] },
      { evaluator: "semantic-judge", criterion: "c", verdict: "pass", score: 1, confidence: 1, self_reported_confidence: 1, rationale: "", evidence: [] },
      { score: 1, rationale_hash: "0".repeat(64), dissent_flag: false, individual_entries: [] },
    );
    const r = runCascadeForTest(makeCriterion(), defaultPolicy(), deepBriefContract(), {
      mechanicalChecker: stubs.mechanicalChecker,
      semanticJudge: stubs.semanticJudge,
      consensusPanel: stubs.consensusPanel,
    });
    const entry = r.record.stage_history.find((e) => e.stage === 1);
    expect(entry).toBeDefined();
    expect(entry!.model).toBe("deterministic");
    expect(entry!.model_version).toBe("mechanical-checker/1.0");
    expect(entry!.prompt_version).toBe("mechanical-checker/1.0");
  });

  it("Stage 2 entry carries claude-sonnet-4-6 model identity", () => {
    const stubs = makeRecordingStubs(
      { pass: false, confidence: 0, matched_anchors: [] },
      { evaluator: "semantic-judge", criterion: "c", verdict: "pass", score: 0.85, confidence: 0.85, self_reported_confidence: 0.85, rationale: "", evidence: [] },
      { score: 0.85, rationale_hash: "0".repeat(64), dissent_flag: false, individual_entries: [] },
    );
    const r = runCascadeForTest(
      makeCriterion({ axis: "data" }),
      defaultPolicy({ stage3_axes: [] }),
      deepBriefContract({ axis_depth: { security: "standard", correctness: "standard", data: "standard", ux: "standard", perf: "standard" } }),
      { mechanicalChecker: stubs.mechanicalChecker, semanticJudge: stubs.semanticJudge, consensusPanel: stubs.consensusPanel },
    );
    const entry = r.record.stage_history.find((e) => e.stage === 2);
    expect(entry).toBeDefined();
    expect(entry!.model).toBe("claude-sonnet-4-6");
    expect(entry!.model_version).toBeTruthy();
    expect(entry!.prompt_version).toBe("semantic-judge/1.0");
  });

  it("Stage 3 entries carry the consensus-panel/1.0 prompt version", () => {
    const stubs = makeRecordingStubs(
      { pass: false, confidence: 0, matched_anchors: ["a"], conflict_signal: true },
      { evaluator: "semantic-judge", criterion: "c", verdict: "pass", score: 0.6, confidence: 0.6, self_reported_confidence: 0.5, rationale: "", evidence: [] },
      {
        score: 0.7,
        rationale_hash: "0".repeat(64),
        dissent_flag: false,
        individual_entries: [
          { stage: 3, score: 0.7, self_reported_confidence: 0.7, model: "claude-opus-4-7", model_version: "claude-opus-4-7-20260301", prompt_version: "consensus-panel/1.0" },
          { stage: 3, score: 0.65, self_reported_confidence: 0.65, model: "claude-sonnet-4-6", model_version: "claude-sonnet-4-6-20260301", prompt_version: "consensus-panel/1.0" },
          { stage: 3, score: 0.75, self_reported_confidence: 0.7, model: "claude-sonnet-4-6", model_version: "claude-sonnet-4-6-20260301", prompt_version: "consensus-panel/1.0" },
        ],
      },
    );
    const r = runCascadeForTest(makeCriterion({ axis: "security" }), defaultPolicy(), deepBriefContract(), {
      mechanicalChecker: stubs.mechanicalChecker,
      semanticJudge: stubs.semanticJudge,
      consensusPanel: stubs.consensusPanel,
    });
    const stage3Entries = r.record.stage_history.filter((e) => e.stage === 3);
    expect(stage3Entries.length).toBe(3);
    for (const e of stage3Entries) {
      expect(e.model).toMatch(/claude-(opus|sonnet)-4-/);
      expect(e.model_version).toMatch(/^claude-(opus|sonnet)-4-/);
      expect(e.prompt_version).toBe("consensus-panel/1.0");
    }
  });

  it("every stage_history entry across an end-to-end cascade has model+model_version+prompt_version populated", () => {
    const stubs = makeRecordingStubs(
      { pass: false, confidence: 0, matched_anchors: ["a"], conflict_signal: true },
      { evaluator: "semantic-judge", criterion: "c", verdict: "pass", score: 0.7, confidence: 0.7, self_reported_confidence: 0.6, rationale: "", evidence: [] },
      {
        score: 0.75,
        rationale_hash: "0".repeat(64),
        dissent_flag: false,
        individual_entries: [
          { stage: 3, score: 0.75, self_reported_confidence: 0.75, model: "claude-opus-4-7", model_version: "v1", prompt_version: "consensus-panel/1.0" },
        ],
      },
    );
    const r = runCascadeForTest(makeCriterion({ axis: "security" }), defaultPolicy(), deepBriefContract(), {
      mechanicalChecker: stubs.mechanicalChecker,
      semanticJudge: stubs.semanticJudge,
      consensusPanel: stubs.consensusPanel,
    });
    for (const entry of r.record.stage_history) {
      expect(entry.model).toBeTruthy();
      expect(entry.model_version).toBeTruthy();
      expect(entry.prompt_version).toBeTruthy();
    }
  });
});
