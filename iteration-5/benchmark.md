# Iteration-1 Benchmark — rubrix-skills

Model: `claude-sonnet-4-6` · Generated: 2026-04-28T07:24:32.509Z

## Headline

| Configuration | Pass rate | Runs all-pass | Avg duration | Avg cost | Total cost |
|---|---|---|---|---|---|
| **with_skill** | **53.8%** (35/65) | 2/13 | 35.1s | $0.0868 | $1.1290 |
| baseline | 52.3% (34/65) | 3/13 | 28.9s | $0.0798 | $1.0369 |
| **delta** | **+1.5 pp** | +-1 | +6.2s | +$0.0071 | — |

## By skill

| Skill | with_skill pass rate | baseline pass rate | delta |
|---|---|---|---|
| rubric | 60.0% (9/15) | 46.7% (7/15) | +13.3 pp |
| matrix | 53.3% (8/15) | 66.7% (10/15) | -13.4 pp |
| plan | 46.7% (7/15) | 33.3% (5/15) | +13.4 pp |
| score | 55.0% (11/20) | 60.0% (12/20) | -5.0 pp |

## Per case (head-to-head)

| Case | with_skill | baseline | delta |
|---|---|---|---|
| `matrix-01-happy-after-rubric-lock` | 2/5 | 3/5 | **-1** ⚠️ |
| `matrix-02-before-rubric-lock-negative` | 5/5 | 5/5 | tie |
| `matrix-03-natural-language-coverage-map` | 1/5 | 2/5 | **-1** ⚠️ |
| `plan-01-happy-after-matrix-lock` | 3/5 | 1/5 | **+2** ✅ |
| `plan-02-from-failed-negative` | 3/5 | 3/5 | tie |
| `plan-03-natural-language-action-plan` | 1/5 | 1/5 | tie |
| `rubric-01-happy-criteria` | 3/5 | 2/5 | **+1** ✅ |
| `rubric-02-bootstrap-missing-contract` | 2/5 | 2/5 | tie |
| `rubric-03-existing-contract-natural-language` | 4/5 | 3/5 | **+1** ✅ |
| `score-01-happy-after-plan-lock` | 2/5 | 2/5 | tie |
| `score-02-locks-plan-false-negative` | 5/5 | 5/5 | tie |
| `score-03-natural-language-judge-output` | 0/5 | 0/5 | tie |
| `score-04-no-contract-verdict-holdout` | 4/5 | 5/5 | **-1** ⚠️ |

## Notable signals

- with_skill **wins**: 3 cases
- **ties**: 7 cases
- with_skill **losses**: 3 cases
