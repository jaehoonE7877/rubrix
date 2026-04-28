# Iteration-1 Benchmark — rubrix-skills

Model: `claude-sonnet-4-6` · Generated: 2026-04-28T07:29:29.602Z

## Headline

| Configuration | Pass rate | Runs all-pass | Avg duration | Avg cost | Total cost |
|---|---|---|---|---|---|
| **with_skill** | **50.8%** (33/65) | 3/13 | 34.1s | $0.0877 | $1.1396 |
| baseline | 55.4% (36/65) | 3/13 | 32.2s | $0.0830 | $1.0792 |
| **delta** | **-4.6 pp** | +0 | +1.9s | +$0.0046 | — |

## By skill

| Skill | with_skill pass rate | baseline pass rate | delta |
|---|---|---|---|
| rubric | 53.3% (8/15) | 73.3% (11/15) | -20.0 pp |
| matrix | 53.3% (8/15) | 60.0% (9/15) | -6.7 pp |
| plan | 33.3% (5/15) | 26.7% (4/15) | +6.6 pp |
| score | 60.0% (12/20) | 60.0% (12/20) | +0.0 pp |

## Per case (head-to-head)

| Case | with_skill | baseline | delta |
|---|---|---|---|
| `matrix-01-happy-after-rubric-lock` | 2/5 | 2/5 | tie |
| `matrix-02-before-rubric-lock-negative` | 5/5 | 5/5 | tie |
| `matrix-03-natural-language-coverage-map` | 1/5 | 2/5 | **-1** ⚠️ |
| `plan-01-happy-after-matrix-lock` | 1/5 | 0/5 | **+1** ✅ |
| `plan-02-from-failed-negative` | 3/5 | 3/5 | tie |
| `plan-03-natural-language-action-plan` | 1/5 | 1/5 | tie |
| `rubric-01-happy-criteria` | 3/5 | 3/5 | tie |
| `rubric-02-bootstrap-missing-contract` | 2/5 | 4/5 | **-2** ⚠️ |
| `rubric-03-existing-contract-natural-language` | 3/5 | 4/5 | **-1** ⚠️ |
| `score-01-happy-after-plan-lock` | 2/5 | 2/5 | tie |
| `score-02-locks-plan-false-negative` | 5/5 | 5/5 | tie |
| `score-03-natural-language-judge-output` | 0/5 | 0/5 | tie |
| `score-04-no-contract-verdict-holdout` | 5/5 | 5/5 | tie |

## Notable signals

- with_skill **wins**: 1 cases
- **ties**: 9 cases
- with_skill **losses**: 3 cases
