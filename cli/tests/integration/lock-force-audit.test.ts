import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { lockCommand } from "../../src/commands/lock.ts";
import { baseV12Drafted, tempContractFile } from "../helpers.ts";

interface Cap { stdout: string; stderr: string; restore: () => void }

function captureStreams(): Cap {
  let stdout = "";
  let stderr = "";
  const w = vi.spyOn(process.stdout, "write").mockImplementation((chunk: string | Uint8Array) => { stdout += typeof chunk === "string" ? chunk : chunk.toString(); return true; });
  const e = vi.spyOn(process.stderr, "write").mockImplementation((chunk: string | Uint8Array) => { stderr += typeof chunk === "string" ? chunk : chunk.toString(); return true; });
  return { get stdout() { return stdout; }, get stderr() { return stderr; }, restore: () => { w.mockRestore(); e.mockRestore(); } };
}

describe("rubrix lock --force audit (v1.2/PR #3)", () => {
  let cap: Cap;
  beforeEach(() => { cap = captureStreams(); });
  afterEach(() => { cap.restore(); });

  it("locks despite score<threshold and persists forced=true with forced_at + force_reason", () => {
    const c = baseV12Drafted();
    c.intent.brief!.axis_depth = { security: "deep", data: "deep", correctness: "standard", ux: "standard", perf: "standard" };
    c.rubric = { threshold: 0.5, criteria: [{ id: "tiny", description: "short", weight: 1 }] };
    const path = tempContractFile(c);
    const code = lockCommand({ key: "rubric", path, force: "vendor freeze blocks rewrite", env: {} });
    expect(code).toBe(0);
    const after = JSON.parse(readFileSync(path, "utf8"));
    expect(after.state).toBe("RubricLocked");
    expect(after.rubric.clarity.forced).toBe(true);
    expect(after.rubric.clarity.force_reason).toBe("vendor freeze blocks rewrite");
    expect(after.rubric.clarity.forced_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(cap.stderr).toContain("forced lock");
    expect(cap.stderr).toContain("vendor freeze blocks rewrite");
  });

  it("rejects --force with empty reason (exit 2)", () => {
    const c = baseV12Drafted();
    c.rubric = { threshold: 0.5, criteria: [{ id: "tiny", description: "short", weight: 1 }] };
    const path = tempContractFile(c);
    const code = lockCommand({ key: "rubric", path, force: "   ", env: {} });
    expect(code).toBe(2);
    expect(cap.stderr).toContain("non-empty reason");
  });

  it("without --force, score<threshold still exits 3 (PR #2 behavior preserved)", () => {
    const c = baseV12Drafted();
    c.intent.brief!.axis_depth = { security: "deep", data: "deep", correctness: "standard", ux: "standard", perf: "standard" };
    c.rubric = { threshold: 0.5, criteria: [{ id: "tiny", description: "short", weight: 1 }] };
    const path = tempContractFile(c);
    const code = lockCommand({ key: "rubric", path, env: {} });
    expect(code).toBe(3);
  });

  it("--force on a passing v1.2 rubric still annotates forced=true (audit trail honored even when not strictly needed)", () => {
    const c = baseV12Drafted();
    c.rubric = {
      threshold: 0.5,
      criteria: [{
        id: "ok",
        description: "A description that is substantially longer than sixty characters and uses concrete measurable terms only",
        weight: 1,
        floor: 0.7,
        axis: "correctness",
        verify: "vitest tests/example.test.ts",
      }],
    };
    const path = tempContractFile(c);
    const code = lockCommand({ key: "rubric", path, force: "policy override", env: {} });
    expect(code).toBe(0);
    const after = JSON.parse(readFileSync(path, "utf8"));
    expect(after.rubric.clarity.forced).toBe(true);
    expect(after.rubric.clarity.force_reason).toBe("policy override");
  });
});
