import { describe, it, expect } from "vitest";
import { mkdtempSync, readFileSync, readdirSync, symlinkSync, lstatSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { saveContract, loadContract } from "../src/core/contract.ts";
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
