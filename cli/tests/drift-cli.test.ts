import { describe, expect, it, vi, afterEach, beforeEach } from "vitest";
import { driftCommand } from "../src/commands/drift.ts";
import { tempContractFile, baseV14Passed, baseV12Drafted, stampDerivedHashes } from "./helpers.ts";

describe("rubrix drift (v1.4 PR #2 — real logic)", () => {
  let stdout: string[];
  let stderr: string[];

  beforeEach(() => {
    stdout = [];
    stderr = [];
    vi.spyOn(process.stdout, "write").mockImplementation(((chunk: string | Uint8Array) => {
      stdout.push(typeof chunk === "string" ? chunk : chunk.toString());
      return true;
    }) as typeof process.stdout.write);
    vi.spyOn(process.stderr, "write").mockImplementation(((chunk: string | Uint8Array) => {
      stderr.push(typeof chunk === "string" ? chunk : chunk.toString());
      return true;
    }) as typeof process.stderr.write);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("v1.4 baseline contract returns 0 and prints status=ok", () => {
    const path = tempContractFile(stampDerivedHashes(baseV14Passed()));
    const code = driftCommand({ path });
    expect(code).toBe(0);
    const out = stdout.join("");
    expect(out).toMatch(/drift_score=0\.000/);
    expect(out).toMatch(/scorer=drift-scorer\/1\.0/);
    expect(out).toMatch(/status=ok/);
    expect(out).toMatch(/brief: delta=0\.000/);
    expect(out).toMatch(/policy: delta=0\.000/);
    expect(out).toMatch(/stage_history: delta=0\.000/);
  });

  it("--json emits structured drift result with status=ok", () => {
    const path = tempContractFile(stampDerivedHashes(baseV14Passed()));
    const code = driftCommand({ path, json: true });
    expect(code).toBe(0);
    const payload = JSON.parse(stdout.join("").trim());
    expect(payload.status).toBe("ok");
    expect(payload.scorer_version).toBe("drift-scorer/1.0");
    expect(payload.factors).toHaveLength(3);
    expect(payload.score).toBe(0);
    expect(payload.accepted).toBe(false);
  });

  it("brief change → drift > threshold → status=soft-deny (still exits 0; CLI is read-only)", () => {
    const c = stampDerivedHashes(baseV14Passed());
    c.intent.brief!.ambition = "demo";
    const path = tempContractFile(c);
    const code = driftCommand({ path, json: true });
    expect(code).toBe(0);
    const payload = JSON.parse(stdout.join("").trim());
    expect(payload.status).toBe("soft-deny");
    expect(payload.score).toBeCloseTo(0.4, 5);
  });

  it("brief + policy + stage_history all drift → drift > hard_threshold → status=hard-deny", () => {
    const c = stampDerivedHashes(baseV14Passed());
    c.intent.brief!.ambition = "demo";
    c.evaluation_policy!.estimated_cost_ceiling = 99;
    c.evaluation_policy!.frontier_models = ["different-model"];
    const path = tempContractFile(c);
    const code = driftCommand({ path, json: true });
    expect(code).toBe(0);
    const payload = JSON.parse(stdout.join("").trim());
    expect(payload.status).toBe("hard-deny");
    expect(payload.score).toBe(1.0);
  });

  it("accepted_drift_history matching evidence_hash → status=accepted", () => {
    const c = stampDerivedHashes(baseV14Passed());
    c.intent.brief!.ambition = "demo";
    const probe = JSON.parse(JSON.stringify(c));
    const driftCmd = driftCommand;
    const probePath = tempContractFile(probe);
    driftCmd({ path: probePath, json: true });
    const probePayload = JSON.parse(stdout.join("").trim());
    stdout.length = 0;
    c.accepted_drift_history = [
      {
        artifact: "plan",
        drift_score: probePayload.score,
        accepted_at: "2026-05-10T00:00:00.000Z",
        reason: "manual policy refresh",
        scorer_version: "drift-scorer/1.0",
        evidence_hash: probePayload.evidence_hash,
      },
    ];
    const path = tempContractFile(c);
    const code = driftCommand({ path, json: true });
    expect(code).toBe(0);
    const payload = JSON.parse(stdout.join("").trim());
    expect(payload.status).toBe("accepted");
    expect(payload.accepted).toBe(true);
  });

  it("v1.3 contract is rejected (drift gate is fail-open below v1.4)", () => {
    const c = stampDerivedHashes(baseV14Passed());
    c.version = "1.3.0";
    delete c.evaluation_policy!.derived_from_policy_hash;
    delete (c as unknown as Record<string, unknown>).drift_policy;
    const path = tempContractFile(c);
    const code = driftCommand({ path });
    expect(code).toBe(2);
    expect(stderr.join("")).toMatch(/v1\.4\+ contract/);
  });

  it("v1.2 contract is rejected", () => {
    const c = baseV12Drafted();
    const path = tempContractFile(c);
    const code = driftCommand({ path });
    expect(code).toBe(2);
  });

  it("nonexistent file returns non-zero", () => {
    const code = driftCommand({ path: "/tmp/__rubrix-no-such__.json" });
    expect(code).not.toBe(0);
  });

  it("plain text output includes threshold + hard_threshold + accepted line", () => {
    const path = tempContractFile(stampDerivedHashes(baseV14Passed()));
    const code = driftCommand({ path });
    expect(code).toBe(0);
    const out = stdout.join("");
    expect(out).toMatch(/threshold=0\.3/);
    expect(out).toMatch(/hard_threshold=0\.5/);
    expect(out).toMatch(/accepted=false/);
  });

  it("scorer_version mismatch is rejected (codex P2 #8)", () => {
    const c = stampDerivedHashes(baseV14Passed());
    c.drift_policy!.scorer_version = "drift-scorer/2.0";
    const path = tempContractFile(c);
    const code = driftCommand({ path });
    expect(code).toBe(2);
    expect(stderr.join("")).toMatch(/scorer_version mismatch/);
  });
});
