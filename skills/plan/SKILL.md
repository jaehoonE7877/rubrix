---
name: plan
description: Author the implementation plan that produces the evidence required by each matrix row. Use after the matrix is locked and before any code-editing tools are run.
---

# /rubrix:plan

Owns `plan.steps[]` and the `MatrixLocked -> PlanDrafted -> PlanLocked` transitions. After `PlanLocked`, the `PreToolUse` hook stops blocking code-editing tools (`Edit`, `Write`, `MultiEdit`, `NotebookEdit`).

## Preconditions

- `rubrix state get rubrix.json` must report one of:
  - `MatrixLocked` — first time entering /rubrix:plan after /rubrix:matrix.
  - `PlanDrafted` — resuming an in-progress draft.
  - `Failed` — a previous `/rubrix:score` failed and the user is iterating (revise plan and re-score).
- For other states, refuse and tell the user to run `/rubrix:matrix` first (or `/rubrix:score` if state is `PlanLocked`/`Scoring`).

## Steps

1. **If the current state is `Failed`, follow this two-mode protocol — DO NOT mutate by default:**

   - **Default mode (report-only): STOP after diagnosis.** Read `scores[]`, identify which criterion(s) fell below `floor` and why, and present a one-paragraph recovery report (which criterion failed, what the plan needs to change, and the recommended next CLI command). Then **stop and wait for the user**. Do NOT call `rubrix state set` and do NOT write a new plan in this turn. Steps 2–7 are skipped.
   
   - **Mutation mode: only when the user's prompt contains an explicit re-plan instruction** such as "revise the plan now", "re-plan and lock", "fix the plan and proceed", "go ahead and re-draft", or equivalent imperative phrasing. Ambiguous phrases like "what should we do?" / "I want a plan" / "tell me next steps" stay in default mode. Only in mutation mode, run `rubrix state set rubrix.json PlanDrafted` first (this resets `locks.plan=false` and clears stale `scores[]` atomically) and then proceed to step 2. Do not proceed to step 2 until `rubrix state get rubrix.json` confirms `PlanDrafted`.
   
   This protocol exists because step 7 ("`rubrix lock plan` is mandatory") otherwise creates a contradiction: if you start mutating without an explicit re-plan request, step 7 will lock the plan even though the user only asked for diagnosis. Default report-only mode prevents that.

2. Read `rubrix.json`. For each `matrix.rows[]` entry, draft at least one `plan.steps[]` entry with `id`, `action` (one sentence imperative), optional `produces` (artifact id or path), and `covers` (list of matrix row ids this step satisfies).

3. Ensure the union of every step's `covers` covers all matrix rows.

4. Write the `plan` block back into `rubrix.json`. (Editing `rubrix.json` itself is exempt from the `PreToolUse` code-edit gate.)

5. Run `rubrix validate rubrix.json`.

6. If the state is still `MatrixLocked`, run `rubrix state set rubrix.json PlanDrafted`.

7. **Run `rubrix lock plan rubrix.json`** if the user requested completion of the plan phase (e.g. "draft the plan and lock it", "ready to start implementing", "lock the plan"). The CLI will set `locks.plan=true` and advance state to `PlanLocked`. **Skip the lock and stop at `PlanDrafted`** if the user asked only for a draft / preview / proposal ("show me what the plan would look like", "draft a plan for review"). In that case, present the `plan` block, run `rubrix validate`, and tell the user the next command is `rubrix lock plan rubrix.json` when they're ready. A plan left at `PlanDrafted` blocks `/rubrix:score` and `PreToolUse` keeps blocking code edits until locked — this is intentional, not a bug.

   **Decision rule:** every `plan.steps[]` entry's `covers[]` must reference at least one `matrix.rows[].id`; the union of all `covers` arrays must hit every matrix row. If you cannot write a step that covers a row, ask the user — do not silently skip a row.

## Worked example — happy path

```jsonc
// rubrix.json excerpt before step 2 (state is MatrixLocked)
{ "state": "MatrixLocked", "locks": { "rubric": true, "matrix": true, "plan": false },
  "matrix": { "rows": [
    { "id": "m1", "criterion": "c1", "evidence_required": "Middleware 401 on invalid token" },
    { "id": "m2", "criterion": "c2", "evidence_required": "No path leaks in error body" }
  ]}
}

// After step 4: plan block written
{
  "plan": { "steps": [
    { "id": "s1", "action": "Add auth middleware that validates JWT on each request",
      "produces": "src/middleware/auth.ts", "covers": ["m1"] },
    { "id": "s2", "action": "Update error handler to strip internal stack traces",
      "produces": "src/middleware/error.ts", "covers": ["m2"] }
  ]}
}

// After step 7 — rubrix lock plan rubrix.json
{ "state": "PlanLocked", "locks": { "rubric": true, "matrix": true, "plan": true } }
```

## Worked example — recovery from Failed

```jsonc
// Fixture: state=Failed from a previous /rubrix:score run
{ "state": "Failed", "locks": { "rubric": true, "matrix": true, "plan": true },
  "scores": [{ "criterion": "c1", "score": 0.0, "notes": "No rollback policy" }] }

// Step 1 (MANDATORY): rubrix state set rubrix.json PlanDrafted
// → state=PlanDrafted, locks.plan=false, scores=[] (cleared)

// Then steps 2–7 proceed normally to produce a revised plan and re-lock
```

## Postconditions

- `rubrix state get rubrix.json` reports `PlanLocked`.
- `PreToolUse` no longer blocks code edits. Implementation work may begin; the `/rubrix:score` skill is the next gate.
