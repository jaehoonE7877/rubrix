import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { briefGetCommand, briefInitCommand } from "../src/commands/brief.ts";
import { loadContract, validateContract } from "../src/core/contract.ts";
import { isCalibrated, resolveAxisDepth } from "../src/core/brief.ts";

function tmpPath(name = "rubrix.json"): string {
  const dir = mkdtempSync(join(tmpdir(), "rubrix-brief-"));
  return join(dir, name);
}

describe("brief schema", () => {
  it("accepts a calibrated brief with all fields", () => {
    const r = validateContract({
      version: "0.1.0",
      intent: {
        summary: "ship v1.1",
        brief: {
          calibrated: true,
          project_type: "brownfield_feature",
          situation: "internal_tool",
          ambition: "production",
          risk_modifiers: ["sensitive_data"],
          axis_depth: { security: "deep", correctness: "deep", ux: "standard", data: "standard", perf: "light" },
        },
      },
      state: "IntentDrafted",
      locks: { rubric: false, matrix: false, plan: false },
    });
    expect(r.ok).toBe(true);
  });

  it("rejects an unknown axis_depth value", () => {
    const r = validateContract({
      version: "0.1.0",
      intent: {
        summary: "x",
        brief: { calibrated: true, axis_depth: { security: "extreme" } },
      },
      state: "IntentDrafted",
      locks: { rubric: false, matrix: false, plan: false },
    });
    expect(r.ok).toBe(false);
  });

  it("rejects an unknown ambition", () => {
    const r = validateContract({
      version: "0.1.0",
      intent: { summary: "x", brief: { calibrated: true, ambition: "ultra" } },
      state: "IntentDrafted",
      locks: { rubric: false, matrix: false, plan: false },
    });
    expect(r.ok).toBe(false);
  });

  it("requires brief.calibrated", () => {
    const r = validateContract({
      version: "0.1.0",
      intent: { summary: "x", brief: { project_type: "doc" } },
      state: "IntentDrafted",
      locks: { rubric: false, matrix: false, plan: false },
    });
    expect(r.ok).toBe(false);
  });

  it("accepts a v1.0 contract without brief (backward compat)", () => {
    const r = validateContract({
      version: "0.1.0",
      intent: { summary: "x" },
      state: "RubricDrafted",
      locks: { rubric: false, matrix: false, plan: false },
      rubric: { threshold: 0.5, criteria: [{ id: "c", description: "d", weight: 1 }] },
    });
    expect(r.ok).toBe(true);
  });

  it("accepts criteria.axis enum value", () => {
    const r = validateContract({
      version: "0.1.0",
      intent: { summary: "x" },
      rubric: {
        threshold: 0.5,
        criteria: [{ id: "c", description: "d", weight: 1, axis: "security" }],
      },
      state: "RubricDrafted",
      locks: { rubric: false, matrix: false, plan: false },
    });
    expect(r.ok).toBe(true);
  });

  it("rejects criteria.axis with unknown value", () => {
    const r = validateContract({
      version: "0.1.0",
      intent: { summary: "x" },
      rubric: {
        threshold: 0.5,
        criteria: [{ id: "c", description: "d", weight: 1, axis: "moonshine" }],
      },
      state: "RubricDrafted",
      locks: { rubric: false, matrix: false, plan: false },
    });
    expect(r.ok).toBe(false);
  });
});

describe("brief init command", () => {
  it("creates a fresh IntentDrafted contract with calibrated brief", () => {
    const path = tmpPath();
    const code = briefInitCommand({
      path,
      summary: "ship v1.1",
      projectType: "brownfield_feature",
      situation: "internal_tool",
      ambition: "production",
      axis: ["security=deep", "correctness=deep"],
      risk: ["sensitive_data"],
    });
    expect(code).toBe(0);
    const c = loadContract(path);
    expect(c.state).toBe("IntentDrafted");
    expect(isCalibrated(c)).toBe(true);
    expect(c.intent.brief?.axis_depth?.security).toBe("deep");
    expect(c.intent.brief?.axis_depth?.correctness).toBe("deep");
    expect(c.intent.brief?.risk_modifiers).toEqual(["sensitive_data"]);
  });

  it("rejects unknown axis depth", () => {
    const path = tmpPath();
    const code = briefInitCommand({
      path,
      summary: "x",
      axis: ["security=extreme"],
    });
    expect(code).toBe(1);
  });

  it("rejects unknown axis name", () => {
    const path = tmpPath();
    const code = briefInitCommand({
      path,
      summary: "x",
      axis: ["foo=deep"],
    });
    expect(code).toBe(1);
  });

  it("requires --summary when creating new file", () => {
    const path = tmpPath();
    const code = briefInitCommand({ path });
    expect(code).toBe(2);
  });

  it("upgrades an existing IntentDrafted contract idempotently", () => {
    const path = tmpPath();
    writeFileSync(
      path,
      JSON.stringify({
        version: "0.1.0",
        intent: { summary: "old summary" },
        state: "IntentDrafted",
        locks: { rubric: false, matrix: false, plan: false },
      }),
    );
    const code = briefInitCommand({
      path,
      summary: "new summary",
      ambition: "demo",
    });
    expect(code).toBe(0);
    const c = loadContract(path);
    expect(c.intent.summary).toBe("new summary");
    expect(c.intent.brief?.ambition).toBe("demo");
  });

  it("refuses to overwrite when state is past IntentDrafted", () => {
    const path = tmpPath();
    writeFileSync(
      path,
      JSON.stringify({
        version: "0.1.0",
        intent: { summary: "x" },
        rubric: { threshold: 0.5, criteria: [{ id: "c", description: "d", weight: 1 }] },
        state: "RubricDrafted",
        locks: { rubric: false, matrix: false, plan: false },
      }),
    );
    const code = briefInitCommand({ path, ambition: "production" });
    expect(code).toBe(3);
  });
});

describe("brief get command", () => {
  it("returns 0 with no brief on v1.0 contract", () => {
    const path = tmpPath();
    writeFileSync(
      path,
      JSON.stringify({
        version: "0.1.0",
        intent: { summary: "x" },
        state: "IntentDrafted",
        locks: { rubric: false, matrix: false, plan: false },
      }),
    );
    expect(briefGetCommand({ path })).toBe(0);
  });

  it("emits effective axis depth via --axis", () => {
    const path = tmpPath();
    briefInitCommand({ path, summary: "x", ambition: "production", axis: ["security=deep"] });
    expect(briefGetCommand({ path, axis: "security" })).toBe(0);
  });

  it("rejects unknown --axis name", () => {
    const path = tmpPath();
    briefInitCommand({ path, summary: "x" });
    expect(briefGetCommand({ path, axis: "moonshine" })).toBe(2);
  });
});

describe("resolveAxisDepth", () => {
  it("returns all standard for v1.0 contract", () => {
    const r = resolveAxisDepth({
      version: "0.1.0",
      intent: { summary: "x" },
      state: "RubricDrafted",
      locks: { rubric: false, matrix: false, plan: false },
    });
    expect(r).toEqual({ security: "standard", data: "standard", correctness: "standard", ux: "standard", perf: "standard" });
  });

  it("collapses to all light when ambition=demo", () => {
    const r = resolveAxisDepth({
      version: "0.1.0",
      intent: {
        summary: "x",
        brief: {
          calibrated: true,
          ambition: "demo",
          axis_depth: { security: "deep" },
        },
      },
      state: "IntentDrafted",
      locks: { rubric: false, matrix: false, plan: false },
    });
    expect(r.security).toBe("light");
    expect(r.ux).toBe("light");
  });

  it("returns standard fallback when RUBRIX_SKIP_BRIEF=1 even if calibrated", () => {
    const r = resolveAxisDepth(
      {
        version: "0.1.0",
        intent: {
          summary: "x",
          brief: { calibrated: true, axis_depth: { security: "deep" } },
        },
        state: "IntentDrafted",
        locks: { rubric: false, matrix: false, plan: false },
      },
      { RUBRIX_SKIP_BRIEF: "1" },
    );
    expect(r.security).toBe("standard");
  });

  it("respects per-axis depth when calibrated", () => {
    const r = resolveAxisDepth(
      {
        version: "0.1.0",
        intent: {
          summary: "x",
          brief: {
            calibrated: true,
            ambition: "production",
            axis_depth: { security: "deep", ux: "light" },
          },
        },
        state: "IntentDrafted",
        locks: { rubric: false, matrix: false, plan: false },
      },
      {},
    );
    expect(r.security).toBe("deep");
    expect(r.ux).toBe("light");
    expect(r.correctness).toBe("standard");
  });
});

describe("brief contract roundtrip", () => {
  it("init then read produces identical brief on disk", () => {
    const path = tmpPath();
    briefInitCommand({
      path,
      summary: "x",
      situation: "regulated",
      ambition: "hardened",
      axis: ["security=deep", "data=deep", "perf=light"],
    });
    const raw = JSON.parse(readFileSync(path, "utf8"));
    expect(raw.intent.brief.calibrated).toBe(true);
    expect(raw.intent.brief.situation).toBe("regulated");
    expect(raw.intent.brief.axis_depth.data).toBe("deep");
    expect(raw.intent.brief.axis_depth.perf).toBe("light");
  });
});
