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

  it("(P1-3) semantic-judge last_assistant_message JSON parses → validation passes", () => {
    const r = handleSubagentStop({
      agent_type: "semantic-judge",
      last_assistant_message: JSON.stringify({
        evaluator: "semantic-judge",
        criterion: "c1",
        verdict: "pass",
        score: 0.85,
        confidence: 0.7,
        self_reported_confidence: 0.7,
        rationale: "ev",
        evidence: ["e1"],
      }),
    } as Parameters<typeof handleSubagentStop>[0]);
    expect(r.decision).not.toBe("block");
  });

  it("(P1-3) semantic-judge last_assistant_message wrapped in ```json fences still parses", () => {
    const payload = {
      evaluator: "semantic-judge",
      criterion: "c1",
      verdict: "pass",
      score: 0.85,
      confidence: 0.7,
      self_reported_confidence: 0.7,
      rationale: "ev",
      evidence: ["e1"],
    };
    const r = handleSubagentStop({
      agent_type: "semantic-judge",
      last_assistant_message: "```json\n" + JSON.stringify(payload) + "\n```",
    } as Parameters<typeof handleSubagentStop>[0]);
    expect(r.decision).not.toBe("block");
  });

  it("(P1-3) semantic-judge last_assistant_message that is plain prose → block with JSON-required reason", () => {
    const r = handleSubagentStop({
      agent_type: "semantic-judge",
      last_assistant_message: "I think this scores well, around 0.85.",
    } as Parameters<typeof handleSubagentStop>[0]);
    expect(r.decision).toBe("block");
    expect(r.reason).toMatch(/last_assistant_message/);
    expect(r.reason).toMatch(/JSON/);
  });

  it("(P1-3) consensus-panel last_assistant_message JSON with strict 3-key set → no block", () => {
    const r = handleSubagentStop({
      agent_type: "consensus-panel",
      last_assistant_message: JSON.stringify({
        score: 0.9,
        rationale_hash: "deadbeef",
        dissent_flag: false,
      }),
    } as Parameters<typeof handleSubagentStop>[0]);
    expect(r.decision).not.toBe("block");
  });

  it("(P1-3) consensus-panel last_assistant_message JSON with extra key → block", () => {
    const r = handleSubagentStop({
      agent_type: "consensus-panel",
      last_assistant_message: JSON.stringify({
        score: 0.9,
        rationale_hash: "abc",
        dissent_flag: false,
        leaked: "x",
      }),
    } as Parameters<typeof handleSubagentStop>[0]);
    expect(r.decision).toBe("block");
    expect(r.reason).toMatch(/unexpected key/);
  });

  it("(v1.3.2 Fix 1) two ```json blocks — first valid object wins", () => {
    const valid = JSON.stringify({ score: 0.9, rationale_hash: "abc", dissent_flag: false });
    const r = handleSubagentStop({
      agent_type: "consensus-panel",
      last_assistant_message: "```json\nnot-valid-json-here\n```\n```json\n" + valid + "\n```",
    } as Parameters<typeof handleSubagentStop>[0]);
    expect(r.decision).not.toBe("block");
  });

  it("(v1.3.2 Fix 1) CRLF line endings inside fenced JSON still parse", () => {
    const json = JSON.stringify({ score: 0.9, rationale_hash: "abc", dissent_flag: false });
    const r = handleSubagentStop({
      agent_type: "consensus-panel",
      last_assistant_message: "```json\r\n" + json + "\r\n```",
    } as Parameters<typeof handleSubagentStop>[0]);
    expect(r.decision).not.toBe("block");
  });

  it("(v1.3.2 Fix 1) primitive JSON literals (number/null/string/array) → block (object required)", () => {
    for (const literal of ["42", "null", '"score:0.9"', "[1,2,3]"]) {
      const r = handleSubagentStop({
        agent_type: "consensus-panel",
        last_assistant_message: literal,
      } as Parameters<typeof handleSubagentStop>[0]);
      expect(r.decision, `expected block for literal ${literal}`).toBe("block");
    }
  });
});
