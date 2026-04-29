import { loadContract, saveContract, ContractError } from "../core/contract.ts";
import { canTransition, isState, type State } from "../core/state.ts";

export interface StateGetOptions {
  path: string;
  json?: boolean;
}

export interface StateSetOptions extends StateGetOptions {
  to: string;
}

export function stateGetCommand(opts: StateGetOptions): number {
  try {
    const c = loadContract(opts.path);
    if (opts.json) {
      process.stdout.write(JSON.stringify({ state: c.state, locks: c.locks }, null, 2) + "\n");
    } else {
      process.stdout.write(`${c.state}\n`);
    }
    return 0;
  } catch (e) {
    process.stderr.write(formatErr(e));
    return e instanceof ContractError ? 2 : 1;
  }
}

export function stateSetCommand(opts: StateSetOptions): number {
  try {
    const c = loadContract(opts.path);
    if (!isState(opts.to)) {
      process.stderr.write(`unknown state: ${opts.to}\n`);
      return 2;
    }
    const target: State = opts.to;
    if (c.state === target) {
      process.stdout.write(`${target} (no-op)\n`);
      return 0;
    }
    if (!canTransition(c.state, target)) {
      process.stderr.write(`refusing transition ${c.state} -> ${target}\n`);
      return 3;
    }
    const wasFailed = c.state === "Failed";
    c.state = target;
    if (target === "PlanDrafted" && c.locks.plan) {
      c.locks.plan = false;
    }
    if (wasFailed && target === "PlanDrafted" && c.scores && c.scores.length > 0) {
      delete c.scores;
    }
    saveContract(opts.path, c);
    process.stdout.write(`${target}\n`);
    return 0;
  } catch (e) {
    process.stderr.write(formatErr(e));
    return e instanceof ContractError ? 2 : 1;
  }
}

function formatErr(e: unknown): string {
  return (e instanceof Error ? e.message : String(e)) + "\n";
}
