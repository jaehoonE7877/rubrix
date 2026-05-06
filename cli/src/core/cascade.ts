import { createHash } from "node:crypto";
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
}

export interface BudgetState {
  stage3_used: number;
}

export function makeBudgetState(): BudgetState {
  return { stage3_used: 0 };
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

const DEFAULT_CONSENSUS: ConsensusPanelFn = (criterion, _contract, stage2) => {
  const median = stage2.score;
  const hash = rationaleHashFor(
    criterion,
    { pass: false, confidence: 0, matched_anchors: [] },
    stage2,
    { score: median, rationale_hash: "deferred", dissent_flag: false },
  );
  return {
    score: median,
    rationale_hash: hash,
    dissent_flag: false,
    individual_entries: [
      {
        stage: 3,
        score: median,
        self_reported_confidence: 0.5,
        model: "claude-opus-4-7",
        model_version: "claude-opus-4-7-default-stub",
        prompt_version: PROMPT_CONSENSUS,
      },
    ],
  };
};

export function runCascade(
  criterion: CascadeCriterion,
  policy: EvaluationPolicy,
  contract: RubrixContract,
  options: CascadeOptions = {},
): { caller: CascadeReturn; record: CascadeInternalRecord } {
  const mech = options.mechanicalChecker ?? DEFAULT_MECHANICAL;
  const sem = options.semanticJudge ?? DEFAULT_SEMANTIC;
  const con = options.consensusPanel ?? DEFAULT_CONSENSUS;
  const budget = options.budgetState ?? makeBudgetState();

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
    return {
      caller,
      record: { ...caller, stage_history, triggered_stage3: false, skipped_stage3_due_to_budget: false },
    };
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
    return {
      caller,
      record: { ...caller, stage_history, triggered_stage3: false, skipped_stage3_due_to_budget: false },
    };
  }

  if (budget.stage3_used >= policy.max_stage3_criteria) {
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
    return {
      caller,
      record: { ...caller, stage_history, triggered_stage3: false, skipped_stage3_due_to_budget: true },
    };
  }

  budget.stage3_used += 1;
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
  return {
    caller,
    record: { ...caller, stage_history, triggered_stage3: true, skipped_stage3_due_to_budget: false },
  };
}
