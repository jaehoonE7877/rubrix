import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { STAGE3_REQUIRED_KEYS } from "../../src/hooks/handlers.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const AGENT_PATH = join(HERE, "..", "..", "..", "agents", "consensus-panel.md");

describe("agent-spec ↔ implementation drift (RUB-30 v1.3.2)", () => {
  it("consensus-panel.md output JSON example keys match STAGE3_REQUIRED_KEYS", () => {
    const md = readFileSync(AGENT_PATH, "utf8");
    const fence = md.match(/```json\s*\r?\n([\s\S]*?)\r?\n```/);
    expect(fence, "consensus-panel.md must contain a ```json example block").not.toBeNull();
    const inner = fence?.[1] ?? "";
    const obj = JSON.parse(inner) as Record<string, unknown>;
    const specKeys = Object.keys(obj).sort();
    const codeKeys = [...STAGE3_REQUIRED_KEYS].sort();
    expect(specKeys).toEqual(codeKeys);
  });

  it("consensus-panel.md still mandates strict three-field output (markdown emphasis tolerant)", () => {
    const md = readFileSync(AGENT_PATH, "utf8");
    expect(md).toMatch(/exactly\W+these\W+three\W+fields/i);
  });
});
