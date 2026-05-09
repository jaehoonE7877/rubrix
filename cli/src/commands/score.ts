import { ContractError, loadContract, saveContract, type CascadeStageEntry, type EvaluationPolicy, type RubrixContract } from "../core/contract.ts";
import {
  clearBudgetOverrunMarker,
  makeBudgetState,
  runCascade,
  type CascadeInternalRecord,
  type CascadeOptions,
  type ConsensusInternal,
  type ConsensusPanelFn,
  type MechanicalCheckerFn,
  type SemanticJudgeFn,
} from "../core/cascade.ts";
import { isV13Plus } from "../core/version.ts";

export interface ScoreOptions {
  path: string;
  stage?: number;
  explain?: string;
  approveExpensive?: boolean;
  cascadeOptions?: CascadeOptions;
}

export function scoreCommand(opts: ScoreOptions): number {
  try {
    if (opts.approveExpensive) {
      clearBudgetOverrunMarker();
    }
    const c = loadContract(opts.path);
    if (!c.rubric) {
      process.stderr.write(`rubrix score: rubric is missing on ${opts.path}; cannot score\n`);
      return 3;
    }
    const policy = resolvePolicy(c);
    if (policy === null) {
      process.stderr.write(
        `rubrix score: contract version ${c.version} requires evaluation_policy at top level (v1.3+ only); add evaluation_policy or downgrade contract version below 1.3.0\n`,
      );
      return 3;
    }

    const newScores: NonNullable<RubrixContract["scores"]> = [];
    let passed = 0;
    let skipped = 0;
    let blockers = 0;

    const sharedBudget = opts.cascadeOptions?.budgetState ?? makeBudgetState();
    const userSink = opts.cascadeOptions?.recordSink;

    for (const criterion of c.rubric.criteria) {
      let record: CascadeInternalRecord | undefined;
      const cascadeOpts: CascadeOptions = {
        ...(opts.cascadeOptions ?? {}),
        budgetState: sharedBudget,
        recordSink: (r) => {
          record = r;
          userSink?.(r);
        },
      };

      const caller = runCascade(
        {
          id: criterion.id,
          description: criterion.description,
          weight: criterion.weight,
          floor: criterion.floor,
          axis: criterion.axis,
          verify: criterion.verify,
        },
        policy,
        c,
        cascadeOpts,
      );
      if (!record) {
        throw new Error(`internal: cascade did not emit a record for criterion ${criterion.id}`);
      }
      const evaluators = inferEvaluators(record.stage_history);
      newScores.push({
        criterion: criterion.id,
        score: caller.score,
        evaluators,
        stage_history: record.stage_history,
        confidence: undefined,
      });
      if (record.skipped_stage3_due_to_budget) skipped += 1;
      if (caller.score < (criterion.floor ?? 0)) blockers += 1;
      else if (!record.skipped_stage3_due_to_budget) passed += 1;
    }

    c.scores = newScores;
    if (c.state === "PlanLocked" || c.state === "Scoring") {
      c.state = "Scoring";
    }
    saveContract(opts.path, c);

    process.stdout.write(`passed=${passed} skipped=${skipped} blockers=${blockers}\n`);
    if (skipped > 0 || blockers > 0) {
      process.stderr.write(`use --explain <id> for details\n`);
    }
    return 0;
  } catch (e) {
    process.stderr.write((e instanceof Error ? e.message : String(e)) + "\n");
    return e instanceof ContractError ? 2 : 1;
  }
}

function resolvePolicy(c: RubrixContract): EvaluationPolicy | null {
  if (c.evaluation_policy) return c.evaluation_policy;
  if (isV13Plus({ version: c.version })) {
    return null;
  }
  return {
    source: "cli-default",
    locked_at: new Date(0).toISOString(),
    approved_by: "rubrix-cli-default",
    derived_from_brief_hash: "0".repeat(64),
    stage1_required: true,
    stage3_threshold: 0.7,
    stage3_axes: ["security", "correctness"],
    max_stage3_criteria: 5,
    max_frontier_votes: 3,
    estimated_cost_ceiling: 0,
    frontier_models: ["claude-opus-4-7", "claude-sonnet-4-6", "claude-sonnet-4-6"],
  };
}

function inferEvaluators(stage_history: CascadeStageEntry[]) {
  const seen = new Set<string>();
  const out: Array<{ evaluator_id: string; stage: 1 | 2 | 3 }> = [];
  for (const entry of stage_history) {
    const id =
      entry.stage === 1 ? "mechanical-checker" : entry.stage === 2 ? "semantic-judge" : "consensus-panel";
    const key = `${id}:${entry.stage}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ evaluator_id: id, stage: entry.stage });
  }
  return out;
}

export type {
  CascadeOptions,
  ConsensusInternal,
  ConsensusPanelFn,
  MechanicalCheckerFn,
  SemanticJudgeFn,
};
