import { describe, expect, it } from "vitest";
import { validateContract, type RubrixContract } from "../src/core/contract.ts";
import { baseV14Passed } from "./helpers.ts";

describe("v1.4 drift schema (additive surface)", () => {
  it("v1.4.0 contract WITH drift_policy + derived_from_policy_hash validates", () => {
    expect(validateContract(baseV14Passed()).ok).toBe(true);
  });

  it("v1.4.0 contract WITHOUT drift_policy at state=Scoring fails (fail-closed v1.4+)", () => {
    const c = baseV14Passed();
    c.state = "Scoring";
    delete c.scores;
    delete (c as unknown as Record<string, unknown>).drift_policy;
    expect(validateContract(c).ok).toBe(false);
  });

  it("v1.4.0 contract WITHOUT drift_policy at state=Passed fails", () => {
    const c = baseV14Passed();
    delete (c as unknown as Record<string, unknown>).drift_policy;
    expect(validateContract(c).ok).toBe(false);
  });

  it("v1.4.0 contract WITHOUT drift_policy at state=Failed fails", () => {
    const c = baseV14Passed();
    c.state = "Failed";
    delete (c as unknown as Record<string, unknown>).drift_policy;
    expect(validateContract(c).ok).toBe(false);
  });

  it("v1.4.0 contract WITHOUT drift_policy at state=PlanLocked validates (drift_policy only required from Scoring onward)", () => {
    const c = baseV14Passed();
    c.state = "PlanLocked";
    delete c.scores;
    delete (c as unknown as Record<string, unknown>).drift_policy;
    expect(validateContract(c).ok).toBe(true);
  });

  it("v1.4.0 contract WITHOUT evaluation_policy.derived_from_policy_hash fails (v1.4+ fail-closed symmetry)", () => {
    const c = baseV14Passed();
    delete c.evaluation_policy!.derived_from_policy_hash;
    expect(validateContract(c).ok).toBe(false);
  });

  it("v1.5.0 contract WITHOUT derived_from_policy_hash fails", () => {
    const c = baseV14Passed();
    c.version = "1.5.0";
    delete c.evaluation_policy!.derived_from_policy_hash;
    expect(validateContract(c).ok).toBe(false);
  });

  it("v2.0.0 contract WITHOUT derived_from_policy_hash fails (major bump still requires v1.4+ surface)", () => {
    const c = baseV14Passed();
    c.version = "2.0.0";
    delete c.evaluation_policy!.derived_from_policy_hash;
    expect(validateContract(c).ok).toBe(false);
  });

  it("v1.10.0 contract WITHOUT derived_from_policy_hash fails (multi-digit minor still v1.4+ enforced)", () => {
    const c = baseV14Passed();
    c.version = "1.10.0";
    delete c.evaluation_policy!.derived_from_policy_hash;
    expect(validateContract(c).ok).toBe(false);
  });

  it("v1.3.0 contract WITHOUT derived_from_policy_hash still validates (v1.3 read-compat fail-open for v1.4 fields)", () => {
    const c = baseV14Passed();
    c.version = "1.3.0";
    delete c.evaluation_policy!.derived_from_policy_hash;
    delete (c as unknown as Record<string, unknown>).drift_policy;
    expect(validateContract(c).ok).toBe(true);
  });

  it("v1.3.0 contract WITHOUT drift_policy still validates at any state", () => {
    const c = baseV14Passed();
    c.version = "1.3.0";
    delete c.evaluation_policy!.derived_from_policy_hash;
    delete (c as unknown as Record<string, unknown>).drift_policy;
    expect(validateContract(c).ok).toBe(true);
  });

  it("v1.2.0 contract carrying optional drift_policy is still valid (additive read-compat)", () => {
    const c = baseV14Passed();
    c.version = "1.2.0";
    c.state = "Passed";
    c.intent.brief = undefined;
    delete c.evaluation_policy;
    delete c.scores!.find(() => true)!.evaluators;
    delete c.scores!.find(() => true)!.stage_history;
    expect(validateContract(c).ok).toBe(true);
  });

  it("drift_policy.threshold > 1 fails schema validation", () => {
    const c = baseV14Passed();
    c.drift_policy!.threshold = 1.5;
    expect(validateContract(c).ok).toBe(false);
  });

  it("drift_policy.threshold < 0 fails schema validation", () => {
    const c = baseV14Passed();
    c.drift_policy!.threshold = -0.1;
    expect(validateContract(c).ok).toBe(false);
  });

  it("drift_policy missing scorer_version fails", () => {
    const c = baseV14Passed();
    delete (c.drift_policy as unknown as Record<string, unknown>).scorer_version;
    expect(validateContract(c).ok).toBe(false);
  });

  it("drift_policy unknown property fails (additionalProperties: false)", () => {
    const c = baseV14Passed();
    (c.drift_policy as unknown as Record<string, unknown>).bogus = "no";
    expect(validateContract(c).ok).toBe(false);
  });

  it("accepted_drift_history[] entry validates with required fields", () => {
    const c = baseV14Passed();
    c.accepted_drift_history = [
      {
        artifact: "plan",
        drift_score: 0.4,
        accepted_at: "2026-05-10T00:00:00.000Z",
        reason: "manual policy refresh after upstream brief change",
        scorer_version: "drift-scorer/1.0",
      },
    ];
    expect(validateContract(c).ok).toBe(true);
  });

  it("accepted_drift_history[] entry with unknown artifact enum fails", () => {
    const c = baseV14Passed();
    c.accepted_drift_history = [
      {
        artifact: "unknown" as never,
        drift_score: 0.4,
        accepted_at: "2026-05-10T00:00:00.000Z",
        reason: "x",
        scorer_version: "drift-scorer/1.0",
      },
    ];
    expect(validateContract(c).ok).toBe(false);
  });

  it("accepted_drift_history[] entry with empty reason fails (minLength)", () => {
    const c = baseV14Passed();
    c.accepted_drift_history = [
      {
        artifact: "plan",
        drift_score: 0.4,
        accepted_at: "2026-05-10T00:00:00.000Z",
        reason: "",
        scorer_version: "drift-scorer/1.0",
      },
    ];
    expect(validateContract(c).ok).toBe(false);
  });

  it("lock_history[] entry validates with required fields", () => {
    const c = baseV14Passed();
    c.lock_history = [
      {
        artifact: "rubric",
        event: "lock",
        occurred_at: "2026-05-10T00:00:00.000Z",
      },
    ];
    expect(validateContract(c).ok).toBe(true);
  });

  it("lock_history[] entry with unknown event fails", () => {
    const c = baseV14Passed();
    c.lock_history = [
      {
        artifact: "rubric",
        event: "bogus" as never,
        occurred_at: "2026-05-10T00:00:00.000Z",
      },
    ];
    expect(validateContract(c).ok).toBe(false);
  });

  it("lock_history[] entry with malformed occurred_at fails (date-time format)", () => {
    const c = baseV14Passed();
    c.lock_history = [
      {
        artifact: "rubric",
        event: "lock",
        occurred_at: "not-a-date",
      },
    ];
    expect(validateContract(c).ok).toBe(false);
  });

  it("evaluation_policy.derived_from_policy_hash with malformed sha256 fails", () => {
    const c = baseV14Passed();
    c.evaluation_policy!.derived_from_policy_hash = "not-hex";
    expect(validateContract(c).ok).toBe(false);
  });

  it("v1.4 contract with empty accepted_drift_history[] is valid", () => {
    const c = baseV14Passed();
    c.accepted_drift_history = [];
    expect(validateContract(c).ok).toBe(true);
  });

  it("v1.4 contract with empty lock_history[] is valid", () => {
    const c = baseV14Passed();
    c.lock_history = [];
    expect(validateContract(c).ok).toBe(true);
  });

  it("v1.4 contract surfaces top-level additionalProperties: false (root rejects unknown field)", () => {
    const c = baseV14Passed() as unknown as RubrixContract & { unknown_field?: string };
    c.unknown_field = "no";
    expect(validateContract(c).ok).toBe(false);
  });
});
