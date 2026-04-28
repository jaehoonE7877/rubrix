# Iteration-1 Benchmark — rubrix-skills

Model: `claude-sonnet-4-6` · Generated: 2026-04-28T03:46:55.503Z

## Headline

| Configuration | Pass rate | Runs all-pass | Avg duration | Avg cost | Total cost |
|---|---|---|---|---|---|
| **with_skill** | **78.3%** (47/60) | 5/12 | 53.8s | $0.1422 | $1.7063 |
| baseline | 53.3% (32/60) | 2/12 | 32.2s | $0.0863 | $1.0355 |
| **delta** | **+25.0 pp** | +3 | +21.7s | +$0.0559 | — |

## By skill

| Skill | with_skill pass rate | baseline pass rate | delta |
|---|---|---|---|
| rubric | 80.0% (12/15) | 53.3% (8/15) | +26.7 pp |
| matrix | 93.3% (14/15) | 60.0% (9/15) | +33.3 pp |
| plan | 80.0% (12/15) | 46.7% (7/15) | +33.3 pp |
| score | 60.0% (9/15) | 53.3% (8/15) | +6.7 pp |

## Per case (head-to-head)

| Case | with_skill | baseline | delta |
|---|---|---|---|
| `matrix-01-happy-after-rubric-lock` | 5/5 | 3/5 | **+2** ✅ |
| `matrix-02-before-rubric-lock-negative` | 5/5 | 5/5 | tie |
| `matrix-03-natural-language-coverage-map` | 4/5 | 1/5 | **+3** ✅ |
| `plan-01-happy-after-matrix-lock` | 4/5 | 3/5 | **+1** ✅ |
| `plan-02-from-failed-negative` | 3/5 | 3/5 | tie |
| `plan-03-natural-language-action-plan` | 5/5 | 1/5 | **+4** ✅ |
| `rubric-01-happy-criteria` | 4/5 | 3/5 | **+1** ✅ |
| `rubric-02-bootstrap-missing-contract` | 5/5 | 2/5 | **+3** ✅ |
| `rubric-03-existing-contract-natural-language` | 3/5 | 3/5 | tie |
| `score-01-happy-after-plan-lock` | 4/5 | 2/5 | **+2** ✅ |
| `score-02-locks-plan-false-negative` | 5/5 | 5/5 | tie |
| `score-03-natural-language-judge-output` | 0/5 | 1/5 | **-1** ⚠️ |

## Notable signals

- with_skill **wins**: 7 cases
- **ties**: 4 cases
- with_skill **losses**: 1 cases
