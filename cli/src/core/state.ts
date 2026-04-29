export const STATES = [
  "IntentDrafted",
  "RubricDrafted",
  "RubricLocked",
  "MatrixDrafted",
  "MatrixLocked",
  "PlanDrafted",
  "PlanLocked",
  "Scoring",
  "Passed",
  "Failed",
] as const;

export type State = (typeof STATES)[number];

export type LockKey = "rubric" | "matrix" | "plan";

export type Locks = Record<LockKey, boolean>;

const TRANSITIONS: Record<State, ReadonlyArray<State>> = {
  IntentDrafted: ["RubricDrafted"],
  RubricDrafted: ["RubricLocked"],
  RubricLocked: ["MatrixDrafted"],
  MatrixDrafted: ["MatrixLocked"],
  MatrixLocked: ["PlanDrafted"],
  PlanDrafted: ["PlanLocked"],
  PlanLocked: ["Scoring"],
  Scoring: [],
  Passed: [],
  Failed: ["PlanDrafted"],
};

const GATE_TRANSITIONS: Record<State, ReadonlyArray<State>> = {
  IntentDrafted: [],
  RubricDrafted: [],
  RubricLocked: [],
  MatrixDrafted: [],
  MatrixLocked: [],
  PlanDrafted: [],
  PlanLocked: [],
  Scoring: ["Passed", "Failed"],
  Passed: [],
  Failed: [],
};

const LOCK_INVARIANTS: Record<State, Locks> = {
  IntentDrafted: { rubric: false, matrix: false, plan: false },
  RubricDrafted: { rubric: false, matrix: false, plan: false },
  RubricLocked: { rubric: true, matrix: false, plan: false },
  MatrixDrafted: { rubric: true, matrix: false, plan: false },
  MatrixLocked: { rubric: true, matrix: true, plan: false },
  PlanDrafted: { rubric: true, matrix: true, plan: false },
  PlanLocked: { rubric: true, matrix: true, plan: true },
  Scoring: { rubric: true, matrix: true, plan: true },
  Passed: { rubric: true, matrix: true, plan: true },
  Failed: { rubric: true, matrix: true, plan: true },
};

const LOCK_TARGET_STATE: Record<LockKey, { from: State; to: State }> = {
  rubric: { from: "RubricDrafted", to: "RubricLocked" },
  matrix: { from: "MatrixDrafted", to: "MatrixLocked" },
  plan: { from: "PlanDrafted", to: "PlanLocked" },
};

export function isState(value: unknown): value is State {
  return typeof value === "string" && (STATES as ReadonlyArray<string>).includes(value);
}

export function canTransition(from: State, to: State): boolean {
  return TRANSITIONS[from].includes(to);
}

export function canGateTransition(from: State, to: State): boolean {
  return GATE_TRANSITIONS[from].includes(to);
}

export function expectedLocks(state: State): Locks {
  return { ...LOCK_INVARIANTS[state] };
}

export function lockTarget(key: LockKey): { from: State; to: State } {
  return LOCK_TARGET_STATE[key];
}

export function locksMatch(state: State, locks: Locks): boolean {
  const want = LOCK_INVARIANTS[state];
  return want.rubric === locks.rubric && want.matrix === locks.matrix && want.plan === locks.plan;
}
