import { createHash } from "node:crypto";
import type {
  ArtifactKey,
  Clarity,
  ClarityDeduction,
  ClarityDeductionCode,
  RubrixContract,
} from "./contract.ts";
import { resolveAxisDepth, AXES } from "./brief.ts";

export const SCORER_VERSION = "clarity-scorer/1.0";

export class ClarityScorerMalformedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ClarityScorerMalformedError";
  }
}

export function canonicalize(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}

export function hashArtifact(contract: RubrixContract, key: ArtifactKey): string {
  const body = contract[key];
  if (body === undefined) {
    throw new Error(`cannot hash missing artifact: ${key}`);
  }
  const canonical = canonicalize({
    key,
    body: stripClarity(body),
    context: scoringContext(contract, key),
  });
  return createHash("sha256").update(canonical).digest("hex");
}

function scoringContext(contract: RubrixContract, key: ArtifactKey): unknown {
  switch (key) {
    case "rubric":
      return {
        axis_depth: contract.intent.brief?.axis_depth ?? null,
        ambition: contract.intent.brief?.ambition ?? null,
        calibrated: contract.intent.brief?.calibrated ?? false,
      };
    case "matrix":
      return {
        rubric_criterion_ids: (contract.rubric?.criteria ?? []).map((c) => c.id),
      };
    case "plan":
      return {
        matrix_row_ids: (contract.matrix?.rows ?? []).map((r) => r.id),
      };
  }
}

function stripClarity<T extends { clarity?: unknown }>(body: T): Omit<T, "clarity"> {
  const { clarity: _ignored, ...rest } = body;
  return rest;
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortKeys);
  }
  if (value !== null && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const sorted: Record<string, unknown> = {};
    for (const k of Object.keys(obj).sort()) {
      sorted[k] = sortKeys(obj[k]);
    }
    return sorted;
  }
  return value;
}

const VAGUE_TOKENS: ReadonlyArray<string> = [
  "good", "well", "appropriate", "nice", "proper", "reasonable",
  "잘", "좋은", "적절", "충분", "괜찮",
];
const SHORT_TEXT_LIMIT = 60;

export interface ScoreClarityInput {
  contract: RubrixContract;
  key: ArtifactKey;
  threshold: number;
  now?: Date;
}

export interface ScoreClarityResult {
  clarity: Clarity;
  ok: boolean;
}

export function scoreClarity(input: ScoreClarityInput): ScoreClarityResult {
  const { contract, key, threshold } = input;
  const deductions: ClarityDeduction[] = [];
  switch (key) {
    case "rubric":
      collectRubricDeductions(contract, deductions);
      break;
    case "matrix":
      collectMatrixDeductions(contract, deductions);
      break;
    case "plan":
      collectPlanDeductions(contract, deductions);
      break;
  }
  deductions.sort(compareDeduction);
  const totalWeight = deductions.reduce((acc, d) => acc + d.weight, 0);
  const rawScore = 1 - totalWeight;
  const score = round4(rawScore < 0 ? 0 : rawScore);
  const artifact_hash = hashArtifact(contract, key);
  const scored_at = (input.now ?? new Date()).toISOString();
  const clarity: Clarity = {
    score,
    threshold: round4(threshold),
    deductions,
    scored_at,
    scorer_version: SCORER_VERSION,
    artifact_hash,
    forced: false,
  };
  return { clarity, ok: score >= clarity.threshold };
}

function collectRubricDeductions(c: RubrixContract, into: ClarityDeduction[]): void {
  const r = c.rubric;
  if (!r) return;
  for (const crit of r.criteria) {
    const text = crit.description.trim();
    if (text.length < SHORT_TEXT_LIMIT) {
      into.push({
        code: "vague_description",
        message: `criterion \`${crit.id}\` description is ${text.length} chars; expand to ≥ ${SHORT_TEXT_LIMIT} chars naming the success condition`,
        weight: 0.10,
      });
    }
    if (containsVagueToken(text)) {
      into.push({
        code: "vague_description",
        message: `criterion \`${crit.id}\` description uses vague language; replace generic words with measurable terms`,
        weight: 0.05,
      });
    }
    if (!crit.verify || crit.verify.trim().length === 0) {
      into.push({
        code: "missing_evidence",
        message: `criterion \`${crit.id}\` has no \`verify\` field; specify how evidence is collected (e.g. \`vitest cli/tests/x.test.ts\`)`,
        weight: 0.10,
      });
    }
  }
  const depths = resolveAxisDepth(c, {});
  for (const axis of AXES) {
    if (depths[axis] !== "deep") continue;
    const matched = r.criteria.filter((cr) => cr.axis === axis);
    if (matched.length === 0) {
      into.push({
        code: "uncovered_axis",
        message: `intent.brief.axis_depth.${axis}=deep but no rubric criterion has axis=\`${axis}\``,
        weight: 0.20,
      });
      continue;
    }
    for (const crit of matched) {
      if (crit.floor === undefined) {
        into.push({
          code: "unmeasurable_floor",
          message: `criterion \`${crit.id}\` (axis=${axis}, depth=deep) has no \`floor\`; set a numeric floor so deep-axis enforcement can fail-fast`,
          weight: 0.15,
        });
      }
    }
  }
}

function collectMatrixDeductions(c: RubrixContract, into: ClarityDeduction[]): void {
  const m = c.matrix;
  if (!m) return;
  const knownCriterionIds = new Set((c.rubric?.criteria ?? []).map((cr) => cr.id));
  for (const row of m.rows) {
    if (!knownCriterionIds.has(row.criterion)) {
      into.push({
        code: "dangling_reference",
        message: `matrix row \`${row.id}\` references unknown rubric criterion \`${row.criterion}\``,
        weight: 0.20,
      });
    }
    const ev = row.evidence_required.trim();
    if (ev.length < SHORT_TEXT_LIMIT) {
      into.push({
        code: "vague_description",
        message: `matrix row \`${row.id}\` evidence_required is ${ev.length} chars; expand to ≥ ${SHORT_TEXT_LIMIT} chars stating exact evidence`,
        weight: 0.10,
      });
    }
    if (containsVagueToken(ev)) {
      into.push({
        code: "vague_description",
        message: `matrix row \`${row.id}\` evidence_required uses vague language`,
        weight: 0.05,
      });
    }
    if (!row.verify || row.verify.trim().length === 0) {
      into.push({
        code: "missing_evidence",
        message: `matrix row \`${row.id}\` has no \`verify\` field`,
        weight: 0.10,
      });
    }
  }
  const coveredCriteria = new Set(m.rows.map((r) => r.criterion));
  for (const cr of c.rubric?.criteria ?? []) {
    if (!coveredCriteria.has(cr.id)) {
      into.push({
        code: "uncovered_axis",
        message: `rubric criterion \`${cr.id}\` is not covered by any matrix row`,
        weight: 0.20,
      });
    }
  }
}

function collectPlanDeductions(c: RubrixContract, into: ClarityDeduction[]): void {
  const p = c.plan;
  if (!p) return;
  const knownRowIds = new Set((c.matrix?.rows ?? []).map((r) => r.id));
  for (const step of p.steps) {
    const action = step.action.trim();
    if (action.length < SHORT_TEXT_LIMIT) {
      into.push({
        code: "vague_description",
        message: `plan step \`${step.id}\` action is ${action.length} chars; expand to ≥ ${SHORT_TEXT_LIMIT} chars stating the concrete deliverable`,
        weight: 0.10,
      });
    }
    if (containsVagueToken(action)) {
      into.push({
        code: "vague_description",
        message: `plan step \`${step.id}\` action uses vague language`,
        weight: 0.05,
      });
    }
    const covers = step.covers ?? [];
    if (covers.length === 0) {
      into.push({
        code: "missing_evidence",
        message: `plan step \`${step.id}\` has empty \`covers\`; map this step to at least one matrix row`,
        weight: 0.10,
      });
    }
    for (const ref of covers) {
      if (!knownRowIds.has(ref)) {
        into.push({
          code: "dangling_reference",
          message: `plan step \`${step.id}\` covers unknown matrix row \`${ref}\``,
          weight: 0.20,
        });
      }
    }
  }
  const coveredRows = new Set<string>();
  for (const step of p.steps) for (const ref of step.covers ?? []) coveredRows.add(ref);
  for (const row of c.matrix?.rows ?? []) {
    if (!coveredRows.has(row.id)) {
      into.push({
        code: "uncovered_axis",
        message: `matrix row \`${row.id}\` is not covered by any plan step`,
        weight: 0.20,
      });
    }
  }
}

function containsVagueToken(text: string): boolean {
  const lower = text.toLowerCase();
  return VAGUE_TOKENS.some((t) => lower.includes(t));
}

const CODE_ORDER: Readonly<Record<ClarityDeductionCode, number>> = {
  vague_description: 0,
  missing_evidence: 1,
  unmeasurable_floor: 2,
  dangling_reference: 3,
  uncovered_axis: 4,
};

function compareDeduction(a: ClarityDeduction, b: ClarityDeduction): number {
  const codeDiff = CODE_ORDER[a.code] - CODE_ORDER[b.code];
  if (codeDiff !== 0) return codeDiff;
  if (a.message < b.message) return -1;
  if (a.message > b.message) return 1;
  return 0;
}

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}
