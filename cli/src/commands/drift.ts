import { ContractError, loadContract } from "../core/contract.ts";
import { isV14Plus } from "../core/version.ts";

export interface DriftOptions {
  path: string;
  json?: boolean;
}

export function driftCommand(opts: DriftOptions): number {
  try {
    const c = loadContract(opts.path);
    if (!isV14Plus(c)) {
      process.stderr.write(
        `rubrix drift requires a v1.4+ contract (this contract has version=${c.version}); v1.0~v1.3 contracts have no drift_policy and the gate is fail-open.\n`,
      );
      return 2;
    }
    if (opts.json) {
      process.stdout.write(
        JSON.stringify({ status: "stub", version: c.version, state: c.state, drift_policy: c.drift_policy ?? null }) + "\n",
      );
    } else {
      process.stdout.write(
        `drift command stub (PR #2 wires computeDriftScore): version=${c.version} state=${c.state} scorer=${c.drift_policy?.scorer_version ?? "<unset>"} threshold=${c.drift_policy?.threshold ?? "<unset>"}\n`,
      );
    }
    return 0;
  } catch (e) {
    process.stderr.write((e instanceof Error ? e.message : String(e)) + "\n");
    return e instanceof ContractError ? 2 : 1;
  }
}
