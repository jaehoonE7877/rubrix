import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Clarity, RubrixContract } from "../src/core/contract.ts";

export function tempContractFile(c: RubrixContract): string {
  const dir = mkdtempSync(join(tmpdir(), "rubrix-test-"));
  const path = join(dir, "rubrix.json");
  writeFileSync(path, JSON.stringify(c, null, 2), "utf8");
  return path;
}

export function baseDrafted(): RubrixContract {
  return {
    version: "0.1.0",
    intent: { summary: "test" },
    rubric: { threshold: 0.5, criteria: [{ id: "c1", description: "d", weight: 1 }] },
    state: "RubricDrafted",
    locks: { rubric: false, matrix: false, plan: false },
  };
}

export function baseV12Drafted(): RubrixContract {
  return {
    version: "1.2.0",
    intent: {
      summary: "test v1.2",
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

export function clarity(score: number, threshold: number, extra: Partial<Clarity> = {}): Clarity {
  return {
    score,
    threshold,
    deductions: [],
    scored_at: "2026-05-01T00:00:00.000Z",
    scorer_version: "clarity-scorer/1.0",
    artifact_hash: "0".repeat(64),
    forced: false,
    ...extra,
  };
}
