# Rubrix — Claude Code Plugin (v1.0.0)

Evaluation-contract-first harness for Claude Code agents. `rubrix.json` is the canonical contract; `hooks`, the `rubrix` CLI, `skills`, and `subagents` enforce it across the 10-state lifecycle.

## Install (local plugin checkout)

```bash
cd cli && npm install
claude --plugin-dir <path-to-rubrix-checkout>
```

The plugin entrypoint is `.claude-plugin/plugin.json`. Skills are loaded under the `rubrix:` namespace (e.g. `/rubrix:rubric`). Hook scripts in `scripts/*.sh` shell out to `node cli/bin/rubrix.js`. The plugin manifest passes `claude plugin validate .`.

## CLI commands

| Command | Purpose | Exit codes |
| --- | --- | --- |
| `rubrix validate <path>` | Validate a `rubrix.json` against the schema. | `0` valid, `1` invalid |
| `rubrix state get <path>` / `set <path> <to>` | Inspect / transition state (forward only; gate-only transitions blocked). | `0` ok, `2` contract/argument error, `3` illegal transition |
| `rubrix lock <key> <path>` | Lock `rubric` \| `matrix` \| `plan` and advance to the matching `*Locked` state. Runs cross-artifact integrity checks (criterion refs, covers refs, duplicate ids) before locking. | `0` ok, `2` contract error, `3` wrong state, missing artifact, or integrity failure |
| `rubrix gate <path> [--apply]` | Evaluate threshold/floor; with `--apply`, persist `Passed`/`Failed`. | `0` pass, `4` fail, `2` contract error, `3` wrong state |
| `rubrix report <path> [--out <file>]` | Render a markdown report. | `0` ok, `2` contract error |
| `rubrix hook <event>` | Adapter: read JSON from stdin, emit per-event JSON or exit-code response per Claude Code hook contract. | per event (see Hook gates) |

## Lifecycle

```
IntentDrafted -> RubricDrafted -> RubricLocked -> MatrixDrafted -> MatrixLocked
              -> PlanDrafted -> PlanLocked -> Scoring -> Passed | Failed
                                              ↳ Failed -> PlanDrafted (loop, clears scores)
```

See [`docs/lifecycle-state-machine.md`](docs/lifecycle-state-machine.md) for full transition + lock invariant tables.

## Skills

Loaded under the plugin namespace `rubrix:`:

- `/rubrix:rubric` — draft and lock `rubric.criteria[]` (transitions `IntentDrafted → RubricLocked`).
- `/rubrix:matrix` — draft and lock `matrix.rows[]` (transitions `RubricLocked → MatrixLocked`).
- `/rubrix:plan` — draft and lock `plan.steps[]`; supports the `Failed → PlanDrafted` recovery loop with a 2-mode protocol (default report-only on `Failed`, mutation only on explicit re-plan instruction).
- `/rubrix:score` — invoke evaluator subagents, write `scores[]`, run `rubrix gate --apply`. Triggers only when `rubrix.json` exists, state is `PlanLocked`, and the user explicitly asks for a verdict against that contract.

Each skill is a thin SKILL.md that calls the CLI; skills never mutate `state` to `Passed` / `Failed` — only `rubrix gate --apply` does.

## Hook gates

- **PreToolUse** (per Claude Code spec — emits `hookSpecificOutput.permissionDecision` to stdout, exit 0):
  - Blocks `Edit` / `Write` / `MultiEdit` / `NotebookEdit` until **all three** locks (`rubric`, `matrix`, `plan`) are `true`. **Exempts edits to `rubrix.json` itself** so contract authoring is always possible.
  - Blocks `/rubrix:score` while `locks.plan=false`.
- **UserPromptExpansion**: injects current `state` + `locks` as additional context; blocks `/rubrix:score` invocations when `locks.plan=false`.
- **Stop** (exit-code path — exit 2 with stderr on block): blocks Stop when `state=Failed` to force the iteration loop.
- **SessionStart**, **PostToolUse**, **PostToolBatch**, **SubagentStop**: informational only.

See [`hooks/hooks.json`](hooks/hooks.json) for the full Claude Code 3-level nested event → matcher → handler config.

## Examples

- [`examples/self-eval/`](examples/self-eval/) — bootstrap rubric for the Rubrix repo itself.
- [`examples/ios-refactor/`](examples/ios-refactor/) — full lifecycle example reaching `Passed`.

## Verification

```bash
cd cli && npm install && npm test           # 87 vitest pass
claude plugin validate .                    # plugin manifest pass
node cli/bin/rubrix.js validate examples/self-eval/rubrix.json
node cli/bin/rubrix.js validate examples/ios-refactor/rubrix.json
```

See [`VERIFICATION.md`](VERIFICATION.md) for the full v1.0.0 verification checklist.

## Planned for v1.1+

- `/rubrix:improve`, `/rubrix:replay`, `/rubrix:learn` loops
- Run history snapshots (`runs/`)
- Multi-evaluator aggregation in `PostToolBatch`
- Domain packs (iOS, web, infra)
- `npm publish` of `@rubrix/cli` and Claude Code Marketplace listing
