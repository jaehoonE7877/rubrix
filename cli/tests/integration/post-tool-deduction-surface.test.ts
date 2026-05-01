import { describe, expect, it } from "vitest";
import { dirname } from "node:path";
import { handlePostToolUse } from "../../src/hooks/handlers.ts";
import { baseDrafted, baseV12Drafted, clarity, tempContractFile } from "../helpers.ts";

describe("PostToolUse v1.2 deduction surface (PR #3)", () => {
  it("surfaces a <rubrix-suggestion> block listing parsed deduction codes when a rubrix lock failed in stderr", () => {
    const c = baseV12Drafted();
    c.rubric!.clarity = clarity(0.95, 0.85);
    c.state = "RubricLocked";
    c.locks = { rubric: true, matrix: false, plan: false };
    const path = tempContractFile(c);
    const decision = handlePostToolUse({
      cwd: dirname(path),
      contract_path: path,
      tool_name: "Bash",
      tool_input: { command: "node cli/bin/rubrix.js lock matrix ./rubrix.json" },
      tool_response: {
        stderr:
          "cannot lock matrix: clarity 0.5 below threshold 0.85\n" +
          "  - [vague_description] matrix row `r-x` evidence_required uses vague language (weight 0.05)\n" +
          "  - [missing_evidence] matrix row `r-y` has no `verify` field (weight 0.10)\n",
      },
    });
    expect(decision.additionalContext).toBeDefined();
    expect(decision.additionalContext).toContain("<rubrix-suggestion>");
    expect(decision.additionalContext).toContain("[vague_description]");
    expect(decision.additionalContext).toContain("[missing_evidence]");
    expect(decision.additionalContext).toContain("--force");
  });

  it("surfaces a forced-lock reminder when any artifact has clarity.forced=true", () => {
    const c = baseV12Drafted();
    c.rubric!.clarity = clarity(0.40, 0.85, {
      forced: true,
      forced_at: "2026-05-01T00:00:00.000Z",
      force_reason: "vendor freeze",
    });
    c.state = "RubricLocked";
    c.locks = { rubric: true, matrix: false, plan: false };
    const path = tempContractFile(c);
    const decision = handlePostToolUse({
      cwd: dirname(path),
      contract_path: path,
      tool_name: "Read",
    });
    expect(decision.additionalContext).toContain("forced lock");
    expect(decision.additionalContext).toContain("rubrix.js\" report");
  });

  it("emits nothing on a clean v1.2 contract after a non-lock tool call", () => {
    const c = baseV12Drafted();
    c.rubric!.clarity = clarity(0.95, 0.85);
    c.state = "RubricLocked";
    c.locks = { rubric: true, matrix: false, plan: false };
    const path = tempContractFile(c);
    const decision = handlePostToolUse({
      cwd: dirname(path),
      contract_path: path,
      tool_name: "Edit",
      tool_input: { file_path: "/tmp/source.ts" },
    });
    expect(decision.additionalContext).toBeUndefined();
    expect(decision.systemMessage).toBeUndefined();
  });

  it("emits nothing for a v1.0 contract regardless of stderr content", () => {
    const c = baseDrafted();
    c.matrix = { rows: [{ id: "r", criterion: "c1", evidence_required: "e" }] };
    c.plan = { steps: [{ id: "s", action: "a", covers: ["r"] }] };
    c.state = "PlanLocked";
    c.locks = { rubric: true, matrix: true, plan: true };
    const path = tempContractFile(c);
    const decision = handlePostToolUse({
      cwd: dirname(path),
      contract_path: path,
      tool_name: "Bash",
      tool_input: { command: "node cli/bin/rubrix.js lock plan ./rubrix.json" },
      tool_response: { stderr: "irrelevant\n  - [vague_description] x" },
    });
    expect(decision.additionalContext).toBeUndefined();
  });
});
