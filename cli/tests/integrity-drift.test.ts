import { describe, expect, it } from "vitest";
import { checkDriftPolicyIntegrity, checkLockHistoryIntegrity } from "../src/core/integrity.ts";
import type { RubrixContract } from "../src/core/contract.ts";
import { baseV14Passed } from "./helpers.ts";

describe("checkDriftPolicyIntegrity", () => {
  it("returns no issues when drift_policy is absent", () => {
    const c = baseV14Passed();
    delete (c as unknown as Record<string, unknown>).drift_policy;
    expect(checkDriftPolicyIntegrity(c)).toEqual([]);
  });

  it("returns no issues on a clean drift_policy", () => {
    const c = baseV14Passed();
    expect(checkDriftPolicyIntegrity(c)).toEqual([]);
  });

  it("flags threshold > 1", () => {
    const c = baseV14Passed();
    c.drift_policy!.threshold = 1.2 as never;
    const issues = checkDriftPolicyIntegrity(c);
    expect(issues.some((i) => i.message.includes("threshold must be in [0,1]"))).toBe(true);
  });

  it("flags threshold < 0", () => {
    const c = baseV14Passed();
    c.drift_policy!.threshold = -0.5 as never;
    const issues = checkDriftPolicyIntegrity(c);
    expect(issues.some((i) => i.message.includes("threshold must be in [0,1]"))).toBe(true);
  });

  it("flags hard_threshold > 1", () => {
    const c = baseV14Passed();
    c.drift_policy!.hard_threshold = 1.5 as never;
    const issues = checkDriftPolicyIntegrity(c);
    expect(issues.some((i) => i.message.includes("hard_threshold must be in [0,1]"))).toBe(true);
  });

  it("flags hard_threshold < threshold (soft gate must trip first)", () => {
    const c = baseV14Passed();
    c.drift_policy!.threshold = 0.4;
    c.drift_policy!.hard_threshold = 0.2;
    const issues = checkDriftPolicyIntegrity(c);
    expect(issues.some((i) => i.message.includes("must be >="))).toBe(true);
  });

  it("flags empty scorer_version", () => {
    const c = baseV14Passed();
    c.drift_policy!.scorer_version = "   " as never;
    const issues = checkDriftPolicyIntegrity(c);
    expect(issues.some((i) => i.message.includes("scorer_version must be a non-empty string"))).toBe(true);
  });
});

describe("checkLockHistoryIntegrity — lock_history[]", () => {
  it("returns no issues when lock_history is absent", () => {
    const c = baseV14Passed();
    expect(checkLockHistoryIntegrity(c)).toEqual([]);
  });

  it("returns no issues on a clean lock_history", () => {
    const c = baseV14Passed();
    c.lock_history = [
      { artifact: "rubric", event: "lock", occurred_at: "2026-05-10T00:00:00.000Z" },
      { artifact: "matrix", event: "lock", occurred_at: "2026-05-10T00:01:00.000Z" },
    ];
    expect(checkLockHistoryIntegrity(c)).toEqual([]);
  });

  it("flags force-lock without reason", () => {
    const c = baseV14Passed();
    c.lock_history = [
      { artifact: "plan", event: "force-lock", occurred_at: "2026-05-10T00:00:00.000Z" },
    ];
    const issues = checkLockHistoryIntegrity(c);
    expect(issues.some((i) => i.message.includes("event=force-lock requires a non-empty reason"))).toBe(true);
  });

  it("flags accept-drift without reason", () => {
    const c = baseV14Passed();
    c.lock_history = [
      { artifact: "plan", event: "accept-drift", occurred_at: "2026-05-10T00:00:00.000Z" },
    ];
    const issues = checkLockHistoryIntegrity(c);
    expect(issues.some((i) => i.message.includes("event=accept-drift requires a non-empty reason"))).toBe(true);
  });

  it("does NOT flag plain lock event without reason", () => {
    const c = baseV14Passed();
    c.lock_history = [
      { artifact: "plan", event: "lock", occurred_at: "2026-05-10T00:00:00.000Z" },
    ];
    expect(checkLockHistoryIntegrity(c)).toEqual([]);
  });

  it("flags drift_score outside [0,1]", () => {
    const c = baseV14Passed();
    c.lock_history = [
      {
        artifact: "plan",
        event: "accept-drift",
        occurred_at: "2026-05-10T00:00:00.000Z",
        reason: "x",
        drift_score: 1.5 as never,
      },
    ];
    const issues = checkLockHistoryIntegrity(c);
    expect(issues.some((i) => i.message.includes("drift_score out of [0,1]"))).toBe(true);
  });
});

describe("checkLockHistoryIntegrity — accepted_drift_history[] (1-shot bounded)", () => {
  it("returns no issues with empty accepted_drift_history", () => {
    const c = baseV14Passed();
    c.accepted_drift_history = [];
    expect(checkLockHistoryIntegrity(c)).toEqual([]);
  });

  it("allows one accept per artifact", () => {
    const c = baseV14Passed();
    c.accepted_drift_history = [
      { artifact: "plan", drift_score: 0.4, accepted_at: "2026-05-10T00:00:00.000Z", reason: "x", scorer_version: "drift-scorer/1.0" },
      { artifact: "matrix", drift_score: 0.4, accepted_at: "2026-05-10T00:01:00.000Z", reason: "y", scorer_version: "drift-scorer/1.0" },
    ];
    expect(checkLockHistoryIntegrity(c)).toEqual([]);
  });

  it("flags second accept on the same artifact even with another artifact in between", () => {
    const c = baseV14Passed();
    c.accepted_drift_history = [
      { artifact: "plan", drift_score: 0.4, accepted_at: "2026-05-10T00:00:00.000Z", reason: "x", scorer_version: "drift-scorer/1.0" },
      { artifact: "matrix", drift_score: 0.4, accepted_at: "2026-05-10T00:01:00.000Z", reason: "y", scorer_version: "drift-scorer/1.0" },
      { artifact: "plan", drift_score: 0.4, accepted_at: "2026-05-10T00:02:00.000Z", reason: "z", scorer_version: "drift-scorer/1.0" },
    ];
    const issues = checkLockHistoryIntegrity(c);
    expect(issues.some((i) => i.message.includes("plan accepted more than once"))).toBe(true);
  });

  it("flags two consecutive accepts on the same artifact", () => {
    const c = baseV14Passed();
    c.accepted_drift_history = [
      { artifact: "rubric", drift_score: 0.4, accepted_at: "2026-05-10T00:00:00.000Z", reason: "x", scorer_version: "drift-scorer/1.0" },
      { artifact: "rubric", drift_score: 0.4, accepted_at: "2026-05-10T00:01:00.000Z", reason: "x", scorer_version: "drift-scorer/1.0" },
    ];
    const issues = checkLockHistoryIntegrity(c);
    expect(issues.some((i) => i.message.includes("rubric accepted more than once"))).toBe(true);
  });

  it("flags drift_score out of [0,1]", () => {
    const c = baseV14Passed();
    c.accepted_drift_history = [
      { artifact: "plan", drift_score: 1.5 as never, accepted_at: "2026-05-10T00:00:00.000Z", reason: "x", scorer_version: "drift-scorer/1.0" },
    ];
    const issues = checkLockHistoryIntegrity(c);
    expect(issues.some((i) => i.message.includes("drift_score out of [0,1]"))).toBe(true);
  });

  it("flags unknown artifact (defense in depth — schema also rejects, but integrity helps when accept-drift mutates pre-validation)", () => {
    const c = baseV14Passed();
    const malformed = [
      { artifact: "bogus", drift_score: 0.4, accepted_at: "2026-05-10T00:00:00.000Z", reason: "x", scorer_version: "drift-scorer/1.0" },
    ] as unknown as RubrixContract["accepted_drift_history"];
    c.accepted_drift_history = malformed;
    const issues = checkLockHistoryIntegrity(c);
    expect(issues.some((i) => i.message.includes("unknown artifact"))).toBe(true);
  });
});
