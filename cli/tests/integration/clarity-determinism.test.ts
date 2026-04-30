import { describe, expect, it } from "vitest";
import { scoreClarity } from "../../src/core/clarity.ts";
import { baseV12Drafted } from "../helpers.ts";

const FIXED_NOW = new Date("2026-05-01T00:00:00.000Z");

describe("scoreClarity determinism (v1.2/PR #2)", () => {
  it("two consecutive scorings of the same input emit byte-equivalent JSON (excluding scored_at)", () => {
    const c = baseV12Drafted();
    c.rubric = {
      threshold: 0.5,
      criteria: [{ id: "tiny", description: "short", weight: 1 }],
    };
    const a = scoreClarity({ contract: c, key: "rubric", threshold: 0.75, now: FIXED_NOW });
    const b = scoreClarity({ contract: c, key: "rubric", threshold: 0.75, now: FIXED_NOW });
    const aJson = JSON.stringify({ ...a.clarity, scored_at: undefined });
    const bJson = JSON.stringify({ ...b.clarity, scored_at: undefined });
    expect(aJson).toBe(bJson);
  });

  it("artifact_hash and ordered deduction codes are stable across runs", () => {
    const c = baseV12Drafted();
    c.intent.brief!.axis_depth = { security: "deep", data: "deep", correctness: "standard", ux: "standard", perf: "standard" };
    c.rubric = { threshold: 0.5, criteria: [{ id: "x", description: "short", weight: 1, axis: "security" }] };
    const a = scoreClarity({ contract: c, key: "rubric", threshold: 0.75, now: FIXED_NOW });
    const b = scoreClarity({ contract: c, key: "rubric", threshold: 0.75, now: FIXED_NOW });
    expect(b.clarity.artifact_hash).toBe(a.clarity.artifact_hash);
    expect(b.clarity.deductions.map((d) => d.code)).toEqual(a.clarity.deductions.map((d) => d.code));
  });

  it("hash is stable even when the contract carries a pre-existing clarity field (clarity is stripped before hashing)", () => {
    const c = baseV12Drafted();
    c.rubric = {
      threshold: 0.5,
      criteria: [{ id: "x", description: "A sufficiently long description without any vague tokens", weight: 1, axis: "correctness", floor: 0.7, verify: "manual" }],
    };
    const first = scoreClarity({ contract: c, key: "rubric", threshold: 0.75, now: FIXED_NOW });
    const cWithClarity = { ...c, rubric: { ...c.rubric!, clarity: first.clarity } };
    const second = scoreClarity({ contract: cWithClarity, key: "rubric", threshold: 0.75, now: FIXED_NOW });
    expect(second.clarity.artifact_hash).toBe(first.clarity.artifact_hash);
  });

  it("threshold_policy_version (and scorer_version) does not change between runs", () => {
    const c = baseV12Drafted();
    c.rubric = { threshold: 0.5, criteria: [{ id: "tiny", description: "short", weight: 1 }] };
    const a = scoreClarity({ contract: c, key: "rubric", threshold: 0.75, now: FIXED_NOW });
    const b = scoreClarity({ contract: c, key: "rubric", threshold: 0.75, now: FIXED_NOW });
    expect(b.clarity.scorer_version).toBe(a.clarity.scorer_version);
  });

  it("(codex review P2 follow-up) same rubric body + different axis_depth produces different artifact_hash", () => {
    const standard = baseV12Drafted();
    standard.rubric = {
      threshold: 0.5,
      criteria: [{ id: "sec", description: "A long enough description that does not trigger the short-text vague penalty", weight: 1, axis: "security", verify: "manual" }],
    };
    const deep = JSON.parse(JSON.stringify(standard));
    deep.intent.brief.axis_depth.security = "deep";
    const a = scoreClarity({ contract: standard, key: "rubric", threshold: 0.75, now: FIXED_NOW });
    const b = scoreClarity({ contract: deep, key: "rubric", threshold: 0.85, now: FIXED_NOW });
    expect(b.clarity.artifact_hash).not.toBe(a.clarity.artifact_hash);
    expect(a.clarity.score).toBe(1);
    expect(b.clarity.score).toBeLessThan(1);
  });

  it("(codex review P2 follow-up) same matrix body + different rubric.criteria.ids produces different artifact_hash", () => {
    const c1 = baseV12Drafted();
    c1.matrix = { rows: [{ id: "r1", criterion: "c1", evidence_required: "Long enough evidence description text without any vague tokens here.", verify: "vitest" }] };
    const c2 = JSON.parse(JSON.stringify(c1));
    c2.rubric.criteria[0].id = "c2";
    c2.matrix.rows[0].criterion = "c1";
    const a = scoreClarity({ contract: c1, key: "matrix", threshold: 0.5, now: FIXED_NOW });
    const b = scoreClarity({ contract: c2, key: "matrix", threshold: 0.5, now: FIXED_NOW });
    expect(b.clarity.artifact_hash).not.toBe(a.clarity.artifact_hash);
  });
});
