import {
  runCascade as runCascadeApi,
  type CascadeCriterion,
  type CascadeInternalRecord,
  type CascadeOptions,
  type CascadeReturn,
  type ConsensusInternal,
  type MechanicalResult,
  type SemanticResult,
} from "../src/core/cascade.ts";
import type { EvaluationPolicy, RubrixContract } from "../src/core/contract.ts";

export function runCascadeForTest(
  criterion: CascadeCriterion,
  policy: EvaluationPolicy,
  contract: RubrixContract,
  options: CascadeOptions = {},
): { caller: CascadeReturn; record: CascadeInternalRecord } {
  let captured: CascadeInternalRecord | undefined;
  const userSink = options.recordSink;
  const caller = runCascadeApi(criterion, policy, contract, {
    ...options,
    recordSink: (r) => {
      captured = r;
      userSink?.(r);
    },
  });
  if (!captured) throw new Error("runCascadeForTest: cascade did not emit a record");
  return { caller, record: captured };
}

export function defaultPolicy(overrides: Partial<EvaluationPolicy> = {}): EvaluationPolicy {
  return {
    source: "cli-default",
    locked_at: "2026-05-06T00:00:00.000Z",
    approved_by: "test",
    derived_from_brief_hash: "a".repeat(64),
    stage1_required: true,
    stage3_threshold: 0.7,
    stage3_axes: ["security", "correctness"],
    max_stage3_criteria: 5,
    max_frontier_votes: 3,
    estimated_cost_ceiling: 1000.0,
    frontier_models: ["claude-opus-4-7", "claude-sonnet-4-6", "claude-sonnet-4-6"],
    ...overrides,
  };
}

export function deepBriefContract(overrides: Partial<RubrixContract["intent"]["brief"]> = {}): RubrixContract {
  return {
    version: "1.3.0",
    intent: {
      summary: "test",
      brief: {
        calibrated: true,
        project_type: "brownfield_feature",
        situation: "internal_tool",
        ambition: "production",
        axis_depth: { security: "deep", correctness: "deep", data: "standard", ux: "standard", perf: "standard" },
        ...overrides,
      },
    },
    rubric: { threshold: 0.5, criteria: [{ id: "c1", description: "d", weight: 1, axis: "security" }] },
    state: "PlanLocked",
    locks: { rubric: true, matrix: true, plan: true },
  };
}

export function lightBriefContract(): RubrixContract {
  return {
    version: "1.3.0",
    intent: {
      summary: "test",
      brief: {
        calibrated: true,
        project_type: "doc",
        situation: "internal_tool",
        ambition: "demo",
        axis_depth: { security: "light", correctness: "light", data: "light", ux: "light", perf: "light" },
      },
    },
    rubric: { threshold: 0.5, criteria: [{ id: "c1", description: "d", weight: 1 }] },
    state: "PlanLocked",
    locks: { rubric: true, matrix: true, plan: true },
  };
}

export function makeCriterion(overrides: Partial<CascadeCriterion> = {}): CascadeCriterion {
  return {
    id: "c1",
    description: "test criterion",
    weight: 1,
    floor: 0.5,
    axis: "security",
    verify: "echo ok",
    ...overrides,
  };
}

export interface RecordingStubs {
  mechCalls: number;
  semCalls: number;
  conCalls: number;
  consensusInternalCapture: ConsensusInternal[];
  mechanicalChecker: (criterion: CascadeCriterion, contract: RubrixContract) => MechanicalResult;
  semanticJudge: (criterion: CascadeCriterion, contract: RubrixContract, s1: MechanicalResult) => SemanticResult;
  consensusPanel: (criterion: CascadeCriterion, contract: RubrixContract, s2: SemanticResult, p: EvaluationPolicy) => ConsensusInternal;
}

export function makeRecordingStubs(
  mechResult: MechanicalResult,
  semResult: SemanticResult,
  conResult: ConsensusInternal,
): RecordingStubs {
  const stubs: RecordingStubs = {
    mechCalls: 0,
    semCalls: 0,
    conCalls: 0,
    consensusInternalCapture: [],
    mechanicalChecker: () => {
      stubs.mechCalls += 1;
      return { ...mechResult, matched_anchors: [...mechResult.matched_anchors] };
    },
    semanticJudge: (criterion: CascadeCriterion) => {
      stubs.semCalls += 1;
      return { ...semResult, criterion: criterion.id, evidence: [...semResult.evidence] };
    },
    consensusPanel: () => {
      stubs.conCalls += 1;
      const capture: ConsensusInternal = {
        ...conResult,
        individual_entries: conResult.individual_entries.map((e) => ({ ...e })),
      };
      stubs.consensusInternalCapture.push(capture);
      return capture;
    },
  };
  return stubs;
}
