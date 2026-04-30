import {
  ContractError,
  formatError,
  loadContract,
  saveContract,
  validateContract,
  type RubrixContract,
} from "../core/contract.ts";
import type { State } from "../core/state.ts";
import { resolveAxisDepth } from "../core/brief.ts";
import { checkClarityInvariants } from "../core/clarity-gate.ts";

export interface GateOptions {
  path: string;
  json?: boolean;
  apply?: boolean;
  env?: NodeJS.ProcessEnv;
}

export interface GateCriterionResult {
  id: string;
  weight: number;
  floor?: number;
  effectiveFloor?: number;
  axis?: string;
  axisDepth?: string;
  score?: number;
  status: "missing" | "below_floor" | "ok";
}

export interface GateOutcome {
  decision: "pass" | "fail";
  total: number;
  threshold: number;
  perCriterion: GateCriterionResult[];
  reasons: string[];
}

const DEEP_FLOOR = 0.7;

export function evaluateGate(c: RubrixContract, env: NodeJS.ProcessEnv = process.env): GateOutcome {
  if (!c.rubric) {
    return { decision: "fail", total: 0, threshold: 0, perCriterion: [], reasons: ["rubric missing"] };
  }
  const axisDepth = resolveAxisDepth(c, env);
  const scoresByCriterion = new Map<string, number>();
  for (const s of c.scores ?? []) {
    const prev = scoresByCriterion.get(s.criterion);
    if (prev === undefined || s.score < prev) {
      scoresByCriterion.set(s.criterion, s.score);
    }
  }
  const perCriterion: GateCriterionResult[] = [];
  const reasons: string[] = [];
  let total = 0;
  let totalWeight = 0;
  for (const crit of c.rubric.criteria) {
    const score = scoresByCriterion.get(crit.id);
    const resolvedDepth = crit.axis ? axisDepth[crit.axis] : undefined;
    const isDeep = resolvedDepth === "deep";
    const baseFloor = crit.floor;
    const effectiveFloor = isDeep ? Math.max(baseFloor ?? 0, DEEP_FLOOR) : baseFloor;
    let status: GateCriterionResult["status"] = "ok";
    if (score === undefined) {
      status = "missing";
      reasons.push(`criterion ${crit.id}: no score`);
    } else if (typeof effectiveFloor === "number" && score < effectiveFloor) {
      status = "below_floor";
      const tag = isDeep && (baseFloor === undefined || baseFloor < DEEP_FLOOR)
        ? `deep-axis effective floor ${effectiveFloor} (axis=${crit.axis})`
        : `floor ${effectiveFloor}`;
      reasons.push(`criterion ${crit.id}: score ${score} below ${tag}`);
    }
    if (score !== undefined) {
      total += crit.weight * score;
    }
    totalWeight += crit.weight;
    perCriterion.push({
      id: crit.id,
      weight: crit.weight,
      ...(baseFloor !== undefined ? { floor: baseFloor } : {}),
      ...(effectiveFloor !== undefined ? { effectiveFloor } : {}),
      ...(crit.axis ? { axis: crit.axis } : {}),
      ...(resolvedDepth ? { axisDepth: resolvedDepth } : {}),
      ...(score !== undefined ? { score } : {}),
      status,
    });
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
    const clarity = checkClarityInvariants(c);
    if (!clarity.ok) {
      process.stderr.write(
        `gate refuses to trust locks: v1.2 clarity invariant breached:\n${clarity.errors.join("\n")}\n`,
      );
      return 2;
    }
    const result = evaluateGate(c, opts.env);
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
