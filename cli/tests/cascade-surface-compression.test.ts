import { describe, expect, it } from "vitest";
import { defaultPolicy, deepBriefContract, makeCriterion, makeRecordingStubs , runCascadeForTest} from "./helpers-cascade.ts";

describe("main-thread surface compression (Codex critical context-isolation)", () => {
  it("runCascade caller return value has EXACTLY {score, rationale_hash, dissent_flag} keys (Stage 1 short-circuit)", () => {
    const stubs = makeRecordingStubs(
      { pass: true, confidence: 1, matched_anchors: ["a"] },
      { evaluator: "semantic-judge", criterion: "c", verdict: "pass", score: 1, confidence: 1, self_reported_confidence: 1, rationale: "should-not-leak", evidence: [] },
      { score: 1, rationale_hash: "0".repeat(64), dissent_flag: false, individual_entries: [] },
    );
    const r = runCascadeForTest(makeCriterion(), defaultPolicy(), deepBriefContract(), {
      mechanicalChecker: stubs.mechanicalChecker,
      semanticJudge: stubs.semanticJudge,
      consensusPanel: stubs.consensusPanel,
    });
    expect(Object.keys(r.caller).sort()).toEqual(["dissent_flag", "rationale_hash", "score"]);
  });

  it("runCascade caller return value has EXACTLY {score, rationale_hash, dissent_flag} keys (Stage 2 path)", () => {
    const stubs = makeRecordingStubs(
      { pass: false, confidence: 0, matched_anchors: [] },
      { evaluator: "semantic-judge", criterion: "c", verdict: "pass", score: 0.85, confidence: 0.85, self_reported_confidence: 0.85, rationale: "should-not-leak", evidence: ["ev"] },
      { score: 0.85, rationale_hash: "0".repeat(64), dissent_flag: false, individual_entries: [] },
    );
    const r = runCascadeForTest(
      makeCriterion({ axis: "data" }),
      defaultPolicy({ stage3_axes: [] }),
      deepBriefContract({ axis_depth: { security: "standard", correctness: "standard", data: "standard", ux: "standard", perf: "standard" } }),
      { mechanicalChecker: stubs.mechanicalChecker, semanticJudge: stubs.semanticJudge, consensusPanel: stubs.consensusPanel },
    );
    expect(Object.keys(r.caller).sort()).toEqual(["dissent_flag", "rationale_hash", "score"]);
  });

  it("runCascade caller return value has EXACTLY {score, rationale_hash, dissent_flag} keys (Stage 3 path)", () => {
    const stubs = makeRecordingStubs(
      { pass: false, confidence: 0, matched_anchors: ["a"], conflict_signal: true },
      { evaluator: "semantic-judge", criterion: "c", verdict: "pass", score: 0.6, confidence: 0.6, self_reported_confidence: 0.5, rationale: "should-not-leak", evidence: [] },
      {
        score: 0.7,
        rationale_hash: "f".repeat(64),
        dissent_flag: true,
        individual_entries: [
          { stage: 3, score: 0.7, self_reported_confidence: 0.7, model: "claude-opus-4-7", model_version: "individual-vote-marker", prompt_version: "consensus-panel/1.0" },
        ],
      },
    );
    const r = runCascadeForTest(makeCriterion({ axis: "security" }), defaultPolicy(), deepBriefContract(), {
      mechanicalChecker: stubs.mechanicalChecker,
      semanticJudge: stubs.semanticJudge,
      consensusPanel: stubs.consensusPanel,
    });
    expect(Object.keys(r.caller).sort()).toEqual(["dissent_flag", "rationale_hash", "score"]);
  });

  it("individual reviewer model_version markers do NOT appear in JSON.stringify(caller)", () => {
    const stubs = makeRecordingStubs(
      { pass: false, confidence: 0, matched_anchors: ["a"], conflict_signal: true },
      { evaluator: "semantic-judge", criterion: "c", verdict: "pass", score: 0.6, confidence: 0.6, self_reported_confidence: 0.5, rationale: "RATIONALE_LEAK_MARKER", evidence: ["EVIDENCE_LEAK_MARKER"] },
      {
        score: 0.7,
        rationale_hash: "f".repeat(64),
        dissent_flag: true,
        individual_entries: [
          { stage: 3, score: 0.6, self_reported_confidence: 0.85, model: "claude-opus-4-7", model_version: "OPUS_LEAK_MARKER", prompt_version: "consensus-panel/1.0" },
          { stage: 3, score: 0.7, self_reported_confidence: 0.7, model: "claude-sonnet-4-6", model_version: "SONNET_A_LEAK_MARKER", prompt_version: "consensus-panel/1.0" },
          { stage: 3, score: 0.9, self_reported_confidence: 0.9, model: "claude-sonnet-4-6", model_version: "SONNET_B_LEAK_MARKER", prompt_version: "consensus-panel/1.0" },
        ],
      },
    );
    const r = runCascadeForTest(makeCriterion({ axis: "security" }), defaultPolicy(), deepBriefContract(), {
      mechanicalChecker: stubs.mechanicalChecker,
      semanticJudge: stubs.semanticJudge,
      consensusPanel: stubs.consensusPanel,
    });
    const callerJson = JSON.stringify(r.caller);
    for (const marker of [
      "RATIONALE_LEAK_MARKER",
      "EVIDENCE_LEAK_MARKER",
      "OPUS_LEAK_MARKER",
      "SONNET_A_LEAK_MARKER",
      "SONNET_B_LEAK_MARKER",
    ]) {
      expect(callerJson).not.toContain(marker);
    }
  });

  it("contract-side stage_history DOES contain the individual entries (audit trail) — separation between caller surface and contract surface", () => {
    const stubs = makeRecordingStubs(
      { pass: false, confidence: 0, matched_anchors: ["a"], conflict_signal: true },
      { evaluator: "semantic-judge", criterion: "c", verdict: "pass", score: 0.6, confidence: 0.6, self_reported_confidence: 0.5, rationale: "", evidence: [] },
      {
        score: 0.7,
        rationale_hash: "f".repeat(64),
        dissent_flag: true,
        individual_entries: [
          { stage: 3, score: 0.6, self_reported_confidence: 0.85, model: "claude-opus-4-7", model_version: "OPUS_AUDIT", prompt_version: "consensus-panel/1.0" },
          { stage: 3, score: 0.9, self_reported_confidence: 0.9, model: "claude-sonnet-4-6", model_version: "SONNET_AUDIT", prompt_version: "consensus-panel/1.0" },
        ],
      },
    );
    const r = runCascadeForTest(makeCriterion({ axis: "security" }), defaultPolicy(), deepBriefContract(), {
      mechanicalChecker: stubs.mechanicalChecker,
      semanticJudge: stubs.semanticJudge,
      consensusPanel: stubs.consensusPanel,
    });
    const recordJson = JSON.stringify(r.record.stage_history);
    expect(recordJson).toContain("OPUS_AUDIT");
    expect(recordJson).toContain("SONNET_AUDIT");
  });
});
