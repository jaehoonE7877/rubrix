import { describe, expect, it } from "vitest";
import { validateContract } from "../src/core/contract.ts";
import { baseV12Drafted, clarity } from "./helpers.ts";

describe("Clarity schema (v1.2)", () => {
  it("accepts a v1.2 RubricDrafted contract without clarity (clarity becomes required only at *Locked)", () => {
    const r = validateContract(baseV12Drafted());
    expect(r.ok).toBe(true);
  });

  it("accepts rubric.clarity with all required fields", () => {
    const c = baseV12Drafted();
    c.rubric!.clarity = clarity(0.82, 0.75);
    const r = validateContract(c);
    expect(r.ok).toBe(true);
  });

  it("rejects clarity with score > 1", () => {
    const c = baseV12Drafted();
    c.rubric!.clarity = clarity(1.5 as number, 0.75);
    const r = validateContract(c);
    expect(r.ok).toBe(false);
  });

  it("rejects clarity.deductions[].code outside the enum", () => {
    const c = baseV12Drafted();
    const cl = clarity(0.5, 0.75);
    cl.deductions.push({ code: "not_a_real_code" as unknown as never, message: "x", weight: 0.1 });
    c.rubric!.clarity = cl;
    const r = validateContract(c);
    expect(r.ok).toBe(false);
  });

  it("rejects forced=true without forced_at + force_reason", () => {
    const c = baseV12Drafted();
    c.rubric!.clarity = clarity(0.4, 0.75, { forced: true });
    const r = validateContract(c);
    expect(r.ok).toBe(false);
  });

  it("accepts forced=true with forced_at + force_reason", () => {
    const c = baseV12Drafted();
    c.rubric!.clarity = clarity(0.4, 0.75, {
      forced: true,
      forced_at: "2026-05-01T01:23:45.000Z",
      force_reason: "vendor freeze: external API outage blocks rewriting",
    });
    const r = validateContract(c);
    expect(r.ok).toBe(true);
  });

  it("rejects clarity.artifact_hash that is not a 64-char hex string", () => {
    const c = baseV12Drafted();
    c.rubric!.clarity = clarity(0.8, 0.75, { artifact_hash: "deadbeef" });
    const r = validateContract(c);
    expect(r.ok).toBe(false);
  });

  it("v1.0 fixture (no clarity) still validates", () => {
    const r = validateContract({
      version: "0.1.0",
      intent: { summary: "x" },
      rubric: { threshold: 0.5, criteria: [{ id: "c", description: "d", weight: 1 }] },
      matrix: { rows: [{ id: "r", criterion: "c", evidence_required: "e" }] },
      plan: { steps: [{ id: "s", action: "a" }] },
      state: "PlanLocked",
      locks: { rubric: true, matrix: true, plan: true },
    });
    expect(r.ok).toBe(true);
  });
});
