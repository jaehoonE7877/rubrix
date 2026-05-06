import { describe, expect, it } from "vitest";
import { buildReport } from "../src/commands/report.ts";
import { baseV12Drafted, clarity } from "./helpers.ts";
import { tempContractFile } from "./helpers.ts";
import type { RubrixContract } from "../src/core/contract.ts";

function v12PassedWithScore(extraScore: Partial<RubrixContract["scores"][number]> = {}): RubrixContract {
  const c = baseV12Drafted();
  c.state = "Passed";
  c.locks = { rubric: true, matrix: true, plan: true };
  c.rubric!.clarity = clarity(0.9, 0.75);
  c.matrix = { rows: [{ id: "r1", criterion: "c1", evidence_required: "x" }], clarity: clarity(0.9, 0.8) };
  c.plan = { steps: [{ id: "s1", action: "do" }], clarity: clarity(0.9, 0.7) };
  c.scores = [{ criterion: "c1", score: 0.9, ...extraScore } as RubrixContract["scores"][number]];
  return c;
}

describe("report Consensus column (v1.3 PR #1)", () => {
  it("renders 'consensus' header in the per-criterion gate table for v1.1+ contracts", () => {
    const path = tempContractFile(v12PassedWithScore());
    const md = buildReport(path);
    const gateBlock = md.split("## Gate:")[1] ?? "";
    expect(gateBlock).toContain("| consensus |");
    expect(gateBlock).toContain("| --- |");
  });

  it("renders an empty consensus cell when no stage_history exists (PR #1 contracts)", () => {
    const path = tempContractFile(v12PassedWithScore());
    const md = buildReport(path);
    const gateBlock = md.split("## Gate:")[1] ?? "";
    const dataLine = gateBlock.split("\n").find((l) => l.includes("| c1 |"));
    expect(dataLine).toBeDefined();
    expect(dataLine!.endsWith("|  |")).toBe(true);
  });

  it("renders 'stage3' in consensus cell when stage_history contains a stage 3 entry", () => {
    const path = tempContractFile(
      v12PassedWithScore({
        stage_history: [
          {
            stage: 3,
            score: 0.9,
            self_reported_confidence: 0.95,
            model: "claude-opus-4-7",
            model_version: "claude-opus-4-7-20260301",
            prompt_version: "consensus-panel/1.0",
          },
        ],
      } as Partial<RubrixContract["scores"][number]>),
    );
    const md = buildReport(path);
    const gateBlock = md.split("## Gate:")[1] ?? "";
    const dataLine = gateBlock.split("\n").find((l) => l.includes("| c1 |"));
    expect(dataLine).toBeDefined();
    expect(dataLine).toContain("stage3");
  });

  it("renders 'skipped_due_to_budget' when stage_history contains a budget-skip entry", () => {
    const path = tempContractFile(
      v12PassedWithScore({
        stage_history: [
          {
            stage: 2,
            score: 0.85,
            self_reported_confidence: 0.85,
            model: "claude-sonnet-4-6",
            model_version: "claude-sonnet-4-6-20260301",
            prompt_version: "semantic-judge/1.0",
            reason: "budget",
          },
        ],
      } as Partial<RubrixContract["scores"][number]>),
    );
    const md = buildReport(path);
    const gateBlock = md.split("## Gate:")[1] ?? "";
    const dataLine = gateBlock.split("\n").find((l) => l.includes("| c1 |"));
    expect(dataLine).toContain("skipped_due_to_budget");
  });
});
