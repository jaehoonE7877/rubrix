import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { RubrixContract } from "../src/core/contract.ts";

export function tempContractFile(c: RubrixContract): string {
  const dir = mkdtempSync(join(tmpdir(), "rubrix-test-"));
  const path = join(dir, "rubrix.json");
  writeFileSync(path, JSON.stringify(c, null, 2), "utf8");
  return path;
}

export function baseDrafted(): RubrixContract {
  return {
    version: "0.1.0",
    intent: { summary: "test" },
    rubric: { threshold: 0.5, criteria: [{ id: "c1", description: "d", weight: 1 }] },
    state: "RubricDrafted",
    locks: { rubric: false, matrix: false, plan: false },
  };
}
