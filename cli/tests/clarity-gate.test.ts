import { describe, expect, it } from "vitest";
import { checkClarityInvariants, firstClarityViolation } from "../src/core/clarity-gate.ts";
import { baseDrafted, baseV12Drafted, clarity } from "./helpers.ts";

describe("checkClarityInvariants (v1.2 shared gate helper)", () => {
  it("v1.0 contract (version 0.1.0) is exempt regardless of locks", () => {
    const c = baseDrafted();
    c.matrix = { rows: [{ id: "r", criterion: "c1", evidence_required: "e" }] };
    c.plan = { steps: [{ id: "s", action: "a", covers: ["r"] }] };
    c.state = "PlanLocked";
    c.locks = { rubric: true, matrix: true, plan: true };
    expect(checkClarityInvariants(c)).toEqual({ ok: true, errors: [] });
  });

  it("v1.2 contract with no locks engaged passes (no enforcement until locked)", () => {
    const c = baseV12Drafted();
    expect(checkClarityInvariants(c).ok).toBe(true);
  });

  it("v1.2 + locks.rubric=true + missing rubric.clarity fails with actionable error", () => {
    const c = baseV12Drafted();
    c.state = "RubricLocked";
    c.locks = { rubric: true, matrix: false, plan: false };
    const r = checkClarityInvariants(c);
    expect(r.ok).toBe(false);
    expect(r.errors.join("\n")).toContain("v1.2 contract requires rubric.clarity");
  });

  it("v1.2 + score < threshold + forced=false fails", () => {
    const c = baseV12Drafted();
    c.rubric!.clarity = clarity(0.4, 0.75);
    c.state = "RubricLocked";
    c.locks = { rubric: true, matrix: false, plan: false };
    const r = checkClarityInvariants(c);
    expect(r.ok).toBe(false);
    expect(r.errors.join("\n")).toContain("score 0.4 < threshold 0.75");
  });

  it("v1.2 + score < threshold + forced=true with reason passes (audited bypass)", () => {
    const c = baseV12Drafted();
    c.rubric!.clarity = clarity(0.4, 0.75, {
      forced: true,
      forced_at: "2026-05-01T00:00:00.000Z",
      force_reason: "vendor freeze",
    });
    c.state = "RubricLocked";
    c.locks = { rubric: true, matrix: false, plan: false };
    expect(checkClarityInvariants(c).ok).toBe(true);
  });

  it("v1.2 PlanLocked surfaces violations on every locked artifact", () => {
    const c = baseV12Drafted();
    c.rubric!.clarity = clarity(0.80, 0.75);
    c.matrix = { rows: [{ id: "r", criterion: "c1", evidence_required: "e" }] };
    c.plan = { steps: [{ id: "s", action: "a", covers: ["r"] }] };
    c.state = "PlanLocked";
    c.locks = { rubric: true, matrix: true, plan: true };
    const r = checkClarityInvariants(c);
    expect(r.ok).toBe(false);
    const joined = r.errors.join("\n");
    expect(joined).toContain("/matrix/clarity");
    expect(joined).toContain("/plan/clarity");
    expect(joined).not.toContain("/rubric/clarity");
  });

  it("firstClarityViolation returns null when ok and a trimmed line otherwise", () => {
    const ok = baseV12Drafted();
    expect(firstClarityViolation(ok)).toBeNull();
    const bad = baseV12Drafted();
    bad.state = "RubricLocked";
    bad.locks = { rubric: true, matrix: false, plan: false };
    const violation = firstClarityViolation(bad);
    expect(violation).not.toBeNull();
    expect(violation!.startsWith(" ")).toBe(false);
    expect(violation).toContain("/rubric/clarity");
  });
});
