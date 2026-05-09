import { afterEach, describe, expect, it } from "vitest";
import { handlePreToolUse } from "../../src/hooks/handlers.ts";

describe("cost-ceiling hook auto-deny (RUB-29 PR #3)", () => {
  afterEach(() => {
    delete process.env.RUBRIX_BUDGET_OVERRUN;
  });

  it("consensus-panel Task call WITH RUBRIX_BUDGET_OVERRUN=1 → deny + cost-ceiling reason", () => {
    process.env.RUBRIX_BUDGET_OVERRUN = "1";
    const r = handlePreToolUse({
      tool_name: "Task",
      tool_input: { subagent_type: "consensus-panel", _cascade_origin: "rubrix-cascade-orchestrator" },
    });
    expect(r.decision).toBe("block");
    expect(r.reason).toMatch(/estimated_cost_ceiling/);
    expect(r.reason).toMatch(/--force|--approve-expensive/);
  });

  it("consensus-panel Task call WITHOUT marker → no cost-ceiling deny (cascade-internal allowed)", () => {
    delete process.env.RUBRIX_BUDGET_OVERRUN;
    const r = handlePreToolUse({
      tool_name: "Task",
      tool_input: { subagent_type: "consensus-panel", _cascade_origin: "rubrix-cascade-orchestrator" },
    });
    expect(r.reason ?? "").not.toMatch(/estimated_cost_ceiling/);
  });

  it("Stage 1 mechanical-checker bypasses cost-ceiling deny even with marker set", () => {
    process.env.RUBRIX_BUDGET_OVERRUN = "1";
    const r = handlePreToolUse({
      tool_name: "Task",
      tool_input: { subagent_type: "mechanical-checker", _cascade_origin: "rubrix-cascade-orchestrator" },
    });
    expect(r.reason ?? "").not.toMatch(/estimated_cost_ceiling/);
  });

  it("Stage 2 semantic-judge under cascade origin bypasses cost-ceiling deny", () => {
    process.env.RUBRIX_BUDGET_OVERRUN = "1";
    const r = handlePreToolUse({
      tool_name: "Task",
      tool_input: { subagent_type: "semantic-judge", _cascade_origin: "rubrix-cascade-orchestrator" },
    });
    expect(r.reason ?? "").not.toMatch(/estimated_cost_ceiling/);
  });
});
