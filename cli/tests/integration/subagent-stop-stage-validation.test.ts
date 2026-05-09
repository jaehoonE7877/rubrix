import { describe, expect, it } from "vitest";
import { handleSubagentStop } from "../../src/hooks/handlers.ts";

describe("SubagentStop stage-aware validation (RUB-29 PR #3)", () => {
  it("(a) semantic-judge missing self_reported_confidence → block + reason", () => {
    const r = handleSubagentStop({
      subagent_type: "semantic-judge",
      tool_response: { score: 0.5, rationale: "ok" },
    });
    expect(r.decision).toBe("block");
    expect(r.reason).toMatch(/Stage 2 output schema violation/);
    expect(r.reason).toMatch(/self_reported_confidence/);
  });

  it("(b) semantic-judge with valid self_reported_confidence in [0,1] → no block", () => {
    const r = handleSubagentStop({
      subagent_type: "semantic-judge",
      tool_response: { score: 0.7, self_reported_confidence: 0.65, rationale: "ok" },
    });
    expect(r.decision).not.toBe("block");
  });

  it("(c) consensus-panel with extra key beyond {score,rationale_hash,dissent_flag} → block", () => {
    const r = handleSubagentStop({
      subagent_type: "consensus-panel",
      tool_response: {
        score: 0.8,
        rationale_hash: "abc",
        dissent_flag: false,
        leaked_field: "should not be here",
      },
    });
    expect(r.decision).toBe("block");
    expect(r.reason).toMatch(/unexpected key/);
    expect(r.reason).toMatch(/leaked_field/);
  });

  it("(d) consensus-panel with exactly the 3 required keys → no block", () => {
    const r = handleSubagentStop({
      subagent_type: "consensus-panel",
      tool_response: { score: 0.9, rationale_hash: "deadbeef", dissent_flag: true },
    });
    expect(r.decision).not.toBe("block");
  });

  it("(e) consensus-panel missing required key → block with missing-key reason", () => {
    const r = handleSubagentStop({
      subagent_type: "consensus-panel",
      tool_response: { score: 0.9, rationale_hash: "abc" },
    });
    expect(r.decision).toBe("block");
    expect(r.reason).toMatch(/missing/);
    expect(r.reason).toMatch(/dissent_flag/);
  });

  it("unknown subagent_type → no decision (no false-positive block)", () => {
    const r = handleSubagentStop({
      subagent_type: "brief-interviewer",
      tool_response: { calibrated: true, project_type: "infra" },
    });
    expect(r.decision).not.toBe("block");
  });

  it("(P1-A) Claude Code SubagentStop payload routes via agent_type → semantic-judge validation triggers", () => {
    const r = handleSubagentStop({
      agent_type: "semantic-judge",
      tool_response: { score: 0.5, rationale: "ok" },
    } as Parameters<typeof handleSubagentStop>[0]);
    expect(r.decision).toBe("block");
    expect(r.reason).toMatch(/Stage 2 output schema violation/);
    expect(r.reason).toMatch(/self_reported_confidence/);
  });

  it("(P1-A) agent_type-routed consensus-panel still enforces strict 3-key contract", () => {
    const r = handleSubagentStop({
      agent_type: "consensus-panel",
      tool_response: {
        score: 0.8,
        rationale_hash: "abc",
        dissent_flag: false,
        leaked_field: "x",
      },
    } as Parameters<typeof handleSubagentStop>[0]);
    expect(r.decision).toBe("block");
    expect(r.reason).toMatch(/unexpected key/);
    expect(r.reason).toMatch(/leaked_field/);
  });
});
