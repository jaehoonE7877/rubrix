import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { handlePreToolUse, handleUserPromptExpansion } from "../src/hooks/handlers.ts";
import type { RubrixContract } from "../src/core/contract.ts";

function tmpContract(c: RubrixContract): string {
  const dir = mkdtempSync(join(tmpdir(), "rubrix-hook-brief-"));
  const path = join(dir, "rubrix.json");
  writeFileSync(path, JSON.stringify(c), "utf8");
  return path;
}

function uncalibratedIntent(): RubrixContract {
  return {
    version: "0.1.0",
    intent: { summary: "x" },
    state: "IntentDrafted",
    locks: { rubric: false, matrix: false, plan: false },
  };
}

function calibratedIntent(): RubrixContract {
  return {
    version: "0.1.0",
    intent: {
      summary: "x",
      brief: { calibrated: true, ambition: "production" },
    },
    state: "IntentDrafted",
    locks: { rubric: false, matrix: false, plan: false },
  };
}

describe("PreToolUse — /rubrix:rubric brief gate", () => {
  const skipKey = "RUBRIX_SKIP_BRIEF";
  let prev: string | undefined;
  beforeEach(() => {
    prev = process.env[skipKey];
    delete process.env[skipKey];
  });
  afterEach(() => {
    if (prev === undefined) delete process.env[skipKey];
    else process.env[skipKey] = prev;
  });

  it("denies /rubrix:rubric when brief is uncalibrated", () => {
    const path = tmpContract(uncalibratedIntent());
    const decision = handlePreToolUse({ cwd: tmpdir(), contract_path: path, prompt: "/rubrix:rubric" });
    expect(decision.decision).toBe("block");
    expect(decision.reason).toMatch(/intent\.brief is not yet calibrated/);
    expect(decision.reason).toMatch(/RUBRIX_SKIP_BRIEF=1/);
  });

  it("allows /rubrix:rubric when brief.calibrated=true", () => {
    const path = tmpContract(calibratedIntent());
    const decision = handlePreToolUse({ cwd: tmpdir(), contract_path: path, prompt: "/rubrix:rubric" });
    expect(decision.decision).toBe("allow");
  });

  it("allows /rubrix:rubric when RUBRIX_SKIP_BRIEF=1 even if uncalibrated", () => {
    process.env[skipKey] = "1";
    const path = tmpContract(uncalibratedIntent());
    const decision = handlePreToolUse({ cwd: tmpdir(), contract_path: path, prompt: "/rubrix:rubric" });
    expect(decision.decision).toBe("allow");
  });

  it("only matches the slash command — does not deny other prompts", () => {
    const path = tmpContract(uncalibratedIntent());
    const decision = handlePreToolUse({ cwd: tmpdir(), contract_path: path, prompt: "tell me about rubric" });
    expect(decision.decision).not.toBe("block");
  });

  it("does not interfere with /rubrix:score path", () => {
    const path = tmpContract(uncalibratedIntent());
    const decision = handlePreToolUse({ cwd: tmpdir(), contract_path: path, prompt: "/rubrix:score" });
    expect(decision.decision).toBe("block");
    expect(decision.reason).toMatch(/plan is not yet locked/);
  });

  it("recognizes alternate triggers /rubric and rubric", () => {
    const path = tmpContract(uncalibratedIntent());
    for (const prompt of ["/rubric", "rubric", "/rubric some args"]) {
      const decision = handlePreToolUse({ cwd: tmpdir(), contract_path: path, prompt });
      expect(decision.decision).toBe("block");
    }
  });
});

describe("UserPromptExpansion — brief suggestion hint", () => {
  const skipKey = "RUBRIX_SKIP_BRIEF";
  let prev: string | undefined;
  beforeEach(() => {
    prev = process.env[skipKey];
    delete process.env[skipKey];
  });
  afterEach(() => {
    if (prev === undefined) delete process.env[skipKey];
    else process.env[skipKey] = prev;
  });

  it("appends <rubrix-suggestion> when state=IntentDrafted and brief is uncalibrated", () => {
    const path = tmpContract(uncalibratedIntent());
    const decision = handleUserPromptExpansion({ cwd: tmpdir(), contract_path: path, prompt: "hello" });
    expect(decision.decision).not.toBe("block");
    expect(decision.additionalContext).toMatch(/<rubrix-suggestion>/);
    expect(decision.additionalContext).toMatch(/\/rubrix:brief/);
  });

  it("does not append the hint when calibrated=true", () => {
    const path = tmpContract(calibratedIntent());
    const decision = handleUserPromptExpansion({ cwd: tmpdir(), contract_path: path, prompt: "hello" });
    expect(decision.additionalContext ?? "").not.toMatch(/<rubrix-suggestion>/);
  });

  it("does not append the hint when RUBRIX_SKIP_BRIEF=1", () => {
    process.env[skipKey] = "1";
    const path = tmpContract(uncalibratedIntent());
    const decision = handleUserPromptExpansion({ cwd: tmpdir(), contract_path: path, prompt: "hello" });
    expect(decision.additionalContext ?? "").not.toMatch(/<rubrix-suggestion>/);
  });
});
