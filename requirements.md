# Rubrix v1.2.0 — Measurement-Based Lock Gates

> Source of truth: [`rubrix.json`](rubrix.json) (calibrated intent.brief, version 1.2.0)
> Linear: [RUB-10](https://linear.app/rubrix/issue/RUB-10) (parent) · [RUB-22](https://linear.app/rubrix/issue/RUB-22) · [RUB-23](https://linear.app/rubrix/issue/RUB-23) · [RUB-24](https://linear.app/rubrix/issue/RUB-24)
> Notion: [v1.2 Measurement-Based Lock Gates](https://app.notion.com/p/3524408817af81f79513fb43ba303f36)

## Why

v1.1.0 made intent calibrated. v1.2 makes the artifacts themselves calibrated. Locking a vague rubric/matrix/plan poisons all downstream evaluation, so v1.2 introduces a measurement-based gate: `rubrix lock <artifact>` must clear a clarity threshold before mutating state. Lock stays explicit, but becomes *fallible*. v1.2 is the direct prerequisite of v1.3 multi-evaluator cascade — Stage 1 needs an unambiguous anchor to match against.

## Scope (additive minor, version-aware enforcement)

- `clarity-scorer` agent (JSON-only, deterministic) scoring Goal Clarity × Specificity × Coverage × Measurability on rubric/matrix/plan with artifact-specific weights.
- Schema additive: `rubric.clarity` / `matrix.clarity` / `plan.clarity` object with `{ score, threshold, deductions[], scored_at, scorer_version, artifact_hash, forced, forced_at?, force_reason? }`.
- Enforcement is **contract version-aware**: only `version >= 1.2.0` contracts gate at lock and require `clarity` at *Locked states. v1.0/v1.1 (`version="0.1.0"` or earlier) read-compat preserved.
- Threshold defaults: `rubric=0.75`, `matrix=0.80`, `plan=0.70`. Override precedence: CLI flag > config > `intent.brief.axis_depth`. axis_depth modifier: `deep`=+0.10, `standard`=0, `light`=-0.10. Multi-axis → max-modifier (most strict).
- CLI:
  - `rubrix score-clarity <key> <path>` — read-only, prints score + deductions JSON, never mutates `rubrix.json`.
  - `rubrix lock <key> <path>` — calls `clarity-scorer`, fails closed on score<threshold or malformed scorer output.
  - `rubrix lock <key> <path> --force <reason>` — audits forced lock with `forced=true`, `forced_at`, `force_reason` persisted to clarity.
- PostToolUse: lock failure surfaces deductions inside `<rubrix-suggestion>` block (actionable, not just stderr).
- `rubrix report`: adds "Forced Locks" section (artifact / score / threshold / forced_at / reason) when contract is v1.2+.
- Determinism contract: cache key = `{scorer_version, artifact_hash, threshold_policy_version}`. Same artifact → byte-equivalent JSON or at minimum identical score + deduction codes.

## Non-goals

- Multi-evaluator cascade (v1.3).
- Drift detection / recovery loop (v1.4).
- Event-sourced run history (v1.5).
- `--force` cumulative hard-block (deferred until v1.4 `--accept-drift` policy alignment).
- Cryptographic seed freeze.
- Disk-backed clarity cache (in-memory only in v1.2; disk in v1.5).

## Acceptance criteria

1. `rubrix score-clarity rubric ./rubrix.json` → exit 0, JSON to stdout, `rubrix.json` byte-unchanged.
2. Same artifact scored twice → byte-equivalent JSON (artifact_hash identical) or identical `score` + deduction `code`s.
3. `rubrix lock <key>` with score < threshold (no `--force`) → exit 3 with named deductions on stderr.
4. `rubrix lock <key> --force "<reason>"` → exit 0 with `clarity.forced=true`, `clarity.forced_at` ISO timestamp, `clarity.force_reason="<reason>"` persisted.
5. `rubrix report` on a v1.2 contract surfaces a "Forced Locks" section; v1.0/v1.1 contracts omit the section entirely.
6. v1.0/v1.1 fixtures (`examples/self-eval`, `examples/ios-refactor`, any `version<"1.2"`) load, validate, gate, and report unchanged from v1.1.x behavior.
7. v1.2 contract with state=`*Locked` but missing `clarity` on the corresponding artifact → `rubrix validate` fails with a user-facing message.
8. Malformed `clarity-scorer` output (invalid JSON / enum violation / missing required field) → lock fails closed, no `clarity` written.
9. Threshold lookup: `intent.brief.axis_depth.security="deep"` → `resolveClarityThreshold(c, "rubric") = 0.85`; `light` axis → `0.65`.
10. PostToolUse: lock failure produces a `<rubrix-suggestion>` block with deduction codes and an actionable next-step hint (`/rubrix:rubric` rerun or `--force` with a reason).
11. Root `rubrix.json` reaches state=`Passed` via natural lock (no `--force`) at the end of PR #3 (RUB-24), demonstrating self-evaluation.
12. Codex review gate: each PR (#1/#2/#3) and the final integration PR carry a recorded `codex-gpt5.5` (xhigh) review summary in both the PR body and the corresponding Linear comment.
13. No new user-facing docs created (5-doc policy preserved); `PLUGIN-README.md` updated additively.

## Risks & mitigations

- **Lock rejection frustration** → deductions must be actionable (mandated by enum + message). Guarded by acceptance #3.
- **Scorer non-determinism** → cache key + JSON output schema enforced; agent system prompt forbids natural language. Guarded by acceptance #2 + #8.
- **v1.0/v1.1 breakage** → enforcement gated on `version >= 1.2.0` (semver compare in CLI, not schema oneOf). Guarded by acceptance #6.
- **Schema 1.2 bump confusion** → `version` field actually bumps to `"1.2.0"` in dogfood for the first time (prior dogfoods kept `"0.1.0"`); CLI `loadContract` logs the resolved enforcement tier on `--verbose`.
- **`--force` abuse** → audit is mandatory (`force_reason` required); report surfaces every forced lock; v1.4 will add cumulative hard-block.

## Operating rules

- Branch: `release/v1.2` ← `origin/main`. Sub-branches: `feature/v1.2-pr1-schema-score-clarity`, `feature/v1.2-pr2-clarity-scorer-lock-gate`, `feature/v1.2-pr3-force-audit-report-dogfood`. All sub-PRs target `release/v1.2`; final integration PR `release/v1.2 → main`.
- PR creation: `gh pr create` (GitHub CLI), HEREDOC body.
- Codex review gate (mandatory per PR): `codex-gpt5.5` reasoning effort `xhigh`. Review summary embedded in PR body and Linear comment. No PR merges without it.
- Self-application: this very `rubrix.json` walks IntentDrafted → Passed across the 3 PRs and is the source of v1.2 self-evaluation evidence.
