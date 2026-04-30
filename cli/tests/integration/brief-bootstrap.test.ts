import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { runValidate } from "../../src/commands/validate.ts";
import { evaluateGate } from "../../src/commands/gate.ts";
import { buildReport } from "../../src/commands/report.ts";
import { loadContract } from "../../src/core/contract.ts";

function tmpFromFile(rel: string): string {
  const src = readFileSync(join(__dirname, "..", "..", "..", rel), "utf8");
  const dir = mkdtempSync(join(tmpdir(), "rubrix-bootstrap-"));
  const path = join(dir, "rubrix.json");
  writeFileSync(path, src, "utf8");
  return path;
}

describe("v1.0 fixture backward compatibility", () => {
  it("examples/self-eval/rubrix.json validates clean and emits no warning at IntentDrafted", () => {
    const path = tmpFromFile("examples/self-eval/rubrix.json");
    const v = runValidate({ path, env: {} });
    expect(v.ok).toBe(true);
    expect(v.warnings).toEqual([]);
  });

  it("examples/ios-refactor/rubrix.json validates clean and emits a brief warning at Passed", () => {
    const path = tmpFromFile("examples/ios-refactor/rubrix.json");
    const v = runValidate({ path, env: {} });
    expect(v.ok).toBe(true);
    expect(v.warnings.length).toBeGreaterThan(0);
    expect(v.warnings[0]).toMatch(/intent\.brief is missing/);
  });

  it("v1.0 ios-refactor gate is unchanged — no axis bump applied", () => {
    const path = tmpFromFile("examples/ios-refactor/rubrix.json");
    const c = loadContract(path);
    const result = evaluateGate(c, {});
    expect(["pass", "fail"]).toContain(result.decision);
    for (const row of result.perCriterion) {
      expect(row.axis).toBeUndefined();
      expect(row.axisDepth ?? "standard").toBe("standard");
    }
  });

  it("RUBRIX_SKIP_BRIEF=1 keeps gate behaviour identical on a v1.0 contract", () => {
    const path = tmpFromFile("examples/ios-refactor/rubrix.json");
    const c = loadContract(path);
    const a = evaluateGate(c, {});
    const b = evaluateGate(c, { RUBRIX_SKIP_BRIEF: "1" });
    expect(a.decision).toBe(b.decision);
    expect(a.total).toBeCloseTo(b.total, 6);
  });

  it("buildReport renders no Intent brief section when contract lacks brief", () => {
    const path = tmpFromFile("examples/self-eval/rubrix.json");
    const md = buildReport(path);
    expect(md).not.toMatch(/Intent brief/);
  });
});

describe("v1.1 dogfood contract roundtrip", () => {
  it("repo-root rubrix.json validates clean", () => {
    const path = tmpFromFile("rubrix.json");
    const v = runValidate({ path, env: {} });
    expect(v.ok).toBe(true);
    expect(v.warnings).toEqual([]);
  });

  it("buildReport renders the Intent brief block with axis_depth table", () => {
    const path = tmpFromFile("rubrix.json");
    const md = buildReport(path);
    expect(md).toMatch(/## Intent brief/);
    expect(md).toMatch(/\| axis \| configured \| effective \|/);
  });
});
