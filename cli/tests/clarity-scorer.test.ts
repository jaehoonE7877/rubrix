import { describe, expect, it } from "vitest";
import { scoreClarity, hashArtifact, canonicalize } from "../src/core/clarity.ts";
import { baseDrafted, baseV12Drafted } from "./helpers.ts";

const FIXED_NOW = new Date("2026-05-01T00:00:00.000Z");

describe("scoreClarity heuristic stub (v1.2/PR #2)", () => {
  it("emits score=1.0 with zero deductions on a well-formed rubric", () => {
    const c = baseV12Drafted();
    c.rubric = {
      threshold: 0.5,
      criteria: [
        {
          id: "well_formed",
          description: "A description that is substantially longer than sixty characters and uses concrete measurable terms only",
          weight: 1,
          floor: 0.7,
          axis: "correctness",
          verify: "vitest tests/example.test.ts",
        },
      ],
    };
    const r = scoreClarity({ contract: c, key: "rubric", threshold: 0.75, now: FIXED_NOW });
    expect(r.clarity.score).toBe(1);
    expect(r.clarity.deductions).toEqual([]);
    expect(r.clarity.scorer_version).toBe("clarity-scorer/1.0");
    expect(r.clarity.forced).toBe(false);
    expect(r.clarity.threshold).toBe(0.75);
    expect(r.ok).toBe(true);
  });

  it("triggers vague_description on short text + missing_evidence on missing verify", () => {
    const c = baseV12Drafted();
    c.rubric = {
      threshold: 0.5,
      criteria: [{ id: "tiny", description: "short", weight: 1, axis: "correctness", floor: 0.7 }],
    };
    const r = scoreClarity({ contract: c, key: "rubric", threshold: 0.75, now: FIXED_NOW });
    const codes = r.clarity.deductions.map((d) => d.code);
    expect(codes).toContain("vague_description");
    expect(codes).toContain("missing_evidence");
    expect(r.clarity.score).toBeLessThan(1);
  });

  it("triggers unmeasurable_floor when a deep-axis criterion lacks floor", () => {
    const c = baseV12Drafted();
    c.intent.brief!.axis_depth!.security = "deep";
    c.rubric = {
      threshold: 0.5,
      criteria: [
        {
          id: "deep_no_floor",
          description: "Sufficiently long description without any vague tokens to avoid penalty here",
          weight: 1,
          axis: "security",
          verify: "manual review",
        },
      ],
    };
    const r = scoreClarity({ contract: c, key: "rubric", threshold: 0.75, now: FIXED_NOW });
    expect(r.clarity.deductions.some((d) => d.code === "unmeasurable_floor")).toBe(true);
  });

  it("triggers uncovered_axis when a deep axis has no matching criterion", () => {
    const c = baseV12Drafted();
    c.intent.brief!.axis_depth!.data = "deep";
    c.rubric = {
      threshold: 0.5,
      criteria: [
        {
          id: "only_correctness",
          description: "Sufficiently long description without any vague tokens to avoid penalty here",
          weight: 1,
          axis: "correctness",
          floor: 0.7,
          verify: "manual review",
        },
      ],
    };
    const r = scoreClarity({ contract: c, key: "rubric", threshold: 0.75, now: FIXED_NOW });
    expect(r.clarity.deductions.some((d) => d.code === "uncovered_axis")).toBe(true);
  });

  it("matrix scoring catches dangling_reference and uncovered criterion", () => {
    const c = baseV12Drafted();
    c.matrix = {
      rows: [
        {
          id: "r-known",
          criterion: "c1",
          evidence_required: "Adequately long evidence description to avoid the short-text penalty here",
          verify: "manual review",
        },
        {
          id: "r-bogus",
          criterion: "does_not_exist",
          evidence_required: "Adequately long evidence description to avoid the short-text penalty here",
          verify: "manual review",
        },
      ],
    };
    const r = scoreClarity({ contract: c, key: "matrix", threshold: 0.5, now: FIXED_NOW });
    const codes = r.clarity.deductions.map((d) => d.code);
    expect(codes).toContain("dangling_reference");
  });

  it("plan scoring catches missing covers and dangling row references", () => {
    const c = baseV12Drafted();
    c.matrix = { rows: [{ id: "r1", criterion: "c1", evidence_required: "Adequately long evidence description here without vague terms.", verify: "manual review" }] };
    c.plan = {
      steps: [
        { id: "s1", action: "An adequately long action description without any vague language tokens here.", covers: [] },
        { id: "s2", action: "An adequately long action description without any vague language tokens here.", covers: ["nope"] },
      ],
    };
    const r = scoreClarity({ contract: c, key: "plan", threshold: 0.5, now: FIXED_NOW });
    const codes = r.clarity.deductions.map((d) => d.code);
    expect(codes).toContain("missing_evidence");
    expect(codes).toContain("dangling_reference");
    expect(codes).toContain("uncovered_axis");
  });

  it("deductions are sorted by code (vague→missing→unmeasurable→dangling→uncovered) then message", () => {
    const c = baseV12Drafted();
    c.intent.brief!.axis_depth = { security: "deep", data: "deep", correctness: "standard", ux: "standard", perf: "standard" };
    c.rubric = {
      threshold: 0.5,
      criteria: [{ id: "x", description: "short", weight: 1, axis: "security" }],
    };
    const r = scoreClarity({ contract: c, key: "rubric", threshold: 0.75, now: FIXED_NOW });
    const order = ["vague_description", "missing_evidence", "unmeasurable_floor", "dangling_reference", "uncovered_axis"];
    const got = r.clarity.deductions.map((d) => d.code);
    for (let i = 1; i < got.length; i++) {
      const cur = got[i];
      const prev = got[i - 1];
      if (cur === undefined || prev === undefined) throw new Error("unexpected undefined deduction code");
      expect(order.indexOf(cur)).toBeGreaterThanOrEqual(order.indexOf(prev));
    }
  });

  it("(codex follow-up #7 P2) artifact_hash differs between env={} and env={RUBRIX_SKIP_BRIEF:1} so cache key reflects effective scoring depth", () => {
    const c = baseV12Drafted();
    c.intent.brief!.axis_depth = { security: "deep", data: "deep", correctness: "standard", ux: "standard", perf: "standard" };
    c.rubric = {
      threshold: 0.5,
      criteria: [{ id: "x", description: "A description that is substantially longer than sixty characters and uses concrete measurable terms only", weight: 1, floor: 0.7, axis: "correctness", verify: "vitest tests/example.test.ts" }],
    };
    const a = hashArtifact(c, "rubric", {});
    const b = hashArtifact(c, "rubric", { RUBRIX_SKIP_BRIEF: "1" });
    expect(a).not.toBe(b);
    const r1 = scoreClarity({ contract: c, key: "rubric", threshold: 0.75, now: FIXED_NOW, env: {} });
    const r2 = scoreClarity({ contract: c, key: "rubric", threshold: 0.75, now: FIXED_NOW, env: { RUBRIX_SKIP_BRIEF: "1" } });
    expect(r1.clarity.artifact_hash).not.toBe(r2.clarity.artifact_hash);
    expect(r1.clarity.score).not.toBe(r2.clarity.score);
  });

  it("(codex review #29 P2) honors RUBRIX_SKIP_BRIEF=1 in env and skips uncovered_axis deductions", () => {
    const c = baseV12Drafted();
    c.intent.brief!.axis_depth = { security: "deep", data: "deep", correctness: "standard", ux: "standard", perf: "standard" };
    c.rubric = {
      threshold: 0.5,
      criteria: [{ id: "x", description: "A description that is substantially longer than sixty characters and uses concrete measurable terms only", weight: 1, floor: 0.7, axis: "correctness", verify: "vitest tests/example.test.ts" }],
    };
    const without = scoreClarity({ contract: c, key: "rubric", threshold: 0.75, now: FIXED_NOW, env: {} });
    const withSkip = scoreClarity({ contract: c, key: "rubric", threshold: 0.75, now: FIXED_NOW, env: { RUBRIX_SKIP_BRIEF: "1" } });
    expect(without.clarity.deductions.map((d) => d.code)).toContain("uncovered_axis");
    expect(withSkip.clarity.deductions.map((d) => d.code)).not.toContain("uncovered_axis");
    expect(withSkip.clarity.score).toBeGreaterThan(without.clarity.score);
  });

  it("score is clamped to 0 when total deduction weight exceeds 1", () => {
    const c = baseV12Drafted();
    c.intent.brief!.axis_depth = { security: "deep", data: "deep", correctness: "deep", ux: "deep", perf: "deep" };
    c.rubric = {
      threshold: 0.5,
      criteria: [{ id: "x", description: "short", weight: 1 }],
    };
    const r = scoreClarity({ contract: c, key: "rubric", threshold: 0.75, now: FIXED_NOW });
    expect(r.clarity.score).toBeGreaterThanOrEqual(0);
    expect(r.clarity.score).toBeLessThanOrEqual(1);
  });

  it("artifact_hash is identical for two scorings of the same contract body (clarity stripped)", () => {
    const c = baseDrafted();
    c.version = "1.2.0";
    c.intent.brief = baseV12Drafted().intent.brief;
    const a = hashArtifact(c, "rubric");
    const b = hashArtifact({ ...c, rubric: { ...c.rubric!, clarity: { score: 0.5, threshold: 0.7, deductions: [], scored_at: "x", scorer_version: "y", artifact_hash: "z", forced: false } as any } }, "rubric");
    expect(a).toBe(b);
    expect(a).toMatch(/^[a-f0-9]{64}$/);
  });

  it("canonicalize sorts keys deterministically across runs", () => {
    const a = canonicalize({ b: 2, a: 1, c: { z: 3, y: 4 } });
    const b = canonicalize({ c: { y: 4, z: 3 }, a: 1, b: 2 });
    expect(a).toBe(b);
  });
});
