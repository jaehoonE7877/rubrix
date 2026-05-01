import { describe, expect, it } from "vitest";
import { runValidate } from "../../src/commands/validate.ts";
import { baseDrafted, baseV12Drafted, clarity, tempContractFile } from "../helpers.ts";

describe("clarity version-aware enforcement (v1.2+)", () => {
  it("v1.0 contract at PlanLocked without clarity remains valid (read-compat)", () => {
    const path = tempContractFile({
      version: "0.1.0",
      intent: { summary: "x" },
      rubric: { threshold: 0.5, criteria: [{ id: "c", description: "d", weight: 1 }] },
      matrix: { rows: [{ id: "r", criterion: "c", evidence_required: "e" }] },
      plan: { steps: [{ id: "s", action: "a" }] },
      state: "PlanLocked",
      locks: { rubric: true, matrix: true, plan: true },
    });
    const r = runValidate({ path, env: {} });
    expect(r.ok).toBe(true);
    expect(r.errors).toEqual([]);
  });

  it("v1.1 contract (version 0.1.0 with brief, no clarity) at PlanLocked still valid", () => {
    const c = baseDrafted();
    c.intent.brief = {
      calibrated: true,
      project_type: "brownfield_feature",
      situation: "internal_tool",
      ambition: "production",
      axis_depth: { security: "standard", data: "standard", correctness: "standard", ux: "standard", perf: "standard" },
    };
    c.matrix = { rows: [{ id: "r", criterion: "c1", evidence_required: "e" }] };
    c.plan = { steps: [{ id: "s", action: "a", covers: ["r"] }] };
    c.state = "PlanLocked";
    c.locks = { rubric: true, matrix: true, plan: true };
    const path = tempContractFile(c);
    const r = runValidate({ path, env: {} });
    expect(r.ok).toBe(true);
  });

  it("v1.2 contract at RubricLocked with rubric.clarity present and score>=threshold validates", () => {
    const c = baseV12Drafted();
    c.rubric!.clarity = clarity(0.80, 0.75);
    c.state = "RubricLocked";
    c.locks = { rubric: true, matrix: false, plan: false };
    const path = tempContractFile(c);
    const r = runValidate({ path, env: {} });
    expect(r.ok).toBe(true);
  });

  it("v1.2 contract at RubricLocked WITHOUT rubric.clarity fails with a v1.2-specific error", () => {
    const c = baseV12Drafted();
    c.state = "RubricLocked";
    c.locks = { rubric: true, matrix: false, plan: false };
    const path = tempContractFile(c);
    const r = runValidate({ path, env: {} });
    expect(r.ok).toBe(false);
    const joined = r.errors.join("\n");
    expect(joined).toContain("/rubric/clarity");
    expect(joined).toContain("v1.2 contract requires rubric.clarity");
  });

  it("v1.2 contract at PlanLocked requires clarity on every locked artifact", () => {
    const c = baseV12Drafted();
    c.matrix = { rows: [{ id: "r", criterion: "c1", evidence_required: "e" }], clarity: clarity(0.85, 0.80) };
    c.plan = { steps: [{ id: "s", action: "a", covers: ["r"] }] };
    c.rubric!.clarity = clarity(0.80, 0.75);
    c.state = "PlanLocked";
    c.locks = { rubric: true, matrix: true, plan: true };
    const path = tempContractFile(c);
    const r = runValidate({ path, env: {} });
    expect(r.ok).toBe(false);
    expect(r.errors.join("\n")).toContain("/plan/clarity");
  });

  it("v1.2 contract with score<threshold and forced=false fails (lock should have refused)", () => {
    const c = baseV12Drafted();
    c.rubric!.clarity = clarity(0.40, 0.75);
    c.state = "RubricLocked";
    c.locks = { rubric: true, matrix: false, plan: false };
    const path = tempContractFile(c);
    const r = runValidate({ path, env: {} });
    expect(r.ok).toBe(false);
    expect(r.errors.join("\n")).toMatch(/score 0\.4 < threshold 0\.75/);
  });

  it("v1.2 contract with score<threshold but forced=true with reason validates (audited bypass)", () => {
    const c = baseV12Drafted();
    c.rubric!.clarity = clarity(0.40, 0.75, {
      forced: true,
      forced_at: "2026-05-01T00:00:00.000Z",
      force_reason: "vendor freeze",
    });
    c.state = "RubricLocked";
    c.locks = { rubric: true, matrix: false, plan: false };
    const path = tempContractFile(c);
    const r = runValidate({ path, env: {} });
    expect(r.ok).toBe(true);
  });
});
