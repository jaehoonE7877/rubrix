# Iteration-1 Benchmark — rubrix-skills

Model: `claude-sonnet-4-6` · Generated: 2026-04-28T06:24:40.973Z

## Headline

| Configuration | Pass rate | Runs all-pass | Avg duration | Avg cost | Total cost |
|---|---|---|---|---|---|
| **with_skill** | **96.9%** (63/65) | 11/13 | 49.1s | $0.1374 | $1.7857 |
| baseline | 53.8% (35/65) | 3/13 | 27.7s | $0.0766 | $0.9960 |
| **delta** | **+43.1 pp** | +8 | +21.4s | +$0.0607 | — |

## By skill

| Skill | with_skill pass rate | baseline pass rate | delta |
|---|---|---|---|
| rubric | 93.3% (14/15) | 33.3% (5/15) | +60.0 pp |
| matrix | 100.0% (15/15) | 73.3% (11/15) | +26.7 pp |
| plan | 93.3% (14/15) | 46.7% (7/15) | +46.6 pp |
| score | 100.0% (20/20) | 60.0% (12/20) | +40.0 pp |

## Per case (head-to-head)

| Case | with_skill | baseline | delta |
|---|---|---|---|
| `matrix-01-happy-after-rubric-lock` | 5/5 | 4/5 | **+1** ✅ |
| `matrix-02-before-rubric-lock-negative` | 5/5 | 5/5 | tie |
| `matrix-03-natural-language-coverage-map` | 5/5 | 2/5 | **+3** ✅ |
| `plan-01-happy-after-matrix-lock` | 4/5 | 3/5 | **+1** ✅ |
| `plan-02-from-failed-negative` | 5/5 | 3/5 | **+2** ✅ |
| `plan-03-natural-language-action-plan` | 5/5 | 1/5 | **+4** ✅ |
| `rubric-01-happy-criteria` | 5/5 | 2/5 | **+3** ✅ |
| `rubric-02-bootstrap-missing-contract` | 5/5 | 2/5 | **+3** ✅ |
| `rubric-03-existing-contract-natural-language` | 4/5 | 1/5 | **+3** ✅ |
| `score-01-happy-after-plan-lock` | 5/5 | 2/5 | **+3** ✅ |
| `score-02-locks-plan-false-negative` | 5/5 | 5/5 | tie |
| `score-03-natural-language-judge-output` | 5/5 | 0/5 | **+5** ✅ |
| `score-04-no-contract-verdict-holdout` | 5/5 | 5/5 | tie |

## Notable signals

- with_skill **wins**: 10 cases
- **ties**: 3 cases
- with_skill **losses**: 0 cases
