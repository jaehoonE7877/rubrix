import { describe, expect, it } from "vitest";
import { resolveClarityThreshold, CLARITY_BASE_THRESHOLDS } from "../src/core/brief.ts";
import { baseV12Drafted } from "./helpers.ts";

describe("resolveClarityThreshold", () => {
  it("returns base when all axes are standard", () => {
    const c = baseV12Drafted();
    expect(resolveClarityThreshold(c, "rubric", { env: {} })).toBe(CLARITY_BASE_THRESHOLDS.rubric);
    expect(resolveClarityThreshold(c, "matrix", { env: {} })).toBe(CLARITY_BASE_THRESHOLDS.matrix);
    expect(resolveClarityThreshold(c, "plan", { env: {} })).toBe(CLARITY_BASE_THRESHOLDS.plan);
  });

  it("bumps +0.10 when any axis is deep (max-modifier across axes)", () => {
    const c = baseV12Drafted();
    c.intent.brief!.axis_depth = {
      security: "deep",
      data: "standard",
      correctness: "standard",
      ux: "standard",
      perf: "standard",
    };
    expect(resolveClarityThreshold(c, "rubric", { env: {} })).toBeCloseTo(0.85, 4);
    expect(resolveClarityThreshold(c, "matrix", { env: {} })).toBeCloseTo(0.90, 4);
    expect(resolveClarityThreshold(c, "plan", { env: {} })).toBeCloseTo(0.80, 4);
  });

  it("with multiple deep axes still adds at most +0.10 (max, not sum)", () => {
    const c = baseV12Drafted();
    c.intent.brief!.axis_depth = {
      security: "deep",
      data: "deep",
      correctness: "deep",
      ux: "deep",
      perf: "deep",
    };
    expect(resolveClarityThreshold(c, "rubric", { env: {} })).toBeCloseTo(0.85, 4);
  });

  it("subtracts 0.10 when all axes are light (ambition=demo or explicit light)", () => {
    const c = baseV12Drafted();
    c.intent.brief!.ambition = "demo";
    expect(resolveClarityThreshold(c, "rubric", { env: {} })).toBeCloseTo(0.65, 4);
    expect(resolveClarityThreshold(c, "matrix", { env: {} })).toBeCloseTo(0.70, 4);
    expect(resolveClarityThreshold(c, "plan", { env: {} })).toBeCloseTo(0.60, 4);
  });

  it("override takes precedence over axis_depth modifier", () => {
    const c = baseV12Drafted();
    c.intent.brief!.axis_depth!.security = "deep";
    expect(resolveClarityThreshold(c, "rubric", { override: 0.5, env: {} })).toBe(0.5);
  });

  it("override is clamped to [0,1]", () => {
    const c = baseV12Drafted();
    expect(resolveClarityThreshold(c, "rubric", { override: -0.5, env: {} })).toBe(0);
    expect(resolveClarityThreshold(c, "rubric", { override: 1.5, env: {} })).toBe(1);
  });

  it("RUBRIX_SKIP_BRIEF=1 falls back to standard depth", () => {
    const c = baseV12Drafted();
    c.intent.brief!.axis_depth!.security = "deep";
    expect(
      resolveClarityThreshold(c, "rubric", { env: { RUBRIX_SKIP_BRIEF: "1" } }),
    ).toBe(CLARITY_BASE_THRESHOLDS.rubric);
  });

  it("uncalibrated brief falls back to standard", () => {
    const c = baseV12Drafted();
    c.intent.brief!.calibrated = false;
    expect(resolveClarityThreshold(c, "rubric", { env: {} })).toBe(CLARITY_BASE_THRESHOLDS.rubric);
  });
});
