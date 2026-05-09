import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { handlePreToolUse } from "../../src/hooks/handlers.ts";

describe("cost-ceiling hook auto-deny (RUB-29 PR #3)", () => {
  let isolatedRoot: string;

  beforeEach(() => {
    isolatedRoot = mkdtempSync(join(tmpdir(), "rubrix-cost-ceiling-iso-"));
    process.env.RUBRIX_RUNTIME_ROOT = isolatedRoot;
  });

  afterEach(() => {
    delete process.env.RUBRIX_BUDGET_OVERRUN;
    delete process.env.RUBRIX_RUNTIME_ROOT;
    rmSync(isolatedRoot, { recursive: true, force: true });
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

  it("(P1-B) cross-process file marker (no env var set) → consensus-panel deny", () => {
    delete process.env.RUBRIX_BUDGET_OVERRUN;
    const tmp = mkdtempSync(join(tmpdir(), "rubrix-budget-marker-"));
    try {
      process.env.RUBRIX_RUNTIME_ROOT = tmp;
      mkdirSync(join(tmp, ".rubrix"), { recursive: true });
      writeFileSync(join(tmp, ".rubrix", "budget-overrun.flag"), String(Date.now()));
      const r = handlePreToolUse({
        tool_name: "Task",
        tool_input: { subagent_type: "consensus-panel", _cascade_origin: "rubrix-cascade-orchestrator" },
      });
      expect(r.decision).toBe("block");
      expect(r.reason).toMatch(/estimated_cost_ceiling/);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("(P1-B) absent file marker AND unset env → no cost-ceiling deny", () => {
    delete process.env.RUBRIX_BUDGET_OVERRUN;
    const tmp = mkdtempSync(join(tmpdir(), "rubrix-budget-marker-"));
    try {
      process.env.RUBRIX_RUNTIME_ROOT = tmp;
      const r = handlePreToolUse({
        tool_name: "Task",
        tool_input: { subagent_type: "consensus-panel", _cascade_origin: "rubrix-cascade-orchestrator" },
      });
      expect(r.reason ?? "").not.toMatch(/estimated_cost_ceiling/);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("(P1-2) tool_name='Agent' deny path also fires when marker is set", () => {
    process.env.RUBRIX_BUDGET_OVERRUN = "1";
    const r = handlePreToolUse({
      tool_name: "Agent",
      tool_input: { subagent_type: "consensus-panel", _cascade_origin: "rubrix-cascade-orchestrator" },
    });
    expect(r.decision).toBe("block");
    expect(r.reason).toMatch(/estimated_cost_ceiling/);
  });

  it("(P2) input.cwd overrides RUBRIX_RUNTIME_ROOT for marker lookup", () => {
    delete process.env.RUBRIX_BUDGET_OVERRUN;
    const sessionRoot = mkdtempSync(join(tmpdir(), "rubrix-session-root-"));
    const irrelevantRoot = mkdtempSync(join(tmpdir(), "rubrix-irrelevant-root-"));
    try {
      mkdirSync(join(sessionRoot, ".rubrix"), { recursive: true });
      writeFileSync(join(sessionRoot, ".rubrix", "budget-overrun.flag"), String(Date.now()));
      process.env.RUBRIX_RUNTIME_ROOT = irrelevantRoot;
      const r = handlePreToolUse({
        tool_name: "Agent",
        cwd: sessionRoot,
        tool_input: { subagent_type: "consensus-panel", _cascade_origin: "rubrix-cascade-orchestrator" },
      });
      expect(r.decision).toBe("block");
      expect(r.reason).toMatch(/estimated_cost_ceiling/);
    } finally {
      rmSync(sessionRoot, { recursive: true, force: true });
      rmSync(irrelevantRoot, { recursive: true, force: true });
    }
  });
});
