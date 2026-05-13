import { describe, expect, it } from "vitest";
import { buildReport } from "../src/commands/report.ts";
import { tempContractFile, baseDrafted } from "./helpers.ts";
import type { RubrixContract } from "../src/core/contract.ts";

function lockedScoring(state: RubrixContract["state"] = "Scoring"): RubrixContract {
  const c = baseDrafted();
  c.state = state;
  c.matrix = { rows: [{ id: "r", criterion: "c1", evidence_required: "e" }] };
  c.plan = { steps: [{ id: "s", action: "a", covers: ["r"] }] };
  c.locks = { rubric: true, matrix: true, plan: true };
  c.scores = [{ criterion: "c1", score: 0.9 }];
  return c;
}

describe("buildReport /goal status section", () => {
  it("omits the section when contract.goal is absent", () => {
    const path = tempContractFile(lockedScoring());
    const md = buildReport(path);
    expect(md).not.toContain("## /goal status");
  });

  it("includes the section when contract.goal.condition is set, with overall_pass + state", () => {
    const c = lockedScoring("Scoring");
    c.goal = {
      condition: "Run `rubrix gate rubrix.json --json` and check overall_pass: true and state: \"Passed\".",
      max_chars: 4000,
    };
    const path = tempContractFile(c);
    const md = buildReport(path);
    expect(md).toContain("## /goal status");
    expect(md).toContain("- contract state: Scoring");
    expect(md).toContain("- overall_pass: true");
    expect(md).toMatch(/- gate total: \d\.\d{3} \(threshold \d/);
    expect(md).toContain("condition: Run `rubrix gate");
  });

  it("Failed state surfaces overall_pass: false so the /goal evaluator sees the failure verdict", () => {
    const c = lockedScoring("Failed");
    c.scores = [{ criterion: "c1", score: 0.0 }]; // forces gate fail
    c.goal = {
      condition: "rubrix gate --json overall_pass true Passed",
      max_chars: 4000,
    };
    const path = tempContractFile(c);
    const md = buildReport(path);
    expect(md).toContain("## /goal status");
    expect(md).toContain("- contract state: Failed");
    expect(md).toContain("- overall_pass: false");
  });

  it("truncates a very long condition with a trailing ellipsis", () => {
    const c = lockedScoring("Scoring");
    const longCondition = "rubrix gate ".repeat(50) + "x".repeat(2000); // well past 200 chars
    c.goal = { condition: longCondition, max_chars: 4000 };
    const path = tempContractFile(c);
    const md = buildReport(path);
    expect(md).toContain("## /goal status");
    // Only the truncated leading slice (200 chars) plus the ellipsis should appear.
    expect(md).toContain("…");
    expect(md).not.toContain(longCondition);
  });

  it("when state is pre-Scoring, surfaces a 'not yet scored' note (gate has not run)", () => {
    const c = baseDrafted();
    c.state = "PlanLocked";
    c.matrix = { rows: [{ id: "r", criterion: "c1", evidence_required: "e" }] };
    c.plan = { steps: [{ id: "s", action: "a", covers: ["r"] }] };
    c.locks = { rubric: true, matrix: true, plan: true };
    c.goal = { condition: "rubrix gate Passed overall_pass", max_chars: 4000 };
    const path = tempContractFile(c);
    const md = buildReport(path);
    expect(md).toContain("## /goal status");
    expect(md).toContain("- contract state: PlanLocked");
    expect(md).toContain("- overall_pass: (not yet scored");
  });
});
