import {
  ContractError,
  formatError,
  loadContract,
  saveContract,
  validateContract,
  type RubrixContract,
} from "../core/contract.ts";
import type { State } from "../core/state.ts";

export interface GateOptions {
  path: string;
  json?: boolean;
  apply?: boolean;
}

export interface GateOutcome {
  decision: "pass" | "fail";
  total: number;
  threshold: number;
  perCriterion: Array<{ id: string; weight: number; floor?: number; score?: number; status: "missing" | "below_floor" | "ok" }>;
  reasons: string[];
}

export function evaluateGate(c: RubrixContract): GateOutcome {
  if (!c.rubric) {
    return { decision: "fail", total: 0, threshold: 0, perCriterion: [], reasons: ["rubric missing"] };
  }
  const scoresByCriterion = new Map<string, number>();
  for (const s of c.scores ?? []) {
    const prev = scoresByCriterion.get(s.criterion);
    if (prev === undefined || s.score < prev) {
      scoresByCriterion.set(s.criterion, s.score);
    }
  }
  const perCriterion: GateOutcome["perCriterion"] = [];
  const reasons: string[] = [];
  let total = 0;
  let totalWeight = 0;
  for (const crit of c.rubric.criteria) {
    const score = scoresByCriterion.get(crit.id);
    let status: "missing" | "below_floor" | "ok" = "ok";
    if (score === undefined) {
      status = "missing";
      reasons.push(`criterion ${crit.id}: no score`);
    } else if (typeof crit.floor === "number" && score < crit.floor) {
      status = "below_floor";
      reasons.push(`criterion ${crit.id}: score ${score} below floor ${crit.floor}`);
    }
    if (score !== undefined) {
      total += crit.weight * score;
    }
    totalWeight += crit.weight;
    perCriterion.push({ id: crit.id, weight: crit.weight, floor: crit.floor, score, status });
  }
  const normalized = totalWeight > 0 ? total / totalWeight : 0;
  if (normalized < c.rubric.threshold) {
    reasons.push(`total ${normalized.toFixed(3)} below threshold ${c.rubric.threshold}`);
  }
  const decision: GateOutcome["decision"] = reasons.length === 0 ? "pass" : "fail";
  return { decision, total: normalized, threshold: c.rubric.threshold, perCriterion, reasons };
}

export function gateCommand(opts: GateOptions): number {
  try {
    const c = loadContract(opts.path);
    if (c.state !== "Scoring" && c.state !== "Passed" && c.state !== "Failed") {
      process.stderr.write(`gate refuses to run: state is ${c.state}, expected Scoring|Passed|Failed\n`);
      return 3;
    }
    const result = evaluateGate(c);
    if (opts.apply && c.state === "Scoring") {
      const next: State = result.decision === "pass" ? "Passed" : "Failed";
      const candidate: RubrixContract = { ...c, state: next };
      const v = validateContract(candidate);
      if (v.ok) {
        saveContract(opts.path, candidate);
      } else {
        process.stderr.write(
          `gate decision ${result.decision}: refusing to persist ${next}; contract is incomplete:\n` +
            v.errors.map(formatError).join("\n") + "\n",
        );
      }
    }
    if (opts.json) {
      process.stdout.write(JSON.stringify(result, null, 2) + "\n");
    } else {
      process.stdout.write(`${result.decision.toUpperCase()} total=${result.total.toFixed(3)} threshold=${result.threshold}\n`);
      for (const r of result.reasons) process.stdout.write(`  - ${r}\n`);
    }
    return result.decision === "pass" ? 0 : 4;
  } catch (e) {
    process.stderr.write((e instanceof Error ? e.message : String(e)) + "\n");
    return e instanceof ContractError ? 2 : 1;
  }
}
