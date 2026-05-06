import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { runCascade } from "../src/core/cascade.ts";
import { defaultPolicy, deepBriefContract, makeCriterion, makeRecordingStubs } from "./helpers-cascade.ts";

const here = dirname(fileURLToPath(import.meta.url));
const CP_PATH = resolve(here, "../../agents/consensus-panel.md");
const CP_TEXT = readFileSync(CP_PATH, "utf8");

describe("consensus-panel agent file (Stage 3)", () => {
  it("declares name=consensus-panel in frontmatter", () => {
    expect(CP_TEXT).toMatch(/^---[\s\S]*?\nname:\s*consensus-panel\b/);
  });

  it("declares Read-only tool surface", () => {
    const fm = CP_TEXT.split("---")[1] ?? "";
    expect(fm).toMatch(/tools:\s*Read\b/);
  });

  it("documents the ensemble identity (opus x1 + sonnet x2)", () => {
    expect(CP_TEXT).toContain("claude-opus-4-7");
    expect(CP_TEXT).toContain("claude-sonnet-4-6");
  });

  it("documents the strict 3-field return contract {score, rationale_hash, dissent_flag}", () => {
    expect(CP_TEXT).toContain("score");
    expect(CP_TEXT).toContain("rationale_hash");
    expect(CP_TEXT).toContain("dissent_flag");
  });

  it("explicitly forbids leaking individual reviewer rationales to the caller", () => {
    expect(CP_TEXT.toLowerCase()).toContain("do not include");
    expect(CP_TEXT.toLowerCase()).toContain("individual");
  });
});

describe("consensus-panel layer in cascade orchestrator (Stage 3 surface compression)", () => {
  it("when Stage 3 fires, caller-visible return has EXACTLY {score, rationale_hash, dissent_flag} keys", () => {
    const stubs = makeRecordingStubs(
      { pass: false, confidence: 0, matched_anchors: [] },
      {
        evaluator: "semantic-judge",
        criterion: "c1",
        verdict: "pass",
        score: 0.6,
        confidence: 0.6,
        self_reported_confidence: 0.4,
        rationale: "stage 2 rationale",
        evidence: ["ev"],
      },
      {
        score: 0.7,
        rationale_hash: "f".repeat(64),
        dissent_flag: true,
        individual_entries: [
          { stage: 3, score: 0.6, self_reported_confidence: 0.85, model: "claude-opus-4-7", model_version: "v1", prompt_version: "consensus-panel/1.0" },
          { stage: 3, score: 0.7, self_reported_confidence: 0.7, model: "claude-sonnet-4-6", model_version: "v2", prompt_version: "consensus-panel/1.0" },
          { stage: 3, score: 0.9, self_reported_confidence: 0.9, model: "claude-sonnet-4-6", model_version: "v2", prompt_version: "consensus-panel/1.0" },
        ],
      },
    );

    const result = runCascade(makeCriterion({ axis: "security" }), defaultPolicy(), deepBriefContract(), {
      mechanicalChecker: stubs.mechanicalChecker,
      semanticJudge: stubs.semanticJudge,
      consensusPanel: stubs.consensusPanel,
    });

    expect(stubs.conCalls).toBe(1);
    expect(Object.keys(result.caller).sort()).toEqual(["dissent_flag", "rationale_hash", "score"]);
    expect(result.caller.score).toBe(0.7);
    expect(result.caller.dissent_flag).toBe(true);
    expect(result.caller.rationale_hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("orchestrator records all 3 individual reviewer entries in stage_history (audit trail) but caller never sees them", () => {
    const individual = [
      { stage: 3 as const, score: 0.6, self_reported_confidence: 0.85, model: "claude-opus-4-7", model_version: "v1", prompt_version: "consensus-panel/1.0" },
      { stage: 3 as const, score: 0.7, self_reported_confidence: 0.7, model: "claude-sonnet-4-6", model_version: "v2", prompt_version: "consensus-panel/1.0" },
      { stage: 3 as const, score: 0.9, self_reported_confidence: 0.9, model: "claude-sonnet-4-6", model_version: "v2", prompt_version: "consensus-panel/1.0" },
    ];
    const stubs = makeRecordingStubs(
      { pass: false, confidence: 0, matched_anchors: [] },
      { evaluator: "semantic-judge", criterion: "c1", verdict: "pass", score: 0.6, confidence: 0.6, self_reported_confidence: 0.4, rationale: "", evidence: [] },
      { score: 0.7, rationale_hash: "f".repeat(64), dissent_flag: true, individual_entries: individual },
    );

    const result = runCascade(makeCriterion({ axis: "security" }), defaultPolicy(), deepBriefContract(), {
      mechanicalChecker: stubs.mechanicalChecker,
      semanticJudge: stubs.semanticJudge,
      consensusPanel: stubs.consensusPanel,
    });

    const stage3Entries = result.record.stage_history.filter((e) => e.stage === 3);
    expect(stage3Entries).toHaveLength(3);
    const callerJson = JSON.stringify(result.caller);
    for (const entry of individual) {
      expect(callerJson).not.toContain(entry.model_version);
    }
  });

  it("dissent_flag preserved on caller return", () => {
    const stubs = makeRecordingStubs(
      { pass: false, confidence: 0, matched_anchors: [] },
      { evaluator: "semantic-judge", criterion: "c1", verdict: "pass", score: 0.5, confidence: 0.5, self_reported_confidence: 0.4, rationale: "", evidence: [] },
      { score: 0.65, rationale_hash: "a".repeat(64), dissent_flag: true, individual_entries: [{ stage: 3, score: 0.65, self_reported_confidence: 0.5, model: "claude-opus-4-7", model_version: "v", prompt_version: "consensus-panel/1.0" }] },
    );

    const result = runCascade(makeCriterion({ axis: "security" }), defaultPolicy(), deepBriefContract(), {
      mechanicalChecker: stubs.mechanicalChecker,
      semanticJudge: stubs.semanticJudge,
      consensusPanel: stubs.consensusPanel,
    });
    expect(result.caller.dissent_flag).toBe(true);
  });
});
