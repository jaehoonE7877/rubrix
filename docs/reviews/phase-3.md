# Phase 3 — Codex Review Log

**Scope reviewed**:
- `cli/src/commands/hook.ts`
- `cli/src/hooks/handlers.ts`
- `cli/tests/hook.test.ts`
- `hooks/hooks.json`
- `scripts/{session_start,user_prompt_expansion,pre_tool_use,post_tool_use,post_tool_batch,subagent_stop,stop}.sh`

## Round 1 — initial findings

| # | Severity | Finding | Resolution |
|---|----------|---------|------------|
| 1 | P1 | Malformed JSON on stdin silently became `{}`, so `PreToolUse` dropped `tool_name`/`cwd` and emitted `{"decision":"allow"}` — fail-open precisely when the input contract is violated. | `parseInput` now returns `{ok,error}`. On parse failure `hookCommand` writes `{"decision":"block","reason":"rubrix hook <event>: stdin is not valid JSON: …"}` to stdout, the same to stderr, and exits 2. |
| 2 | P2 | Unknown event names exited with stderr only — no JSON stdout decision, breaking the adapter contract. | Unknown events now also emit `{"decision":"block","reason":"unknown hook event: X (expected one of …)"}` to stdout, stderr, and exit 2. |

## Round 2 — verification

Re-ran `codex review` after fixes. Codex inspected sources and tests directly and confirmed both branches now fail closed with JSON block decisions on stdout, stderr context, and exit code 2. Verbatim conclusion:

> The malformed-stdin and unknown-event paths now both fail closed with JSON block decisions on stdout, stderr context, and exit code 2. Tests and typecheck pass; **no further improvements**.

## Local verification

- `npm run typecheck` exits 0
- `npm test` — 48 vitest tests pass (16 new in `hook.test.ts`)
- E2E shell test through the actual hook shim:
  - `echo '{not valid' | bash scripts/pre_tool_use.sh` → stdout `{"decision":"block","reason":"rubrix hook PreToolUse: stdin is not valid JSON: …"}`, exit 2
  - `echo '{"cwd":"…","contract_path":"examples/self-eval/rubrix.json","tool_name":"Edit"}' | bash scripts/pre_tool_use.sh` → block (`locks.rubric=false`), exit 2
  - `echo '{…}' | bash scripts/session_start.sh` → systemMessage with state/locks, exit 0
- All 7 `hooks/hooks.json` paths point to `${CLAUDE_PLUGIN_ROOT}/scripts/<name>.sh`; all `scripts/*.sh` are `chmod +x` and consist of a 3–4 line shim with no business logic.

## Gate

Phase 3 passes. Proceed to Phase 4.
