import { describe, expect, it } from "vitest";
import { scoreCommand, type ScoreOptions } from "../src/commands/score.ts";
import { tempContractFile } from "./helpers.ts";
import { defaultPolicy, deepBriefContract } from "./helpers-cascade.ts";
import type { RubrixContract } from "../src/core/contract.ts";

function captureStderr(fn: () => number): { code: number; err: string } {
  const orig = process.stderr.write.bind(process.stderr);
  let buf = "";
  process.stderr.write = ((s: string | Uint8Array) => {
    buf += typeof s === "string" ? s : Buffer.from(s).toString();
    return true;
  }) as typeof process.stderr.write;
  try {
    const code = fn();
    return { code, err: buf };
  } finally {
    process.stderr.write = orig;
  }
}

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

function smallContract(): RubrixContract {
  const c = deepBriefContract();
  c.rubric = {
    threshold: 0.5,
    criteria: [{ id: "c1", description: "first criterion", weight: 1, floor: 0.5, axis: "security", verify: "echo ok" }],
  };
  c.matrix = { rows: [{ id: "r1", criterion: "c1", evidence_required: "x" }] };
  c.plan = { steps: [{ id: "s1", action: "implement c1" }] };
  c.evaluation_policy = defaultPolicy();
  c.state = "PlanLocked";
  c.locks = { rubric: true, matrix: true, plan: true };
  return c;
}

const stubAlwaysPass: NonNullable<ScoreOptions["cascadeOptions"]> = {
  mechanicalChecker: () => ({ pass: true, confidence: 1, matched_anchors: ["x"] }),
  semanticJudge: (criterion) => ({ evaluator: "semantic-judge", criterion: criterion.id, verdict: "pass", score: 1, confidence: 1, self_reported_confidence: 1, rationale: "", evidence: [] }),
  consensusPanel: () => ({ score: 1, rationale_hash: "0".repeat(64), dissent_flag: false, individual_entries: [] }),
};

describe("score CLI (v1.3 PR #2 — replaces PR #1 stub)", () => {
  it("returns exit 0 on a valid PlanLocked contract with stub cascade", () => {
    const path = tempContractFile(smallContract());
    const { code } = captureStdout(() => scoreCommand({ path, cascadeOptions: stubAlwaysPass }));
    expect(code).toBe(0);
  });

  it("accepts --stage option without error", () => {
    const path = tempContractFile(smallContract());
    const { code } = captureStdout(() => scoreCommand({ path, stage: 2, cascadeOptions: stubAlwaysPass }));
    expect(code).toBe(0);
  });

  it("accepts --explain option without error", () => {
    const path = tempContractFile(smallContract());
    const { code } = captureStdout(() => scoreCommand({ path, explain: "c1", cascadeOptions: stubAlwaysPass }));
    expect(code).toBe(0);
  });

  it("accepts --approve-expensive option without error", () => {
    const path = tempContractFile(smallContract());
    const { code } = captureStdout(() => scoreCommand({ path, approveExpensive: true, cascadeOptions: stubAlwaysPass }));
    expect(code).toBe(0);
  });

  it("emits aggregate stdout line (PR #2 contract — replaces PR #1 placeholder text)", () => {
    const path = tempContractFile(smallContract());
    const { out } = captureStdout(() => scoreCommand({ path, cascadeOptions: stubAlwaysPass }));
    expect(out.split("\n")[0]).toMatch(/^passed=\d+ skipped=\d+ blockers=\d+$/);
  });

  it("(v1.3.2 Fix 5) returns exit 3 when state is below PlanLocked (lifecycle gate)", () => {
    const c = smallContract();
    delete c.rubric;
    c.state = "IntentDrafted";
    c.locks = { rubric: false, matrix: false, plan: false };
    delete c.matrix;
    delete c.plan;
    const path = tempContractFile(c);
    const { code, err } = captureStderr(() => scoreCommand({ path, cascadeOptions: stubAlwaysPass }));
    expect(code).toBe(3);
    expect(err).toContain("must be PlanLocked or later");
  });

  it("returns nonzero when v1.3.0 contract is missing evaluation_policy (schema rejects at load time)", () => {
    const c = smallContract();
    c.version = "1.3.0";
    delete c.evaluation_policy;
    const path = tempContractFile(c);
    const { code, err } = captureStderr(() => scoreCommand({ path, cascadeOptions: stubAlwaysPass }));
    expect(code).not.toBe(0);
    expect(err).toContain("evaluation_policy");
  });

  it("(v1.3.2 Fix 3) clears stale RUBRIX_BUDGET_OVERRUN env on startup without --approve-expensive", () => {
    process.env.RUBRIX_BUDGET_OVERRUN = "1";
    try {
      const path = tempContractFile(smallContract());
      captureStdout(() => scoreCommand({ path, cascadeOptions: stubAlwaysPass }));
      expect(process.env.RUBRIX_BUDGET_OVERRUN).toBeUndefined();
    } finally {
      delete process.env.RUBRIX_BUDGET_OVERRUN;
    }
  });

  it("(v1.3.2 Fix 5) accepts state=Scoring (re-score allowed)", () => {
    const c = smallContract();
    c.state = "Scoring";
    const path = tempContractFile(c);
    const { code } = captureStdout(() => scoreCommand({ path, cascadeOptions: stubAlwaysPass }));
    expect(code).toBe(0);
  });

  it("(v1.3.2 Fix 5) rejects state=Failed (Failed → PlanDrafted recovery loop required by CLAUDE.md)", () => {
    const c = smallContract();
    c.state = "Failed";
    c.scores = [];
    const path = tempContractFile(c);
    const { code, err } = captureStderr(() => scoreCommand({ path, cascadeOptions: stubAlwaysPass }));
    expect(code).toBe(3);
    expect(err).toContain("must be PlanLocked or later");
  });
});
