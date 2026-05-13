import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  goalPrintCommand,
  goalValidateCommand,
  synthesizeCondition,
  checkCondition,
} from "../src/commands/goal.ts";
import type { RubrixContract } from "../src/core/contract.ts";

function tmpContract(c: object, name = "rubrix.json"): string {
  const dir = mkdtempSync(join(tmpdir(), "rubrix-goal-"));
  const p = join(dir, name);
  writeFileSync(p, JSON.stringify(c, null, 2), "utf8");
  return p;
}

function lockedContract(overrides: Partial<RubrixContract> = {}): RubrixContract {
  return {
    version: "0.1.0",
    intent: { summary: "test" },
    rubric: {
      threshold: 0.8,
      criteria: [
        { id: "c1", description: "first", weight: 0.5, floor: 0.7 },
        { id: "c2", description: "second", weight: 0.5, floor: 0.6 },
      ],
    },
    matrix: {
      rows: [
        { id: "m1", criterion: "c1", evidence_required: "x" },
        { id: "m2", criterion: "c2", evidence_required: "y" },
      ],
    },
    plan: {
      steps: [
        { id: "s1", action: "do thing", covers: ["m1", "m2"] },
      ],
    },
    state: "PlanLocked",
    locks: { rubric: true, matrix: true, plan: true },
    ...overrides,
  };
}

describe("goal print", () => {
  it("returns exit 0 and emits a condition for PlanLocked", () => {
    const p = tmpContract(lockedContract());
    const stdout = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    try {
      const code = goalPrintCommand({ path: p });
      expect(code).toBe(0);
      const printed = stdout.mock.calls.map((args) => String(args[0])).join("");
      expect(printed).toContain("rubrix.js gate");
      expect(printed).toContain("overall_pass");
      expect(printed).toContain('state: "Passed"');
      expect(printed).toContain("c1>=0.7");
      expect(printed).toContain("c2>=0.6");
    } finally {
      stdout.mockRestore();
    }
  });

  it("supports --json output with derived_from_contract_hash", () => {
    const p = tmpContract(lockedContract());
    const stdout = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    try {
      const code = goalPrintCommand({ path: p, json: true });
      expect(code).toBe(0);
      const printed = stdout.mock.calls.map((args) => String(args[0])).join("");
      const parsed = JSON.parse(printed);
      expect(parsed).toHaveProperty("condition");
      expect(parsed).toHaveProperty("length");
      expect(parsed).toHaveProperty("criteria_count", 2);
      expect(parsed).toHaveProperty("criteria_included", 2);
      expect(parsed).toHaveProperty("suggested_for_state", "PlanLocked");
      expect(parsed.derived_from_contract_hash).toMatch(/^[a-f0-9]{64}$/);
      expect(parsed.length).toBeLessThanOrEqual(4000);
    } finally {
      stdout.mockRestore();
    }
  });

  it("works in Scoring state (with scores[])", () => {
    const p = tmpContract(
      lockedContract({
        state: "Scoring",
        scores: [
          { criterion: "c1", score: 0.5 },
          { criterion: "c2", score: 0.5 },
        ],
      }),
    );
    const code = goalPrintCommand({ path: p, json: true });
    expect(code).toBe(0);
  });

  it("works in Failed state (with scores[])", () => {
    const p = tmpContract(
      lockedContract({
        state: "Failed",
        scores: [
          { criterion: "c1", score: 0.0 },
          { criterion: "c2", score: 0.5 },
        ],
      }),
    );
    const code = goalPrintCommand({ path: p, json: true });
    expect(code).toBe(0);
  });

  it("refuses with exit 3 when state is IntentDrafted", () => {
    const stderr = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    const p = tmpContract({
      version: "0.1.0",
      intent: { summary: "x" },
      state: "IntentDrafted",
      locks: { rubric: false, matrix: false, plan: false },
    });
    try {
      const code = goalPrintCommand({ path: p });
      expect(code).toBe(3);
      const printed = stderr.mock.calls.map((args) => String(args[0])).join("");
      expect(printed).toContain("PlanLocked");
      expect(printed).toContain("IntentDrafted");
    } finally {
      stderr.mockRestore();
    }
  });

  it("refuses with exit 3 when state is PlanDrafted", () => {
    const p = tmpContract(lockedContract({ state: "PlanDrafted", locks: { rubric: true, matrix: true, plan: false } }));
    const stderr = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    try {
      expect(goalPrintCommand({ path: p })).toBe(3);
    } finally {
      stderr.mockRestore();
    }
  });

  it("returns nonzero on missing file (I/O error)", () => {
    const stderr = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    try {
      const code = goalPrintCommand({ path: "/tmp/does-not-exist-rubrix.json" });
      expect(code).not.toBe(0);
    } finally {
      stderr.mockRestore();
    }
  });

  it("trims criteria and appends '+K more' when total length would exceed 4000 chars", () => {
    const manyCriteria = Array.from({ length: 200 }, (_, i) => ({
      id: `criterion-with-rather-long-identifier-${String(i).padStart(3, "0")}`,
      description: "x",
      weight: 1 - i / 1000,
      floor: 0.5,
    }));
    const c = lockedContract({
      rubric: { threshold: 0.8, criteria: manyCriteria },
    });
    const p = tmpContract(c);
    const stdout = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    try {
      goalPrintCommand({ path: p, json: true });
      const printed = stdout.mock.calls.map((args) => String(args[0])).join("");
      const parsed = JSON.parse(printed);
      expect(parsed.length).toBeLessThanOrEqual(4000);
      expect(parsed.criteria_count).toBe(200);
      expect(parsed.criteria_included).toBeLessThan(200);
      expect(parsed.condition).toContain("more criteria");
    } finally {
      stdout.mockRestore();
    }
  });

  it("orders criteria by weight descending in the condition", () => {
    const c = lockedContract({
      rubric: {
        threshold: 0.8,
        criteria: [
          { id: "low", description: "x", weight: 0.1, floor: 0.5 },
          { id: "high", description: "y", weight: 0.9, floor: 0.7 },
          { id: "mid", description: "z", weight: 0.5, floor: 0.6 },
        ],
      },
    });
    const p = tmpContract(c);
    const stdout = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    try {
      goalPrintCommand({ path: p });
      const printed = stdout.mock.calls.map((args) => String(args[0])).join("");
      const highIdx = printed.indexOf("`high>=");
      const midIdx = printed.indexOf("`mid>=");
      const lowIdx = printed.indexOf("`low>=");
      expect(highIdx).toBeGreaterThan(-1);
      expect(midIdx).toBeGreaterThan(highIdx);
      expect(lowIdx).toBeGreaterThan(midIdx);
    } finally {
      stdout.mockRestore();
    }
  });

  it("produces a deterministic hash for the same contract", () => {
    const c = lockedContract();
    const a = synthesizeCondition(c, "rubrix.json");
    const b = synthesizeCondition(c, "rubrix.json");
    expect(a.derived_from_contract_hash).toBe(b.derived_from_contract_hash);
  });

  it("changes the hash when rubric content changes", () => {
    const a = synthesizeCondition(lockedContract(), "rubrix.json");
    const mutated = lockedContract({
      rubric: {
        threshold: 0.8,
        criteria: [{ id: "c1", description: "first", weight: 0.5, floor: 0.99 }],
      },
    });
    const b = synthesizeCondition(mutated, "rubrix.json");
    expect(a.derived_from_contract_hash).not.toBe(b.derived_from_contract_hash);
  });
});

describe("goal validate", () => {
  const validBaseContract = lockedContract();

  it("accepts a condition with required keywords and no forbidden patterns", () => {
    const p = tmpContract(validBaseContract);
    const code = goalValidateCommand({
      path: p,
      condition:
        "Run `rubrix gate rubrix.json --json` and check overall_pass=true and state=Passed.",
    });
    expect(code).toBe(0);
  });

  it("rejects empty condition with exit 3", () => {
    const p = tmpContract(validBaseContract);
    const stderr = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    try {
      expect(goalValidateCommand({ path: p, condition: "" })).toBe(3);
    } finally {
      stderr.mockRestore();
    }
  });

  it("rejects condition with no required keyword", () => {
    const p = tmpContract(validBaseContract);
    const stderr = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    try {
      const code = goalValidateCommand({
        path: p,
        condition: "Make sure everything looks good before stopping.",
      });
      expect(code).toBe(3);
      const printed = stderr.mock.calls.map((args) => String(args[0])).join("");
      expect(printed).toContain("evaluator-friendly marker");
    } finally {
      stderr.mockRestore();
    }
  });

  it("rejects condition that asks to cat rubrix.json", () => {
    const p = tmpContract(validBaseContract);
    const stderr = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    try {
      const code = goalValidateCommand({
        path: p,
        condition:
          "Run cat rubrix.json and check that overall_pass is true and state is Passed.",
      });
      expect(code).toBe(3);
      const printed = stderr.mock.calls.map((args) => String(args[0])).join("");
      expect(printed).toContain("filesystem read");
    } finally {
      stderr.mockRestore();
    }
  });

  it("rejects condition that asks to read the file", () => {
    const p = tmpContract(validBaseContract);
    const stderr = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    try {
      const code = goalValidateCommand({
        path: p,
        condition: "Please read the file and confirm overall_pass=true and state=Passed.",
      });
      expect(code).toBe(3);
    } finally {
      stderr.mockRestore();
    }
  });

  it("rejects condition exceeding 4000 chars", () => {
    const p = tmpContract(validBaseContract);
    const oversized = "rubrix gate " + "x".repeat(4100);
    const stderr = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    try {
      const code = goalValidateCommand({ path: p, condition: oversized });
      expect(code).toBe(3);
      const printed = stderr.mock.calls.map((args) => String(args[0])).join("");
      expect(printed).toContain("4000 character cap");
    } finally {
      stderr.mockRestore();
    }
  });

  it("--json emits structured ok and issues", () => {
    const p = tmpContract(validBaseContract);
    const stdout = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    try {
      goalValidateCommand({
        path: p,
        condition: "Run rubrix gate and confirm overall_pass=true and state=Passed.",
        json: true,
      });
      const printed = stdout.mock.calls.map((args) => String(args[0])).join("");
      const parsed = JSON.parse(printed);
      expect(parsed.ok).toBe(true);
      expect(parsed.issues).toEqual([]);
      expect(parsed.length).toBeGreaterThan(0);
    } finally {
      stdout.mockRestore();
    }
  });
});

describe("checkCondition (unit)", () => {
  it("accepts a minimal valid condition", () => {
    expect(checkCondition("rubrix gate output should show overall_pass true and state Passed")).toEqual([]);
  });

  it("returns multiple issues at once for cap+forbidden cases", () => {
    const oversizedAndForbidden = "cat rubrix.json " + "x".repeat(4100);
    const issues = checkCondition(oversizedAndForbidden);
    expect(issues.some((i) => i.includes("4000 character cap"))).toBe(true);
    expect(issues.some((i) => i.includes("filesystem read"))).toBe(true);
  });

  it("does not match 'concatenate rubrix.json' as a forbidden cat command (no false positive on word boundary)", () => {
    // The forbidden /\bcat\s+rubrix\.json/i pattern uses \b to avoid matching mid-word.
    // "concatenate rubrix.json" must remain valid because "cat" inside "concatenate" is not a word boundary match.
    const issues = checkCondition(
      "Verify that we did not concatenate rubrix.json output with stdout; overall_pass must be true.",
    );
    expect(issues.some((i) => i.includes("filesystem read"))).toBe(false);
  });
});

describe("synthesizeCondition pathological cases", () => {
  function makeContract(criteria: Array<{ id: string; weight: number; floor: number }>) {
    return {
      version: "0.1.0",
      intent: { summary: "test" },
      rubric: {
        threshold: 0.8,
        criteria: criteria.map((c) => ({ id: c.id, description: "x", weight: c.weight, floor: c.floor })),
      },
      matrix: { rows: criteria.map((c) => ({ id: `m-${c.id}`, criterion: c.id, evidence_required: "x" })) },
      plan: { steps: [{ id: "s1", action: "do thing", covers: criteria.map((c) => `m-${c.id}`) }] },
      state: "PlanLocked",
      locks: { rubric: true, matrix: true, plan: true },
    } as unknown as Parameters<typeof synthesizeCondition>[0];
  }

  it("preserves verdict markers even when the path is so long that header+tail exceeds 4000 chars", () => {
    const c = makeContract([{ id: "c1", weight: 0.5, floor: 0.7 }]);
    const extremelyLongPath = "x".repeat(4500) + ".json";
    const result = synthesizeCondition(c, extremelyLongPath);
    expect(result.length).toBeLessThanOrEqual(4000);
    // The whole point of the pathological-path branch: verdict markers must survive
    // because the small-fast /goal evaluator looks for them in the transcript.
    expect(result.condition).toContain("overall_pass: true");
    expect(result.condition).toContain('state: "Passed"');
    expect(result.criteria_included).toBe(0);
  });

  it("produces deterministic hash when artifacts are undefined (not just absent JSON keys)", () => {
    // canonicalize() silently drops undefined-valued keys via JSON.stringify;
    // synthesizeCondition normalizes undefined → null so the canonical input is stable.
    const a = synthesizeCondition(
      { version: "0.1.0", intent: { summary: "x" }, state: "PlanLocked" } as unknown as Parameters<typeof synthesizeCondition>[0],
      "rubrix.json",
    );
    const b = synthesizeCondition(
      {
        version: "0.1.0",
        intent: { summary: "x" },
        state: "PlanLocked",
        rubric: undefined,
        matrix: undefined,
        plan: undefined,
      } as unknown as Parameters<typeof synthesizeCondition>[0],
      "rubrix.json",
    );
    expect(a.derived_from_contract_hash).toBe(b.derived_from_contract_hash);
    expect(a.derived_from_contract_hash).toMatch(/^[a-f0-9]{64}$/);
  });
});
