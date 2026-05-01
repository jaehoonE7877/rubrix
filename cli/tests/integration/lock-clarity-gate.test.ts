import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { lockCommand } from "../../src/commands/lock.ts";
import { baseDrafted, baseV12Drafted, clarity, tempContractFile } from "../helpers.ts";

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

  it("(codex follow-up #13 P2) lockCommand refuses re-lock from Failed/Scoring/Passed states (forces documented rollback loop)", () => {
    for (const terminalState of ["Scoring", "Passed", "Failed"] as const) {
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
        clarity: clarity(0.95, 0.75),
      };
      c.matrix = { rows: [{ id: "r1", criterion: "ok", evidence_required: "An adequately long evidence requirement description without vague language tokens.", verify: "manual review" }], clarity: clarity(0.95, 0.80) };
      c.plan = { steps: [{ id: "s1", action: "An adequately long action description without any vague language tokens here.", covers: ["r1"] }], clarity: clarity(0.95, 0.70) };
      c.state = terminalState;
      c.locks = { rubric: true, matrix: true, plan: true };
      c.scores = [{ criterion: "ok", score: 0.9 }];
      const path = tempContractFile(c);
      const code = lockCommand({ key: "plan", path, force: "audit", env: {} });
      expect(code).toBe(3);
      expect(cap.stderr).toContain(`state is ${terminalState}`);
      expect(cap.stderr).toContain("rubrix state set");
      const after = JSON.parse(readFileSync(path, "utf8"));
      expect(after.state).toBe(terminalState);
      expect(after.scores).toEqual([{ criterion: "ok", score: 0.9 }]);
    }
  });

  it("(codex follow-up #12 P2) re-lock upstream cascades: clears downstream locks/clarity and rolls state back to *Locked", () => {
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
      clarity: clarity(0.95, 0.75),
    };
    c.matrix = { rows: [{ id: "r1", criterion: "ok", evidence_required: "An adequately long evidence requirement description without vague language tokens.", verify: "manual review" }], clarity: clarity(0.95, 0.80) };
    c.plan = { steps: [{ id: "s1", action: "An adequately long action description without any vague language tokens here.", covers: ["r1"] }], clarity: clarity(0.95, 0.70) };
    c.state = "PlanLocked";
    c.locks = { rubric: true, matrix: true, plan: true };
    c.scores = [{ criterion: "ok", score: 0.9 }];
    const path = tempContractFile(c);
    const code = lockCommand({ key: "rubric", path, env: {} });
    expect(code).toBe(0);
    const after = JSON.parse(readFileSync(path, "utf8"));
    expect(after.state).toBe("RubricLocked");
    expect(after.locks).toEqual({ rubric: true, matrix: false, plan: false });
    expect(after.matrix.clarity).toBeUndefined();
    expect(after.plan.clarity).toBeUndefined();
    expect(after.scores).toBeUndefined();
    expect(cap.stderr).toContain("re-lock cascade");
    expect(cap.stderr).toContain("matrix");
    expect(cap.stderr).toContain("plan");
  });

  it("(codex follow-up #11 P2) lockCommand allows in-place re-lock of an already-locked artifact (recovery path executable)", () => {
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
      clarity: clarity(0.95, 0.75),
    };
    c.matrix = { rows: [{ id: "r1", criterion: "ok", evidence_required: "An adequately long evidence requirement description without vague language tokens.", verify: "manual review" }] };
    c.plan = { steps: [{ id: "s1", action: "An adequately long action description without any vague language tokens here.", covers: ["r1"] }] };
    c.state = "PlanDrafted";
    c.locks = { rubric: true, matrix: true, plan: false };
    const path = tempContractFile(c);
    const code = lockCommand({ key: "matrix", path, force: "audit override", env: {} });
    expect(code).toBe(0);
    const after = JSON.parse(readFileSync(path, "utf8"));
    expect(after.state).toBe("MatrixLocked");
    expect(after.locks.matrix).toBe(true);
    expect(after.locks.plan).toBe(false);
    expect(after.matrix.clarity.forced).toBe(true);
    expect(after.matrix.clarity.force_reason).toBe("audit override");
    expect(cap.stdout).toContain("re-locked");
  });

  it("(codex follow-up #10 P1) lockCommand refuses to advance lifecycle when upstream artifact has clarity invariant breach", () => {
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
    c.matrix = { rows: [{ id: "r1", criterion: "ok", evidence_required: "An adequately long evidence requirement description without vague language tokens.", verify: "manual review" }] };
    c.state = "MatrixDrafted";
    c.locks = { rubric: true, matrix: false, plan: false };
    const path = tempContractFile(c);
    const code = lockCommand({ key: "matrix", path, env: {} });
    expect(code).toBe(3);
    expect(cap.stderr).toContain("upstream clarity invariant breach");
    expect(cap.stderr).toContain("/rubric/clarity");
    const after = JSON.parse(readFileSync(path, "utf8"));
    expect(after.state).toBe("MatrixDrafted");
    expect(after.locks.matrix).toBe(false);
  });

  it("(codex follow-up #4 P2) lockCommand falls back to process.env at the CLI boundary so RUBRIX_SKIP_BRIEF=1 works without explicit env arg", () => {
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
    const prev = process.env.RUBRIX_SKIP_BRIEF;
    process.env.RUBRIX_SKIP_BRIEF = "1";
    try {
      const code = lockCommand({ key: "rubric", path });
      expect(code).toBe(0);
      const after = JSON.parse(readFileSync(path, "utf8"));
      const codes = (after.rubric.clarity.deductions ?? []).map((d: { code: string }) => d.code);
      expect(codes).not.toContain("uncovered_axis");
    } finally {
      if (prev === undefined) delete process.env.RUBRIX_SKIP_BRIEF;
      else process.env.RUBRIX_SKIP_BRIEF = prev;
    }
  });

  it("(codex follow-up #4 P2) core scoreClarity stays env-deterministic: RUBRIX_SKIP_BRIEF in process.env does NOT leak into a direct call with no env arg", async () => {
    const { scoreClarity } = await import("../../src/core/clarity.ts");
    const c = baseV12Drafted();
    c.intent.brief!.axis_depth = { security: "deep", data: "deep", correctness: "standard", ux: "standard", perf: "standard" };
    c.rubric = {
      threshold: 0.5,
      criteria: [{ id: "x", description: "short", weight: 1, axis: "security" }],
    };
    const prev = process.env.RUBRIX_SKIP_BRIEF;
    process.env.RUBRIX_SKIP_BRIEF = "1";
    try {
      const r = scoreClarity({ contract: c, key: "rubric", threshold: 0.75 });
      const codes = r.clarity.deductions.map((d) => d.code);
      expect(codes).toContain("uncovered_axis");
    } finally {
      if (prev === undefined) delete process.env.RUBRIX_SKIP_BRIEF;
      else process.env.RUBRIX_SKIP_BRIEF = prev;
    }
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
