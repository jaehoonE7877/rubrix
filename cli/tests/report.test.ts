import { describe, expect, it } from "vitest";
import { buildReport } from "../src/commands/report.ts";
import { tempContractFile, baseDrafted } from "./helpers.ts";

describe("buildReport", () => {
  it("includes intent, state and rubric table", () => {
    const path = tempContractFile(baseDrafted());
    const md = buildReport(path);
    expect(md).toContain("# Rubrix Report");
    expect(md).toContain("**Intent**: test");
    expect(md).toContain("**State**: RubricDrafted");
    expect(md).toContain("## Rubric");
    expect(md).toContain("| c1 |");
  });

  it("includes gate section in scoring/passed/failed states", () => {
    const c = baseDrafted();
    c.state = "Scoring";
    c.matrix = { rows: [{ id: "r", criterion: "c1", evidence_required: "e" }] };
    c.plan = { steps: [{ id: "s", action: "a" }] };
    c.locks = { rubric: true, matrix: true, plan: true };
    c.scores = [{ criterion: "c1", score: 0.9 }];
    const path = tempContractFile(c);
    const md = buildReport(path);
    expect(md).toContain("## Gate: PASS");
  });
});
