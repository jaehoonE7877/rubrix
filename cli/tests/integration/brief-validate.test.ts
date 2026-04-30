import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { runValidate } from "../../src/commands/validate.ts";

function writeFixture(state: string, brief?: { calibrated?: boolean }): string {
  const dir = mkdtempSync(join(tmpdir(), "rubrix-validate-"));
  const path = join(dir, "rubrix.json");
  const c: Record<string, unknown> = {
    version: "0.1.0",
    intent: { summary: "x", ...(brief !== undefined ? { brief } : {}) },
    state,
    locks: pastIntentLocks(state),
  };
  if (state !== "IntentDrafted") {
    c.rubric = { threshold: 0.5, criteria: [{ id: "c", description: "d", weight: 1 }] };
  }
  if (["MatrixDrafted", "MatrixLocked", "PlanDrafted", "PlanLocked", "Scoring", "Passed", "Failed"].includes(state)) {
    c.matrix = { rows: [{ id: "r", criterion: "c", evidence_required: "e" }] };
  }
  if (["PlanDrafted", "PlanLocked", "Scoring", "Passed", "Failed"].includes(state)) {
    c.plan = { steps: [{ id: "s", action: "a" }] };
  }
  if (["Passed", "Failed"].includes(state)) {
    c.scores = [{ criterion: "c", score: 0.9 }];
  }
  writeFileSync(path, JSON.stringify(c, null, 2));
  return path;
}

function pastIntentLocks(state: string) {
  if (["IntentDrafted", "RubricDrafted"].includes(state)) return { rubric: false, matrix: false, plan: false };
  if (state === "RubricLocked" || state === "MatrixDrafted") return { rubric: true, matrix: false, plan: false };
  if (state === "MatrixLocked" || state === "PlanDrafted") return { rubric: true, matrix: true, plan: false };
  return { rubric: true, matrix: true, plan: true };
}

describe("validate brief warning", () => {
  it("warns at RubricDrafted when brief is missing", () => {
    const path = writeFixture("RubricDrafted");
    const out = runValidate({ path, env: {} });
    expect(out.ok).toBe(true);
    expect(out.warnings.length).toBe(1);
    expect(out.warnings[0]).toMatch(/intent\.brief is missing/);
  });

  it("warns at PlanLocked when brief.calibrated is false", () => {
    const path = writeFixture("PlanLocked", { calibrated: false });
    const out = runValidate({ path, env: {} });
    expect(out.ok).toBe(true);
    expect(out.warnings.length).toBe(1);
  });

  it("does not warn at IntentDrafted (brief is being prepared)", () => {
    const path = writeFixture("IntentDrafted");
    const out = runValidate({ path, env: {} });
    expect(out.ok).toBe(true);
    expect(out.warnings).toEqual([]);
  });

  it("annotates when RUBRIX_SKIP_BRIEF=1 is set", () => {
    const path = writeFixture("RubricDrafted");
    const out = runValidate({ path, env: { RUBRIX_SKIP_BRIEF: "1" } });
    expect(out.ok).toBe(true);
    expect(out.warnings[0]).toMatch(/RUBRIX_SKIP_BRIEF=1/);
  });

  it("emits no warning when brief.calibrated=true", () => {
    const dir = mkdtempSync(join(tmpdir(), "rubrix-validate-"));
    const path = join(dir, "rubrix.json");
    writeFileSync(
      path,
      JSON.stringify({
        version: "0.1.0",
        intent: {
          summary: "x",
          brief: { calibrated: true, ambition: "production" },
        },
        rubric: { threshold: 0.5, criteria: [{ id: "c", description: "d", weight: 1 }] },
        state: "RubricDrafted",
        locks: { rubric: false, matrix: false, plan: false },
      }),
    );
    const out = runValidate({ path, env: {} });
    expect(out.ok).toBe(true);
    expect(out.warnings).toEqual([]);
  });
});
