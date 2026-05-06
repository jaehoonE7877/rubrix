import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { scoreCommand } from "../src/commands/score.ts";
import { tempContractFile } from "./helpers.ts";
import { defaultPolicy, deepBriefContract } from "./helpers-cascade.ts";
import type { RubrixContract } from "../src/core/contract.ts";

function captureStdout(fn: () => number): { code: number; out: string } {
  const orig = process.stdout.write.bind(process.stdout);
  let buf = "";
  process.stdout.write = ((s: string | Uint8Array) => {
    buf += typeof s === "string" ? s : Buffer.from(s).toString();
    return true;
  }) as typeof process.stdout.write;
  try {
    const code = fn();
    return { code, out: buf };
  } finally {
    process.stdout.write = orig;
  }
}

function smallScoringContract(): RubrixContract {
  const c = deepBriefContract();
  c.rubric = {
    threshold: 0.5,
    criteria: [
      { id: "a", description: "first", weight: 0.5, floor: 0.5, axis: "security", verify: "echo a" },
      { id: "b", description: "second", weight: 0.5, floor: 0.5, axis: "data", verify: "echo b" },
    ],
  };
  c.matrix = { rows: [{ id: "ra", criterion: "a", evidence_required: "x" }, { id: "rb", criterion: "b", evidence_required: "y" }] };
  c.plan = { steps: [{ id: "sa", action: "do a" }, { id: "sb", action: "do b" }] };
  c.evaluation_policy = defaultPolicy();
  c.state = "PlanLocked";
  c.locks = { rubric: true, matrix: true, plan: true };
  return c;
}

describe("rubrix score stdout = aggregate only (Codex critical context-isolation)", () => {
  it("first stdout line matches /^passed=\\d+ skipped=\\d+ blockers=\\d+/", () => {
    const path = tempContractFile(smallScoringContract());
    const stubReturning = (score: number) => ({
      mechanicalChecker: () => ({ pass: true, confidence: 1 as const, matched_anchors: ["x"] }),
      semanticJudge: (criterion: { id: string }) => ({
        evaluator: "semantic-judge" as const,
        criterion: criterion.id,
        verdict: "pass" as const,
        score,
        confidence: score,
        self_reported_confidence: score,
        rationale: "",
        evidence: [],
      }),
      consensusPanel: () => ({
        score,
        rationale_hash: "0".repeat(64),
        dissent_flag: false,
        individual_entries: [],
      }),
    });
    const { code, out } = captureStdout(() => scoreCommand({ path, cascadeOptions: stubReturning(0.9) }));
    expect(code).toBe(0);
    const firstLine = out.split("\n")[0];
    expect(firstLine).toMatch(/^passed=\d+ skipped=\d+ blockers=\d+$/);
  });

  it("stdout contains NO per-criterion verdict, rationale, or frontier vote text", () => {
    const path = tempContractFile(smallScoringContract());
    const { out } = captureStdout(() =>
      scoreCommand({
        path,
        cascadeOptions: {
          mechanicalChecker: () => ({ pass: false, confidence: 0, matched_anchors: [] }),
          semanticJudge: (criterion) => ({
            evaluator: "semantic-judge",
            criterion: criterion.id,
            verdict: "pass",
            score: 0.85,
            confidence: 0.85,
            self_reported_confidence: 0.85,
            rationale: "RATIONALE_LEAK_TO_STDOUT",
            evidence: ["EVIDENCE_LEAK_TO_STDOUT"],
          }),
          consensusPanel: () => ({
            score: 0.85,
            rationale_hash: "0".repeat(64),
            dissent_flag: false,
            individual_entries: [
              { stage: 3, score: 0.85, self_reported_confidence: 0.85, model: "claude-opus-4-7", model_version: "VOTE_LEAK_TO_STDOUT", prompt_version: "consensus-panel/1.0" },
            ],
          }),
        },
      }),
    );
    expect(out).not.toContain("RATIONALE_LEAK_TO_STDOUT");
    expect(out).not.toContain("EVIDENCE_LEAK_TO_STDOUT");
    expect(out).not.toContain("VOTE_LEAK_TO_STDOUT");
  });

  it("when blockers > 0, stderr (NOT stdout) adds the 'use --explain <id> for details' hint", () => {
    const path = tempContractFile(smallScoringContract());
    const origErr = process.stderr.write.bind(process.stderr);
    let errBuf = "";
    process.stderr.write = ((s: string | Uint8Array) => {
      errBuf += typeof s === "string" ? s : Buffer.from(s).toString();
      return true;
    }) as typeof process.stderr.write;
    const { out } = captureStdout(() =>
      scoreCommand({
        path,
        cascadeOptions: {
          mechanicalChecker: () => ({ pass: false, confidence: 1, matched_anchors: [] }),
          semanticJudge: (criterion) => ({
            evaluator: "semantic-judge",
            criterion: criterion.id,
            verdict: "fail",
            score: 0,
            confidence: 1,
            self_reported_confidence: 1,
            rationale: "",
            evidence: [],
          }),
          consensusPanel: () => ({ score: 0, rationale_hash: "0".repeat(64), dissent_flag: false, individual_entries: [] }),
        },
      }),
    );
    process.stderr.write = origErr;
    expect(out).not.toContain("use --explain");
    expect(errBuf).toContain("use --explain");
  });

  it("when scores are clean (no blockers, no skips), stdout does NOT print the --explain hint", () => {
    const path = tempContractFile(smallScoringContract());
    const { out } = captureStdout(() =>
      scoreCommand({
        path,
        cascadeOptions: {
          mechanicalChecker: () => ({ pass: true, confidence: 1, matched_anchors: ["x"] }),
          semanticJudge: (c) => ({ evaluator: "semantic-judge", criterion: c.id, verdict: "pass", score: 1, confidence: 1, self_reported_confidence: 1, rationale: "", evidence: [] }),
          consensusPanel: () => ({ score: 1, rationale_hash: "0".repeat(64), dissent_flag: false, individual_entries: [] }),
        },
      }),
    );
    expect(out).not.toContain("use --explain");
  });

  it("score command shares budget state across criteria (cap is per-run, not per-criterion)", () => {
    const c = smallScoringContract();
    c.rubric!.criteria = [
      { id: "a", description: "first", weight: 0.5, floor: 0.5, axis: "security", verify: "echo a" },
      { id: "b", description: "second", weight: 0.5, floor: 0.5, axis: "security", verify: "echo b" },
    ];
    const path = tempContractFile(c);
    const stage3Hits: string[] = [];
    captureStdout(() =>
      scoreCommand({
        path,
        cascadeOptions: {
          mechanicalChecker: () => ({ pass: false, confidence: 0, matched_anchors: ["a"], conflict_signal: true }),
          semanticJudge: (criterion) => ({ evaluator: "semantic-judge", criterion: criterion.id, verdict: "pass", score: 0.8, confidence: 0.8, self_reported_confidence: 0.8, rationale: "", evidence: [] }),
          consensusPanel: (criterion) => {
            stage3Hits.push(criterion.id);
            return { score: 0.85, rationale_hash: "0".repeat(64), dissent_flag: false, individual_entries: [{ stage: 3, score: 0.85, self_reported_confidence: 0.85, model: "claude-opus-4-7", model_version: "v", prompt_version: "consensus-panel/1.0" }] };
          },
        },
      }),
    );
    const policyMaxStage3 = defaultPolicy().max_stage3_criteria;
    expect(policyMaxStage3).toBeGreaterThanOrEqual(2);
    expect(stage3Hits).toEqual(["a", "b"]);

    const c2 = smallScoringContract();
    c2.rubric!.criteria = Array.from({ length: 6 }, (_, i) => ({ id: `c${i}`, description: `crit${i}`, weight: 1 / 6, floor: 0.5, axis: "security" as const, verify: `echo c${i}` }));
    c2.evaluation_policy = defaultPolicy({ max_stage3_criteria: 2, stage3_axes: ["security"], stage3_threshold: 0.9 });
    const path2 = tempContractFile(c2);
    const stage3Hits2: string[] = [];
    captureStdout(() =>
      scoreCommand({
        path: path2,
        cascadeOptions: {
          mechanicalChecker: () => ({ pass: false, confidence: 0, matched_anchors: ["a"], conflict_signal: true }),
          semanticJudge: (criterion) => ({ evaluator: "semantic-judge", criterion: criterion.id, verdict: "pass", score: 0.8, confidence: 0.8, self_reported_confidence: 0.8, rationale: "", evidence: [] }),
          consensusPanel: (criterion) => {
            stage3Hits2.push(criterion.id);
            return { score: 0.85, rationale_hash: "0".repeat(64), dissent_flag: false, individual_entries: [{ stage: 3, score: 0.85, self_reported_confidence: 0.85, model: "claude-opus-4-7", model_version: "v", prompt_version: "consensus-panel/1.0" }] };
          },
        },
      }),
    );
    expect(stage3Hits2).toHaveLength(2);
  });

  it("after score runs, the contract file on disk has scores[] with full stage_history populated per criterion", () => {
    const path = tempContractFile(smallScoringContract());
    captureStdout(() =>
      scoreCommand({
        path,
        cascadeOptions: {
          mechanicalChecker: () => ({ pass: true, confidence: 1, matched_anchors: ["x"] }),
          semanticJudge: (c) => ({ evaluator: "semantic-judge", criterion: c.id, verdict: "pass", score: 0.9, confidence: 0.9, self_reported_confidence: 0.9, rationale: "", evidence: [] }),
          consensusPanel: () => ({ score: 0.9, rationale_hash: "0".repeat(64), dissent_flag: false, individual_entries: [] }),
        },
      }),
    );
    const persisted = JSON.parse(readFileSync(path, "utf8")) as RubrixContract;
    expect(persisted.scores?.length).toBe(2);
    for (const s of persisted.scores ?? []) {
      expect(s.stage_history).toBeDefined();
      expect(s.stage_history!.length).toBeGreaterThan(0);
      for (const e of s.stage_history!) {
        expect(e.model).toBeTruthy();
        expect(e.model_version).toBeTruthy();
        expect(e.prompt_version).toBeTruthy();
      }
    }
  });
});
