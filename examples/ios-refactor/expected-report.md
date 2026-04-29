# Expected Report — examples/ios-refactor

The checked-in `examples/ios-refactor/rubrix.json` is already in the `Passed` state with realistic scores. Running `rubrix report examples/ios-refactor/rubrix.json` produces this exact output:

```
# Rubrix Report

- **Intent**: Refactor LoginViewController to extract auth logic into LoginInteractor without breaking behavior.
- **State**: Passed
- **Locks**: rubric=true matrix=true plan=true

## Rubric (threshold 0.85)

| id | weight | floor | description |
| --- | --- | --- | --- |
| tests_pass | 0.4 | 1 | All existing iOS unit + UI tests pass after the refactor. |
| public_api_unchanged | 0.25 | 1 | Public symbols of LoginViewController have identical signatures pre/post refactor. |
| interactor_extracted | 0.2 | 0.7 | Auth logic is moved into LoginInteractor; LoginViewController has no direct AuthService calls. |
| background_queue_preserved | 0.15 | 0.8 | Every network call stays on URLSession's background queue (no main-thread blocking). |

## Gate: PASS

- total=0.945 threshold=0.85

| criterion | weight | floor | score | status |
| --- | --- | --- | --- | --- |
| tests_pass | 0.4 | 1 | 1 | ok |
| public_api_unchanged | 0.25 | 1 | 1 | ok |
| interactor_extracted | 0.2 | 0.7 | 0.8 | ok |
| background_queue_preserved | 0.15 | 0.8 | 0.9 | ok |
```

Total math: `0.4*1.0 + 0.25*1.0 + 0.2*0.8 + 0.15*0.9 = 0.945`. The threshold is `0.85`, so the gate passes; no criterion is below its `floor`.

A failing run (e.g. one test still red, dropping `tests_pass` below its `floor=1.0`) would show `## Gate: FAIL`, `rubrix gate` would exit `4`, and `state` would be `Failed`. The user iterates by running `/plan` again to revise the plan, then `/score`. The CLI clears stale `scores[]` on the `Failed -> PlanDrafted` transition.
