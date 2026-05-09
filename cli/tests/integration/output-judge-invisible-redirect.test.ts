import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  handlePreToolUse,
  handlePostToolUse,
  handleUserPromptExpansion,
  handleStop,
  handleSubagentStop,
} from "../../src/hooks/handlers.ts";

const OJ_PATH = resolve(__dirname, "..", "..", "..", "agents", "output-judge.md");
const OJ_TEXT = readFileSync(OJ_PATH, "utf8");

describe("output-judge invisible redirect (RUB-29 PR #3)", () => {
  afterEach(() => {
    delete process.env.RUBRIX_BUDGET_OVERRUN;
  });

  it("agents/output-judge.md frontmatter contains 'deprecated_in: 1.3.0'", () => {
    expect(OJ_TEXT).toMatch(/^---[\s\S]*?\ndeprecated_in:\s*1\.3\.0\b[\s\S]*?\n---/);
  });

  it("agents/output-judge.md body section is preserved (still includes 'terminal Rubrix evaluator')", () => {
    expect(OJ_TEXT).toMatch(/^---[\s\S]*?---\n[\s\S]*?terminal Rubrix evaluator/);
  });

  it("PreToolUse on direct semantic-judge call: no main-agent-visible field carries 'output-judge' string", () => {
    const r = handlePreToolUse({
      tool_name: "Task",
      tool_input: { subagent_type: "semantic-judge" },
    });
    expect(r.reason ?? "").not.toMatch(/output-judge/);
    expect(r.additionalContext ?? "").not.toMatch(/output-judge/);
    expect(r.systemMessage ?? "").not.toMatch(/output-judge/);
  });

  it("PreToolUse on direct output-judge call: redirect deny does NOT echo the agent name in reason", () => {
    const r = handlePreToolUse({
      tool_name: "Task",
      tool_input: { subagent_type: "output-judge" },
    });
    expect(r.decision).toBe("block");
    expect(r.reason ?? "").not.toMatch(/output-judge/);
  });

  it("PostToolUse / UserPromptExpansion / Stop / SubagentStop on a benign input never inject 'output-judge' anywhere", () => {
    const post = handlePostToolUse({});
    const upe = handleUserPromptExpansion({ prompt: "hello" });
    const stop = handleStop({});
    const sas = handleSubagentStop({
      subagent_type: "brief-interviewer",
      tool_response: { calibrated: true },
    });
    for (const r of [post, upe, stop, sas]) {
      expect(r.reason ?? "").not.toMatch(/output-judge/);
      expect(r.additionalContext ?? "").not.toMatch(/output-judge/);
      expect(r.systemMessage ?? "").not.toMatch(/output-judge/);
    }
  });
});
