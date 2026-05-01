import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { lockCommand } from "../../src/commands/lock.ts";
import { baseDrafted, baseV12Drafted, tempContractFile } from "../helpers.ts";

interface Cap {
  stdout: string;
  stderr: string;
  restore: () => void;
}

function captureStreams(): Cap {
  let stdout = "";
  let stderr = "";
  const w = vi.spyOn(process.stdout, "write").mockImplementation((chunk: string | Uint8Array) => {
    stdout += typeof chunk === "string" ? chunk : chunk.toString();
    return true;
  });
  const e = vi.spyOn(process.stderr, "write").mockImplementation((chunk: string | Uint8Array) => {
    stderr += typeof chunk === "string" ? chunk : chunk.toString();
    return true;
  });
  return {
    get stdout() { return stdout; },
    get stderr() { return stderr; },
    restore: () => { w.mockRestore(); e.mockRestore(); },
  };
}

describe("rubrix lock v1.2 clarity gate (PR #2)", () => {
  let cap: Cap;
  beforeEach(() => { cap = captureStreams(); });
  afterEach(() => { cap.restore(); });

  it("rejects a vague v1.2 rubric with exit 3 and lists deductions on stderr; rubrix.json unchanged", () => {
    const c = baseV12Drafted();
    c.intent.brief!.axis_depth = { security: "deep", data: "deep", correctness: "standard", ux: "standard", perf: "standard" };
    c.rubric = {
      threshold: 0.5,
      criteria: [{ id: "tiny", description: "short", weight: 1 }],
    };
    const path = tempContractFile(c);
    const before = readFileSync(path, "utf8");
    const code = lockCommand({ key: "rubric", path, env: {} });
    expect(code).toBe(3);
    expect(cap.stderr).toContain("clarity");
    expect(cap.stderr).toContain("below threshold");
    expect(cap.stderr).toMatch(/\[vague_description\]|\[missing_evidence\]|\[uncovered_axis\]/);
    expect(readFileSync(path, "utf8")).toBe(before);
  });

  it("locks a well-formed v1.2 rubric and persists clarity with forced=false", () => {
    const c = baseV12Drafted();
    c.rubric = {
      threshold: 0.5,
      criteria: [
        {
          id: "well_formed",
          description: "A description that is substantially longer than sixty characters and uses concrete measurable terms only",
          weight: 1,
          floor: 0.7,
          axis: "correctness",
          verify: "vitest tests/example.test.ts",
        },
      ],
    };
    const path = tempContractFile(c);
    const code = lockCommand({ key: "rubric", path, env: {} });
    expect(code).toBe(0);
    expect(cap.stdout).toContain("rubric locked -> RubricLocked");
    const after = JSON.parse(readFileSync(path, "utf8"));
    expect(after.state).toBe("RubricLocked");
    expect(after.locks.rubric).toBe(true);
    expect(after.rubric.clarity).toBeDefined();
    expect(after.rubric.clarity.forced).toBe(false);
    expect(after.rubric.clarity.score).toBeGreaterThanOrEqual(after.rubric.clarity.threshold);
    expect(after.rubric.clarity.scorer_version).toBe("clarity-scorer/1.0");
  });

  it("v1.0 contract (version 0.1.0) skips the scorer entirely (read-compat)", () => {
    const c = baseDrafted();
    c.rubric = { threshold: 0.5, criteria: [{ id: "tiny", description: "short", weight: 1 }] };
    const path = tempContractFile(c);
    const code = lockCommand({ key: "rubric", path, env: {} });
    expect(code).toBe(0);
    const after = JSON.parse(readFileSync(path, "utf8"));
    expect(after.state).toBe("RubricLocked");
    expect(after.rubric.clarity).toBeUndefined();
  });

  it("--threshold override can lower the bar enough to lock a borderline rubric", () => {
    const c = baseV12Drafted();
    c.rubric = {
      threshold: 0.5,
      criteria: [{ id: "tiny", description: "short", weight: 1 }],
    };
    const path = tempContractFile(c);
    const code = lockCommand({ key: "rubric", path, threshold: 0, env: {} });
    expect(code).toBe(0);
    const after = JSON.parse(readFileSync(path, "utf8"));
    expect(after.rubric.clarity.threshold).toBe(0);
  });

  it("(codex review #29 P2) RUBRIX_SKIP_BRIEF=1 in env propagates to scoreClarity so threshold and deductions agree", () => {
    const c = baseV12Drafted();
    c.intent.brief!.axis_depth = { security: "deep", data: "deep", correctness: "standard", ux: "standard", perf: "standard" };
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
    const code = lockCommand({ key: "rubric", path, env: { RUBRIX_SKIP_BRIEF: "1" } });
    expect(code).toBe(0);
    const after = JSON.parse(readFileSync(path, "utf8"));
    const codes = (after.rubric.clarity.deductions ?? []).map((d: { code: string }) => d.code);
    expect(codes).not.toContain("uncovered_axis");
  });
});
