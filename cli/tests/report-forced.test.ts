import { describe, expect, it } from "vitest";
import { buildReport } from "../src/commands/report.ts";
import { baseDrafted, baseV12Drafted, clarity, tempContractFile } from "./helpers.ts";

describe("rubrix report Forced Locks section (v1.2/PR #3)", () => {
  it("v1.2 contract with no forced locks renders 'No forced locks.'", () => {
    const c = baseV12Drafted();
    c.rubric!.clarity = clarity(0.95, 0.85);
    c.state = "RubricLocked";
    c.locks = { rubric: true, matrix: false, plan: false };
    const md = buildReport(tempContractFile(c));
    expect(md).toContain("## Forced Locks");
    expect(md).toContain("No forced locks.");
  });

  it("v1.2 contract with one forced lock renders a table row with score / threshold / forced_at / reason", () => {
    const c = baseV12Drafted();
    c.rubric!.clarity = clarity(0.40, 0.85, {
      forced: true,
      forced_at: "2026-05-01T12:34:56.000Z",
      force_reason: "vendor freeze",
    });
    c.state = "RubricLocked";
    c.locks = { rubric: true, matrix: false, plan: false };
    const md = buildReport(tempContractFile(c));
    expect(md).toContain("## Forced Locks");
    expect(md).toContain("| rubric | 0.4 | 0.85 | 2026-05-01T12:34:56.000Z | vendor freeze |");
  });

  it("(codex review P3 follow-up) escapes pipe and newline characters in force_reason so the markdown table stays well-formed", () => {
    const c = baseV12Drafted();
    c.rubric!.clarity = clarity(0.40, 0.85, {
      forced: true,
      forced_at: "2026-05-01T00:00:00.000Z",
      force_reason: "vendor freeze | line1\nline2",
    });
    c.state = "RubricLocked";
    c.locks = { rubric: true, matrix: false, plan: false };
    const md = buildReport(tempContractFile(c));
    const tableLines = md.split("\n").filter((l) => l.startsWith("| rubric"));
    expect(tableLines).toHaveLength(1);
    expect(tableLines[0]).toContain("\\|");
    expect(tableLines[0]).not.toMatch(/\nline2/);
  });

  it("v1.0 contract (version 0.1.0) omits the Forced Locks section entirely (no regression)", () => {
    const c = baseDrafted();
    c.matrix = { rows: [{ id: "r", criterion: "c1", evidence_required: "e" }] };
    c.plan = { steps: [{ id: "s", action: "a", covers: ["r"] }] };
    c.state = "PlanLocked";
    c.locks = { rubric: true, matrix: true, plan: true };
    const md = buildReport(tempContractFile(c));
    expect(md).not.toContain("Forced Locks");
  });
});
