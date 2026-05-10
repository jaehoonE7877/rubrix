import { createHash } from "node:crypto";
import { existsSync, mkdirSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type {
  CascadeStageEntry,
  EvaluationPolicy,
  RubrixContract,
} from "./contract.ts";

export interface CascadeCriterion {
  id: string;
  description: string;
  weight: number;
  floor?: number;
  axis?: string;
  verify?: string;
}

export interface MechanicalResult {
  pass: boolean;
  confidence: 0 | 1;
  matched_anchors: string[];
  conflict_signal?: boolean;
}

export interface SemanticResult {
  evaluator: "semantic-judge";
  criterion: string;
  verdict: "pass" | "fail" | "needs_more_evidence";
  score: number;
  confidence: number;
  self_reported_confidence: number;
  rationale: string;
  evidence: string[];
  evidence_conflict?: boolean;
}

export interface ConsensusReturn {
  score: number;
  rationale_hash: string;
  dissent_flag: boolean;
}

export interface ConsensusInternal extends ConsensusReturn {
  individual_entries: CascadeStageEntry[];
}

export type MechanicalCheckerFn = (
  criterion: CascadeCriterion,
  contract: RubrixContract,
) => MechanicalResult;

export type SemanticJudgeFn = (
  criterion: CascadeCriterion,
  contract: RubrixContract,
  stage1: MechanicalResult,
) => SemanticResult;

export type ConsensusPanelFn = (
  criterion: CascadeCriterion,
  contract: RubrixContract,
  stage2: SemanticResult,
  policy: EvaluationPolicy,
) => ConsensusInternal;

export interface CascadeOptions {
  mechanicalChecker?: MechanicalCheckerFn;
  semanticJudge?: SemanticJudgeFn;
  consensusPanel?: ConsensusPanelFn;
  budgetState?: BudgetState;
  recordSink?: (record: CascadeInternalRecord) => void;
}

export interface BudgetState {
  stage3_used: number;
  cumulative_cost: number;
  over_budget?: boolean;
  approve_expensive?: boolean;
}

export function makeBudgetState(): BudgetState {
  return { stage3_used: 0, cumulative_cost: 0, over_budget: false };
}

function estimatePerStage3Cost(policy: EvaluationPolicy): number {
  if (policy.max_stage3_criteria <= 0) return 0;
  return policy.estimated_cost_ceiling / policy.max_stage3_criteria;
}

function isOverBudget(budget: BudgetState, policy: EvaluationPolicy): boolean {
  if (budget.stage3_used >= policy.max_stage3_criteria) return true;
  if (budget.cumulative_cost >= policy.estimated_cost_ceiling) return true;
  return false;
}

const BUDGET_OVERRUN_ENV = "RUBRIX_BUDGET_OVERRUN";
const BUDGET_OVERRUN_RELATIVE_PATH = ".rubrix/budget-overrun.flag";

function budgetOverrunMarkerPath(rootOverride?: string): string {
  const root = rootOverride ?? process.env.RUBRIX_RUNTIME_ROOT ?? process.cwd();
  return join(root, BUDGET_OVERRUN_RELATIVE_PATH);
}

export function emitBudgetOverrunMarker(rootOverride?: string): void {
  process.env[BUDGET_OVERRUN_ENV] = "1";
  const markerPath = budgetOverrunMarkerPath(rootOverride);
  try {
    mkdirSync(dirname(markerPath), { recursive: true });
    writeFileSync(markerPath, String(Date.now()));
  } catch {}
}

export function clearBudgetOverrunMarker(rootOverride?: string): void {
  delete process.env[BUDGET_OVERRUN_ENV];
  const markerPath = budgetOverrunMarkerPath(rootOverride);
  try {
    if (existsSync(markerPath)) unlinkSync(markerPath);
  } catch {}
}

export function isBudgetOverrunMarkerSet(rootOverride?: string): boolean {
  if (process.env[BUDGET_OVERRUN_ENV] === "1") return true;
  return existsSync(budgetOverrunMarkerPath(rootOverride));
}

function recordBudgetOverrun(budget: BudgetState): void {
  budget.over_budget = true;
  if (!budget.approve_expensive) {
    emitBudgetOverrunMarker();
  }
}

export interface CascadeReturn {
  score: number;
  rationale_hash: string;
  dissent_flag: boolean;
}

export interface CascadeInternalRecord extends CascadeReturn {
  stage_history: CascadeStageEntry[];
  triggered_stage3: boolean;
  skipped_stage3_due_to_budget: boolean;
}

const PROMPT_MECHANICAL = "mechanical-checker/1.0";
const PROMPT_SEMANTIC = "semantic-judge/1.0";
const PROMPT_CONSENSUS = "consensus-panel/1.0";

export function isStage3Triggered(
  criterion: CascadeCriterion,
  stage1: MechanicalResult,
  stage2: SemanticResult,
  policy: EvaluationPolicy,
  contract: RubrixContract,
): boolean {
  const axisDepth = criterion.axis ? contract.intent.brief?.axis_depth?.[criterion.axis as keyof NonNullable<typeof contract.intent.brief>["axis_depth"]] : undefined;
  if (allLight(contract)) return false;
  const triggers: boolean[] = [];
  triggers.push(
    stage2.self_reported_confidence < policy.stage3_threshold &&
      stage1.confidence === 0,
  );
  triggers.push(
    criterion.axis !== undefined &&
      policy.stage3_axes.includes(criterion.axis) &&
      axisDepth === "deep",
  );
  triggers.push(stage1.conflict_signal === true);
  triggers.push(stage2.evidence_conflict === true);
  return triggers.some(Boolean);
}

function allLight(contract: RubrixContract): boolean {
  const ad = contract.intent.brief?.axis_depth;
  if (!ad) return false;
  const axes = ["security", "data", "correctness", "ux", "perf"] as const;
  return axes.every((a) => ad[a] === "light");
}

function rationaleHashFor(
  criterion: CascadeCriterion,
  stage1: MechanicalResult,
  stage2: SemanticResult,
  consensus?: ConsensusReturn,
): string {
  const payload = canonicalize({
    criterion_id: criterion.id,
    stage1_pass: stage1.pass,
    stage1_confidence: stage1.confidence,
    stage1_anchors: [...stage1.matched_anchors].sort(),
    stage2_verdict: stage2.verdict,
    stage2_score: stage2.score,
    stage2_evidence: [...stage2.evidence].sort(),
    consensus_score: consensus?.score,
    consensus_dissent: consensus?.dissent_flag,
  });
  return createHash("sha256").update(payload).digest("hex");
}

function canonicalize(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return "[" + value.map(canonicalize).join(",") + "]";
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => JSON.stringify(k) + ":" + canonicalize(v));
  return "{" + entries.join(",") + "}";
}

const DEFAULT_MECHANICAL: MechanicalCheckerFn = (criterion) => ({
  pass: false,
  confidence: 0,
  matched_anchors: criterion.verify ? [criterion.verify] : [],
});

const DEFAULT_SEMANTIC: SemanticJudgeFn = (criterion) => ({
  evaluator: "semantic-judge",
  criterion: criterion.id,
  verdict: "needs_more_evidence",
  score: 0,
  confidence: 0,
  self_reported_confidence: 0,
  rationale: "default semantic-judge stub: real implementation requires model invocation; PR #2 default returns needs_more_evidence to keep tests deterministic without a live model",
  evidence: [],
});

const DEFAULT_CONSENSUS: ConsensusPanelFn = (criterion, _contract, stage2, policy) => {
  const median = stage2.score;
  const hash = rationaleHashFor(
    criterion,
    { pass: false, confidence: 0, matched_anchors: [] },
    stage2,
    { score: median, rationale_hash: "deferred", dissent_flag: false },
  );
  const ensemble = policy.frontier_models.length > 0
    ? policy.frontier_models
    : ["claude-opus-4-7", "claude-sonnet-4-6", "claude-sonnet-4-6"];
  const individual_entries = ensemble.map((model) => ({
    stage: 3 as const,
    score: median,
    self_reported_confidence: 0.5,
    model,
    model_version: `${model}-default-stub`,
    prompt_version: PROMPT_CONSENSUS,
  }));
  return {
    score: median,
    rationale_hash: hash,
    dissent_flag: false,
    individual_entries,
  };
};

export function runCascade(
  criterion: CascadeCriterion,
  policy: EvaluationPolicy,
  contract: RubrixContract,
  options: CascadeOptions = {},
): CascadeReturn {
  const mech = options.mechanicalChecker ?? DEFAULT_MECHANICAL;
  const sem = options.semanticJudge ?? DEFAULT_SEMANTIC;
  const con = options.consensusPanel ?? DEFAULT_CONSENSUS;
  const budget = options.budgetState ?? makeBudgetState();
  const sink = options.recordSink;

  const stage_history: CascadeStageEntry[] = [];

  const stage1Start = Date.now();
  const stage1 = mech(criterion, contract);
  stage_history.push({
    stage: 1,
    score: stage1.pass ? 1 : 0,
    self_reported_confidence: stage1.confidence,
    model: "deterministic",
    model_version: "mechanical-checker/1.0",
    prompt_version: PROMPT_MECHANICAL,
    latency_ms: Date.now() - stage1Start,
  });

  if (stage1.confidence === 1) {
    const score = stage1.pass ? 1 : 0;
    const hash = rationaleHashFor(criterion, stage1, {
      evaluator: "semantic-judge",
      criterion: criterion.id,
      verdict: stage1.pass ? "pass" : "fail",
      score,
      confidence: 1,
      self_reported_confidence: 1,
      rationale: "stage1-shortcircuit",
      evidence: [],
    });
    const caller: CascadeReturn = { score, rationale_hash: hash, dissent_flag: false };
    sink?.({ ...caller, stage_history, triggered_stage3: false, skipped_stage3_due_to_budget: false });
    return caller;
  }

  const stage2Start = Date.now();
  const stage2 = sem(criterion, contract, stage1);
  stage_history.push({
    stage: 2,
    score: stage2.score,
    self_reported_confidence: stage2.self_reported_confidence,
    model: "claude-sonnet-4-6",
    model_version: "claude-sonnet-4-6-stub",
    prompt_version: PROMPT_SEMANTIC,
    latency_ms: Date.now() - stage2Start,
  });

  const wantsStage3 = isStage3Triggered(criterion, stage1, stage2, policy, contract);
  if (!wantsStage3) {
    const hash = rationaleHashFor(criterion, stage1, stage2);
    const caller: CascadeReturn = {
      score: stage2.score,
      rationale_hash: hash,
      dissent_flag: false,
    };
    sink?.({ ...caller, stage_history, triggered_stage3: false, skipped_stage3_due_to_budget: false });
    return caller;
  }

  const fanout = Math.max(policy.frontier_models.length, 1);
  const projectedAddition = estimatePerStage3Cost(policy) * fanout;
  const projectedCost = budget.cumulative_cost + projectedAddition;
  const wouldExceedCeiling = projectedCost > policy.estimated_cost_ceiling;
  if (isOverBudget(budget, policy) || wouldExceedCeiling) {
    recordBudgetOverrun(budget);
    stage_history.push({
      stage: 2,
      score: stage2.score,
      self_reported_confidence: stage2.self_reported_confidence,
      model: "claude-sonnet-4-6",
      model_version: "claude-sonnet-4-6-stub",
      prompt_version: PROMPT_SEMANTIC,
      reason: "budget",
    });
    const hash = rationaleHashFor(criterion, stage1, stage2);
    const caller: CascadeReturn = {
      score: stage2.score,
      rationale_hash: hash,
      dissent_flag: false,
    };
    sink?.({ ...caller, stage_history, triggered_stage3: false, skipped_stage3_due_to_budget: true });
    return caller;
  }

  budget.stage3_used += 1;
  budget.cumulative_cost = projectedCost;
  if (isOverBudget(budget, policy)) {
    recordBudgetOverrun(budget);
  }
  const stage3Start = Date.now();
  const stage3 = con(criterion, contract, stage2, policy);
  for (const entry of stage3.individual_entries) {
    stage_history.push({ ...entry, latency_ms: entry.latency_ms ?? Date.now() - stage3Start });
  }
  const caller: CascadeReturn = {
    score: stage3.score,
    rationale_hash: stage3.rationale_hash,
    dissent_flag: stage3.dissent_flag,
  };
  sink?.({ ...caller, stage_history, triggered_stage3: true, skipped_stage3_due_to_budget: false });
  return caller;
}
