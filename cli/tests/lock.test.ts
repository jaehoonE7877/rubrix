import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { lockCommand } from "../src/commands/lock.ts";
import { baseDrafted, tempContractFile } from "./helpers.ts";

function captureStderr(fn: () => number): { code: number; err: string } {
  const orig = process.stderr.write.bind(process.stderr);
  let buf = "";
  process.stderr.write = ((s: string | Uint8Array) => {
    buf += typeof s === "string" ? s : Buffer.from(s).toString();
    return true;
  }) as typeof process.stderr.write;
  try {
    const code = fn();
    return { code, err: buf };
  } finally {
    process.stderr.write = orig;
  }
}

function captureStdout(fn: () => number): { code: number; out: string } {
  const orig = process.stdout.write.bind(process.stdout);
  let buf = "";
  process.stdout.write = ((s: string | Uint8Array) => {
    buf += typeof s === "string" ? s : Buffer.from(s).toString();
    return true;
  }) as typeof process.stdout.write;
  try {
    const code = fn();
    return { code, out: buf };
  } finally {
    process.stdout.write = orig;
  }
}

describe("lock command", () => {
  it("locks rubric and advances state to RubricLocked", () => {
    const path = tempContractFile(baseDrafted());
    const { code } = captureStdout(() => lockCommand({ key: "rubric", path }));
    expect(code).toBe(0);
    const after = JSON.parse(readFileSync(path, "utf8"));
    expect(after.state).toBe("RubricLocked");
    expect(after.locks).toEqual({ rubric: true, matrix: false, plan: false });
  });

  it("refuses to lock matrix when state is RubricDrafted", () => {
    const path = tempContractFile(baseDrafted());
    const { code, err } = captureStderr(() => lockCommand({ key: "matrix", path }));
    expect(code).toBe(3);
    expect(err).toContain("expected MatrixDrafted");
  });

  it("refuses unknown lock keys", () => {
    const path = tempContractFile(baseDrafted());
    const { code, err } = captureStderr(() => lockCommand({ key: "bogus", path }));
    expect(code).toBe(2);
    expect(err).toContain("unknown lock key");
  });

  it("requires the corresponding artifact to exist", () => {
    const c = baseDrafted();
    delete c.rubric;
    c.state = "RubricDrafted";
    const path = tempContractFile(c);
    const { code, err } = captureStderr(() => lockCommand({ key: "rubric", path }));
    expect(code).toBe(2);
    expect(err.toLowerCase()).toContain("not valid");
  });

  it("refuses to lock matrix when a row references an unknown criterion", () => {
    const c = baseDrafted();
    c.state = "MatrixDrafted";
    c.locks = { rubric: true, matrix: false, plan: false };
    c.matrix = { rows: [{ id: "m1", criterion: "c99", evidence_required: "e" }] };
    const path = tempContractFile(c);
    const { code, err } = captureStderr(() => lockCommand({ key: "matrix", path }));
    expect(code).toBe(3);
    expect(err).toContain("unknown criteria");
    expect(err).toContain("c99");
  });

  it("refuses to lock matrix when a criterion is not covered by any row", () => {
    const c = baseDrafted();
    c.rubric = {
      threshold: 0.5,
      criteria: [
        { id: "c1", description: "d", weight: 0.5 },
        { id: "c2", description: "d", weight: 0.5 },
      ],
    };
    c.state = "MatrixDrafted";
    c.locks = { rubric: true, matrix: false, plan: false };
    c.matrix = { rows: [{ id: "m1", criterion: "c1", evidence_required: "e" }] };
    const path = tempContractFile(c);
    const { code, err } = captureStderr(() => lockCommand({ key: "matrix", path }));
    expect(code).toBe(3);
    expect(err).toContain("not covered");
  });

  it("refuses to lock plan when covers references an unknown matrix row", () => {
    const c = baseDrafted();
    c.state = "PlanDrafted";
    c.locks = { rubric: true, matrix: true, plan: false };
    c.matrix = { rows: [{ id: "m1", criterion: "c1", evidence_required: "e" }] };
    c.plan = { steps: [{ id: "p1", action: "do", covers: ["m99"] }] };
    const path = tempContractFile(c);
    const { code, err } = captureStderr(() => lockCommand({ key: "plan", path }));
    expect(code).toBe(3);
    expect(err).toContain("unknown matrix rows");
    expect(err).toContain("m99");
  });

  it("refuses to lock plan when a matrix row is not covered", () => {
    const c = baseDrafted();
    c.rubric = {
      threshold: 0.5,
      criteria: [
        { id: "c1", description: "d", weight: 0.5 },
        { id: "c2", description: "d", weight: 0.5 },
      ],
    };
    c.state = "PlanDrafted";
    c.locks = { rubric: true, matrix: true, plan: false };
    c.matrix = {
      rows: [
        { id: "m1", criterion: "c1", evidence_required: "e1" },
        { id: "m2", criterion: "c2", evidence_required: "e2" },
      ],
    };
    c.plan = { steps: [{ id: "p1", action: "do", covers: ["m1"] }] };
    const path = tempContractFile(c);
    const { code, err } = captureStderr(() => lockCommand({ key: "plan", path }));
    expect(code).toBe(3);
    expect(err).toContain("not covered");
    expect(err).toContain("m2");
  });

  it("locks plan successfully when all covers are valid and complete", () => {
    const c = baseDrafted();
    c.state = "PlanDrafted";
    c.locks = { rubric: true, matrix: true, plan: false };
    c.matrix = { rows: [{ id: "m1", criterion: "c1", evidence_required: "e" }] };
    c.plan = { steps: [{ id: "p1", action: "do", covers: ["m1"] }] };
    const path = tempContractFile(c);
    const { code } = captureStdout(() => lockCommand({ key: "plan", path }));
    expect(code).toBe(0);
    const after = JSON.parse(readFileSync(path, "utf8"));
    expect(after.state).toBe("PlanLocked");
    expect(after.locks.plan).toBe(true);
  });
});
