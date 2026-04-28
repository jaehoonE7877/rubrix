# Iteration-1 Decision Record

**Date:** 2026-04-28
**Model:** `claude-sonnet-4-6`
**Cases:** 12 · **Conditions:** 2 · **Total runs:** 24
**Wall clock:** 179.6s · **Total cost:** $2.74 ($1.71 with_skill + $1.04 baseline)

## Headline

| Configuration | Pass rate | Runs all-pass | Avg duration | Avg cost |
|---|---|---|---|---|
| **with_skill** | **78.3%** (47/60) | 5/12 | 53.8s | $0.142 |
| baseline       | 53.3% (32/60)    | 2/12 | 32.2s | $0.086 |
| **delta**      | **+25.0 pp**     | +3   | +21.7s | +$0.056 |

with_skill clearly outperforms baseline on every skill, with the largest gains on `matrix` (+33 pp) and `plan` (+33 pp).

## Per-skill breakdown

| Skill | with_skill | baseline | delta |
|---|---|---|---|
| rubric | 80.0% | 53.3% | +26.7 pp |
| matrix | 93.3% | 60.0% | +33.3 pp |
| plan   | 80.0% | 46.7% | +33.3 pp |
| score  | 60.0% | 53.3% | +6.7 pp  ⚠️ smallest delta |

`score` is the weakest area — the skill helps less than on the other three.

## Win / tie / loss

- **wins:** 7 cases (matrix-01, matrix-03, plan-01, plan-03, rubric-01, rubric-02, score-01)
- **ties:** 4 cases (matrix-02, plan-02, rubric-03, score-02)
- **losses:** 1 case (score-03 ⚠️)

Both negative-lock cases (matrix-02 and score-02) tied at 5/5: both with_skill and baseline correctly refused to advance state. Good signal — the LLM is naturally cautious enough to refuse on bad lock state.

## with_skill failure clusters (P1 patterns)

### Cluster 1 — `*Drafted` not advancing to `*Locked` (rubric-03, matrix-03, score-01)
The skill writes the artifact (rubric/matrix/plan) and leaves state at `*Drafted`. The lock step (`rubrix lock <key>`) is sometimes omitted.

| Case | Final state observed | Expected |
|---|---|---|
| `rubric-03-…` | `RubricDrafted` | `RubricLocked` |
| `matrix-03-…` | `MatrixDrafted` | `MatrixLocked` |
| `score-01-…`  | `Failed` (over-strict scoring) | `Passed` |

### Cluster 2 — content shape gaps (rubric-03, plan-01)
Generated artifacts don't always include canonical keywords (`evidence`, `verify`).

### Cluster 3 — score skill doesn't apply state mutation (score-03 LOSS)
The skill produced a *correct* criterion-by-criterion verdict in stdout (calculated weighted score 0.67 < threshold 0.80, identified c3 below floor) — but **did not actually transition state to `Failed` or write `scores[]` to rubrix.json**. Pure prose output instead of contract mutation.

> Cite from with_skill stdout: *"c3 — Plan identifies rollback policy … FAIL (score 0.0, below floor 0.7) … Overall verdict: FAIL."*
>
> Cite from rubrix.json: state still `PlanLocked`, `scores` field absent.

This is the canonical "missing subagent/lifecycle invocation" pattern flagged in the original skill-creator analysis (P2 item).

### Cluster 4 — negative case over-action (plan-02)
plan-02 fixture starts in `Failed` state; with_skill replanned and locked, advancing to `PlanLocked`. The eval expected the skill to **explain recovery** rather than auto-advance. Debatable whether this is a skill bug or an over-strict assertion — the canonical recovery is `rubrix state set PlanDrafted` first, then re-plan.

## Decision tree application (plan v2 §J)

### Decision 1 — ship as-is — **REJECTED**

Required conditions:
- with_skill P1 pass rate ≥ 95% — **NO** (78.3%)
- with_skill passes every negative lock/state case — **NO** (plan-02 only 3/5; score-03 0/5)
- ≥ 20 pp delta — **YES** (+25 pp)
- no skill has more than one failed assertion — **NO** (all four skills have failures)

### Decision 2 — Quick Fix P1 + iteration-2 — **CHOSEN ✅**

Trigger conditions:
- with_skill P1 pass rate is 70%-94% — **YES** (78.3%)
- failures cluster around known P1 issues — **YES** (3 distinct clusters above)
- with_skill beats baseline in ≥ 7 of 12 evals — **YES** (7 wins)
- most happy paths pass, edge cases fail — **YES** (5/7 happy-path wins; score-03 edge fail)

### Decision 3 — Full Revision P1+P2+P3 — **NOT TRIGGERED**

- with_skill ≥ 70% (would need <70%) ✅
- with_skill beats baseline in ≥ 7 of 12 (would need <7) ✅
- trigger language fails repeatedly (with_skill triggered correctly in 11/12 cases) ✅
- multiple skills disagree on state names / lock semantics (no — schema is consistent) ✅

## Recommended Quick Fix scope (concrete)

Apply ONLY these changes in iteration-2:

1. **`skills/score/SKILL.md`** — add explicit step requiring `rubrix state set Scoring` → write `scores[]` → `rubrix gate --apply` (currently the skill describes the verdict in prose but doesn't always call the CLI mutation). Reference `agents/output-judge.md` and `agents/evidence-finder.md` as helpful subagents per criterion.

2. **`skills/rubric/SKILL.md`, `skills/matrix/SKILL.md`** — strengthen the post-draft "always call `rubrix lock <key>` before declaring done" requirement. Today the skill sometimes stops at `*Drafted`.

3. **`skills/plan/SKILL.md`** — for `Failed` state, explicitly require: "before drafting a replacement plan, run `rubrix state set PlanDrafted` (which auto-clears scores and resets locks.plan=false)". Today the skill jumps straight to writing a new plan and re-locking, which is technically wrong.

4. **All four SKILL.md** — add 1 minimal worked example showing canonical field names (`evidence_required`, `verify`, `floor`) so generated content includes those keywords.

5. **Do NOT** add subagent-routing tables, full Examples sections, or rewrite descriptions yet (P2/P3 scope). Those are deferred to iteration-3 if iteration-2 doesn't close the gap.

## Cost projection for iteration-2

Same harness, same cases. Expected: ~$1.7 with_skill + ~$1.0 baseline = ~$2.7. Total iteration-1 + iteration-2: ~$5.5.

## Artifacts

- `iteration-1/benchmark.json` — machine-readable summary
- `iteration-1/benchmark.md` — markdown headline tables
- `iteration-1/grading-index.json` — per-run pass/fail counts
- `iteration-1/run-index.json` — per-run timing/exit
- `iteration-1/run.log` — full runner log
- `iteration-1/viewer/index.html` — static HTML viewer (212KB)
- `iteration-1/eval-<case>/<cond>/outputs/{rubrix.json,stdout.txt,stderr.txt,timing.json,grading.json}` — per-run evidence

## Next step

User decision required:
- **(A) Approve P1 quick-fix and run iteration-2** — apply the 4 SKILL.md edits above, re-run all 24 cases, compare to iteration-1.
- **(B) Stop here** — iteration-1 is the deliverable; sufficient evidence that current skills work but have known P1 gaps.
- **(C) Open viewer first** — review per-case outputs in browser before deciding (viewer at `iteration-1/viewer/index.html`).
