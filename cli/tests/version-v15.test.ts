import { describe, expect, it } from "vitest";
import { isV12Plus, isV13Plus, isV14Plus, isV15Plus } from "../src/core/version.ts";

describe("isV15Plus helper", () => {
  it("returns true for 1.5.0", () => {
    expect(isV15Plus({ version: "1.5.0" })).toBe(true);
  });

  it("returns true for 1.5.99", () => {
    expect(isV15Plus({ version: "1.5.99" })).toBe(true);
  });

  it("returns true for 1.6.0", () => {
    expect(isV15Plus({ version: "1.6.0" })).toBe(true);
  });

  it("returns true for 2.0.0", () => {
    expect(isV15Plus({ version: "2.0.0" })).toBe(true);
  });

  it("returns true for multi-digit minor 1.10.0", () => {
    expect(isV15Plus({ version: "1.10.0" })).toBe(true);
  });

  it("returns false for 1.4.99", () => {
    expect(isV15Plus({ version: "1.4.99" })).toBe(false);
  });

  it("returns false for 1.4.0", () => {
    expect(isV15Plus({ version: "1.4.0" })).toBe(false);
  });

  it("returns false for 1.3.0", () => {
    expect(isV15Plus({ version: "1.3.0" })).toBe(false);
  });

  it("returns false for 0.1.0", () => {
    expect(isV15Plus({ version: "0.1.0" })).toBe(false);
  });

  it("returns false for invalid version (no throw at boundary)", () => {
    expect(isV15Plus({ version: "not-a-semver" })).toBe(false);
  });

  it("returns false for zero-padded forms (parseVersion rejects them; helper catches)", () => {
    expect(isV15Plus({ version: "1.05.0" })).toBe(false);
    expect(isV15Plus({ version: "01.5.0" })).toBe(false);
    expect(isV15Plus({ version: "1.5.03" })).toBe(false);
  });

  it("preserves isV12Plus / isV13Plus / isV14Plus contract (no regression on lower-bound helpers)", () => {
    expect(isV12Plus({ version: "1.5.0" })).toBe(true);
    expect(isV13Plus({ version: "1.5.0" })).toBe(true);
    expect(isV14Plus({ version: "1.5.0" })).toBe(true);
    expect(isV14Plus({ version: "1.4.0" })).toBe(true);
    expect(isV15Plus({ version: "1.4.0" })).toBe(false);
  });
});
