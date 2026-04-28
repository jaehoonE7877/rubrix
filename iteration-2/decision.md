# Iteration-2 Decision Record

**Date:** 2026-04-28
**Model:** `claude-sonnet-4-6`
**Cases:** 12 · **Conditions:** 2 · **Total runs:** 24
**Wall clock:** 175.7s · **Total cost:** $3.19 ($2.09 with_skill + $1.10 baseline)

## Headline

| Configuration | Pass rate | Runs all-pass | Avg duration | Avg cost |
|---|---|---|---|---|
| **with_skill** | **85.0%** (51/60) | 8/12 | 44.7s | $0.174 |
| baseline       | 46.7% (28/60)    | 3/12 | 23.4s | $0.092 |
| **delta**      | **+38.3 pp**     | +5   | +21.3s | +$0.082 |

## vs iteration-1

| Metric | iteration-1 | iteration-2 | delta |
|---|---|---|---|
| with_skill pass rate | 78.3% | **85.0%** | **+6.7 pp** |
| baseline pass rate | 53.3% | 46.7% | −6.6 pp (variance) |
| total delta (ws − bl) | +25.0 pp | **+38.3 pp** | **+13.3 pp** |
| with_skill all-pass runs | 5/12 | **8/12** | **+3** |

## Per-skill breakdown

| Skill | iter-1 with_skill | iter-2 with_skill | delta | baseline |
|---|---|---|---|---|
| rubric | 80.0% | **100.0%** | **+20.0 pp** ✅ | 46.7% |
| matrix | 93.3% | **100.0%** | **+6.7 pp** ✅ | 46.7% |
| plan   | 80.0% | 80.0%     | **0 pp** — unchanged | 46.7% |
| score  | 60.0% | 60.0%     | **0 pp** — unchanged | 46.7% |

## Per-case head-to-head

| Case | iter-1 with_skill | iter-2 with_skill | change |
|---|---|---|---|
| `matrix-01` | 5/5 | 5/5 | — |
| `matrix-02` | 5/5 | 5/5 | — |
| `matrix-03` | 4/5 | **5/5** | **+1** ✅ |
| `plan-01` | 4/5 | 4/5 | — |
| `plan-02` | 3/5 | 3/5 | — |
| `plan-03` | 5/5 | 5/5 | — |
| `rubric-01` | 4/5 | **5/5** | **+1** ✅ |
| `rubric-02` | 5/5 | 5/5 | — |
| `rubric-03` | 3/5 | **5/5** | **+2** ✅ (was RubricDrafted, now RubricLocked) |
| `score-01` | 4/5 | 4/5 | — (lifecycle runs, but over-strict scoring) |
| `score-02` | 5/5 | 5/5 | — |
| `score-03` | 0/5 | 0/5 | — ❌ persistent failure |

## What the Quick Fix fixed

### Fixed: Cluster 1 — `*Drafted` not advancing to `*Locked`
- `rubric-03` improved from 3/5 → 5/5. The "mandatory, not optional" lock step language resolved this.
- `matrix-03` improved from 4/5 → 5/5. Same fix.
- `rubric-01` improved from 4/5 → 5/5 (lock + canonical field names in example).

### Partially fixed: Cluster 3 — score skill lifecycle
- `score-01`: The skill now mutates rubrix.json (scores[] written, gate applied, state changed). Previously it produced prose only. The 4/5 failure is now a content-judgment error (model scored c2 at 0.0 due to fixture stub limitations), not a lifecycle omission.
- `score-03`: Still 0/5. See below.

## Persistent failures

### score-03 — Natural language judge prompt (0/5)

Root cause: The score-03 prompt phrase is **"Judge whether this run passed. I need a criterion-by-criterion verdict"**. The model interprets this as a text-producing task rather than a lifecycle-execution task, so it generates a correct prose verdict (computed 0.621 < 0.80, identified c3 below floor) but never runs `rubrix state set Scoring` or `rubrix gate --apply`.

This is distinct from the iteration-1 failure: in iteration-1 the skill body instructions were ambiguous. In iteration-2 the skill body is explicit, but the model isn't recognising "judge/verdict" natural language as triggering the `/score` skill at all.

**Diagnosis:** The skill `description` (frontmatter) says *"Use after the plan is locked and the implementation work is complete"* — it doesn't say "when the user asks for a judgment, verdict, or criterion-by-criterion assessment." The skill is not being triggered by the score-03 prompt phrasing.

**Fix required (P2 — skill description):** Add "…or when the user asks for a pass/fail verdict, judgment, or criterion assessment on a completed run" to the score `description` frontmatter.

### plan-02 — Recovery from Failed (tie 3/5, unchanged)
Model still advances from Failed to PlanLocked without pausing for explanation. The plan-01 Step 1 language is already in the SKILL.md but the eval assertion for plan-02 checks that the model EXPLAINS the recovery path rather than auto-executes it. Debatable scope — documented but not targeted in this iteration.

### score-01 — Fixture stub limitation (4/5)
c2 ("contains exact command invocations") scored 0.0 because the fixture's stub stdout.txt only has pass/fail messages. This is a fixture design issue, not a skill issue — the model now correctly runs the lifecycle.

## Decision tree application

### Decision 1 — ship as-is — **REJECTED**
- with_skill pass rate ≥ 95% — **NO** (85.0%)
- no skill has more than one failed assertion — **NO** (score has two persistent failures)

### Decision 2 — Quick Fix P1 + iteration-3 — **TRIGGERED ✅**
- with_skill pass rate 70–94% — **YES** (85.0%)
- failures cluster around known patterns — **YES** (score trigger mismatch, plan-02 assertion scope)
- with_skill beats baseline in ≥ 7 of 12 evals — **YES** (9 wins, 3 ties, 0 losses)
- most happy paths pass — **YES** (8/12 all-pass; only score-03 is a clean 0/5)

### Decision 3 — Full Revision — **NOT TRIGGERED**
- with_skill ≥ 70% (would need <70%) ✅
- beats baseline ≥ 7/12 (would need <7) ✅

## Recommended Quick Fix scope for iteration-3

Apply ONLY:

1. **`skills/score/SKILL.md` frontmatter `description`** — append trigger phrase: *"Also trigger when the user asks for a judgment, verdict, pass/fail assessment, or criterion-by-criterion evaluation of a completed run."*

2. **`skills/plan/SKILL.md`** — for `Failed` state, step 1 language is correct but plan-02 eval fixture expects "explain recovery" rather than "auto-advance". Consider whether to adjust the fixture assertion (expected behaviour may be over-specified) OR add a sentence: *"If the user has not explicitly asked to re-plan, describe the recovery steps and wait for confirmation before running `rubrix state set PlanDrafted`."*

3. **`score-01` fixture** — update `fixture/outputs/stdout.txt` to include at least one shell command line so c2 ("contains exact command invocations") passes legitimately on a good run.

4. **Do NOT** add subagent-routing tables, description overhaul, or architecture changes (P3 scope). Those are deferred if iteration-3 doesn't close to ≥ 93%.

## Cost projection for iteration-3

Same harness, same 12 cases. Expected ~$2.1 with_skill + ~$1.1 baseline = ~$3.2. Total 3-iteration budget: ~$9.1.

## Artifacts

- `iteration-2/benchmark.json` — machine-readable summary
- `iteration-2/benchmark.md` — markdown headline tables
- `iteration-2/run-index.json` — per-run timing/exit
- `iteration-2/run.log` — full runner log
- `iteration-2/viewer/index.html` — static HTML viewer with iteration-1 comparison (366KB)
- `iteration-2/eval-<case>/<cond>/outputs/{rubrix.json,stdout.txt,stderr.txt,timing.json,grading.json}` — per-run evidence

## Next step

- **(A) Approve P2 quick-fix and run iteration-3** — apply 3 targeted changes above (score description + plan-02 language + score-01 fixture), re-run 24 cases.
- **(B) Stop here** — 85% with_skill / +38pp delta is sufficient as deliverable.
- **(C) Open viewer** — review iteration-2 outputs with iteration-1 comparison in browser before deciding (`iteration-2/viewer/index.html`).
