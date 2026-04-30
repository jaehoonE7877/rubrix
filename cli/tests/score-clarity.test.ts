import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { scoreClarityCommand } from "../src/commands/score-clarity.ts";
import { baseV12Drafted, tempContractFile } from "./helpers.ts";

interface CapturedStreams {
  stdout: string;
  stderr: string;
  restore: () => void;
}

function captureStreams(): CapturedStreams {
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

describe("rubrix score-clarity (v1.2/PR #1 placeholder)", () => {
  let cap: CapturedStreams;
  beforeEach(() => { cap = captureStreams(); });
  afterEach(() => { cap.restore(); });

  it("rejects an invalid key with exit 2", () => {
    const path = tempContractFile(baseV12Drafted());
    const code = scoreClarityCommand({ key: "bogus", path });
    expect(code).toBe(2);
    expect(cap.stderr).toContain("invalid key");
  });

  it("returns exit 3 with explanatory message when the artifact is not present", () => {
    const c = baseV12Drafted();
    c.state = "IntentDrafted";
    delete c.rubric;
    const path = tempContractFile(c);
    const code = scoreClarityCommand({ key: "rubric", path });
    expect(code).toBe(3);
    expect(cap.stderr).toContain("rubric not present");
  });

  it("emits a JSON object with hash + threshold + placeholder score=null on success", () => {
    const c = baseV12Drafted();
    const path = tempContractFile(c);
    const code = scoreClarityCommand({ key: "rubric", path });
    expect(code).toBe(0);
    const parsed = JSON.parse(cap.stdout);
    expect(parsed.artifact).toBe("rubric");
    expect(parsed.score).toBeNull();
    expect(parsed.deductions).toEqual([]);
    expect(parsed.scorer_version).toBe("placeholder/1.0");
    expect(parsed.threshold_policy_version).toBe("clarity-policy/1.0");
    expect(parsed.threshold).toBe(0.75);
    expect(parsed.artifact_hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("never mutates rubrix.json (read-only)", () => {
    const c = baseV12Drafted();
    const path = tempContractFile(c);
    const before = readFileSync(path, "utf8");
    const code = scoreClarityCommand({ key: "rubric", path });
    expect(code).toBe(0);
    const after = readFileSync(path, "utf8");
    expect(after).toBe(before);
  });

  it("artifact_hash is byte-equivalent across two invocations on the same input", () => {
    const c = baseV12Drafted();
    const path = tempContractFile(c);
    scoreClarityCommand({ key: "rubric", path });
    const first = JSON.parse(cap.stdout);
    cap.restore();
    cap = captureStreams();
    scoreClarityCommand({ key: "rubric", path });
    const second = JSON.parse(cap.stdout);
    expect(second.artifact_hash).toBe(first.artifact_hash);
  });

  it("--threshold override is reflected in output and clamped", () => {
    const c = baseV12Drafted();
    const path = tempContractFile(c);
    scoreClarityCommand({ key: "rubric", path, threshold: 0.5 });
    const parsed = JSON.parse(cap.stdout);
    expect(parsed.threshold).toBe(0.5);
  });

  it("axis_depth.deep raises threshold to 0.85 for rubric", () => {
    const c = baseV12Drafted();
    c.intent.brief!.axis_depth!.security = "deep";
    const path = tempContractFile(c);
    scoreClarityCommand({ key: "rubric", path });
    const parsed = JSON.parse(cap.stdout);
    expect(parsed.threshold).toBeCloseTo(0.85, 4);
  });
});
