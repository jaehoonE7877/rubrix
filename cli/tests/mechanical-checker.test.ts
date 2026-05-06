import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { runCascade } from "../src/core/cascade.ts";
import { defaultPolicy, deepBriefContract, makeCriterion, makeRecordingStubs } from "./helpers-cascade.ts";

const here = dirname(fileURLToPath(import.meta.url));
const AGENT_PATH = resolve(here, "../../agents/mechanical-checker.md");
const AGENT_TEXT = readFileSync(AGENT_PATH, "utf8");

describe("mechanical-checker agent file (Stage 1)", () => {
  it("declares name=mechanical-checker in frontmatter", () => {
    expect(AGENT_TEXT).toMatch(/^---[\s\S]*?\nname:\s*mechanical-checker\b/);
  });

  it("declares Read, Grep, Bash tools (Stage 1 needs all three for grep+verify)", () => {
    const fm = AGENT_TEXT.split("---")[1] ?? "";
    expect(fm).toMatch(/tools:.*\bRead\b/);
    expect(fm).toMatch(/tools:.*\bGrep\b/);
    expect(fm).toMatch(/tools:.*\bBash\b/);
  });

  it("body documents the {pass, confidence, matched_anchors} JSON output contract", () => {
    expect(AGENT_TEXT).toContain("\"pass\"");
    expect(AGENT_TEXT).toContain("\"confidence\"");
    expect(AGENT_TEXT).toContain("\"matched_anchors\"");
  });

  it("body declares the zero-model-call invariant", () => {
    expect(AGENT_TEXT.toLowerCase()).toContain("zero model call");
  });
});

describe("mechanical-checker layer in cascade orchestrator", () => {
  it("short-circuits at Stage 1 when confidence=1 and pass=true (no Stage 2 / Stage 3 calls)", () => {
    const stubs = makeRecordingStubs(
      { pass: true, confidence: 1, matched_anchors: ["anchor1"] },
      { evaluator: "semantic-judge", criterion: "c1", verdict: "pass", score: 0.9, confidence: 0.9, self_reported_confidence: 0.9, rationale: "", evidence: [] },
      {
        score: 0.9,
        rationale_hash: "0".repeat(64),
        dissent_flag: false,
        individual_entries: [
          { stage: 3, score: 0.9, self_reported_confidence: 0.9, model: "claude-opus-4-7", model_version: "v", prompt_version: "consensus-panel/1.0" },
        ],
      },
    );

    let record: import("../src/core/cascade.ts").CascadeInternalRecord | undefined;
    const caller = runCascade(makeCriterion(), defaultPolicy(), deepBriefContract(), {
      mechanicalChecker: stubs.mechanicalChecker,
      semanticJudge: stubs.semanticJudge,
      consensusPanel: stubs.consensusPanel,
      recordSink: (r) => { record = r; },
    });

    expect(stubs.mechCalls).toBe(1);
    expect(stubs.semCalls).toBe(0);
    expect(stubs.conCalls).toBe(0);
    expect(caller.score).toBe(1);
    expect(record!.triggered_stage3).toBe(false);
    expect(record!.stage_history).toHaveLength(1);
    expect(record!.stage_history[0].stage).toBe(1);
  });

  it("escalates to Stage 2 when Stage 1 confidence=0 (ambiguous)", () => {
    const stubs = makeRecordingStubs(
      { pass: false, confidence: 0, matched_anchors: [] },
      { evaluator: "semantic-judge", criterion: "c1", verdict: "pass", score: 0.85, confidence: 0.85, self_reported_confidence: 0.85, rationale: "", evidence: [] },
      {
        score: 0.85,
        rationale_hash: "0".repeat(64),
        dissent_flag: false,
        individual_entries: [
          { stage: 3, score: 0.85, self_reported_confidence: 0.85, model: "claude-opus-4-7", model_version: "v", prompt_version: "consensus-panel/1.0" },
        ],
      },
    );

    runCascade(
      makeCriterion({ axis: "data" }),
      defaultPolicy(),
      deepBriefContract({
        axis_depth: { security: "standard", correctness: "standard", data: "standard", ux: "standard", perf: "standard" },
      }),
      {
        mechanicalChecker: stubs.mechanicalChecker,
        semanticJudge: stubs.semanticJudge,
        consensusPanel: stubs.consensusPanel,
      },
    );

    expect(stubs.mechCalls).toBe(1);
    expect(stubs.semCalls).toBe(1);
    expect(stubs.conCalls).toBe(0);
  });

  it("when no anchors match and verify is missing, emits confidence=0 to escalate", () => {
    const stubs = makeRecordingStubs(
      { pass: false, confidence: 0, matched_anchors: [] },
      { evaluator: "semantic-judge", criterion: "c1", verdict: "needs_more_evidence", score: 0, confidence: 0.2, self_reported_confidence: 0.2, rationale: "", evidence: [] },
      {
        score: 0,
        rationale_hash: "0".repeat(64),
        dissent_flag: false,
        individual_entries: [],
      },
    );

    let record: import("../src/core/cascade.ts").CascadeInternalRecord | undefined;
    runCascade(
      makeCriterion({ verify: undefined }),
      defaultPolicy(),
      deepBriefContract({
        axis_depth: { security: "standard", correctness: "standard", data: "standard", ux: "standard", perf: "standard" },
      }),
      {
        mechanicalChecker: stubs.mechanicalChecker,
        semanticJudge: stubs.semanticJudge,
        consensusPanel: stubs.consensusPanel,
        recordSink: (r) => { record = r; },
      },
    );

    expect(stubs.mechCalls).toBe(1);
    expect(stubs.semCalls).toBe(1);
    expect(record!.stage_history.find((e) => e.stage === 1)?.self_reported_confidence).toBe(0);
  });
});
