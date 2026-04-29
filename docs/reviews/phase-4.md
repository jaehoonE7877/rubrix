# Phase 4 — Codex Review Log

**Scope reviewed**:
- `skills/{rubric,matrix,plan,score}/SKILL.md`
- (touched) `cli/src/hooks/handlers.ts` — contract-edit exemption
- (touched) `cli/src/commands/state.ts` — Failed→PlanDrafted scores clear
- (touched) `cli/tests/{hook,state.cli}.test.ts`

## Round 1 — initial findings

| # | Severity | Finding | Resolution |
|---|----------|---------|------------|
| 1 | P1 | `/rubric` instructed Claude to `Edit`/`Write` `rubrix.json`, but `PreToolUse` blocked `Edit`/`Write` while `locks.rubric=false`. Circular deadlock — could never write the rubric to lock it. | `handlePreToolUse` now exempts `Edit`/`Write`/`MultiEdit`/`NotebookEdit` whose target `file_path` resolves to the contract path itself. Contract authoring is exempt; non-contract files are still blocked. Two new tests cover both branches. SKILL.md updated to call out the exemption. |
| 2 | P1 | Same deadlock for `/matrix` after the rubric lock — `locks.matrix=false` still blocks `Edit`/`Write`. | Same exemption applies. SKILL.md updated. |
| 3 | P2 | `/plan` precondition required `MatrixLocked`, so the documented Failed → /plan → /score loop was broken — `Failed` got rejected. | `/plan` preconditions now accept `MatrixLocked`, `PlanDrafted`, OR `Failed`. New step 1 runs `rubrix state set rubrix.json PlanDrafted` when the state is `Failed` (transition exists in TRANSITIONS, CLI resets `locks.plan=false`). |

## Round 2 — additional finding

| # | Severity | Finding | Resolution |
|---|----------|---------|------------|
| 4 | P2 | Failed → PlanDrafted reset `locks.plan` but kept stale `scores[]`. `evaluateGate` selects the lowest score per criterion, so a previous low score could keep the next run failing even after a successful re-score. | `stateSetCommand` now also deletes `scores[]` on the Failed→PlanDrafted transition. Existing test upgraded to assert `after.scores === undefined`. SKILL.md `/plan` step 1 documents the clearing. |

## Round 3 — verification

Re-ran `codex review` after the retry-loop fix. Verbatim conclusion:

> Verified Failed -> PlanDrafted now clears stale scores[] and resets locks.plan; the upgraded test asserts scores is undefined. Focused state CLI tests and typecheck pass; **no further improvements**.

## Local verification

- `npm run typecheck` exits 0
- `npm test` — 50 vitest tests pass (2 new contract-edit exemption tests, 1 upgraded retry test)
- 4 SKILL.md files have valid `name`/`description` frontmatter
- `/rubric`, `/matrix`, `/plan` reference `rubrix lock` once each; `/score` reaches Pass/Fail via `rubrix gate --apply` (not via direct state set), as documented

## Gate

Phase 4 passes. Proceed to Phase 5.
