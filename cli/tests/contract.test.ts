import { describe, it, expect } from "vitest";
import { mkdtempSync, readFileSync, readdirSync, symlinkSync, lstatSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { saveContract, loadContract, formatError, validateContract } from "../src/core/contract.ts";
import { tempContractFile, baseDrafted } from "./helpers.ts";

describe("saveContract — atomic + symlink-safe", () => {
  it("does not leave a temp file in the directory after a successful write", () => {
    const path = tempContractFile(baseDrafted());
    const dir = join(path, "..");
    const c = loadContract(path);
    c.intent.summary = "updated";
    saveContract(path, c);
    const remaining = readdirSync(dir).filter((n) => n.includes(".tmp-"));
    expect(remaining).toEqual([]);
    const after = JSON.parse(readFileSync(path, "utf8"));
    expect(after.intent.summary).toBe("updated");
  });

  it("writes through a symlink to the underlying file (preserves the symlink)", () => {
    const realDir = mkdtempSync(join(tmpdir(), "rubrix-real-"));
    const linkDir = mkdtempSync(join(tmpdir(), "rubrix-link-"));
    const realPath = join(realDir, "rubrix.json");
    const linkPath = join(linkDir, "rubrix.json");
    saveContract(realPath, baseDrafted());
    symlinkSync(realPath, linkPath);
    expect(lstatSync(linkPath).isSymbolicLink()).toBe(true);
    const c = loadContract(linkPath);
    c.intent.summary = "via-symlink";
    saveContract(linkPath, c);
    expect(lstatSync(linkPath).isSymbolicLink()).toBe(true);
    const real = JSON.parse(readFileSync(realPath, "utf8"));
    expect(real.intent.summary).toBe("via-symlink");
  });

  it("refuses to write a contract that fails schema validation", () => {
    const path = tempContractFile(baseDrafted());
    const c = loadContract(path);
    (c as unknown as { state: string }).state = "BogusState";
    expect(() => saveContract(path, c)).toThrow(/refusing to write invalid/);
    const after = JSON.parse(readFileSync(path, "utf8"));
    expect(after.state).toBe("RubricDrafted");
  });
});

describe("formatError — criterion_id 환각에 대한 진단 hint", () => {
  it("matrix.rows[]에 criterion 누락 시 'use field name criterion' hint 출력", () => {
    const r = validateContract({
      version: "0.1.0",
      intent: { summary: "x" },
      rubric: { threshold: 0.5, criteria: [{ id: "c1", description: "d", weight: 1 }] },
      matrix: { rows: [{ id: "m1", evidence_required: "e" }] },
      state: "MatrixDrafted",
      locks: { rubric: true, matrix: false, plan: false },
    });
    expect(r.ok).toBe(false);
    const messages = r.errors.map(formatError).join("\n");
    expect(messages).toMatch(/use field name 'criterion'/);
    expect(messages).toMatch(/not 'criterion_id'/);
  });

  it("matrix.rows[]에 criterion_id 추가 시 'schema rejects criterion_id' hint 출력", () => {
    const r = validateContract({
      version: "0.1.0",
      intent: { summary: "x" },
      rubric: { threshold: 0.5, criteria: [{ id: "c1", description: "d", weight: 1 }] },
      matrix: { rows: [{ id: "m1", criterion: "c1", criterion_id: "c1", evidence_required: "e" }] },
      state: "MatrixDrafted",
      locks: { rubric: true, matrix: false, plan: false },
    });
    expect(r.ok).toBe(false);
    const messages = r.errors.map(formatError).join("\n");
    expect(messages).toMatch(/schema rejects 'criterion_id'/);
    expect(messages).toMatch(/iteration-5 회귀 가드/);
  });
});
