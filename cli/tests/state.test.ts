import { describe, expect, it } from "vitest";
import { STATES, canGateTransition, canTransition, expectedLocks, isState, locksMatch, lockTarget } from "../src/core/state.ts";

describe("state machine", () => {
  it("has 10 states in documented order", () => {
    expect(STATES).toEqual([
      "IntentDrafted",
      "RubricDrafted",
      "RubricLocked",
      "MatrixDrafted",
      "MatrixLocked",
      "PlanDrafted",
      "PlanLocked",
      "Scoring",
      "Passed",
      "Failed",
    ]);
  });

  it("allows the documented forward transitions", () => {
    expect(canTransition("IntentDrafted", "RubricDrafted")).toBe(true);
    expect(canTransition("RubricDrafted", "RubricLocked")).toBe(true);
    expect(canTransition("PlanLocked", "Scoring")).toBe(true);
  });

  it("Scoring -> Passed/Failed are gate-only transitions, not regular state transitions", () => {
    expect(canTransition("Scoring", "Passed")).toBe(false);
    expect(canTransition("Scoring", "Failed")).toBe(false);
    expect(canGateTransition("Scoring", "Passed")).toBe(true);
    expect(canGateTransition("Scoring", "Failed")).toBe(true);
    expect(canGateTransition("PlanLocked", "Passed")).toBe(false);
  });

  it("rejects skipping states", () => {
    expect(canTransition("IntentDrafted", "RubricLocked")).toBe(false);
    expect(canTransition("RubricLocked", "PlanDrafted")).toBe(false);
    expect(canTransition("PlanDrafted", "Scoring")).toBe(false);
    expect(canTransition("Passed", "Failed")).toBe(false);
  });

  it("supports the Failed -> PlanDrafted loop", () => {
    expect(canTransition("Failed", "PlanDrafted")).toBe(true);
  });

  it("locks invariants match each state", () => {
    expect(expectedLocks("IntentDrafted")).toEqual({ rubric: false, matrix: false, plan: false });
    expect(expectedLocks("RubricLocked")).toEqual({ rubric: true, matrix: false, plan: false });
    expect(expectedLocks("PlanLocked")).toEqual({ rubric: true, matrix: true, plan: true });
    expect(expectedLocks("Failed")).toEqual({ rubric: true, matrix: true, plan: true });
  });

  it("locksMatch detects mismatch", () => {
    expect(locksMatch("RubricLocked", { rubric: true, matrix: false, plan: false })).toBe(true);
    expect(locksMatch("RubricLocked", { rubric: false, matrix: false, plan: false })).toBe(false);
  });

  it("isState narrows correctly", () => {
    expect(isState("Passed")).toBe(true);
    expect(isState("Bogus")).toBe(false);
    expect(isState(null)).toBe(false);
  });

  it("lockTarget returns from/to pair", () => {
    expect(lockTarget("rubric")).toEqual({ from: "RubricDrafted", to: "RubricLocked" });
    expect(lockTarget("matrix")).toEqual({ from: "MatrixDrafted", to: "MatrixLocked" });
    expect(lockTarget("plan")).toEqual({ from: "PlanDrafted", to: "PlanLocked" });
  });
});
