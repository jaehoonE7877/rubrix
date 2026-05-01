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

    it("(codex follow-up P2) PreToolUse blocks Bash that is NOT a rubrix CLI invocation on clarity breach (no shell-write bypass)", () => {
      const c = v12PlanLockedMissingPlanClarity();
      const path = tempContractFile(c);
      const decision = handlePreToolUse({
        cwd: dirname(path),
        contract_path: path,
        tool_name: "Bash",
        tool_input: { command: "cat > src/foo.ts <<EOF\nexport const x = 1;\nEOF" },
      });
      expect(decision.decision).toBe("block");
      expect(decision.reason).toContain("v1.2 clarity invariant");
    });

    it("(codex follow-up P2) PreToolUse blocks Bash sed -i (in-place file mutation) on clarity breach", () => {
      const c = v12PlanLockedMissingPlanClarity();
      const path = tempContractFile(c);
      const decision = handlePreToolUse({
        cwd: dirname(path),
        contract_path: path,
        tool_name: "Bash",
        tool_input: { command: "sed -i 's/old/new/' src/foo.ts" },
      });
      expect(decision.decision).toBe("block");
      expect(decision.reason).toContain("v1.2 clarity invariant");
    });

    it("(codex follow-up P2) PreToolUse allows `node cli/bin/rubrix.js report` Bash on clarity breach (rubrix CLI recovery)", () => {
      const c = v12PlanLockedMissingPlanClarity();
      const path = tempContractFile(c);
      const decision = handlePreToolUse({
        cwd: dirname(path),
        contract_path: path,
        tool_name: "Bash",
        tool_input: { command: `node cli/bin/rubrix.js report ${path}` },
      });
      expect(decision.decision).toBe("allow");
    });

    it("(codex follow-up #2 P1) PreToolUse blocks compound Bash like `rubrix report && sed -i ...` on clarity breach (no metachar bypass)", () => {
      const c = v12PlanLockedMissingPlanClarity();
      const path = tempContractFile(c);
      const decision = handlePreToolUse({
        cwd: dirname(path),
        contract_path: path,
        tool_name: "Bash",
        tool_input: { command: `rubrix report ${path} && sed -i 's/x/y/' src/foo.ts` },
      });
      expect(decision.decision).toBe("block");
      expect(decision.reason).toContain("v1.2 clarity invariant");
    });

    it("(codex follow-up #2 P1) PreToolUse blocks `cat >src/foo.ts; rubrix validate ...` on clarity breach (semicolon chaining)", () => {
      const c = v12PlanLockedMissingPlanClarity();
      const path = tempContractFile(c);
      const decision = handlePreToolUse({
        cwd: dirname(path),
        contract_path: path,
        tool_name: "Bash",
        tool_input: { command: `cat >src/foo.ts <<EOF\nx\nEOF\nrubrix validate ${path}` },
      });
      expect(decision.decision).toBe("block");
      expect(decision.reason).toContain("v1.2 clarity invariant");
    });

    it("(codex follow-up #2 P1) PreToolUse blocks redirect `rubrix report > out.txt` on clarity breach", () => {
      const c = v12PlanLockedMissingPlanClarity();
      const path = tempContractFile(c);
      const decision = handlePreToolUse({
        cwd: dirname(path),
        contract_path: path,
        tool_name: "Bash",
        tool_input: { command: `rubrix report ${path} > /tmp/out.txt` },
      });
      expect(decision.decision).toBe("block");
    });

    it("(codex follow-up #2 P1) PreToolUse blocks pipe `rubrix report | tee` on clarity breach", () => {
      const c = v12PlanLockedMissingPlanClarity();
      const path = tempContractFile(c);
      const decision = handlePreToolUse({
        cwd: dirname(path),
        contract_path: path,
        tool_name: "Bash",
        tool_input: { command: `rubrix report ${path} | tee /tmp/out.txt` },
      });
      expect(decision.decision).toBe("block");
    });

    it("(codex follow-up #3 P1) PreToolUse blocks `rubrix report --out src/foo.ts` on clarity breach (--out file-writing flag)", () => {
      const c = v12PlanLockedMissingPlanClarity();
      const path = tempContractFile(c);
      const decision = handlePreToolUse({
        cwd: dirname(path),
        contract_path: path,
        tool_name: "Bash",
        tool_input: { command: `rubrix report ${path} --out src/foo.ts` },
      });
      expect(decision.decision).toBe("block");
      expect(decision.reason).toContain("v1.2 clarity invariant");
    });

    it("(codex follow-up #3 P1) PreToolUse blocks `rubrix report --out=src/foo.ts` (=-form of file-writing flag)", () => {
      const c = v12PlanLockedMissingPlanClarity();
      const path = tempContractFile(c);
      const decision = handlePreToolUse({
        cwd: dirname(path),
        contract_path: path,
        tool_name: "Bash",
        tool_input: { command: `rubrix report ${path} --out=src/foo.ts` },
      });
      expect(decision.decision).toBe("block");
    });

    it("(codex follow-up #2 P1) PreToolUse blocks command-substitution `rubrix lock $(some)` on clarity breach", () => {
      const c = v12PlanLockedMissingPlanClarity();
      const path = tempContractFile(c);
      const decision = handlePreToolUse({
        cwd: dirname(path),
        contract_path: path,
        tool_name: "Bash",
        tool_input: { command: `rubrix lock plan ${path} --force "$(cat /tmp/reason.txt)"` },
      });
      expect(decision.decision).toBe("block");
    });

    it("(codex follow-up #4 P1) PreToolUse blocks `rubrix report\\nsed -i ...` (newline-chained Bash) on clarity breach", () => {
      const c = v12PlanLockedMissingPlanClarity();
      const path = tempContractFile(c);
      const decision = handlePreToolUse({
        cwd: dirname(path),
        contract_path: path,
        tool_name: "Bash",
        tool_input: { command: `rubrix report ${path}\nsed -i 's/x/y/' src/foo.ts` },
      });
      expect(decision.decision).toBe("block");
    });

    it("(codex follow-up #4 P1) PreToolUse blocks `node scripts/mutate.js rubrix report ...` (rubrix as argument, not script)", () => {
      const c = v12PlanLockedMissingPlanClarity();
      const path = tempContractFile(c);
      const decision = handlePreToolUse({
        cwd: dirname(path),
        contract_path: path,
        tool_name: "Bash",
        tool_input: { command: `node scripts/mutate.js rubrix report ${path}` },
      });
      expect(decision.decision).toBe("block");
    });

    it("(codex follow-up #4 P1) PreToolUse blocks quoted `\"--out\" src/foo.ts` (whitespace+quoted form of file-write flag)", () => {
      const c = v12PlanLockedMissingPlanClarity();
      const path = tempContractFile(c);
      const decision = handlePreToolUse({
        cwd: dirname(path),
        contract_path: path,
        tool_name: "Bash",
        tool_input: { command: `rubrix report ${path} "--out" src/foo.ts` },
      });
      expect(decision.decision).toBe("block");
    });

    it("(codex follow-up #5 P1) PreToolUse blocks `node /tmp/rubrix.js lock ...` (arbitrary rubrix.js path, not bundled CLI)", () => {
      const c = v12PlanLockedMissingPlanClarity();
      const path = tempContractFile(c);
      const decision = handlePreToolUse({
        cwd: dirname(path),
        contract_path: path,
        tool_name: "Bash",
        tool_input: { command: `node /tmp/rubrix.js lock plan ${path}` },
      });
      expect(decision.decision).toBe("block");
    });

    it("(codex follow-up #5 P1) PreToolUse blocks `node ../../../tmp/rubrix.js lock ...` (parent-traversal path)", () => {
      const c = v12PlanLockedMissingPlanClarity();
      const path = tempContractFile(c);
      const decision = handlePreToolUse({
        cwd: dirname(path),
        contract_path: path,
        tool_name: "Bash",
        tool_input: { command: `node ../../../tmp/rubrix.js lock plan ${path}` },
      });
      expect(decision.decision).toBe("block");
    });

    it("(codex follow-up #5 P1) PreToolUse blocks `rubrix report --o\"ut\"=src/foo.ts` (shell-quoted --out evades regex but tokenizer catches it)", () => {
      const c = v12PlanLockedMissingPlanClarity();
      const path = tempContractFile(c);
      const decision = handlePreToolUse({
        cwd: dirname(path),
        contract_path: path,
        tool_name: "Bash",
        tool_input: { command: `rubrix report ${path} --o"ut"=src/foo.ts` },
      });
      expect(decision.decision).toBe("block");
    });

    it("(codex follow-up #5 P1) PreToolUse blocks `rubrix report --\\out=src/foo.ts` (backslash-escaped flag)", () => {
      const c = v12PlanLockedMissingPlanClarity();
      const path = tempContractFile(c);
      const decision = handlePreToolUse({
        cwd: dirname(path),
        contract_path: path,
        tool_name: "Bash",
        tool_input: { command: `rubrix report ${path} --\\out=src/foo.ts` },
      });
      expect(decision.decision).toBe("block");
    });

    it("(codex follow-up #6 P1) PreToolUse blocks `rubrix report $'--out=src/foo.ts'` (ANSI-C quoting expansion)", () => {
      const c = v12PlanLockedMissingPlanClarity();
      const path = tempContractFile(c);
      const decision = handlePreToolUse({
        cwd: dirname(path),
        contract_path: path,
        tool_name: "Bash",
        tool_input: { command: `rubrix report ${path} $'--out=src/foo.ts'` },
      });
      expect(decision.decision).toBe("block");
    });

    it("(codex follow-up #6 P1) PreToolUse blocks `rubrix report {--out=src/foo.ts,}` (brace expansion)", () => {
      const c = v12PlanLockedMissingPlanClarity();
      const path = tempContractFile(c);
      const decision = handlePreToolUse({
        cwd: dirname(path),
        contract_path: path,
        tool_name: "Bash",
        tool_input: { command: `rubrix report ${path} {--out=src/foo.ts,}` },
      });
      expect(decision.decision).toBe("block");
    });

    it("(codex follow-up #6 P1) PreToolUse blocks `rubrix report ~/foo` (tilde expansion)", () => {
      const c = v12PlanLockedMissingPlanClarity();
      const path = tempContractFile(c);
      const decision = handlePreToolUse({
        cwd: dirname(path),
        contract_path: path,
        tool_name: "Bash",
        tool_input: { command: `rubrix report ${path} --out ~/.something` },
      });
      expect(decision.decision).toBe("block");
    });

    it("(codex follow-up #6 P1) PreToolUse blocks `rubrix report *.json` (glob expansion)", () => {
      const c = v12PlanLockedMissingPlanClarity();
      const path = tempContractFile(c);
      const decision = handlePreToolUse({
        cwd: dirname(path),
        contract_path: path,
        tool_name: "Bash",
        tool_input: { command: `rubrix report *.json` },
      });
      expect(decision.decision).toBe("block");
    });

    it("(codex follow-up #6 P2) PreToolUse blocks `node .cli/bin/rubrix.js lock ...` (single-dot prefix is NOT bundled)", () => {
      const c = v12PlanLockedMissingPlanClarity();
      const path = tempContractFile(c);
      const decision = handlePreToolUse({
        cwd: dirname(path),
        contract_path: path,
        tool_name: "Bash",
        tool_input: { command: `node .cli/bin/rubrix.js lock plan ${path}` },
      });
      expect(decision.decision).toBe("block");
    });

    it("(codex follow-up #7 P2) PreToolUse blocks `rubrix brief init ...` (mutating subcommand removed from recovery allowlist)", () => {
      const c = v12PlanLockedMissingPlanClarity();
      const path = tempContractFile(c);
      const decision = handlePreToolUse({
        cwd: dirname(path),
        contract_path: path,
        tool_name: "Bash",
        tool_input: { command: `rubrix brief init src/new.ts --summary x --project-type doc --situation internal_tool --ambition demo` },
      });
      expect(decision.decision).toBe("block");
    });

    it("(codex follow-up #7 P2) PreToolUse blocks `rubrix state set ...` and `rubrix gate --apply` (mutating subcommands removed)", () => {
      const c = v12PlanLockedMissingPlanClarity();
      const path = tempContractFile(c);
      const setDecision = handlePreToolUse({
        cwd: dirname(path),
        contract_path: path,
        tool_name: "Bash",
        tool_input: { command: `rubrix state set ${path} Passed` },
      });
      expect(setDecision.decision).toBe("block");
      const applyDecision = handlePreToolUse({
        cwd: dirname(path),
        contract_path: path,
        tool_name: "Bash",
        tool_input: { command: `rubrix gate ${path} --apply` },
      });
      expect(applyDecision.decision).toBe("block");
    });

    it("(codex follow-up #8 P1) PreToolUse blocks backslash-newline line-continuation in --out (`--o\\<newline>ut=...`)", () => {
      const c = v12PlanLockedMissingPlanClarity();
      const path = tempContractFile(c);
      const decision = handlePreToolUse({
        cwd: dirname(path),
        contract_path: path,
        tool_name: "Bash",
        tool_input: { command: `rubrix report ${path} --o\\\nut=src/foo.ts` },
      });
      expect(decision.decision).toBe("block");
    });

    it("(codex follow-up #9 P2) PreToolUse allows `RUBRIX_SKIP_BRIEF=1 node cli/bin/rubrix.js lock rubric ...` (safe env prefix for recovery)", () => {
      const c = v12PlanLockedMissingPlanClarity();
      const path = tempContractFile(c);
      const prev = process.env.CLAUDE_PLUGIN_ROOT;
      delete process.env.CLAUDE_PLUGIN_ROOT;
      try {
        const decision = handlePreToolUse({
          cwd: dirname(path),
          contract_path: path,
          tool_name: "Bash",
          tool_input: { command: `RUBRIX_SKIP_BRIEF=1 node cli/bin/rubrix.js lock rubric ${path}` },
        });
        expect(decision.decision).toBe("allow");
      } finally {
        if (prev !== undefined) process.env.CLAUDE_PLUGIN_ROOT = prev;
      }
    });

    it("(codex follow-up #9 P2) PreToolUse blocks arbitrary env prefix (e.g. `FOO=bar rubrix lock ...`)", () => {
      const c = v12PlanLockedMissingPlanClarity();
      const path = tempContractFile(c);
      const decision = handlePreToolUse({
        cwd: dirname(path),
        contract_path: path,
        tool_name: "Bash",
        tool_input: { command: `FOO=bar rubrix lock rubric ${path}` },
      });
      expect(decision.decision).toBe("block");
    });

    it("(codex follow-up #9 P2) PreToolUse blocks `RUBRIX_SKIP_BRIEF=0 rubrix lock ...` (only =1 is the documented safe value)", () => {
      const c = v12PlanLockedMissingPlanClarity();
      const path = tempContractFile(c);
      const decision = handlePreToolUse({
        cwd: dirname(path),
        contract_path: path,
        tool_name: "Bash",
        tool_input: { command: `RUBRIX_SKIP_BRIEF=0 rubrix lock rubric ${path}` },
      });
      expect(decision.decision).toBe("block");
    });

    it("(codex follow-up #12 P2) PreToolUse allows `node $CLAUDE_PLUGIN_ROOT/cli/bin/rubrix.js lock ...` (plugin-installed absolute path)", () => {
      const c = v12PlanLockedMissingPlanClarity();
      const path = tempContractFile(c);
      const fakeRoot = "/Users/me/.claude/plugins/cache/rubrix/rubrix/1.2.0";
      const prev = process.env.CLAUDE_PLUGIN_ROOT;
      process.env.CLAUDE_PLUGIN_ROOT = fakeRoot;
      try {
        const decision = handlePreToolUse({
          cwd: dirname(path),
          contract_path: path,
          tool_name: "Bash",
          tool_input: { command: `node ${fakeRoot}/cli/bin/rubrix.js lock plan ${path} --force "audit"` },
        });
        expect(decision.decision).toBe("allow");
      } finally {
        if (prev === undefined) delete process.env.CLAUDE_PLUGIN_ROOT;
        else process.env.CLAUDE_PLUGIN_ROOT = prev;
      }
    });

    it("(codex follow-up #13 P2) PreToolUse blocks `node cli/bin/rubrix.js ...` (relative form) when CLAUDE_PLUGIN_ROOT is set — relative could resolve to workspace's own file", () => {
      const c = v12PlanLockedMissingPlanClarity();
      const path = tempContractFile(c);
      const fakeRoot = "/Users/me/.claude/plugins/cache/rubrix/rubrix/1.2.0";
      const prev = process.env.CLAUDE_PLUGIN_ROOT;
      process.env.CLAUDE_PLUGIN_ROOT = fakeRoot;
      try {
        const decision = handlePreToolUse({
          cwd: dirname(path),
          contract_path: path,
          tool_name: "Bash",
          tool_input: { command: `node cli/bin/rubrix.js lock plan ${path}` },
        });
        expect(decision.decision).toBe("block");
      } finally {
        if (prev === undefined) delete process.env.CLAUDE_PLUGIN_ROOT;
        else process.env.CLAUDE_PLUGIN_ROOT = prev;
      }
    });

    it("(codex follow-up #12 P2) PreToolUse blocks `node /tmp/imposter/cli/bin/rubrix.js lock ...` even with CLAUDE_PLUGIN_ROOT set elsewhere", () => {
      const c = v12PlanLockedMissingPlanClarity();
      const path = tempContractFile(c);
      const fakeRoot = "/Users/me/.claude/plugins/cache/rubrix/rubrix/1.2.0";
      const prev = process.env.CLAUDE_PLUGIN_ROOT;
      process.env.CLAUDE_PLUGIN_ROOT = fakeRoot;
      try {
        const decision = handlePreToolUse({
          cwd: dirname(path),
          contract_path: path,
          tool_name: "Bash",
          tool_input: { command: `node /tmp/imposter/cli/bin/rubrix.js lock plan ${path}` },
        });
        expect(decision.decision).toBe("block");
      } finally {
        if (prev === undefined) delete process.env.CLAUDE_PLUGIN_ROOT;
        else process.env.CLAUDE_PLUGIN_ROOT = prev;
      }
    });

    it("(codex follow-up #14 P2) PreToolUse allows `node cli/bin/rubrix.js state set <path> PlanDrafted` on clarity breach (Failed-loop rollback executable)", () => {
      const c = v12PlanLockedMissingPlanClarity();
      const path = tempContractFile(c);
      const prev = process.env.CLAUDE_PLUGIN_ROOT;
      delete process.env.CLAUDE_PLUGIN_ROOT;
      try {
        const decision = handlePreToolUse({
          cwd: dirname(path),
          contract_path: path,
          tool_name: "Bash",
          tool_input: { command: `node cli/bin/rubrix.js state set ${path} PlanDrafted` },
        });
        expect(decision.decision).toBe("allow");
      } finally {
        if (prev !== undefined) process.env.CLAUDE_PLUGIN_ROOT = prev;
      }
    });

    it("(codex follow-up #14 P2) PreToolUse blocks `rubrix state set <path> Passed` (only PlanDrafted target is exempted)", () => {
      const c = v12PlanLockedMissingPlanClarity();
      const path = tempContractFile(c);
      const decision = handlePreToolUse({
        cwd: dirname(path),
        contract_path: path,
        tool_name: "Bash",
        tool_input: { command: `rubrix state set ${path} Passed` },
      });
      expect(decision.decision).toBe("block");
    });

    it("(codex follow-up #14 P2) PreToolUse blocks `rubrix state get` (only the specific rollback `state set ... PlanDrafted` form is exempted)", () => {
      const c = v12PlanLockedMissingPlanClarity();
      const path = tempContractFile(c);
      const decision = handlePreToolUse({
        cwd: dirname(path),
        contract_path: path,
        tool_name: "Bash",
        tool_input: { command: `rubrix state get ${path}` },
      });
      expect(decision.decision).toBe("block");
    });

    it("(codex follow-up #4 P1) PreToolUse allows `node cli/bin/rubrix.js lock plan ...` (legitimate node-invocation form, no CLAUDE_PLUGIN_ROOT)", () => {
      const c = v12PlanLockedMissingPlanClarity();
      const path = tempContractFile(c);
      const prev = process.env.CLAUDE_PLUGIN_ROOT;
      delete process.env.CLAUDE_PLUGIN_ROOT;
      try {
        const decision = handlePreToolUse({
          cwd: dirname(path),
          contract_path: path,
          tool_name: "Bash",
          tool_input: { command: `node cli/bin/rubrix.js lock plan ${path} --force "vendor freeze"` },
        });
        expect(decision.decision).toBe("allow");
      } finally {
        if (prev !== undefined) process.env.CLAUDE_PLUGIN_ROOT = prev;
      }
    });

    it("(codex follow-up #19 P2) clarity-breach hint chooses prefix per CLAUDE_PLUGIN_ROOT presence", () => {
      const c = v12PlanLockedMissingPlanClarity();
      const path = tempContractFile(c);
      const prev = process.env.CLAUDE_PLUGIN_ROOT;
      delete process.env.CLAUDE_PLUGIN_ROOT;
      try {
        const dev = handlePreToolUse({
          cwd: dirname(path),
          contract_path: path,
          tool_name: "Edit",
          tool_input: { file_path: "/tmp/source.ts" },
        });
        expect(dev.reason).toContain("node cli/bin/rubrix.js");
        expect(dev.reason).not.toContain("$CLAUDE_PLUGIN_ROOT");
      } finally {
        if (prev !== undefined) process.env.CLAUDE_PLUGIN_ROOT = prev;
      }
      const fakeRoot = "/Users/me/.claude/plugins/cache/rubrix/rubrix/1.2.0";
      process.env.CLAUDE_PLUGIN_ROOT = fakeRoot;
      try {
        const installed = handlePreToolUse({
          cwd: dirname(path),
          contract_path: path,
          tool_name: "Edit",
          tool_input: { file_path: "/tmp/source.ts" },
        });
        expect(installed.reason).toContain("$CLAUDE_PLUGIN_ROOT/cli/bin/rubrix.js");
      } finally {
        if (prev === undefined) delete process.env.CLAUDE_PLUGIN_ROOT;
        else process.env.CLAUDE_PLUGIN_ROOT = prev;
      }
    });

    it("(codex follow-up #17 P2) PreToolUse blocks bare `rubrix lock ...` (PATH-trusting form is unsafe — workspace-local rubrix could shadow bundled CLI)", () => {
      const c = v12PlanLockedMissingPlanClarity();
      const path = tempContractFile(c);
      const decision = handlePreToolUse({
        cwd: dirname(path),
        contract_path: path,
        tool_name: "Bash",
        tool_input: { command: `rubrix lock plan ${path} --force "audit"` },
      });
      expect(decision.decision).toBe("block");
    });

    it("(codex follow-up P2) PreToolUse allows Glob/Grep diagnostics on clarity breach (read-only tools)", () => {
      const c = v12PlanLockedMissingPlanClarity();
      const path = tempContractFile(c);
      const grep = handlePreToolUse({
        cwd: dirname(path),
        contract_path: path,
        tool_name: "Grep",
        tool_input: { pattern: "TODO" },
      });
      expect(grep.decision).toBe("allow");
      const glob = handlePreToolUse({
        cwd: dirname(path),
        contract_path: path,
        tool_name: "Glob",
        tool_input: { pattern: "**/*.ts" },
      });
      expect(glob.decision).toBe("allow");
    });

    it("(codex follow-up #16 P2) PreToolUse allows `node \"$CLAUDE_PLUGIN_ROOT/cli/bin/rubrix.js\" lock ...` (portable installed-plugin form, double-quoted)", () => {
      const c = v12PlanLockedMissingPlanClarity();
      const path = tempContractFile(c);
      const fakeRoot = "/Users/me/.claude/plugins/cache/rubrix/rubrix/1.2.0";
      const prev = process.env.CLAUDE_PLUGIN_ROOT;
      process.env.CLAUDE_PLUGIN_ROOT = fakeRoot;
      try {
        const decision = handlePreToolUse({
          cwd: dirname(path),
          contract_path: path,
          tool_name: "Bash",
          tool_input: { command: `node "$CLAUDE_PLUGIN_ROOT/cli/bin/rubrix.js" lock plan ${path} --force "audit"` },
        });
        expect(decision.decision).toBe("allow");
      } finally {
        if (prev === undefined) delete process.env.CLAUDE_PLUGIN_ROOT;
        else process.env.CLAUDE_PLUGIN_ROOT = prev;
      }
    });

    it("(codex follow-up #16 P2) PreToolUse blocks `$OTHERVAR/cli/bin/rubrix.js` (only $CLAUDE_PLUGIN_ROOT is the safe expansion)", () => {
      const c = v12PlanLockedMissingPlanClarity();
      const path = tempContractFile(c);
      const fakeRoot = "/Users/me/.claude/plugins/cache/rubrix/rubrix/1.2.0";
      const prev = process.env.CLAUDE_PLUGIN_ROOT;
      process.env.CLAUDE_PLUGIN_ROOT = fakeRoot;
      try {
        const decision = handlePreToolUse({
          cwd: dirname(path),
          contract_path: path,
          tool_name: "Bash",
          tool_input: { command: `node "$HOME/cli/bin/rubrix.js" lock plan ${path}` },
        });
        expect(decision.decision).toBe("block");
      } finally {
        if (prev === undefined) delete process.env.CLAUDE_PLUGIN_ROOT;
        else process.env.CLAUDE_PLUGIN_ROOT = prev;
      }
    });

    it("(codex follow-up #15 P2) PreToolUse allows LS and NotebookRead on clarity breach (extended read-only allowlist)", () => {
      const c = v12PlanLockedMissingPlanClarity();
      const path = tempContractFile(c);
      const ls = handlePreToolUse({
        cwd: dirname(path),
        contract_path: path,
        tool_name: "LS",
        tool_input: { path: "/tmp" },
      });
      expect(ls.decision).toBe("allow");
      const nb = handlePreToolUse({
        cwd: dirname(path),
        contract_path: path,
        tool_name: "NotebookRead",
        tool_input: { notebook_path: "/tmp/nb.ipynb" },
      });
      expect(nb.decision).toBe("allow");
    });
  });
});
