# @rubrix/cli

CLI for the [Rubrix](https://github.com/jaehoonE/rubrix) Claude Code plugin. Operates on a `rubrix.json` evaluation contract.

## Install

```bash
npm install -g @rubrix/cli
```

## Commands

| Command | Purpose | Exit codes |
| --- | --- | --- |
| `rubrix validate <path>` | Validate against `rubrix.schema.json` | `0` valid, `1` invalid |
| `rubrix state get <path>` / `set <path> <to>` | Inspect / transition lifecycle state | `0`, `2` contract error, `3` illegal transition |
| `rubrix lock <key> <path>` | Lock `rubric` \| `matrix` \| `plan` and advance state | `0`, `2`, `3` |
| `rubrix gate <path> [--apply]` | Evaluate threshold/floor; persist Passed/Failed with `--apply` | `0` pass, `4` fail, `2`, `3` |
| `rubrix report <path> [--out <file>]` | Render markdown report | `0`, `2` |
| `rubrix hook <event>` | Adapter for Claude Code hook events (stdin JSON in, stdout JSON out) | `0` allow, `2` block |

## Schemas

Bundled at `node_modules/@rubrix/cli/schemas/`:
- `rubrix.schema.json`
- `evaluator-result.schema.json`
- `registry.schema.json`

## Lifecycle

`IntentDrafted → RubricDrafted → RubricLocked → MatrixDrafted → MatrixLocked → PlanDrafted → PlanLocked → Scoring → Passed | Failed`. Failed loops back to `PlanDrafted` (clears stale `scores[]`). See the main repo's `docs/lifecycle-state-machine.md`.

## License

MIT
