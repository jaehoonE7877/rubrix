---
name: score
description: Run evaluators against the implemented artifact and decide pass/fail via the gate. Trigger ONLY when ALL of these hold (a) `rubrix.json` exists in the working directory, (b) state is `PlanLocked`, AND (c) the user asks to evaluate that contract's evidence — phrased as scoring, "does this pass the rubric?", "judge this run", a per-criterion verdict, or a pass/fail decision against the locked rubric. If any of (a)/(b)/(c) is unclear, ask the user before mutating. Do NOT trigger on generic "review this code" / "is this design good?" prompts that aren't about a Rubrix contract.
---

# /rubrix:score

Owns `scores[]`, the `PlanLocked -> Scoring` transition, and the `Scoring -> Passed | Failed` decision (the latter only via `rubrix gate --apply`).

**Critical: every lifecycle transition (`PlanLocked → Scoring`, `Scoring → Passed|Failed`) must be performed through CLI commands. Evaluator subagent calls and `scores[]` writes to `rubrix.json` are required side effects of those transitions, not prose. A run that produces only a text verdict — without mutating `rubrix.json` — is incomplete, regardless of how correct the analysis reads.**

## Preconditions

- `rubrix state get rubrix.json` reports `PlanLocked` (i.e. all three locks are `true`).
- The `PreToolUse` hook will block this skill if `locks.plan === false`.
- If preconditions fail, refuse and tell the user to run `/rubrix:plan` first.

## Steps

1. **Run `rubrix state set rubrix.json Scoring`** — this is the first mutation. If this command is not executed, the contract stays at `PlanLocked` and all downstream steps are meaningless.

2. For each `rubric.criteria[].id`, invoke the appropriate evaluator subagent (e.g. `agents/output-judge.md` for verdict-by-criterion, `agents/evidence-finder.md` to locate supporting artifacts). Each evaluator must return a JSON object matching `cli/schemas/evaluator-result.schema.json`.

3. **Write `scores[]` into `rubrix.json`** — for every criterion produce one entry with `criterion` (id string), `score` (0–1), `evaluator` (agent name), `confidence` (0–1), and `notes` (free text). Use `Edit` or `Write` on `rubrix.json` directly; do not defer this write.

   **Field name (안티-환각):** the field is literally `"criterion"` — NOT `"criterion_id"`, NOT `"criteria_id"`, NOT `"criteriaId"`. The schema (`cli/schemas/rubrix.schema.json`) sets `additionalProperties: false` on `scores[]`, so any other spelling causes `rubrix validate` to fail. Copy the field name from the example below verbatim.

4. **Run `rubrix validate rubrix.json`** and fix any errors before continuing.

5. **Run `rubrix gate rubrix.json --apply`** — this is the terminal mutation:
   - exit `0` → persists `state=Passed` when weighted total ≥ `rubric.threshold` and no criterion is below its `floor`
   - exit `4` → persists `state=Failed` otherwise
   
   If you only narrate the verdict without running this command, `rubrix.json` will still say `Scoring` and the lifecycle will stall.

6. **Run `rubrix report rubrix.json`** and present the markdown report to the user. If `state=Failed`, the `Stop` hook will block exit until the user iterates: re-run `/rubrix:plan` to revise the plan and then `/rubrix:score` again.

## Worked example

```jsonc
// Before step 1 — rubrix.json excerpt
{ "state": "PlanLocked", "locks": { "rubric": true, "matrix": true, "plan": true },
  "rubric": { "threshold": 0.8,
    "criteria": [
      { "id": "c1", "description": "Has rollback policy", "weight": 0.5, "floor": 0.7 },
      { "id": "c2", "description": "Test coverage ≥ 80%",  "weight": 0.5, "floor": 0.6 }
    ]
  }
}

// After step 3 — scores[] written
"scores": [
  { "criterion": "c1", "score": 0.0, "evaluator": "output-judge", "confidence": 0.95,
    "notes": "No rollback policy found in plan.md — FAIL, below floor 0.7" },
  { "criterion": "c2", "score": 0.9, "evaluator": "output-judge", "confidence": 0.90,
    "notes": "Tests cover 87% of branches — PASS" }
]

// After step 5 — rubrix gate --apply writes state=Failed
// (weighted 0.5*0.0 + 0.5*0.9 = 0.45 < threshold 0.8; c1 below floor)
{ "state": "Failed", ... }
```

## Postconditions

- `rubrix state get rubrix.json` reports `Passed` or `Failed`.
- `scores[]` contains exactly one entry per criterion.
- A markdown report is printed to the user.
