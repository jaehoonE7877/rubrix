import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_READ_TIMEOUT_MS, HookTimeoutError, hookCommand } from "../src/commands/hook.ts";

// RUB-6: stdin read timeout (safety-net) and event-specific fail-mode.
//
// Strategy: replace process.stdin's async iterator with a generator that
// awaits a long Promise (longer than our short test timeout). The
// hookCommand's internal Promise.race fires the timeout first → we assert
// the resulting exit code, stdout, stderr per event type.

interface IO {
  stdoutBuf: string;
  stderrBuf: string;
  restore: () => void;
}
function captureIO(): IO {
  let stdoutBuf = "";
  let stderrBuf = "";
  const origOut = process.stdout.write.bind(process.stdout);
  const origErr = process.stderr.write.bind(process.stderr);
  process.stdout.write = ((s: string | Uint8Array) => {
    stdoutBuf += typeof s === "string" ? s : Buffer.from(s).toString();
    return true;
  }) as typeof process.stdout.write;
  process.stderr.write = ((s: string | Uint8Array) => {
    stderrBuf += typeof s === "string" ? s : Buffer.from(s).toString();
    return true;
  }) as typeof process.stderr.write;
  return {
    get stdoutBuf() {
      return stdoutBuf;
    },
    get stderrBuf() {
      return stderrBuf;
    },
    restore: () => {
      process.stdout.write = origOut;
      process.stderr.write = origErr;
    },
  } as unknown as IO;
}

async function* hangingStdin(holdMs: number): AsyncGenerator<string> {
  await new Promise((r) => setTimeout(r, holdMs));
  yield ""; // never reached within test timeout
}

type StdinIter = { [Symbol.asyncIterator]: () => AsyncIterator<string> };

describe("RUB-6 acceptance — hook stdin timeout (safety-net)", () => {
  let io: IO;
  let origIsTTY: boolean | undefined;
  let origIter: unknown;

  beforeEach(() => {
    io = captureIO();
    origIsTTY = (process.stdin as { isTTY?: boolean }).isTTY;
    origIter = (process.stdin as unknown as { [Symbol.asyncIterator]: unknown })[Symbol.asyncIterator];
    (process.stdin as { isTTY?: boolean }).isTTY = false;
    (process.stdin as unknown as StdinIter)[Symbol.asyncIterator] = () => hangingStdin(60_000)[Symbol.asyncIterator]();
  });
  afterEach(() => {
    io.restore();
    (process.stdin as { isTTY?: boolean }).isTTY = origIsTTY;
    (process.stdin as unknown as { [Symbol.asyncIterator]: unknown })[Symbol.asyncIterator] = origIter;
  });

  it("exposes DEFAULT_READ_TIMEOUT_MS = 5000 as the production default", () => {
    expect(DEFAULT_READ_TIMEOUT_MS).toBe(5_000);
  });

  it("HookTimeoutError carries the timeoutMs value", () => {
    const err = new HookTimeoutError(123);
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe("HookTimeoutError");
    expect(err.timeoutMs).toBe(123);
    expect(err.message).toContain("123");
  });

  it("PreToolUse: timeout → fail-closed deny (exit 0, JSON permissionDecision=deny)", async () => {
    const code = await hookCommand({ event: "PreToolUse", readTimeoutMs: 30 });
    expect(code).toBe(0);
    const payload = JSON.parse(io.stdoutBuf.trim());
    expect(payload.hookSpecificOutput.hookEventName).toBe("PreToolUse");
    expect(payload.hookSpecificOutput.permissionDecision).toBe("deny");
    expect(payload.hookSpecificOutput.permissionDecisionReason).toContain("stdin timeout");
    expect(payload.hookSpecificOutput.permissionDecisionReason).toContain("preserve lifecycle gate");
  });

  it("Stop: timeout → fail-closed block (exit 2, stderr has timeout reason)", async () => {
    const code = await hookCommand({ event: "Stop", readTimeoutMs: 30 });
    expect(code).toBe(2);
    expect(io.stdoutBuf).toBe("");
    expect(io.stderrBuf).toContain("stdin timeout");
    expect(io.stderrBuf).toContain("force iteration");
  });

  it("UserPromptExpansion: timeout → fail-open (exit 0, stderr warning, no decision JSON)", async () => {
    const code = await hookCommand({ event: "UserPromptExpansion", readTimeoutMs: 30 });
    expect(code).toBe(0);
    expect(io.stdoutBuf).toBe("");
    expect(io.stderrBuf).toContain("[rubrix] hook UserPromptExpansion stdin timeout");
    expect(io.stderrBuf).toContain("proceeding without contract context");
  });

  it.each([
    "SessionStart" as const,
    "PostToolUse" as const,
    "PostToolBatch" as const,
    "SubagentStop" as const,
  ])("informational hook %s: timeout → fail-open (exit 0, stderr warning)", async (event) => {
    const code = await hookCommand({ event, readTimeoutMs: 30 });
    expect(code).toBe(0);
    expect(io.stdoutBuf).toBe("");
    expect(io.stderrBuf).toContain(`[rubrix] hook ${event} stdin timeout`);
    expect(io.stderrBuf).toContain("proceeding without contract context");
  });
});
