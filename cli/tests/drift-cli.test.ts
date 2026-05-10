import { describe, expect, it, vi, afterEach, beforeEach } from "vitest";
import { driftCommand } from "../src/commands/drift.ts";
import { tempContractFile, baseV14Passed, baseV12Drafted } from "./helpers.ts";

describe("rubrix drift (PR #1 stub)", () => {
  let stdout: string[];
  let stderr: string[];

  beforeEach(() => {
    stdout = [];
    stderr = [];
    vi.spyOn(process.stdout, "write").mockImplementation(((chunk: string | Uint8Array) => {
      stdout.push(typeof chunk === "string" ? chunk : chunk.toString());
      return true;
    }) as typeof process.stdout.write);
    vi.spyOn(process.stderr, "write").mockImplementation(((chunk: string | Uint8Array) => {
      stderr.push(typeof chunk === "string" ? chunk : chunk.toString());
      return true;
    }) as typeof process.stderr.write);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("v1.4 contract returns 0 and prints stub placeholder", () => {
    const path = tempContractFile(baseV14Passed());
    const code = driftCommand({ path });
    expect(code).toBe(0);
    expect(stdout.join("")).toMatch(/drift command stub/);
    expect(stdout.join("")).toMatch(/version=1\.4\.0/);
    expect(stdout.join("")).toMatch(/scorer=drift-scorer\/1\.0/);
  });

  it("--json emits JSON with status=stub", () => {
    const path = tempContractFile(baseV14Passed());
    const code = driftCommand({ path, json: true });
    expect(code).toBe(0);
    const payload = JSON.parse(stdout.join("").trim());
    expect(payload.status).toBe("stub");
    expect(payload.version).toBe("1.4.0");
    expect(payload.drift_policy).toMatchObject({ scorer_version: "drift-scorer/1.0" });
  });

  it("v1.3 contract is rejected with a versioning error (no drift_policy on pre-v1.4)", () => {
    const c = baseV14Passed();
    c.version = "1.3.0";
    delete c.evaluation_policy!.derived_from_policy_hash;
    delete (c as unknown as Record<string, unknown>).drift_policy;
    const path = tempContractFile(c);
    const code = driftCommand({ path });
    expect(code).toBe(2);
    expect(stderr.join("")).toMatch(/v1\.4\+ contract/);
  });

  it("v1.2 contract is rejected", () => {
    const c = baseV12Drafted();
    c.version = "1.2.0";
    const path = tempContractFile(c);
    const code = driftCommand({ path });
    expect(code).toBe(2);
  });

  it("nonexistent file returns non-zero", () => {
    const code = driftCommand({ path: "/tmp/__rubrix-no-such__.json" });
    expect(code).not.toBe(0);
  });
});
