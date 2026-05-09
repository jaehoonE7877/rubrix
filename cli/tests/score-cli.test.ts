import { describe, expect, it } from "vitest";
import { scoreCommand } from "../src/commands/score.ts";

function captureStderr(fn: () => number): { code: number; err: string } {
  const orig = process.stderr.write.bind(process.stderr);
  let buf = "";
  process.stderr.write = ((s: string | Uint8Array) => {
    buf += typeof s === "string" ? s : Buffer.from(s).toString();
    return true;
  }) as typeof process.stderr.write;
  try {
    const code = fn();
    return { code, err: buf };
  } finally {
    process.stderr.write = orig;
  }
}

describe("score CLI stub (v1.3 PR #1)", () => {
  it("returns exit 0 and PR #2 placeholder message with no flags", () => {
    const { code, err } = captureStderr(() => scoreCommand({ path: "/tmp/whatever.json" }));
    expect(code).toBe(0);
    expect(err).toContain("cascade orchestrator not yet wired");
    expect(err).toContain("PR #2");
    expect(err).toContain("/tmp/whatever.json");
  });

  it("echoes --stage flag back in the placeholder message", () => {
    const { code, err } = captureStderr(() =>
      scoreCommand({ path: "/tmp/x.json", stage: 2 }),
    );
    expect(code).toBe(0);
    expect(err).toContain("--stage 2");
  });

  it("echoes --explain flag back in the placeholder message", () => {
    const { code, err } = captureStderr(() =>
      scoreCommand({ path: "/tmp/x.json", explain: "criterion-id" }),
    );
    expect(code).toBe(0);
    expect(err).toContain("--explain criterion-id");
  });

  it("echoes --approve-expensive flag back in the placeholder message", () => {
    const { code, err } = captureStderr(() =>
      scoreCommand({ path: "/tmp/x.json", approveExpensive: true }),
    );
    expect(code).toBe(0);
    expect(err).toContain("--approve-expensive");
  });

  it("combines all flags in the placeholder message", () => {
    const { code, err } = captureStderr(() =>
      scoreCommand({ path: "/tmp/x.json", stage: 3, explain: "c1", approveExpensive: true }),
    );
    expect(code).toBe(0);
    expect(err).toContain("--stage 3");
    expect(err).toContain("--explain c1");
    expect(err).toContain("--approve-expensive");
  });

  it("does not mutate the contract path argument", () => {
    const { code } = captureStderr(() => scoreCommand({ path: ".rubrix/x.json", stage: 1 }));
    expect(code).toBe(0);
  });
});
