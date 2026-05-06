import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { validateContract, type RubrixContract } from "../src/core/contract.ts";
import { isV12Plus, isV13Plus } from "../src/core/version.ts";
import { baseV12Drafted, clarity } from "./helpers.ts";

const here = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(here, "../..");

function loadFixture(relPath: string): RubrixContract {
  const txt = readFileSync(resolve(REPO_ROOT, relPath), "utf8");
  return JSON.parse(txt) as RubrixContract;
}

function v13Passed(): RubrixContract {
  const c = baseV12Drafted();
  c.version = "1.3.0";
  c.state = "Passed";
  c.locks = { rubric: true, matrix: true, plan: true };
  c.rubric!.clarity = clarity(0.9, 0.75);
  c.matrix = { rows: [{ id: "r1", criterion: "c1", evidence_required: "x" }], clarity: clarity(0.9, 0.8) };
  c.plan = { steps: [{ id: "s1", action: "do" }], clarity: clarity(0.9, 0.7) };
  c.scores = [
    {
      criterion: "c1",
      score: 0.9,
      evaluators: [{ evaluator_id: "semantic-judge", stage: 2 }],
      stage_history: [
        {
          stage: 2,
          score: 0.9,
          self_reported_confidence: 0.85,
          model: "claude-sonnet-4-6",
          model_version: "claude-sonnet-4-6-20260301",
          prompt_version: "semantic-judge/1.0",
        },
      ],
    },
  ] as RubrixContract["scores"];
  (c as RubrixContract & { evaluation_policy: Record<string, unknown> }).evaluation_policy = {
    source: "brief",
    locked_at: "2026-05-06T00:00:00.000Z",
    approved_by: "rubrix",
    derived_from_brief_hash: "a".repeat(64),
    stage1_required: true,
    stage3_threshold: 0.7,
    stage3_axes: ["security"],
    max_stage3_criteria: 5,
    max_frontier_votes: 3,
    estimated_cost_ceiling: 5.0,
    frontier_models: ["claude-opus-4-7", "claude-sonnet-4-6", "claude-sonnet-4-6"],
  };
  return c;
}

function v10MinimalDrafted(): RubrixContract {
  return {
    version: "1.0.0",
    intent: { summary: "v1.0 minimal" },
    rubric: { threshold: 0.5, criteria: [{ id: "c1", description: "d", weight: 1 }] },
    state: "RubricDrafted",
    locks: { rubric: false, matrix: false, plan: false },
  };
}

function v11MinimalDrafted(): RubrixContract {
  return {
    version: "1.1.0",
    intent: {
      summary: "v1.1 minimal",
      brief: {
        calibrated: true,
        project_type: "brownfield_feature",
        situation: "internal_tool",
        ambition: "production",
        axis_depth: { security: "standard", data: "standard", correctness: "standard", ux: "standard", perf: "standard" },
      },
    },
    rubric: { threshold: 0.5, criteria: [{ id: "c1", description: "d", weight: 1, axis: "correctness" }] },
    state: "RubricDrafted",
    locks: { rubric: false, matrix: false, plan: false },
  };
}

describe("version-aware fail-open / fail-closed (v1.3 PR #1)", () => {
  it("v0.1 example self-eval/rubrix.json (version=0.1.0) validates clean (no v1.3 fields required)", () => {
    expect(validateContract(loadFixture("examples/self-eval/rubrix.json")).ok).toBe(true);
  });

  it("v0.1 example ios-refactor/rubrix.json (version=0.1.0) validates clean (no v1.3 fields required)", () => {
    expect(validateContract(loadFixture("examples/ios-refactor/rubrix.json")).ok).toBe(true);
  });

  it("v1.0.0 minimal contract validates without evaluation_policy / evaluators[] / stage_history (fail-open)", () => {
    expect(validateContract(v10MinimalDrafted()).ok).toBe(true);
  });

  it("v1.1.0 minimal contract validates without evaluation_policy / evaluators[] / stage_history (fail-open)", () => {
    expect(validateContract(v11MinimalDrafted()).ok).toBe(true);
  });

  it("v1.2 root rubrix.json (current dogfood) validates clean (no v1.3 fields required)", () => {
    expect(validateContract(loadFixture("rubrix.json")).ok).toBe(true);
  });

  it("v1.2.0 PR #1-shaped contract (calibrated brief + clarity-locked rubric/matrix/plan + scores) validates without v1.3 fields", () => {
    const c = baseV12Drafted();
    c.state = "Passed";
    c.locks = { rubric: true, matrix: true, plan: true };
    c.rubric!.clarity = clarity(0.95, 0.85);
    c.matrix = {
      rows: [{ id: "r1", criterion: "c1", evidence_required: "vitest" }],
      clarity: clarity(0.95, 0.9),
    };
    c.plan = {
      steps: [{ id: "s1", action: "implement", covers: ["r1"] }],
      clarity: clarity(0.9, 0.8),
    };
    c.scores = [{ criterion: "c1", score: 1.0, evaluator: "manual-review" }];
    expect(validateContract(c).ok).toBe(true);
  });

  it("v1.3.0 contract WITH evaluation_policy validates", () => {
    expect(validateContract(v13Passed()).ok).toBe(true);
  });

  it("v1.3.0 contract WITHOUT evaluation_policy fails (fail-closed for v1.3.x)", () => {
    const c = v13Passed();
    delete (c as Record<string, unknown>).evaluation_policy;
    expect(validateContract(c).ok).toBe(false);
  });

  it("v1.4.0 contract WITHOUT evaluation_policy fails (fail-closed extends to all v1.3+ minors)", () => {
    const c = v13Passed();
    c.version = "1.4.0";
    delete (c as Record<string, unknown>).evaluation_policy;
    expect(validateContract(c).ok).toBe(false);
  });

  it("v1.5.0 contract WITHOUT evaluation_policy fails", () => {
    const c = v13Passed();
    c.version = "1.5.0";
    delete (c as Record<string, unknown>).evaluation_policy;
    expect(validateContract(c).ok).toBe(false);
  });

  it("v2.0.0 contract WITHOUT evaluation_policy fails (major bump still requires policy)", () => {
    const c = v13Passed();
    c.version = "2.0.0";
    delete (c as Record<string, unknown>).evaluation_policy;
    expect(validateContract(c).ok).toBe(false);
  });

  it("v1.10.0 contract WITHOUT evaluation_policy fails (10 != [012] — regex excludes only v1.0/v1.1/v1.2)", () => {
    const c = v13Passed();
    c.version = "1.10.0";
    delete (c as Record<string, unknown>).evaluation_policy;
    expect(validateContract(c).ok).toBe(false);
  });

  it("v1.20.0 contract WITHOUT evaluation_policy fails (20 != [012])", () => {
    const c = v13Passed();
    c.version = "1.20.0";
    delete (c as Record<string, unknown>).evaluation_policy;
    expect(validateContract(c).ok).toBe(false);
  });

  it("v1.4.0 contract WITH evaluation_policy validates", () => {
    const c = v13Passed();
    c.version = "1.4.0";
    expect(validateContract(c).ok).toBe(true);
  });

  it("v0.1.0 contract WITHOUT evaluation_policy still validates (v0.x fail-open)", () => {
    const c = v13Passed();
    c.version = "0.1.0";
    delete (c as Record<string, unknown>).evaluation_policy;
    expect(validateContract(c).ok).toBe(true);
  });

  it("v1.2 contract WITHOUT evaluation_policy still validates (fail-open for version<1.3)", () => {
    const c = baseV12Drafted();
    c.state = "Passed";
    c.locks = { rubric: true, matrix: true, plan: true };
    c.rubric!.clarity = clarity(0.9, 0.75);
    c.matrix = { rows: [{ id: "r1", criterion: "c1", evidence_required: "x" }], clarity: clarity(0.9, 0.8) };
    c.plan = { steps: [{ id: "s1", action: "do" }], clarity: clarity(0.9, 0.7) };
    c.scores = [{ criterion: "c1", score: 0.9 }];
    expect(validateContract(c).ok).toBe(true);
  });
});

describe("isV13Plus helper", () => {
  it("returns true for 1.3.0", () => {
    expect(isV13Plus({ version: "1.3.0" })).toBe(true);
  });

  it("returns true for 1.5.0", () => {
    expect(isV13Plus({ version: "1.5.0" })).toBe(true);
  });

  it("returns true for 2.0.0", () => {
    expect(isV13Plus({ version: "2.0.0" })).toBe(true);
  });

  it("returns false for 1.2.0", () => {
    expect(isV13Plus({ version: "1.2.0" })).toBe(false);
  });

  it("returns false for 1.2.99", () => {
    expect(isV13Plus({ version: "1.2.99" })).toBe(false);
  });

  it("returns false for 1.1.0", () => {
    expect(isV13Plus({ version: "1.1.0" })).toBe(false);
  });

  it("returns false for 0.1.0", () => {
    expect(isV13Plus({ version: "0.1.0" })).toBe(false);
  });

  it("returns false for invalid version string (no throw at boundary)", () => {
    expect(isV13Plus({ version: "not-a-semver" })).toBe(false);
  });

  it("isV12Plus contract is preserved (no regression)", () => {
    expect(isV12Plus({ version: "1.2.0" })).toBe(true);
    expect(isV12Plus({ version: "1.3.0" })).toBe(true);
    expect(isV12Plus({ version: "1.1.0" })).toBe(false);
    expect(isV12Plus({ version: "0.1.0" })).toBe(false);
  });
});
