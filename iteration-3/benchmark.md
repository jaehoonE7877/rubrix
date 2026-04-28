# Iteration-1 Benchmark — rubrix-skills

Model: `claude-sonnet-4-6` · Generated: 2026-04-28T05:51:26.172Z

## Headline

| Configuration | Pass rate | Runs all-pass | Avg duration | Avg cost | Total cost |
|---|---|---|---|---|---|
| **with_skill** | **91.7%** (55/60) | 8/12 | 68.3s | $0.1594 | $1.9133 |
| baseline | 46.7% (28/60) | 2/12 | 30.5s | $0.0812 | $0.9741 |
| **delta** | **+45.0 pp** | +6 | +37.7s | +$0.0783 | — |

## By skill

| Skill | with_skill pass rate | baseline pass rate | delta |
|---|---|---|---|
| rubric | 93.3% (14/15) | 26.7% (4/15) | +66.6 pp |
| matrix | 100.0% (15/15) | 53.3% (8/15) | +46.7 pp |
| plan | 80.0% (12/15) | 60.0% (9/15) | +20.0 pp |
| score | 93.3% (14/15) | 46.7% (7/15) | +46.6 pp |

## Per case (head-to-head)

| Case | with_skill | baseline | delta |
|---|---|---|---|
| `matrix-01-happy-after-rubric-lock` | 5/5 | 2/5 | **+3** ✅ |
| `matrix-02-before-rubric-lock-negative` | 5/5 | 5/5 | tie |
| `matrix-03-natural-language-coverage-map` | 5/5 | 1/5 | **+4** ✅ |
| `plan-01-happy-after-matrix-lock` | 4/5 | 4/5 | tie |
| `plan-02-from-failed-negative` | 3/5 | 4/5 | **-1** ⚠️ |
| `plan-03-natural-language-action-plan` | 5/5 | 1/5 | **+4** ✅ |
| `rubric-01-happy-criteria` | 5/5 | 1/5 | **+4** ✅ |
| `rubric-02-bootstrap-missing-contract` | 5/5 | 2/5 | **+3** ✅ |
| `rubric-03-existing-contract-natural-language` | 4/5 | 1/5 | **+3** ✅ |
| `score-01-happy-after-plan-lock` | 4/5 | 2/5 | **+2** ✅ |
| `score-02-locks-plan-false-negative` | 5/5 | 5/5 | tie |
| `score-03-natural-language-judge-output` | 5/5 | 0/5 | **+5** ✅ |

## Notable signals

- with_skill **wins**: 8 cases
- **ties**: 3 cases
- with_skill **losses**: 1 cases
