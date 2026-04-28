import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { stateGetCommand, stateSetCommand } from "../src/commands/state.ts";
import { baseDrafted, tempContractFile } from "./helpers.ts";

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

describe("state commands", () => {
  it("get prints the current state", () => {
    const path = tempContractFile(baseDrafted());
    const { code, out } = captureStdout(() => stateGetCommand({ path }));
    expect(code).toBe(0);
    expect(out.trim()).toBe("RubricDrafted");
  });

  it("set rejects illegal forward jumps", () => {
    const path = tempContractFile(baseDrafted());
    const { code, err } = captureStderr(() => stateSetCommand({ path, to: "PlanLocked" }));
    expect(code).toBe(3);
    expect(err).toContain("refusing transition");
  });

  it("set rejects unknown state names", () => {
    const path = tempContractFile(baseDrafted());
    const { code, err } = captureStderr(() => stateSetCommand({ path, to: "Bogus" }));
    expect(code).toBe(2);
    expect(err).toContain("unknown state");
  });

  it("rejects Scoring -> Passed via state set (must go through gate --apply)", () => {
    const c = baseDrafted();
    c.state = "Scoring";
    c.matrix = { rows: [{ id: "r", criterion: "c1", evidence_required: "e" }] };
    c.plan = { steps: [{ id: "s", action: "a" }] };
    c.locks = { rubric: true, matrix: true, plan: true };
    c.scores = [{ criterion: "c1", score: 0.1 }];
    const path = tempContractFile(c);
    const { code, err } = captureStderr(() => stateSetCommand({ path, to: "Passed" }));
    expect(code).toBe(3);
    expect(err).toContain("refusing transition");
  });

  it("rejects Scoring -> Failed via state set", () => {
    const c = baseDrafted();
    c.state = "Scoring";
    c.matrix = { rows: [{ id: "r", criterion: "c1", evidence_required: "e" }] };
    c.plan = { steps: [{ id: "s", action: "a" }] };
    c.locks = { rubric: true, matrix: true, plan: true };
    c.scores = [{ criterion: "c1", score: 0.1 }];
    const path = tempContractFile(c);
    const { code } = captureStderr(() => stateSetCommand({ path, to: "Failed" }));
    expect(code).toBe(3);
  });

  it("Failed -> PlanDrafted resets locks.plan and clears stale scores", () => {
    const c = baseDrafted();
    c.state = "Failed";
    c.matrix = { rows: [{ id: "r", criterion: "c1", evidence_required: "e" }] };
    c.plan = { steps: [{ id: "s", action: "a" }] };
    c.locks = { rubric: true, matrix: true, plan: true };
    c.scores = [{ criterion: "c1", score: 0.1 }];
    const path = tempContractFile(c);
    const { code } = captureStdout(() => stateSetCommand({ path, to: "PlanDrafted" }));
    expect(code).toBe(0);
    const after = JSON.parse(readFileSync(path, "utf8"));
    expect(after.state).toBe("PlanDrafted");
    expect(after.locks.plan).toBe(false);
    expect(after.scores).toBeUndefined();
  });
});
