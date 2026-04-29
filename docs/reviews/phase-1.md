# Phase 1 — Codex Review Log

**Scope reviewed**:
- `.claude-plugin/plugin.json`
- `cli/schemas/rubrix.schema.json`
- `cli/schemas/evaluator-result.schema.json`
- `examples/self-eval/rubrix.json`
- `docs/lifecycle-state-machine.md`

## Round 1 — initial findings

Codex (`codex review`, `--uncommitted` working tree) raised three issues.

| # | Severity | Finding | Resolution |
|---|----------|---------|------------|
| 1 | P1 | Lock invariants only encoded for `RubricLocked`, `MatrixLocked`, `PlanLocked`, `Scoring`. States like `IntentDrafted` with all locks `true`, `PlanDrafted` with `plan=true`, or `Passed`/`Failed` with locks `false` were accepted, contradicting the lifecycle doc and letting a canonical `rubrix.json` bypass intended gates. | Added conditional `allOf` branches for **all 10 states**, each pinning the exact `locks.{rubric,matrix,plan}` triple required by `docs/lifecycle-state-machine.md`. Also added presence requirements: `RubricDrafted`+ requires `rubric`; `MatrixDrafted`+ requires `matrix`; `PlanDrafted`+ requires `plan`. |
| 2 | P2 | `rubric.threshold` was optional. A contract could reach `Scoring`/`Passed`/`Failed` with no threshold, leaving gate behavior ambiguous. | Added `threshold` to `rubric.required` and documented that no implicit default exists. |
| 3 | P2 | `examples/self-eval/rubrix.json` referenced later-phase surfaces (CLI tests, hook scripts), so running it now would evaluate planned (not Phase 1) deliverables. | Rewrote the self-eval rubric to scope strictly to Phase 1 surfaces: `schema_self_validates`, `state_enum_complete`, `lock_invariants_encoded`, `plugin_manifest_valid`. |

## Round 2 — verification

Re-ran `codex review` after fixes. Verbatim conclusion:

> The three previously reported issues are resolved: lock invariants are now encoded for all lifecycle states, rubric.threshold is required, and the self-eval example is limited to Phase 1 surfaces. I found no remaining Phase 1 blockers; **no further improvements**.

## Local verification commands run

- `npx ajv-cli@5 validate -s cli/schemas/rubrix.schema.json -d examples/self-eval/rubrix.json --spec=draft2020` → valid
- 4 negative cases all rejected with the expected error message:
  - `PlanLocked` with `plan=false` → `must be equal to constant`
  - `IntentDrafted` with `rubric=true` → `must be equal to constant`
  - rubric without `threshold` → `must have required property 'threshold'`
  - `Passed` without `scores` → `must have required property 'scores'`
- `node -e` confirmed `state` enum contains exactly the 10 documented values in order.

## Gate

Phase 1 passes. Proceed to Phase 2.
