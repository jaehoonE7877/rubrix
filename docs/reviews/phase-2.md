# Phase 2 — Codex Review Log

**Scope reviewed**:
- `cli/package.json`, `cli/tsconfig.json`
- `cli/bin/rubrix.js`, `bin/rubrix`
- `cli/src/cli.ts`
- `cli/src/core/state.ts`, `cli/src/core/contract.ts`
- `cli/src/commands/{validate,gate,report,state,lock}.ts`
- `cli/tests/{state,state.cli,validate,gate,lock,report}.test.ts`

## Round 1 — initial findings

| # | Severity | Finding | Resolution |
|---|----------|---------|------------|
| 1 | P1 | `state set` accepted `Scoring -> Passed`/`Failed` because the transition table allowed it, letting callers mark a failing run as passed without `rubrix gate`. | Removed `Passed`/`Failed` from `TRANSITIONS["Scoring"]`. Added a separate `GATE_TRANSITIONS` table (and `canGateTransition`) so the documented gate-only transitions remain expressible. `gateCommand` already bypasses `canTransition` by direct assignment. Added 2 tests in `state.cli.test.ts` asserting `state set Scoring -> Passed/Failed` returns exit code 3. |
| 2 | P1 | `tsx` was a `devDependency` but `cli/bin/rubrix.js` `await import("tsx/esm")` at runtime, so a normal install would crash. | Moved `tsx` to `dependencies` in `cli/package.json`. |
| 3 | P2 | `gate --apply` on a `Scoring` contract with no `scores` set `state="Failed"`, but the schema required `scores` for `Failed`, so `saveContract` threw and the command returned `2` (contract error) instead of `4` (gate fail). | `gateCommand` now validates the candidate `Passed`/`Failed` contract before persisting. If invalid, it emits a stderr warning, skips persistence, and still returns the gate decision exit code (4 fail / 0 pass). Added 2 tests in `gate.test.ts` covering both branches. |

## Round 2 — additional finding

Re-ran `codex review` after Round 1 fixes. The runtime issues were addressed but TypeScript typecheck failed:

| # | Severity | Finding | Resolution |
|---|----------|---------|------------|
| 4 | P1 | `gate.ts:73-76` — after spreading `c` with the new `state`, `next` was inferred as `string`, so `candidate` was inferred as `{state: string; ...}` and `saveContract(opts.path, candidate)` failed `npm run typecheck` with `Type 'string' is not assignable to type State`. Vitest passed but typecheck blocked the CLI. | Imported `type { State }` from `../core/state.ts`. Annotated `const next: State = result.decision === "pass" ? "Passed" : "Failed"` and `const candidate: RubrixContract = { ...c, state: next }`. |

## Round 3 — verification

Re-ran `codex review` after the typecheck fix. Codex executed `npm run typecheck && npm test -- --run` and confirmed both pass. Verbatim conclusion:

> Verified the typecheck fix in gate.ts: State and RubrixContract annotations resolve the prior inference issue. `npm run typecheck` exits 0 and all 32 vitest tests pass; **no further improvements**.

## Local verification

All 32 vitest tests pass (added 5 vs. previous 27):

```
tests/state.test.ts        9 tests
tests/validate.test.ts     4 tests
tests/gate.test.ts         7 tests   ← +2 (apply-incomplete, apply-pass-persists)
tests/lock.test.ts         4 tests
tests/state.cli.test.ts    6 tests   ← +2 (Scoring->Passed reject, Scoring->Failed reject)
tests/report.test.ts       2 tests
```

End-to-end CLI smoke test (manual) confirmed:
- `rubrix validate examples/self-eval/rubrix.json` → exit 0
- `rubrix state set <tmp>/r.json RubricDrafted` → exit 0
- `rubrix lock rubric <tmp>/r.json` → state advances to `RubricLocked`
- `rubrix gate <tmp>/r.json` (state still `RubricLocked`) → exit 3 with stderr `gate refuses to run`

## Gate

Phase 2 passes. Proceed to Phase 3.
