import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { defaultPolicy, deepBriefContract, makeCriterion, makeRecordingStubs , runCascadeForTest} from "./helpers-cascade.ts";

const here = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(here, "../..");
const SJ_PATH = resolve(REPO_ROOT, "agents/semantic-judge.md");
const OJ_PATH = resolve(REPO_ROOT, "agents/output-judge.md");

const SJ_TEXT = readFileSync(SJ_PATH, "utf8");
const OJ_TEXT = readFileSync(OJ_PATH, "utf8");

describe("semantic-judge agent file (Stage 2)", () => {
  it("declares name=semantic-judge in frontmatter", () => {
    expect(SJ_TEXT).toMatch(/^---[\s\S]*?\nname:\s*semantic-judge\b/);
  });

  it("declares Read, Glob, Grep tools (semantic-judge inherits output-judge tool surface)", () => {
    const fm = SJ_TEXT.split("---")[1] ?? "";
    expect(fm).toMatch(/tools:.*\bRead\b/);
    expect(fm).toMatch(/tools:.*\bGlob\b/);
    expect(fm).toMatch(/tools:.*\bGrep\b/);
  });

  it("body mandates self_reported_confidence on output (Codex critical #2)", () => {
    expect(SJ_TEXT).toContain("self_reported_confidence");
    expect(SJ_TEXT.toLowerCase()).toContain("required");
  });

  it("body documents that single low confidence alone does NOT trigger Stage 3", () => {
    expect(SJ_TEXT.toLowerCase()).toMatch(/not\s+alone/);
  });
});

describe("output-judge.md preservation (PR #3 will deprecate, PR #2 must NOT touch)", () => {
  it("file still exists with name=output-judge", () => {
    expect(OJ_TEXT).toMatch(/^---[\s\S]*?\nname:\s*output-judge\b/);
  });

  it("PR #2 does NOT add deprecated_in marker (that lands in PR #3)", () => {
    expect(OJ_TEXT).not.toContain("deprecated_in");
  });
});

describe("semantic-judge layer in cascade orchestrator", () => {
  it("orchestrator stage_history records self_reported_confidence on Stage 2 entries", () => {
    const stubs = makeRecordingStubs(
      { pass: false, confidence: 0, matched_anchors: [] },
      {
        evaluator: "semantic-judge",
        criterion: "c1",
        verdict: "pass",
        score: 0.85,
        confidence: 0.85,
        self_reported_confidence: 0.78,
        rationale: "",
        evidence: ["ev-1"],
      },
      {
        score: 0.85,
        rationale_hash: "0".repeat(64),
        dissent_flag: false,
        individual_entries: [],
      },
    );

    const result = runCascadeForTest(
      makeCriterion({ axis: "data" }),
      defaultPolicy(),
      deepBriefContract({
        axis_depth: { security: "standard", correctness: "standard", data: "standard", ux: "standard", perf: "standard" },
      }),
      { mechanicalChecker: stubs.mechanicalChecker, semanticJudge: stubs.semanticJudge, consensusPanel: stubs.consensusPanel },
    );

    const stage2Entry = result.record.stage_history.find((e) => e.stage === 2);
    expect(stage2Entry).toBeDefined();
    expect(stage2Entry!.self_reported_confidence).toBe(0.78);
    expect(stage2Entry!.score).toBe(0.85);
  });

  it("orchestrator never persists semantic-judge rationale or evidence array as caller-visible return", () => {
    const stubs = makeRecordingStubs(
      { pass: false, confidence: 0, matched_anchors: [] },
      {
        evaluator: "semantic-judge",
        criterion: "c1",
        verdict: "pass",
        score: 0.9,
        confidence: 0.9,
        self_reported_confidence: 0.9,
        rationale: "RATIONALE_SHOULD_NOT_LEAK",
        evidence: ["EVIDENCE_SHOULD_NOT_LEAK"],
      },
      {
        score: 0.9,
        rationale_hash: "0".repeat(64),
        dissent_flag: false,
        individual_entries: [],
      },
    );

    const result = runCascadeForTest(
      makeCriterion({ axis: "data" }),
      defaultPolicy(),
      deepBriefContract({
        axis_depth: { security: "standard", correctness: "standard", data: "standard", ux: "standard", perf: "standard" },
      }),
      { mechanicalChecker: stubs.mechanicalChecker, semanticJudge: stubs.semanticJudge, consensusPanel: stubs.consensusPanel },
    );

    const callerJson = JSON.stringify(result.caller);
    expect(callerJson).not.toContain("RATIONALE_SHOULD_NOT_LEAK");
    expect(callerJson).not.toContain("EVIDENCE_SHOULD_NOT_LEAK");
  });
});
