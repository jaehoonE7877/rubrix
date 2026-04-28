---
name: matrix
description: Build the evidence matrix that maps each rubric criterion to required evidence and collection method. Use after the rubric is locked and before planning implementation steps.
---

# /rubrix:matrix

Owns `matrix.rows[]` and the `RubricLocked -> MatrixDrafted -> MatrixLocked` transitions.

## Preconditions

- `rubrix state get rubrix.json` reports `RubricLocked` (i.e. `locks.rubric === true`).
- If preconditions fail, refuse and tell the user to run `/rubrix:rubric` first.

## Steps

1. Read `rubrix.json`. For each `rubric.criteria[].id`, draft one matrix row with `id`, `criterion` (the criterion id), `evidence_required` (one sentence describing what artifact or observation proves this criterion), and optional `verify` (e.g. `vitest`, `manual review`, `agent:output-judge`).
2. Write the `matrix` block back into `rubrix.json`. (Editing `rubrix.json` itself is exempt from the `PreToolUse` code-edit gate, so this works even while `locks.matrix=false`.)
3. Run `rubrix validate rubrix.json`.
4. Run `rubrix state set rubrix.json MatrixDrafted`.
5. **Run `rubrix lock matrix rubrix.json`** if the user requested completion of the matrix phase (e.g. "build and lock the matrix", "wire up the evidence matrix", "ready for plan"). The CLI will set `locks.matrix=true` and advance state to `MatrixLocked`. **Skip the lock and stop at `MatrixDrafted`** if the user asked only for a draft / preview / suggestion ("show me a draft matrix", "what would the matrix look like?"). In that case, present the proposed `matrix` block, run `rubrix validate`, and tell the user the next command is `rubrix lock matrix rubrix.json` when ready. A matrix left at `MatrixDrafted` blocks `/rubrix:plan` until locked — this is intentional.

   **Decision rule:** every `matrix.rows[]` entry must use the exact `criterion` id from `rubric.criteria[].id`. Do not rename or paraphrase the criterion id, even if you reword the `evidence_required` text — the gate command joins on this id.

## Worked example

```jsonc
// rubrix.json excerpt before step 1
{ "state": "RubricLocked", "locks": { "rubric": true, "matrix": false, "plan": false },
  "rubric": {
    "threshold": 0.75,
    "criteria": [
      { "id": "c1", "description": "Auth token validated on every request", "weight": 0.4, "floor": 0.7 },
      { "id": "c2", "description": "Error messages do not leak paths",        "weight": 0.3, "floor": 0.6 },
      { "id": "c3", "description": "Unit tests cover happy + error paths",     "weight": 0.3, "floor": 0.5 }
    ]
  }
}

// After step 1–2: matrix block written
{
  "matrix": {
    "rows": [
      { "id": "m1", "criterion": "c1",
        "evidence_required": "Middleware logs show 401 on missing/invalid token",
        "verify": "agent:output-judge" },
      { "id": "m2", "criterion": "c2",
        "evidence_required": "Error response body contains only user-facing message",
        "verify": "manual review" },
      { "id": "m3", "criterion": "c3",
        "evidence_required": "vitest --coverage shows ≥ 80% branch coverage",
        "verify": "vitest --coverage" }
    ]
  }
}

// After step 5 — rubrix lock matrix rubrix.json
{ "state": "MatrixLocked", "locks": { "rubric": true, "matrix": true, "plan": false } }
```

## Postconditions

- `rubrix state get rubrix.json` reports `MatrixLocked`.
- Every criterion has at least one matrix row whose `criterion` field matches a `rubric.criteria[].id`. The `/rubrix:plan` skill is now unblocked.
