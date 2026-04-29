# Rubrix Lifecycle State Machine

> Source of truth for the state field of `rubrix.json`. CLI (`rubrix state`, `rubrix lock`, `rubrix gate`) and hooks (`PreToolUse`, `Stop`) MUST honor this document. Skills MUST NOT mutate `state` directly — they call CLI commands.

## States (10)

| State              | Meaning                                                              | Lock invariants                       |
| ------------------ | -------------------------------------------------------------------- | ------------------------------------- |
| `IntentDrafted`    | `intent.summary` exists. Nothing else committed.                     | all locks `false`                     |
| `RubricDrafted`    | `rubric.criteria[]` populated, awaiting lock.                        | `rubric=false`                        |
| `RubricLocked`     | Rubric committed; downstream phases may begin.                       | `rubric=true`                         |
| `MatrixDrafted`    | `matrix.rows[]` populated, awaiting lock.                            | `rubric=true`, `matrix=false`         |
| `MatrixLocked`     | Matrix committed.                                                    | `rubric=true`, `matrix=true`          |
| `PlanDrafted`      | `plan.steps[]` populated, awaiting lock.                             | `rubric=true`, `matrix=true`, `plan=false` |
| `PlanLocked`       | Plan committed; code-editing tools allowed by `PreToolUse`.          | all locks `true`                      |
| `Scoring`          | Evaluators running; `scores[]` being populated.                      | all locks `true`                      |
| `Passed`           | `rubrix gate` returned pass.                                         | all locks `true`, `scores[]` exists   |
| `Failed`           | `rubrix gate` returned fail (threshold or any floor missed).         | all locks `true`, `scores[]` exists   |

## Allowed transitions

```
IntentDrafted -> RubricDrafted
RubricDrafted -> RubricLocked        (via `rubrix lock rubric`)
RubricLocked  -> MatrixDrafted
MatrixDrafted -> MatrixLocked        (via `rubrix lock matrix`)
MatrixLocked  -> PlanDrafted
PlanDrafted   -> PlanLocked          (via `rubrix lock plan`)
PlanLocked    -> Scoring             (entered by `/score` skill via `rubrix state set Scoring`)
Scoring       -> Passed | Failed     (decided by `rubrix gate`)
Failed        -> PlanDrafted         (loop: revise plan and re-score; resets locks.plan=false)
```

Any transition not in this table MUST be rejected by `rubrix state set` with a non-zero exit code.

## Lock gates vs state

`state` advances when the user (or CLI) decides to move forward. `locks.{rubric,matrix,plan}` are independently set to `true` only by `rubrix lock <name>`, which:

1. Validates the corresponding artifact (rubric / matrix / plan) against the schema.
2. Confirms the current state is the matching `*Drafted`.
3. Sets `locks.<name> = true`.
4. Advances `state` to `*Locked`.

This separation lets hooks check `locks.*` cheaply without parsing the full state history.

## Hook contracts

- `PreToolUse` (Phase 3): blocks code-editing tools when `locks.rubric === false || locks.matrix === false`. Blocks `/score` when `locks.plan === false`.
- `Stop` (Phase 3): if `state` is `Failed` and the run is in a loop budget, returns `{"decision":"block","reason":"gate failed; iterate"}` so the agent does not stop.

## Why 10 states (not 9)

`Passed` and `Failed` are distinct terminal states because:
- Hooks (`Stop`) need to distinguish them to decide loop continuation.
- Reports render different sections for each.
- Downstream `/improve`, `/replay` (v0.2+) only attach to `Failed`.
