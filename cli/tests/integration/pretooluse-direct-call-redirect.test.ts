import { describe, expect, it } from "vitest";
import { handlePreToolUse } from "../../src/hooks/handlers.ts";

describe("PreToolUse invisible cascade redirect (RUB-29 PR #3)", () => {
  it("(1) direct semantic-judge Task call from main-agent → deny redirect", () => {
    const r = handlePreToolUse({
      tool_name: "Task",
      tool_input: { subagent_type: "semantic-judge", prompt: "score X" },
    });
    expect(r.decision).toBe("block");
    expect(r.reason).toMatch(/redirect-to-cascade/);
    expect(r.reason).toMatch(/rubrix score/);
  });

  it("(2) cascade-internal semantic-judge call (with origin marker) → no decision (passthrough)", () => {
    const r = handlePreToolUse({
      tool_name: "Task",
      tool_input: {
        subagent_type: "semantic-judge",
        _cascade_origin: "rubrix-cascade-orchestrator",
        prompt: "score X",
      },
    });
    expect(r.decision).not.toBe("block");
  });

  it("(3) direct output-judge Task call (alias) → deny redirect", () => {
    const r = handlePreToolUse({
      tool_name: "Task",
      tool_input: { subagent_type: "output-judge", prompt: "score X" },
    });
    expect(r.decision).toBe("block");
    expect(r.reason).toMatch(/redirect-to-cascade/);
  });

  it("(4) non-Task tool: redirect-to-cascade reason never appears (other gates may still deny independently)", () => {
    const r = handlePreToolUse({
      tool_name: "Edit",
      tool_input: { file_path: "foo.ts", old_string: "a", new_string: "b" },
    });
    expect(r.reason ?? "").not.toMatch(/redirect-to-cascade/);
  });

  it("redirect text never carries 'output-judge' or 'semantic-judge' agent names", () => {
    const r = handlePreToolUse({
      tool_name: "Task",
      tool_input: { subagent_type: "semantic-judge" },
    });
    expect(r.reason ?? "").not.toMatch(/output-judge/);
    expect(r.reason ?? "").not.toMatch(/semantic-judge/);
    expect(r.additionalContext).toBeUndefined();
  });

  it("(P1-2) tool_name='Agent' (Claude Code primary subagent dispatch) → redirect fires", () => {
    const r = handlePreToolUse({
      tool_name: "Agent",
      tool_input: { subagent_type: "semantic-judge", prompt: "score X" },
    });
    expect(r.decision).toBe("block");
    expect(r.reason).toMatch(/redirect-to-cascade/);
  });
});
