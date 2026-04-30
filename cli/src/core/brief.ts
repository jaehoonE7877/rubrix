import type { ArtifactKey, Axis, AxisDepth, IntentBrief, RubrixContract } from "./contract.ts";

export const AXES: ReadonlyArray<Axis> = ["security", "data", "correctness", "ux", "perf"];
export const AXIS_DEPTHS: ReadonlyArray<AxisDepth> = ["light", "standard", "deep"];

const SKIP_ENV_VAR = "RUBRIX_SKIP_BRIEF";

export const CLARITY_BASE_THRESHOLDS: Readonly<Record<ArtifactKey, number>> = Object.freeze({
  rubric: 0.75,
  matrix: 0.80,
  plan: 0.70,
});

export const CLARITY_DEPTH_MODIFIERS: Readonly<Record<AxisDepth, number>> = Object.freeze({
  deep: 0.10,
  standard: 0,
  light: -0.10,
});

export const THRESHOLD_POLICY_VERSION = "clarity-policy/1.0";

export interface ResolveClarityThresholdOpts {
  override?: number;
  env?: NodeJS.ProcessEnv;
}

export function resolveClarityThreshold(
  contract: RubrixContract,
  key: ArtifactKey,
  opts: ResolveClarityThresholdOpts = {},
): number {
  if (typeof opts.override === "number" && Number.isFinite(opts.override)) {
    return clampUnit(opts.override);
  }
  const depths = resolveAxisDepth(contract, opts.env ?? process.env);
  const modifiers = AXES.map((a) => CLARITY_DEPTH_MODIFIERS[depths[a]]);
  const modifier = modifiers.reduce((acc, m) => Math.max(acc, m), -Infinity);
  const base = CLARITY_BASE_THRESHOLDS[key];
  return clampUnit(base + modifier);
}

function clampUnit(n: number): number {
  if (n < 0) return 0;
  if (n > 1) return 1;
  return Math.round(n * 10000) / 10000;
}

export function isBriefSkipEnv(env: NodeJS.ProcessEnv = process.env): boolean {
  return env[SKIP_ENV_VAR] === "1";
}

export function isCalibrated(contract: RubrixContract): boolean {
  const b = contract.intent.brief;
  if (!b || b.calibrated !== true) return false;
  return b.project_type !== undefined
    && b.situation !== undefined
    && b.ambition !== undefined
    && b.axis_depth !== undefined;
}

export function resolveAxisDepth(
  contract: RubrixContract,
  env: NodeJS.ProcessEnv = process.env,
): Record<Axis, AxisDepth> {
  const brief = contract.intent.brief;
  const skip = isBriefSkipEnv(env);
  const fallback: AxisDepth = "standard";
  if (!brief || brief.calibrated !== true || skip) {
    return AXES.reduce((acc, a) => ({ ...acc, [a]: fallback }), {} as Record<Axis, AxisDepth>);
  }
  if (brief.ambition === "demo") {
    return AXES.reduce((acc, a) => ({ ...acc, [a]: "light" }), {} as Record<Axis, AxisDepth>);
  }
  return AXES.reduce((acc, a) => {
    const v = brief.axis_depth?.[a];
    return { ...acc, [a]: v ?? fallback };
  }, {} as Record<Axis, AxisDepth>);
}

export function isAxis(value: string): value is Axis {
  return (AXES as ReadonlyArray<string>).includes(value);
}

export function isAxisDepth(value: string): value is AxisDepth {
  return (AXIS_DEPTHS as ReadonlyArray<string>).includes(value);
}

export interface CalibratedBriefInit {
  project_type: NonNullable<IntentBrief["project_type"]>;
  situation: NonNullable<IntentBrief["situation"]>;
  ambition: NonNullable<IntentBrief["ambition"]>;
  axis_depth?: IntentBrief["axis_depth"];
  risk_modifiers?: string[];
}

export function newCalibratedContract(opts: {
  summary: string;
  brief: CalibratedBriefInit;
  details?: string;
  owner?: string;
  version?: string;
}): RubrixContract {
  return {
    version: opts.version ?? "0.1.0",
    intent: {
      summary: opts.summary,
      ...(opts.details !== undefined ? { details: opts.details } : {}),
      ...(opts.owner !== undefined ? { owner: opts.owner } : {}),
      brief: {
        calibrated: true,
        project_type: opts.brief.project_type,
        situation: opts.brief.situation,
        ambition: opts.brief.ambition,
        axis_depth: opts.brief.axis_depth ?? {},
        ...(opts.brief.risk_modifiers !== undefined ? { risk_modifiers: opts.brief.risk_modifiers } : {}),
      },
    },
    state: "IntentDrafted",
    locks: { rubric: false, matrix: false, plan: false },
  };
}
