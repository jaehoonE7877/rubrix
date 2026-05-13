import { describe, expect, it } from "vitest";
import { validateContract } from "../src/core/contract.ts";
import { baseV14Passed } from "./helpers.ts";

describe("v1.5 goal schema (additive surface)", () => {
  it("v1.5.0 contract WITHOUT goal validates (goal is optional)", () => {
    const c = baseV14Passed();
    c.version = "1.5.0";
    expect(validateContract(c).ok).toBe(true);
  });

  it("v1.5.0 contract WITH a well-formed goal validates", () => {
    const c = baseV14Passed();
    c.version = "1.5.0";
    (c as unknown as Record<string, unknown>).goal = {
      condition:
        "Run `rubrix gate rubrix.json --json` and check overall_pass: true and state: \"Passed\".",
      max_chars: 4000,
      suggested_condition: "(same as condition)",
      derived_from_contract_hash:
        "a".repeat(64),
    };
    expect(validateContract(c).ok).toBe(true);
  });

  it("rejects goal.max_chars != 4000 (constant)", () => {
    const c = baseV14Passed();
    c.version = "1.5.0";
    (c as unknown as Record<string, unknown>).goal = {
      condition: "rubrix gate --json overall_pass: true Passed",
      max_chars: 8000,
    };
    expect(validateContract(c).ok).toBe(false);
  });

  it("rejects goal.condition longer than 4000 chars", () => {
    const c = baseV14Passed();
    c.version = "1.5.0";
    (c as unknown as Record<string, unknown>).goal = {
      condition: "rubrix gate " + "x".repeat(4100),
      max_chars: 4000,
    };
    expect(validateContract(c).ok).toBe(false);
  });

  it("rejects empty goal.condition", () => {
    const c = baseV14Passed();
    c.version = "1.5.0";
    (c as unknown as Record<string, unknown>).goal = {
      condition: "",
      max_chars: 4000,
    };
    expect(validateContract(c).ok).toBe(false);
  });

  it("rejects goal without required max_chars", () => {
    const c = baseV14Passed();
    c.version = "1.5.0";
    (c as unknown as Record<string, unknown>).goal = {
      condition: "rubrix gate Passed",
    };
    expect(validateContract(c).ok).toBe(false);
  });

  it("rejects unknown property under goal (additionalProperties: false)", () => {
    const c = baseV14Passed();
    c.version = "1.5.0";
    (c as unknown as Record<string, unknown>).goal = {
      condition: "rubrix gate Passed",
      max_chars: 4000,
      foo_unknown: "bar",
    };
    expect(validateContract(c).ok).toBe(false);
  });

  it("rejects malformed derived_from_contract_hash (must be 64 hex chars)", () => {
    const c = baseV14Passed();
    c.version = "1.5.0";
    (c as unknown as Record<string, unknown>).goal = {
      condition: "rubrix gate Passed",
      max_chars: 4000,
      derived_from_contract_hash: "not-a-hash",
    };
    expect(validateContract(c).ok).toBe(false);
  });

  it("v1.4.0 contract carrying a goal still validates (fail-open: pre-v1.5 CLIs ignore unknown top-level)", () => {
    // Top-level has no additionalProperties:false in the schema, so older CLIs reading a v1.5 file
    // with `goal` accept it. This is the dogfood-safety invariant.
    const c = baseV14Passed();
    c.version = "1.4.0";
    (c as unknown as Record<string, unknown>).goal = {
      condition: "rubrix gate Passed",
      max_chars: 4000,
    };
    expect(validateContract(c).ok).toBe(true);
  });
});
