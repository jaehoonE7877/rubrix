---
name: rubric
description: Draft and lock the evaluation rubric inside rubrix.json. Use this skill at the start of a Rubrix run, after the user states intent and before any matrix/plan/score work.
---

# /rubrix:rubric

Owns the `rubric.criteria[]`, `rubric.threshold`, and the `IntentDrafted -> RubricDrafted -> RubricLocked` transitions. All validation and persistence go through the CLI; this skill never edits `rubrix.json` directly with shell tools.

## Preconditions

- `rubrix.json` exists at the working directory (or `RUBRIX_CONTRACT` env var path).
- Current state must be `IntentDrafted` or `RubricDrafted`. Run `rubrix state get rubrix.json` to confirm.

## Steps

1. Read `rubrix.json` and the user's intent. Propose 3–7 criteria with `id`, `description`, `weight` (0–1, must sum near 1), optional `floor` (minimum acceptable score per criterion), and optional `verify` (how to collect evidence). Set `rubric.threshold`.
2. Write the proposed `rubric` object back into `rubrix.json` using `Edit` or `Write`. Editing `rubrix.json` itself is exempt from the `PreToolUse` code-edit gate (contract authoring is not implementation), so this works even while `locks.rubric=false`.
3. Run `rubrix validate rubrix.json` and fix any schema errors.
4. Run `rubrix state set rubrix.json RubricDrafted` if the state was still `IntentDrafted`.
5. **Run `rubrix lock rubric rubrix.json`** if the user requested completion of the rubric phase (e.g. "draft the rubric and lock it", "set up the rubric", "I'm ready to move on"). The CLI will atomically validate, set `locks.rubric=true`, and advance state to `RubricLocked`. **Skip the lock and stop at `RubricDrafted`** if the user asked only for a draft, preview, suggestion, or proposal ("show me a draft rubric", "what would the rubric look like?", "propose criteria"). In that case, present the proposed `rubric` block, run `rubrix validate`, and tell the user the next command is `rubrix lock rubric rubrix.json` when they're ready. A rubric left at `RubricDrafted` blocks downstream `/rubrix:matrix` until locked — this is intentional, not a bug.

   **Decision rule:** preserve the user's domain terminology in `criteria[].description` rather than rewording into generic phrases — the eval matrix and downstream judges grep these descriptions for canonical terms.

## Worked example

```jsonc
// rubrix.json excerpt before step 1
{ "state": "IntentDrafted", "locks": { "rubric": false, "matrix": false, "plan": false } }

// After step 1–2: rubric block written
{
  "rubric": {
    "threshold": 0.75,
    "criteria": [
      { "id": "c1", "description": "Auth token is validated on every request",
        "weight": 0.4, "floor": 0.7, "verify": "agent:output-judge" },
      { "id": "c2", "description": "Error messages do not leak internal paths",
        "weight": 0.3, "floor": 0.6, "verify": "manual review" },
      { "id": "c3", "description": "Unit tests cover happy and error paths",
        "weight": 0.3, "floor": 0.5, "verify": "vitest --coverage" }
    ]
  }
}

// After step 5 — rubrix lock rubric rubrix.json
{ "state": "RubricLocked", "locks": { "rubric": true, "matrix": false, "plan": false } }
```

## Postconditions

- `rubrix state get rubrix.json` reports `RubricLocked`.
- `rubrix.json` contains a complete `rubric` block with `threshold`, at least one criterion, and canonical fields (`floor`, `verify`); downstream `/rubrix:matrix` skill is now unblocked.
