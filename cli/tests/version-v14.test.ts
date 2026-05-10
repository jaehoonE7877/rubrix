import { describe, expect, it } from "vitest";
import { isV12Plus, isV13Plus, isV14Plus } from "../src/core/version.ts";

describe("isV14Plus helper", () => {
  it("returns true for 1.4.0", () => {
    expect(isV14Plus({ version: "1.4.0" })).toBe(true);
  });

  it("returns true for 1.4.99", () => {
    expect(isV14Plus({ version: "1.4.99" })).toBe(true);
  });

  it("returns true for 1.5.0", () => {
    expect(isV14Plus({ version: "1.5.0" })).toBe(true);
  });

  it("returns true for 2.0.0", () => {
    expect(isV14Plus({ version: "2.0.0" })).toBe(true);
  });

  it("returns true for multi-digit minor 1.10.0", () => {
    expect(isV14Plus({ version: "1.10.0" })).toBe(true);
  });

  it("returns false for 1.3.99", () => {
    expect(isV14Plus({ version: "1.3.99" })).toBe(false);
  });

  it("returns false for 1.3.0", () => {
    expect(isV14Plus({ version: "1.3.0" })).toBe(false);
  });

  it("returns false for 1.2.0", () => {
    expect(isV14Plus({ version: "1.2.0" })).toBe(false);
  });

  it("returns false for 1.1.0", () => {
    expect(isV14Plus({ version: "1.1.0" })).toBe(false);
  });

  it("returns false for 0.1.0", () => {
    expect(isV14Plus({ version: "0.1.0" })).toBe(false);
  });

  it("returns false for invalid version (no throw at boundary)", () => {
    expect(isV14Plus({ version: "not-a-semver" })).toBe(false);
  });

  it("returns false for zero-padded forms (parseVersion rejects them; helper catches)", () => {
    expect(isV14Plus({ version: "1.04.0" })).toBe(false);
    expect(isV14Plus({ version: "01.4.0" })).toBe(false);
    expect(isV14Plus({ version: "1.4.03" })).toBe(false);
  });

  it("preserves isV12Plus / isV13Plus contract (no regression on lower-bound helpers)", () => {
    expect(isV12Plus({ version: "1.2.0" })).toBe(true);
    expect(isV12Plus({ version: "1.4.0" })).toBe(true);
    expect(isV13Plus({ version: "1.3.0" })).toBe(true);
    expect(isV13Plus({ version: "1.4.0" })).toBe(true);
    expect(isV13Plus({ version: "1.2.0" })).toBe(false);
  });
});
