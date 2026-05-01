import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { gateCommand } from "../../src/commands/gate.ts";
import { handlePreToolUse, handleUserPromptExpansion } from "../../src/hooks/handlers.ts";
import { baseDrafted, baseV12Drafted, clarity, tempContractFile } from "../helpers.ts";
import { dirname } from "node:path";
import type { RubrixContract } from "../../src/core/contract.ts";

function v12PlanLockedMissingPlanClarity(): RubrixContract {
  const c = baseV12Drafted();
  c.rubric!.clarity = clarity(0.85, 0.75);
  c.matrix = { rows: [{ id: "r", criterion: "c1", evidence_required: "e" }], clarity: clarity(0.90, 0.80) };
  c.plan = { steps: [{ id: "s", action: "a", covers: ["r"] }] };
  c.state = "PlanLocked";
  c.locks = { rubric: true, matrix: true, plan: true };
  return c;
}

interface Cap {
  stdout: string;
  stderr: string;
  restore: () => void;
}

function captureStreams(): Cap {
  let stdout = "";
  let stderr = "";
  const w = vi.spyOn(process.stdout, "write").mockImplementation((chunk: string | Uint8Array) => {
    stdout += typeof chunk === "string" ? chunk : chunk.toString();
    return true;
  });
  const e = vi.spyOn(process.stderr, "write").mockImplementation((chunk: string | Uint8Array) => {
    stderr += typeof chunk === "string" ? chunk : chunk.toString();
    return true;
  });
  return {
    get stdout() { return stdout; },
    get stderr() { return stderr; },
    restore: () => { w.mockRestore(); e.mockRestore(); },
  };
}

describe("v1.2 clarity invariant is enforced across hook + gate paths (codex review P2)", () => {
  let cap: Cap;
  beforeEach(() => { cap = captureStreams(); });
  afterEach(() => { cap.restore(); });

  it("PreToolUse blocks an Edit on a v1.2 PlanLocked contract that is missing plan.clarity", () => {
    const c = v12PlanLockedMissingPlanClarity();
    const path = tempContractFile(c);
    const decision = handlePreToolUse({
      cwd: dirname(path),
      contract_path: path,
      tool_name: "Edit",
      tool_input: { file_path: "/tmp/some-source.ts" },
    });
    expect(decision.decision).toBe("block");
    expect(decision.reason).toContain("v1.2 clarity invariant");
    expect(decision.reason).toContain("/plan/clarity");
  });

  it("PreToolUse still allows editing rubrix.json itself even when invariant is breached (so users can fix it)", () => {
    const c = v12PlanLockedMissingPlanClarity();
    const path = tempContractFile(c);
    const decision = handlePreToolUse({
      cwd: dirname(path),
      contract_path: path,
      tool_name: "Edit",
      tool_input: { file_path: path },
    });
    expect(decision.decision).toBe("allow");
  });

  it("PreToolUse blocks /rubrix:score on a v1.2 contract missing clarity", () => {
    const c = v12PlanLockedMissingPlanClarity();
    const path = tempContractFile(c);
    const decision = handlePreToolUse({
      cwd: dirname(path),
      contract_path: path,
      tool_name: "SlashCommand",
      prompt: "/rubrix:score",
    });
    expect(decision.decision).toBe("block");
    expect(decision.reason).toContain("v1.2 clarity invariant");
  });

  it("UserPromptExpansion blocks /rubrix:score on a v1.2 contract missing clarity (parity with PreToolUse)", () => {
    const c = v12PlanLockedMissingPlanClarity();
    const path = tempContractFile(c);
    const decision = handleUserPromptExpansion({
      cwd: dirname(path),
      contract_path: path,
      prompt: "/rubrix:score",
    });
    expect(decision.decision).toBe("block");
    expect(decision.reason).toContain("v1.2 clarity invariant");
  });

  it("v1.0 PlanLocked contract without clarity is unaffected (read-compat preserved)", () => {
    const c = baseDrafted();
    c.matrix = { rows: [{ id: "r", criterion: "c1", evidence_required: "e" }] };
    c.plan = { steps: [{ id: "s", action: "a", covers: ["r"] }] };
    c.state = "PlanLocked";
    c.locks = { rubric: true, matrix: true, plan: true };
    const path = tempContractFile(c);
    const decision = handlePreToolUse({
      cwd: dirname(path),
      contract_path: path,
      tool_name: "Edit",
      tool_input: { file_path: "/tmp/source.ts" },
    });
    expect(decision.decision).toBe("allow");
  });

  it("gate refuses to run on a v1.2 Scoring contract that is missing clarity", () => {
    const c = v12PlanLockedMissingPlanClarity();
    c.state = "Scoring";
    c.scores = [{ criterion: "c1", score: 0.9 }];
    const path = tempContractFile(c);
    const code = gateCommand({ path, env: {} });
    expect(code).toBe(2);
    expect(cap.stderr).toContain("v1.2 clarity invariant");
  });

  it("gate runs normally on a v1.0 Scoring contract", () => {
    const c = baseDrafted();
    c.matrix = { rows: [{ id: "r", criterion: "c1", evidence_required: "e" }] };
    c.plan = { steps: [{ id: "s", action: "a", covers: ["r"] }] };
    c.state = "Scoring";
    c.locks = { rubric: true, matrix: true, plan: true };
    c.scores = [{ criterion: "c1", score: 0.9 }];
    const path = tempContractFile(c);
    const code = gateCommand({ path, env: {} });
    expect(code).toBe(0);
  });

  describe("(codex review #28/#31 P1) clarity-breach block scope is restricted to gated surfaces", () => {
    it("PreToolUse allows Bash (e.g. `rubrix lock --force`) on a v1.2 contract with a clarity breach", () => {
      const c = v12PlanLockedMissingPlanClarity();
      const path = tempContractFile(c);
      const decision = handlePreToolUse({
        cwd: dirname(path),
        contract_path: path,
        tool_name: "Bash",
        tool_input: { command: `node cli/bin/rubrix.js lock plan ${path} --force "audit override"` },
      });
      expect(decision.decision).toBe("allow");
    });

    it("PreToolUse allows Read (diagnostics) on a v1.2 contract with a clarity breach", () => {
      const c = v12PlanLockedMissingPlanClarity();
      const path = tempContractFile(c);
      const decision = handlePreToolUse({
        cwd: dirname(path),
        contract_path: path,
        tool_name: "Read",
        tool_input: { file_path: "/tmp/some-other-file.ts" },
      });
      expect(decision.decision).toBe("allow");
    });

    it("PreToolUse still blocks /rubrix:rubric on a v1.2 contract with a clarity breach", () => {
      const c = v12PlanLockedMissingPlanClarity();
      const path = tempContractFile(c);
      const decision = handlePreToolUse({
        cwd: dirname(path),
        contract_path: path,
        tool_name: "SlashCommand",
        prompt: "/rubrix:rubric",
      });
      expect(decision.decision).toBe("block");
      expect(decision.reason).toContain("v1.2 clarity invariant");
    });
  });
});
