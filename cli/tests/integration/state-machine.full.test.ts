import { describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { saveContract, loadContract, type RubrixContract } from "../../src/core/contract.ts";
import { stateGetCommand, stateSetCommand } from "../../src/commands/state.ts";
import { lockCommand } from "../../src/commands/lock.ts";
import { gateCommand } from "../../src/commands/gate.ts";

function silentRun(fn: () => number): number {
  const o = process.stdout.write.bind(process.stdout);
  const e = process.stderr.write.bind(process.stderr);
  process.stdout.write = (() => true) as typeof process.stdout.write;
  process.stderr.write = (() => true) as typeof process.stderr.write;
  try {
    return fn();
  } finally {
    process.stdout.write = o;
    process.stderr.write = e;
  }
}

function readContract(path: string): RubrixContract {
  return JSON.parse(readFileSync(path, "utf8")) as RubrixContract;
}

describe("full lifecycle E2E — IntentDrafted → Passed via CLI commands", () => {
  it("advances through every state via the documented commands", () => {
    const dir = mkdtempSync(join(tmpdir(), "rubrix-e2e-"));
    const path = join(dir, "rubrix.json");

    const initial: RubrixContract = {
      version: "0.1.0",
      intent: { summary: "ship rubrix v1.0.0" },
      state: "IntentDrafted",
      locks: { rubric: false, matrix: false, plan: false },
    };
    writeFileSync(path, JSON.stringify(initial), "utf8");

    expect(loadContract(path).state).toBe("IntentDrafted");

    let c = loadContract(path);
    c.rubric = {
      threshold: 0.7,
      criteria: [
        { id: "schema_valid", description: "schema accepts the contract", weight: 0.5 },
        { id: "tests_pass", description: "vitest runs green", weight: 0.5, floor: 0.6 },
      ],
    };
    saveContract(path, c);
    expect(silentRun(() => stateSetCommand({ path, to: "RubricDrafted" }))).toBe(0);
    expect(readContract(path).state).toBe("RubricDrafted");

    expect(silentRun(() => lockCommand({ key: "rubric", path }))).toBe(0);
    expect(readContract(path).state).toBe("RubricLocked");
    expect(readContract(path).locks).toEqual({ rubric: true, matrix: false, plan: false });

    c = loadContract(path);
    c.matrix = {
      rows: [
        { id: "m_schema", criterion: "schema_valid", evidence_required: "ajv compile + validate" },
        { id: "m_tests", criterion: "tests_pass", evidence_required: "npm test" },
      ],
    };
    saveContract(path, c);
    expect(silentRun(() => stateSetCommand({ path, to: "MatrixDrafted" }))).toBe(0);
    expect(silentRun(() => lockCommand({ key: "matrix", path }))).toBe(0);
    expect(readContract(path).state).toBe("MatrixLocked");
    expect(readContract(path).locks).toEqual({ rubric: true, matrix: true, plan: false });

    c = loadContract(path);
    c.plan = {
      steps: [
        { id: "s1", action: "compile schema", covers: ["m_schema"] },
        { id: "s2", action: "run tests", covers: ["m_tests"] },
      ],
    };
    saveContract(path, c);
    expect(silentRun(() => stateSetCommand({ path, to: "PlanDrafted" }))).toBe(0);
    expect(silentRun(() => lockCommand({ key: "plan", path }))).toBe(0);
    expect(readContract(path).state).toBe("PlanLocked");
    expect(readContract(path).locks).toEqual({ rubric: true, matrix: true, plan: true });

    expect(silentRun(() => stateSetCommand({ path, to: "Scoring" }))).toBe(0);
    expect(readContract(path).state).toBe("Scoring");

    c = loadContract(path);
    c.scores = [
      { criterion: "schema_valid", score: 1.0, evaluator: "agent:output-judge" },
      { criterion: "tests_pass", score: 0.9, evaluator: "agent:output-judge" },
    ];
    saveContract(path, c);

    expect(silentRun(() => gateCommand({ path, apply: true }))).toBe(0);
    expect(readContract(path).state).toBe("Passed");

    let getOut = "";
    const orig = process.stdout.write.bind(process.stdout);
    process.stdout.write = ((s: string | Uint8Array) => {
      getOut += typeof s === "string" ? s : Buffer.from(s).toString();
      return true;
    }) as typeof process.stdout.write;
    try {
      stateGetCommand({ path });
    } finally {
      process.stdout.write = orig;
    }
    expect(getOut.trim()).toBe("Passed");
  });

  it("Failed → PlanDrafted recovery loop replays plan + score", () => {
    const dir = mkdtempSync(join(tmpdir(), "rubrix-e2e-fail-"));
    const path = join(dir, "rubrix.json");

    const c: RubrixContract = {
      version: "0.1.0",
      intent: { summary: "x" },
      rubric: {
        threshold: 0.7,
        criteria: [
          { id: "a", description: "d", weight: 0.5, floor: 0.4 },
          { id: "b", description: "d", weight: 0.5 },
        ],
      },
      matrix: {
        rows: [
          { id: "ma", criterion: "a", evidence_required: "e" },
          { id: "mb", criterion: "b", evidence_required: "e" },
        ],
      },
      plan: {
        steps: [
          { id: "s1", action: "a", covers: ["ma"] },
          { id: "s2", action: "b", covers: ["mb"] },
        ],
      },
      state: "Scoring",
      locks: { rubric: true, matrix: true, plan: true },
      scores: [
        { criterion: "a", score: 0.2 },
        { criterion: "b", score: 0.2 },
      ],
    };
    saveContract(path, c);

    expect(silentRun(() => gateCommand({ path, apply: true }))).toBe(4);
    expect(readContract(path).state).toBe("Failed");

    expect(silentRun(() => stateSetCommand({ path, to: "PlanDrafted" }))).toBe(0);
    const after = readContract(path);
    expect(after.state).toBe("PlanDrafted");
    expect(after.locks.plan).toBe(false);
    expect(after.scores).toBeUndefined();
  });
});
