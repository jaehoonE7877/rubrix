# Iteration-1 Benchmark — rubrix-skills

Model: `claude-sonnet-4-6` · Generated: 2026-04-28T05:29:08.583Z

## Headline

| Configuration | Pass rate | Runs all-pass | Avg duration | Avg cost | Total cost |
|---|---|---|---|---|---|
| **with_skill** | **85.0%** (51/60) | 8/12 | 56.1s | $0.1743 | $2.0915 |
| baseline | 46.7% (28/60) | 2/12 | 30.9s | $0.0918 | $1.1017 |
| **delta** | **+38.3 pp** | +6 | +25.1s | +$0.0825 | — |

## By skill

| Skill | with_skill pass rate | baseline pass rate | delta |
|---|---|---|---|
| rubric | 100.0% (15/15) | 46.7% (7/15) | +53.3 pp |
| matrix | 100.0% (15/15) | 46.7% (7/15) | +53.3 pp |
| plan | 80.0% (12/15) | 46.7% (7/15) | +33.3 pp |
| score | 60.0% (9/15) | 46.7% (7/15) | +13.3 pp |

## Per case (head-to-head)

| Case | with_skill | baseline | delta |
|---|---|---|---|
| `matrix-01-happy-after-rubric-lock` | 5/5 | 1/5 | **+4** ✅ |
| `matrix-02-before-rubric-lock-negative` | 5/5 | 5/5 | tie |
| `matrix-03-natural-language-coverage-map` | 5/5 | 1/5 | **+4** ✅ |
| `plan-01-happy-after-matrix-lock` | 4/5 | 3/5 | **+1** ✅ |
| `plan-02-from-failed-negative` | 3/5 | 3/5 | tie |
| `plan-03-natural-language-action-plan` | 5/5 | 1/5 | **+4** ✅ |
| `rubric-01-happy-criteria` | 5/5 | 2/5 | **+3** ✅ |
| `rubric-02-bootstrap-missing-contract` | 5/5 | 2/5 | **+3** ✅ |
| `rubric-03-existing-contract-natural-language` | 5/5 | 3/5 | **+2** ✅ |
| `score-01-happy-after-plan-lock` | 4/5 | 2/5 | **+2** ✅ |
| `score-02-locks-plan-false-negative` | 5/5 | 5/5 | tie |
| `score-03-natural-language-judge-output` | 0/5 | 0/5 | tie |

## Notable signals

- with_skill **wins**: 8 cases
- **ties**: 4 cases
- with_skill **losses**: 0 cases
