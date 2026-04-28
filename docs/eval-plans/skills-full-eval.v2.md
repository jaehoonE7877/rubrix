## Schema correctness note

v2 fixes three schema mismatches from v1:

- State names: replaces nonexistent `Draft` and `Scored` states with the canonical lifecycle states. Score happy path ends in `Passed`; the missing rollback-policy score case ends in `Failed`.
- Score commitment: removes the nonexistent score lock. Scoring is committed by terminal `state` plus populated `scores[]`.
- Skill-creator path and commands: replaces the nonexistent `.codex/skills/.system/skill-creator` path and invented viewer module with the verified Claude skill path, `scripts.aggregate_benchmark`, and `eval-viewer/generate_review.py`.

Fixture JSON in this plan is written against `cli/schemas/rubrix.schema.json` and was checked with:

```bash
node cli/bin/rubrix.js validate <fixture>
```

---

## A. Scope Decisions

### A1. Evaluate all 4 skills in one pass

Pick: **all 4 skills in one iteration pass**.

Trade-off:

- One-at-a-time gives cleaner debugging, but it misses cross-skill workflow failures such as `/rubric` producing a contract that `/matrix`, `/plan`, or `/score` cannot consume.
- All-at-once is more expensive, but this repo’s value is the full eval workflow, so the first benchmark should measure the system as a pipeline.

Execution unit:

```text
/Users/jaehoonseo/Desktop/JaehoonE/rubrix/.claude/worktrees/sleepy-pike-a5dc39/iteration-1/
```

Run matrix:

```text
4 skills x 3 prompts x 2 conditions = 24 runs
```

### A2. Use 3 prompts per skill

Pick: **3 prompts per skill**.

Justification:

- The known issues include trigger coverage, missing bootstrap behavior, lock-state errors, and workflow ordering. Two prompts would force either happy path or edge path to be undercovered.
- Three prompts per skill is still small enough for one parallel iteration while covering happy path, natural-language trigger, and negative/edge behavior.

### A3. Baseline means no skill loaded

Pick: **baseline = no Rubrix skill loaded at all**.

Justification:

- The user wants to know whether the current skills improve results versus ordinary Claude behavior. Comparing “current SKILL.md” against itself before improvements does not answer that.
- The “with-skill” condition is the current checked-in skill. The “baseline” condition is the same task in the same repo with Rubrix skills unavailable.

Conditions:

```text
with_skill:
  Uses current repo skills:
  - skills/rubric/SKILL.md
  - skills/matrix/SKILL.md
  - skills/plan/SKILL.md
  - skills/score/SKILL.md

baseline:
  Same repo files and same prompt fixtures, but run with an isolated Claude config where these skills are not discoverable.
```

### A4. Workspace location

Pick: **repo-local `iteration-1/` at the repo root**.

Path:

```text
/Users/jaehoonseo/Desktop/JaehoonE/rubrix/.claude/worktrees/sleepy-pike-a5dc39/iteration-1
```

Justification:

- It keeps eval artifacts close to the plugin version being tested.
- It avoids mixing benchmark outputs into `.claude/`, which should remain plugin/runtime configuration, not generated evaluation data.

Directory layout:

```text
iteration-1/
  cases/
    rubric-01/
      prompt.md
      fixture/
    rubric-02/
      prompt.md
      fixture/
    ...
  eval-rubric-01/
    with_skill/
      outputs/
        rubrix.json
        stdout.txt
        stderr.txt
        timing.json
        grading.json
    baseline/
      outputs/
        rubrix.json
        stdout.txt
        stderr.txt
        timing.json
        grading.json
  benchmark.json
  benchmark.md
  viewer/
  feedback.json
```

---

## B. Test Prompt Design

## B1. `/rubric` Skill

### `rubric-01-happy-criteria`

Purpose: happy path from vague request to locked rubric.

Prompt:

```markdown
I want to add a small CLI command that checks whether a rubrix.json file is valid. Before anyone implements it, define the evaluation criteria and scoring rules for what counts as done.
```

Initial fixture:

```text
No rubrix.json exists.
```

Expected skill trigger coverage:

```text
evaluation criteria
scoring rules
what counts as done
```

### `rubric-02-bootstrap-missing-contract`

Purpose: edge case for missing `rubrix.json`.

Prompt:

```markdown
There is no rubrix.json yet. Bootstrap one for this request: make Rubrix reject vague implementation plans unless they include acceptance criteria, evidence paths, and a test command. I need the rubric first.
```

Initial fixture:

```text
No rubrix.json exists.
```

Expected skill trigger coverage:

```text
no rubrix.json
Bootstrap
rubric first
acceptance criteria
```

### `rubric-03-existing-contract-natural-language`

Purpose: natural-language trigger without slash command.

Prompt:

```markdown
For the existing contract, tighten the definition of done. I want clear pass/fail criteria for the output quality, especially around evidence, unsupported claims, and whether the plan is actionable.
```

Initial fixture:

```json
{
  "version": "0.1",
  "intent": {
    "summary": "Improve Rubrix planning output quality"
  },
  "state": "IntentDrafted",
  "locks": {
    "rubric": false,
    "matrix": false,
    "plan": false
  }
}
```

Expected skill trigger coverage:

```text
definition of done
pass/fail criteria
output quality
evidence
actionable
```

---

## B2. `/matrix` Skill

### `matrix-01-happy-after-rubric-lock`

Purpose: happy path from locked rubric to evaluation matrix.

Prompt:

```markdown
The rubric is locked. Build the evaluation matrix so we can compare candidate plans against each criterion with clear pass/fail evidence requirements.
```

Initial fixture:

```json
{
  "version": "0.1",
  "intent": {
    "summary": "Evaluate whether a Rubrix plan is implementation-ready"
  },
  "state": "RubricLocked",
  "locks": {
    "rubric": true,
    "matrix": false,
    "plan": false
  },
  "rubric": {
    "threshold": 0.8,
    "criteria": [
      {
        "id": "c1",
        "description": "Plan has explicit acceptance criteria",
        "weight": 0.34,
        "floor": 0.7
      },
      {
        "id": "c2",
        "description": "Plan names concrete evidence files or commands",
        "weight": 0.33,
        "floor": 0.7
      },
      {
        "id": "c3",
        "description": "Plan distinguishes blockers from nice-to-haves",
        "weight": 0.33,
        "floor": 0.7
      }
    ]
  }
}
```

Expected skill trigger coverage:

```text
evaluation matrix
compare candidate plans
criterion
evidence requirements
```

### `matrix-02-before-rubric-lock-negative`

Purpose: negative case for matrix before rubric is locked.

Prompt:

```markdown
Can you create the matrix now? The criteria are probably obvious from the request, so just move forward if possible.
```

Initial fixture:

```json
{
  "version": "0.1",
  "intent": {
    "summary": "Evaluate CLI output quality"
  },
  "state": "IntentDrafted",
  "locks": {
    "rubric": false,
    "matrix": false,
    "plan": false
  }
}
```

Expected behavior:

```text
Do not invent matrix rows.
Tell user rubric must be created or locked first.
Leave matrix unlocked.
```

### `matrix-03-natural-language-coverage-map`

Purpose: natural-language trigger without using “matrix” as the primary instruction.

Prompt:

```markdown
I need a coverage map from each scoring rule to the exact evidence we should collect. Make it strict enough that two reviewers would check the same things.
```

Initial fixture:

```json
{
  "version": "0.1",
  "intent": {
    "summary": "Review Rubrix skill outputs"
  },
  "state": "RubricLocked",
  "locks": {
    "rubric": true,
    "matrix": false,
    "plan": false
  },
  "rubric": {
    "threshold": 0.8,
    "criteria": [
      {
        "id": "c1",
        "description": "Output includes objective assertions",
        "weight": 0.34,
        "floor": 0.7
      },
      {
        "id": "c2",
        "description": "Output includes concrete file paths",
        "weight": 0.33,
        "floor": 0.7
      },
      {
        "id": "c3",
        "description": "Output avoids vague quality claims",
        "weight": 0.33,
        "floor": 0.7
      }
    ]
  }
}
```

Expected skill trigger coverage:

```text
coverage map
scoring rule
exact evidence
strict
two reviewers
```

---

## B3. `/plan` Skill

### `plan-01-happy-after-matrix-lock`

Purpose: happy path from locked rubric and matrix to implementation plan.

Prompt:

```markdown
Use the locked rubric and matrix to produce the implementation plan. It should be step-by-step, evidence-backed, and ready for a coding agent to execute.
```

Initial fixture:

```json
{
  "version": "0.1",
  "intent": {
    "summary": "Improve Rubrix skill trigger reliability"
  },
  "state": "MatrixLocked",
  "locks": {
    "rubric": true,
    "matrix": true,
    "plan": false
  },
  "rubric": {
    "threshold": 0.8,
    "criteria": [
      {
        "id": "c1",
        "description": "Skill descriptions trigger on natural language",
        "weight": 0.34,
        "floor": 0.7
      },
      {
        "id": "c2",
        "description": "Skill handles invalid lock state explicitly",
        "weight": 0.33,
        "floor": 0.7
      },
      {
        "id": "c3",
        "description": "Skill includes at least one realistic example",
        "weight": 0.33,
        "floor": 0.7
      }
    ]
  },
  "matrix": {
    "rows": [
      {
        "id": "m1",
        "criterion": "c1",
        "evidence_required": "SKILL.md description contains natural-language trigger phrases"
      },
      {
        "id": "m2",
        "criterion": "c2",
        "evidence_required": "SKILL.md workflow includes failure handling"
      },
      {
        "id": "m3",
        "criterion": "c3",
        "evidence_required": "SKILL.md includes examples section"
      }
    ]
  }
}
```

Expected skill trigger coverage:

```text
implementation plan
step-by-step
evidence-backed
coding agent
```

### `plan-02-from-failed-negative`

Purpose: negative case for `state == Failed`.

Prompt:

```markdown
The last run failed, but I still want a plan. Continue from the current contract and tell me what should happen next.
```

Initial fixture:

```json
{
  "version": "0.1",
  "intent": {
    "summary": "Plan Rubrix skill improvements"
  },
  "state": "Failed",
  "locks": {
    "rubric": true,
    "matrix": true,
    "plan": true
  },
  "rubric": {
    "threshold": 0.8,
    "criteria": [
      {
        "id": "c1",
        "description": "Every matrix row maps to evidence",
        "weight": 0.5,
        "floor": 0.7
      },
      {
        "id": "c2",
        "description": "Each criterion has actionable recovery guidance",
        "weight": 0.5,
        "floor": 0.7
      }
    ]
  },
  "matrix": {
    "rows": [
      {
        "id": "m1",
        "criterion": "c1",
        "evidence_required": "Matrix row evidence references are present"
      },
      {
        "id": "m2",
        "criterion": "c2",
        "evidence_required": "Recovery guidance is present for failed criteria"
      }
    ]
  },
  "plan": {
    "steps": [
      {
        "id": "p1",
        "action": "Review failed matrix coverage",
        "covers": ["m1"]
      },
      {
        "id": "p2",
        "action": "Add recovery guidance for missing evidence mappings",
        "covers": ["m2"]
      }
    ]
  },
  "scores": [
    {
      "criterion": "c1",
      "score": 0.9,
      "evaluator": "fixture",
      "confidence": 0.9,
      "notes": "Coverage is present"
    },
    {
      "criterion": "c2",
      "score": 0.4,
      "evaluator": "fixture",
      "confidence": 0.9,
      "notes": "Below floor because recovery guidance is missing"
    }
  ]
}
```

Expected behavior:

```text
Do not draft or lock a replacement plan while still in Failed.
Explain failed state.
Point to recovery path: rubrix state set PlanDrafted.
Starting state remains Failed until that explicit transition, which resets locks.plan=false and clears scores.
```

### `plan-03-natural-language-action-plan`

Purpose: natural-language trigger without `/plan`.

Prompt:

```markdown
Turn this evaluation contract into an actionable sequence of tasks. I need dependencies, order of operations, and the exact checks that prove each step is complete.
```

Initial fixture:

```json
{
  "version": "0.1",
  "intent": {
    "summary": "Make Rubrix skill outputs auditable"
  },
  "state": "MatrixLocked",
  "locks": {
    "rubric": true,
    "matrix": true,
    "plan": false
  },
  "rubric": {
    "threshold": 0.8,
    "criteria": [
      {
        "id": "c1",
        "description": "Every output has file-based evidence",
        "weight": 0.34,
        "floor": 0.7
      },
      {
        "id": "c2",
        "description": "Every failure mode has a recovery instruction",
        "weight": 0.33,
        "floor": 0.7
      },
      {
        "id": "c3",
        "description": "Every state transition is explicit",
        "weight": 0.33,
        "floor": 0.7
      }
    ]
  },
  "matrix": {
    "rows": [
      {
        "id": "m1",
        "criterion": "c1",
        "evidence_required": "Output files under eval directory"
      },
      {
        "id": "m2",
        "criterion": "c2",
        "evidence_required": "stderr and recovery message"
      },
      {
        "id": "m3",
        "criterion": "c3",
        "evidence_required": "rubrix.json state and locks"
      }
    ]
  }
}
```

Expected skill trigger coverage:

```text
actionable sequence
dependencies
order of operations
checks
complete
```

---

## B4. `/score` Skill

### `score-01-happy-after-plan-lock`

Purpose: happy path from locked plan to scoring.

Prompt:

```markdown
Score this completed run against the locked rubric and matrix. Use the evidence files, produce pass/fail results per criterion, and update the contract state.
```

Initial fixture:

```json
{
  "version": "0.1",
  "intent": {
    "summary": "Evaluate Rubrix skill changes"
  },
  "state": "PlanLocked",
  "locks": {
    "rubric": true,
    "matrix": true,
    "plan": true
  },
  "rubric": {
    "threshold": 0.8,
    "criteria": [
      {
        "id": "c1",
        "description": "Output includes objective assertions",
        "weight": 0.34,
        "floor": 0.7
      },
      {
        "id": "c2",
        "description": "Output includes exact commands",
        "weight": 0.33,
        "floor": 0.7
      },
      {
        "id": "c3",
        "description": "Output handles validation failure reporting cleanly",
        "weight": 0.33,
        "floor": 0.7
      }
    ]
  },
  "matrix": {
    "rows": [
      {
        "id": "m1",
        "criterion": "c1",
        "evidence_required": "outputs/assertions.json"
      },
      {
        "id": "m2",
        "criterion": "c2",
        "evidence_required": "outputs/stdout.txt"
      },
      {
        "id": "m3",
        "criterion": "c3",
        "evidence_required": "outputs/stderr.txt"
      }
    ]
  },
  "plan": {
    "steps": [
      {
        "id": "p1",
        "action": "Generate assertions",
        "covers": ["m1"]
      },
      {
        "id": "p2",
        "action": "Run validation",
        "covers": ["m2", "m3"]
      }
    ]
  }
}
```

Additional evidence fixture:

```text
outputs/assertions.json exists and contains 3 assertions.
outputs/stdout.txt contains "validation passed".
outputs/stderr.txt is empty.
```

Expected skill trigger coverage:

```text
Score
evidence files
pass/fail
criterion
update contract state
```

Expected terminal state:

```text
Passed
```

### `score-02-locks-plan-false-negative`

Purpose: negative case for `locks.plan === false`.

Prompt:

```markdown
Please score the output now. The plan is not locked yet, but the evidence looks complete enough.
```

Initial fixture:

```json
{
  "version": "0.1",
  "intent": {
    "summary": "Evaluate CLI validation command"
  },
  "state": "MatrixLocked",
  "locks": {
    "rubric": true,
    "matrix": true,
    "plan": false
  },
  "rubric": {
    "threshold": 0.8,
    "criteria": [
      {
        "id": "c1",
        "description": "Command exits non-zero on invalid contract",
        "weight": 1,
        "floor": 0.7
      }
    ]
  },
  "matrix": {
    "rows": [
      {
        "id": "m1",
        "criterion": "c1",
        "evidence_required": "outputs/stdout.txt"
      }
    ]
  }
}
```

Expected behavior:

```text
Do not score.
Do not advance state to Scoring, Passed, or Failed.
Explain plan must be locked first.
Leave scores absent or empty.
```

### `score-03-natural-language-judge-output`

Purpose: natural-language trigger without saying `/score`.

Prompt:

```markdown
Judge whether this run passed. I need a criterion-by-criterion verdict using the saved evidence, not a general summary.
```

Initial fixture:

```json
{
  "version": "0.1",
  "intent": {
    "summary": "Judge Rubrix plan quality"
  },
  "state": "PlanLocked",
  "locks": {
    "rubric": true,
    "matrix": true,
    "plan": true
  },
  "rubric": {
    "threshold": 0.8,
    "criteria": [
      {
        "id": "c1",
        "description": "Plan has numbered execution steps",
        "weight": 0.34,
        "floor": 0.7
      },
      {
        "id": "c2",
        "description": "Plan includes verification commands",
        "weight": 0.33,
        "floor": 0.7
      },
      {
        "id": "c3",
        "description": "Plan identifies rollback policy",
        "weight": 0.33,
        "floor": 0.7
      }
    ]
  },
  "matrix": {
    "rows": [
      {
        "id": "m1",
        "criterion": "c1",
        "evidence_required": "outputs/plan.md"
      },
      {
        "id": "m2",
        "criterion": "c2",
        "evidence_required": "outputs/plan.md"
      },
      {
        "id": "m3",
        "criterion": "c3",
        "evidence_required": "outputs/plan.md"
      }
    ]
  },
  "plan": {
    "steps": [
      {
        "id": "p1",
        "action": "Create plan",
        "covers": ["m1", "m2", "m3"]
      }
    ]
  }
}
```

Additional evidence fixture:

```text
outputs/plan.md contains numbered steps and verification commands, but no rollback policy.
```

Expected skill trigger coverage:

```text
Judge
passed
criterion-by-criterion verdict
saved evidence
not a general summary
```

Expected terminal state:

```text
Failed
```

---

## C. Assertions Per Test Prompt

## C1. `rubric-01-happy-criteria`

Assertions:

```json
[
  {
    "text": "rubrix.json exists",
    "source": "rubrix.json",
    "check": "file_exists"
  },
  {
    "text": "rubrix.json state is RubricLocked",
    "source": "rubrix.json",
    "check": "json_path_equals",
    "path": "$.state",
    "expected": "RubricLocked"
  },
  {
    "text": "locks.rubric is true",
    "source": "rubrix.json",
    "check": "json_path_equals",
    "path": "$.locks.rubric",
    "expected": true
  },
  {
    "text": "rubric.threshold exists",
    "source": "rubrix.json",
    "check": "json_path_number_between",
    "path": "$.rubric.threshold",
    "min": 0,
    "max": 1
  },
  {
    "text": "rubric.criteria contains between 3 and 7 entries",
    "source": "rubrix.json",
    "check": "json_array_length_between",
    "path": "$.rubric.criteria",
    "min": 3,
    "max": 7
  },
  {
    "text": "each criterion has id, description, and weight",
    "source": "rubrix.json",
    "check": "json_array_items_have_keys",
    "path": "$.rubric.criteria",
    "keys": ["id", "description", "weight"]
  }
]
```

## C2. `rubric-02-bootstrap-missing-contract`

Assertions:

```json
[
  {
    "text": "rubrix.json is created even though no contract existed initially",
    "source": "rubrix.json",
    "check": "file_exists"
  },
  {
    "text": "intent.summary preserves the user's intent",
    "source": "rubrix.json",
    "check": "json_path_contains",
    "path": "$.intent.summary",
    "expected_substrings": ["vague", "acceptance criteria", "evidence"]
  },
  {
    "text": "state is RubricLocked",
    "source": "rubrix.json",
    "check": "json_path_equals",
    "path": "$.state",
    "expected": "RubricLocked"
  },
  {
    "text": "locks.rubric is true",
    "source": "rubrix.json",
    "check": "json_path_equals",
    "path": "$.locks.rubric",
    "expected": true
  },
  {
    "text": "locks.matrix and locks.plan remain false",
    "source": "rubrix.json",
    "check": "json_paths_equal",
    "paths": ["$.locks.matrix", "$.locks.plan"],
    "expected": false
  },
  {
    "text": "stderr does not contain a missing-file failure",
    "source": "stderr.txt",
    "check": "text_not_contains",
    "expected_substrings": ["ENOENT", "No such file", "missing rubrix.json"]
  }
]
```

## C3. `rubric-03-existing-contract-natural-language`

Assertions:

```json
[
  {
    "text": "rubrix.json remains valid JSON",
    "source": "rubrix.json",
    "check": "json_parseable"
  },
  {
    "text": "state is RubricLocked",
    "source": "rubrix.json",
    "check": "json_path_equals",
    "path": "$.state",
    "expected": "RubricLocked"
  },
  {
    "text": "rubric.criteria contains between 3 and 7 entries",
    "source": "rubrix.json",
    "check": "json_array_length_between",
    "path": "$.rubric.criteria",
    "min": 3,
    "max": 7
  },
  {
    "text": "each criterion has id, description, and weight",
    "source": "rubrix.json",
    "check": "json_array_items_have_keys",
    "path": "$.rubric.criteria",
    "keys": ["id", "description", "weight"]
  },
  {
    "text": "at least one criterion mentions evidence",
    "source": "rubrix.json",
    "check": "json_array_any_text_contains",
    "path": "$.rubric.criteria",
    "field": "description",
    "expected_substrings": ["evidence"]
  },
  {
    "text": "at least one criterion mentions actionable output or actionability",
    "source": "rubrix.json",
    "check": "json_array_any_text_contains",
    "path": "$.rubric.criteria",
    "field": "description",
    "expected_substrings": ["actionable", "actionability"]
  }
]
```

## C4. `matrix-01-happy-after-rubric-lock`

Assertions:

```json
[
  {
    "text": "state is MatrixLocked",
    "source": "rubrix.json",
    "check": "json_path_equals",
    "path": "$.state",
    "expected": "MatrixLocked"
  },
  {
    "text": "locks.matrix is true",
    "source": "rubrix.json",
    "check": "json_path_equals",
    "path": "$.locks.matrix",
    "expected": true
  },
  {
    "text": "matrix.rows has exactly one row per rubric criterion",
    "source": "rubrix.json",
    "check": "json_array_lengths_equal",
    "paths": ["$.matrix.rows", "$.rubric.criteria"]
  },
  {
    "text": "each matrix row has id, criterion, and evidence_required",
    "source": "rubrix.json",
    "check": "json_array_items_have_keys",
    "path": "$.matrix.rows",
    "keys": ["id", "criterion", "evidence_required"]
  },
  {
    "text": "each row maps to one existing criterion id",
    "source": "rubrix.json",
    "check": "json_array_values_subset",
    "path": "$.matrix.rows[*].criterion",
    "allowed_from": "$.rubric.criteria[*].id"
  },
  {
    "text": "locks.plan remains false",
    "source": "rubrix.json",
    "check": "json_path_equals",
    "path": "$.locks.plan",
    "expected": false
  }
]
```

## C5. `matrix-02-before-rubric-lock-negative`

Assertions:

```json
[
  {
    "text": "state remains IntentDrafted",
    "source": "rubrix.json",
    "check": "json_path_equals",
    "path": "$.state",
    "expected": "IntentDrafted"
  },
  {
    "text": "locks.matrix remains false",
    "source": "rubrix.json",
    "check": "json_path_equals",
    "path": "$.locks.matrix",
    "expected": false
  },
  {
    "text": "matrix.rows is absent or empty",
    "source": "rubrix.json",
    "check": "json_path_absent_or_empty",
    "path": "$.matrix.rows"
  },
  {
    "text": "rubric is not invented by the matrix skill",
    "source": "rubrix.json",
    "check": "json_path_absent",
    "path": "$.rubric"
  },
  {
    "text": "stdout or stderr explains that rubric must be created or locked first",
    "source": ["stdout.txt", "stderr.txt"],
    "check": "text_contains_any",
    "expected_substrings": ["rubric", "locked", "RubricLocked", "locks.rubric", "IntentDrafted"]
  }
]
```

## C6. `matrix-03-natural-language-coverage-map`

Assertions:

```json
[
  {
    "text": "state is MatrixLocked",
    "source": "rubrix.json",
    "check": "json_path_equals",
    "path": "$.state",
    "expected": "MatrixLocked"
  },
  {
    "text": "matrix.rows has exactly 3 rows",
    "source": "rubrix.json",
    "check": "json_array_length_equals",
    "path": "$.matrix.rows",
    "expected": 3
  },
  {
    "text": "each row maps to one existing criterion id",
    "source": "rubrix.json",
    "check": "json_array_values_subset",
    "path": "$.matrix.rows[*].criterion",
    "allowed": ["c1", "c2", "c3"]
  },
  {
    "text": "each row contains non-empty evidence_required text",
    "source": "rubrix.json",
    "check": "json_array_items_field_nonempty",
    "path": "$.matrix.rows",
    "field": "evidence_required"
  },
  {
    "text": "locks.plan remains false",
    "source": "rubrix.json",
    "check": "json_path_equals",
    "path": "$.locks.plan",
    "expected": false
  }
]
```

## C7. `plan-01-happy-after-matrix-lock`

Assertions:

```json
[
  {
    "text": "state is PlanLocked",
    "source": "rubrix.json",
    "check": "json_path_equals",
    "path": "$.state",
    "expected": "PlanLocked"
  },
  {
    "text": "locks.plan is true",
    "source": "rubrix.json",
    "check": "json_path_equals",
    "path": "$.locks.plan",
    "expected": true
  },
  {
    "text": "plan.steps contains between 3 and 10 entries",
    "source": "rubrix.json",
    "check": "json_array_length_between",
    "path": "$.plan.steps",
    "min": 3,
    "max": 10
  },
  {
    "text": "each plan step has id and action",
    "source": "rubrix.json",
    "check": "json_array_items_have_keys",
    "path": "$.plan.steps",
    "keys": ["id", "action"]
  },
  {
    "text": "plan includes verification or evidence for at least one step",
    "source": "rubrix.json",
    "check": "json_text_contains_any",
    "expected_substrings": ["verify", "verification", "evidence", "check"]
  }
]
```

## C8. `plan-02-from-failed-negative`

Assertions:

```json
[
  {
    "text": "state remains Failed until explicit recovery transition",
    "source": "rubrix.json",
    "check": "json_path_equals",
    "path": "$.state",
    "expected": "Failed"
  },
  {
    "text": "locks.plan remains true while still in Failed",
    "source": "rubrix.json",
    "check": "json_path_equals",
    "path": "$.locks.plan",
    "expected": true
  },
  {
    "text": "scores remain populated as the failure commitment signal",
    "source": "rubrix.json",
    "check": "json_array_length_equals",
    "path": "$.scores",
    "expected": 2
  },
  {
    "text": "at least one score remains below its criterion floor",
    "source": "rubrix.json",
    "check": "json_scores_include_below_floor",
    "scores_path": "$.scores",
    "criteria_path": "$.rubric.criteria"
  },
  {
    "text": "no schema-invalid failure.reason field is added",
    "source": "rubrix.json",
    "check": "json_path_absent",
    "path": "$.failure.reason"
  },
  {
    "text": "stdout or stderr explains failed-state recovery",
    "source": ["stdout.txt", "stderr.txt"],
    "check": "text_contains_any",
    "expected_substrings": ["Failed", "recover", "PlanDrafted", "rubrix state set PlanDrafted", "clears scores"]
  }
]
```

## C9. `plan-03-natural-language-action-plan`

Assertions:

```json
[
  {
    "text": "state is PlanLocked",
    "source": "rubrix.json",
    "check": "json_path_equals",
    "path": "$.state",
    "expected": "PlanLocked"
  },
  {
    "text": "plan.steps contains at least 3 entries",
    "source": "rubrix.json",
    "check": "json_array_length_at_least",
    "path": "$.plan.steps",
    "min": 3
  },
  {
    "text": "each plan step has id and action",
    "source": "rubrix.json",
    "check": "json_array_items_have_keys",
    "path": "$.plan.steps",
    "keys": ["id", "action"]
  },
  {
    "text": "at least one step contains dependency or ordering language",
    "source": "rubrix.json",
    "check": "json_array_any_text_contains",
    "path": "$.plan.steps",
    "field": "action",
    "expected_substrings": ["after", "before", "depends", "dependency", "order"]
  },
  {
    "text": "at least one step contains completion check language",
    "source": "rubrix.json",
    "check": "json_array_any_text_contains",
    "path": "$.plan.steps",
    "field": "action",
    "expected_substrings": ["check", "verify", "complete", "evidence"]
  },
  {
    "text": "scores remain absent before scoring",
    "source": "rubrix.json",
    "check": "json_path_absent_or_empty",
    "path": "$.scores"
  }
]
```

## C10. `score-01-happy-after-plan-lock`

Assertions:

```json
[
  {
    "text": "state is terminal Passed for the happy scoring case",
    "source": "rubrix.json",
    "check": "json_path_equals",
    "path": "$.state",
    "expected": "Passed"
  },
  {
    "text": "scores has exactly one score per rubric criterion",
    "source": "rubrix.json",
    "check": "json_array_lengths_equal",
    "paths": ["$.scores", "$.rubric.criteria"]
  },
  {
    "text": "each score includes criterion and score",
    "source": "rubrix.json",
    "check": "json_array_items_have_keys",
    "path": "$.scores",
    "keys": ["criterion", "score"]
  },
  {
    "text": "each score criterion maps to an existing criterion id",
    "source": "rubrix.json",
    "check": "json_array_values_subset",
    "path": "$.scores[*].criterion",
    "allowed_from": "$.rubric.criteria[*].id"
  },
  {
    "text": "each score is at or above its criterion floor",
    "source": "rubrix.json",
    "check": "json_scores_all_meet_floor",
    "scores_path": "$.scores",
    "criteria_path": "$.rubric.criteria"
  }
]
```

## C11. `score-02-locks-plan-false-negative`

Assertions:

```json
[
  {
    "text": "state remains MatrixLocked",
    "source": "rubrix.json",
    "check": "json_path_equals",
    "path": "$.state",
    "expected": "MatrixLocked"
  },
  {
    "text": "state did not advance to Scoring, Passed, or Failed",
    "source": "rubrix.json",
    "check": "json_path_not_in",
    "path": "$.state",
    "disallowed": ["Scoring", "Passed", "Failed"]
  },
  {
    "text": "scores is absent or empty",
    "source": "rubrix.json",
    "check": "json_path_absent_or_empty",
    "path": "$.scores"
  },
  {
    "text": "stdout or stderr explains plan must be locked first",
    "source": ["stdout.txt", "stderr.txt"],
    "check": "text_contains_any",
    "expected_substrings": ["plan", "locked", "PlanLocked", "locks.plan"]
  },
  {
    "text": "rubric and matrix locks remain true",
    "source": "rubrix.json",
    "check": "json_paths_equal",
    "paths": ["$.locks.rubric", "$.locks.matrix"],
    "expected": true
  },
  {
    "text": "plan lock remains false",
    "source": "rubrix.json",
    "check": "json_path_equals",
    "path": "$.locks.plan",
    "expected": false
  }
]
```

## C12. `score-03-natural-language-judge-output`

Assertions:

```json
[
  {
    "text": "state is terminal Failed because rollback policy is absent",
    "source": "rubrix.json",
    "check": "json_path_equals",
    "path": "$.state",
    "expected": "Failed"
  },
  {
    "text": "scores has exactly 3 entries",
    "source": "rubrix.json",
    "check": "json_array_length_equals",
    "path": "$.scores",
    "expected": 3
  },
  {
    "text": "scores has exactly one score per rubric criterion",
    "source": "rubrix.json",
    "check": "json_array_lengths_equal",
    "paths": ["$.scores", "$.rubric.criteria"]
  },
  {
    "text": "criterion c3 score is below floor because rollback policy is absent",
    "source": "rubrix.json",
    "check": "json_array_item_number_below",
    "path": "$.scores",
    "where": {
      "criterion": "c3"
    },
    "field": "score",
    "threshold": 0.7
  },
  {
    "text": "c3 score notes mention rollback policy absence",
    "source": "rubrix.json",
    "check": "json_array_item_text_contains",
    "path": "$.scores",
    "where": {
      "criterion": "c3"
    },
    "field": "notes",
    "expected_substrings": ["rollback"]
  }
]
```

---

## D. Subagent Orchestration

### D1. Spawn method

Pick: **script-driven Claude Code Task runs**.

Justification:

- A script gives repeatable fixture setup, environment isolation, stdout/stderr capture, and timing capture.
- Manual Task-tool spawning is faster for an exploratory run, but it is too hard to reproduce or aggregate cleanly across 24 runs.

Command shape:

```bash
cd /Users/jaehoonseo/Desktop/JaehoonE/rubrix/.claude/worktrees/sleepy-pike-a5dc39

node scripts/eval/run-skill-benchmark.mjs \
  --iteration iteration-1 \
  --parallel 8 \
  --cases iteration-1/cases \
  --conditions with_skill,baseline
```

If `scripts/eval/run-skill-benchmark.mjs` does not exist, create it as part of the eval harness before running iteration 1.

### D2. With-skill condition

Run each case in a clean copied fixture directory:

```text
iteration-1/eval-<id>/with_skill/workspace/
```

Set environment:

```bash
RUBRIX_CONTRACT=./rubrix.json
CLAUDE_PROJECT_DIR=/Users/jaehoonseo/Desktop/JaehoonE/rubrix/.claude/worktrees/sleepy-pike-a5dc39
```

Prompt wrapper:

```markdown
You are evaluating the current Rubrix plugin skills.

Use the repo's available Rubrix skill if it naturally applies. Do not edit files outside the current run workspace.

User prompt:

<verbatim test prompt>
```

### D3. Baseline condition

Pick: **isolated Claude home with no Rubrix skills installed**.

Baseline run directory:

```text
iteration-1/eval-<id>/baseline/workspace/
```

Environment:

```bash
RUBRIX_CONTRACT=./rubrix.json
CLAUDE_HOME=/tmp/rubrix-baseline-claude-home
CLAUDE_PROJECT_DIR=/tmp/rubrix-baseline-empty-project
```

Baseline setup:

```bash
rm -rf /tmp/rubrix-baseline-claude-home /tmp/rubrix-baseline-empty-project
mkdir -p /tmp/rubrix-baseline-claude-home /tmp/rubrix-baseline-empty-project
```

Justification:

- This makes baseline deterministic by removing skill discovery from the run.
- Do not paste the skill text into the prompt, because that would test prompt engineering, not skill triggering.

### D4. Capture timing

Required file per run:

```text
iteration-1/eval-<id>/<condition>/outputs/timing.json
```

Required fields:

```json
{
  "case_id": "rubric-01-happy-criteria",
  "condition": "with_skill",
  "started_at": "2026-04-28T00:00:00.000Z",
  "ended_at": "2026-04-28T00:03:12.000Z",
  "duration_ms": 192000,
  "exit_code": 0,
  "total_tokens": 18420,
  "input_tokens": 5200,
  "output_tokens": 13220,
  "model": "claude-sonnet-4-5",
  "run_command": "..."
}
```

Capture method:

- Use shell `date +%s%3N` or Node `performance.now()` for `duration_ms`.
- Capture token usage from Claude Code JSON output if available.
- If token usage is unavailable, write `null`, not `0`.

### D5. Capture outputs

Required files:

```text
outputs/rubrix.json
outputs/stdout.txt
outputs/stderr.txt
outputs/timing.json
```

Optional files:

```text
outputs/changed-files.txt
outputs/transcript.jsonl
outputs/tool-calls.json
```

Every run should copy final workspace `rubrix.json` into `outputs/rubrix.json`, even if unchanged.

### D6. Parallelism budget

Pick: **parallel 8**.

Justification:

- 24 fully parallel runs can overload Claude Code, filesystem fixtures, and rate limits.
- Parallel 8 keeps wall-clock low while leaving enough isolation to debug failed runs.

Execution waves:

```text
Wave 1: 8 runs
Wave 2: 8 runs
Wave 3: 8 runs
```

Expected total:

```text
24 runs / 8 parallel = 3 waves
```

---

## E. Grading

### E1. Grader method

Pick: **inline deterministic grader script**.

Justification:

- Assertions are intentionally objective and file-based. A spawned grader subagent would add judgment variance and token cost.
- Use subagent grading only for optional qualitative preference, not for pass/fail assertions.

Command shape:

```bash
cd /Users/jaehoonseo/Desktop/JaehoonE/rubrix/.claude/worktrees/sleepy-pike-a5dc39

node scripts/eval/grade-run.mjs \
  --case iteration-1/cases/rubric-01-happy-criteria/assertions.json \
  --outputs iteration-1/eval-rubric-01-happy-criteria/with_skill/outputs \
  --out iteration-1/eval-rubric-01-happy-criteria/with_skill/outputs/grading.json
```

### E2. `grading.json` location

Per run:

```text
iteration-1/eval-<id>/<condition>/outputs/grading.json
```

Required shape:

```json
{
  "case_id": "rubric-01-happy-criteria",
  "condition": "with_skill",
  "summary": {
    "passed": 5,
    "failed": 0,
    "total": 5
  },
  "assertions": [
    {
      "text": "rubrix.json exists",
      "passed": true,
      "evidence": "Found outputs/rubrix.json"
    },
    {
      "text": "rubrix.json state is RubricLocked",
      "passed": true,
      "evidence": "$.state == \"RubricLocked\""
    }
  ]
}
```

Every assertion object must contain:

```json
{
  "text": "human-readable assertion",
  "passed": true,
  "evidence": "specific observed value or missing value"
}
```

### E3. File-based vs stream-based assertions

Pick: **file-based assertions first, stream assertions only for error messages**.

Rules:

- Contract correctness is checked from `rubrix.json`.
- User-facing explanations and error handling are checked from `stdout.txt` and `stderr.txt`.
- Never grade by reading transient terminal streams directly; always grade saved files.

Justification:

- File-based grading is reproducible and aggregation-friendly.
- Stream assertions are still necessary for negative cases because correct behavior includes explaining why the transition was refused.

---

## F. Aggregation + Viewer

### F1. Aggregation command location

Run from the verified skill-creator skill directory.

Absolute path:

```text
/Users/jaehoonseo/Library/Application Support/Claude/local-agent-mode-sessions/skills-plugin/6ede39d3-8634-40e5-aa39-ba2f5e5fe8ec/da22bbcc-636f-47f9-bf2f-f09508db34a0/skills/skill-creator
```

The path may differ across machines and should be re-verified before running:

```bash
find ~/Library/Application\ Support/Claude -type d -name skill-creator
```

Command:

```bash
SC="/Users/jaehoonseo/Library/Application Support/Claude/local-agent-mode-sessions/skills-plugin/6ede39d3-8634-40e5-aa39-ba2f5e5fe8ec/da22bbcc-636f-47f9-bf2f-f09508db34a0/skills/skill-creator"
ITER="/Users/jaehoonseo/Desktop/JaehoonE/rubrix/.claude/worktrees/sleepy-pike-a5dc39/iteration-1"

cd "$SC" && python -m scripts.aggregate_benchmark "$ITER" \
  --skill-name rubrix-skills \
  --output "$ITER/benchmark.json"
```

If the local shell has no `python` shim, use the same command with `python3`.

Pin the resolved path in:

```text
iteration-1/README.md
```

### F2. Benchmark structure

Pick: **one merged benchmark across all 4 skills, with per-skill sections**.

Justification:

- The question is whether the current Rubrix skills support the full eval workflow.
- A merged benchmark gives one decision boundary, while per-skill grouping still shows where failures cluster.

Benchmark dimensions:

```json
{
  "iteration": 1,
  "skills": ["rubric", "matrix", "plan", "score"],
  "conditions": ["with_skill", "baseline"],
  "summary": {
    "with_skill_pass_rate": 0.0,
    "baseline_pass_rate": 0.0,
    "delta": 0.0
  },
  "by_skill": {},
  "by_case": {},
  "timing": {},
  "token_usage": {}
}
```

### F3. Viewer mode

Pick: **static viewer with `--static`**.

Justification:

- Static output is easier to review, attach, archive, and compare across iterations.
- `nohup` server is useful for live browsing, but it adds process cleanup and port conflicts for no benefit in the first iteration.

Command:

```bash
SC="/Users/jaehoonseo/Library/Application Support/Claude/local-agent-mode-sessions/skills-plugin/6ede39d3-8634-40e5-aa39-ba2f5e5fe8ec/da22bbcc-636f-47f9-bf2f-f09508db34a0/skills/skill-creator"
ITER="/Users/jaehoonseo/Desktop/JaehoonE/rubrix/.claude/worktrees/sleepy-pike-a5dc39/iteration-1"

python "$SC/eval-viewer/generate_review.py" \
  "$ITER" \
  --skill-name rubrix-skills \
  --benchmark "$ITER/benchmark.json" \
  --static "$ITER/viewer/index.html"
```

If the local shell has no `python` shim, use the same command with `python3`.

Review artifact:

```text
/Users/jaehoonseo/Desktop/JaehoonE/rubrix/.claude/worktrees/sleepy-pike-a5dc39/iteration-1/viewer/index.html
```

---

## G. Iteration Loop

### G1. Stop criterion

Pick:

```text
Stop when all P1 assertions pass for with_skill in 2 consecutive iterations,
and user qualitative preference for with_skill is >= 80%.
```

P1 assertions:

- Correct state transition.
- Correct lock mutation.
- No mutation on invalid state.
- Required artifact exists.
- Error explanation exists for refused transitions.

Justification:

- One passing iteration can be luck or prompt-specific.
- Two consecutive iterations reduces overfitting after skill edits.

### G2. User feedback file

After viewer review, collect:

```text
iteration-1/feedback.json
```

Shape:

```json
{
  "reviewer": "user",
  "reviewed_at": "2026-04-28T00:00:00.000Z",
  "preferred_condition_by_case": {
    "rubric-01-happy-criteria": "with_skill"
  },
  "qualitative_notes": [
    {
      "case_id": "rubric-01-happy-criteria",
      "note": "With-skill output was stricter and more contract-shaped."
    }
  ],
  "decision": "quick_fix"
}
```

Allowed decisions:

```text
ship_as_is
quick_fix
full_revision
```

### G3. Rollback policy

Pick:

```text
If iteration N has lower with_skill P1 pass rate than iteration N-1, revert the skill changes from iteration N before trying another approach.
```

Rollback unit:

```text
skills/rubric/SKILL.md
skills/matrix/SKILL.md
skills/plan/SKILL.md
skills/score/SKILL.md
```

Preserve benchmark artifacts:

```text
iteration-N/
```

Do not delete failed benchmark outputs. They are evidence.

### G4. Maximum iterations

Pick:

```text
Maximum 3 iterations.
```

Policy:

```text
Iteration 1: evaluate current skills.
Iteration 2: apply chosen fix scope and rerun same benchmark.
Iteration 3: only if iteration 2 improved but did not meet stop criterion.
```

Declare “needs different approach” if:

```text
After iteration 3, with_skill P1 pass rate is below 90%
or negative-state cases still mutate rubrix.json incorrectly.
```

---

## H. Time + Cost Estimate

### H1. Wall-clock estimate for iteration 1

Assumptions:

```text
24 runs total
8 parallel
2-5 minutes per run
1-2 minutes setup
1-2 minutes grading
1-2 minutes aggregation/viewer
```

Estimate:

```text
Best case: 10-12 minutes
Expected: 15-20 minutes
Worst normal case: 25-35 minutes
```

If rate limits or subagent startup delays occur:

```text
45-60 minutes
```

### H2. Token estimate

Assumptions:

```text
Each run: 8k-25k tokens total
24 runs
Aggregation and grading: mostly local, minimal model tokens
Optional qualitative review: 10k-30k tokens
```

Rough estimate:

```text
Low: 24 x 8k = 192k tokens
Expected: 24 x 15k = 360k tokens
High: 24 x 25k = 600k tokens
```

Budget range:

```text
200k-650k total tokens for iteration 1
```

### H3. Stop and ask user decision

Stop after:

```text
iteration-1/benchmark.md
iteration-1/benchmark.json
iteration-1/viewer/index.html
```

Then ask the user to choose:

```text
1. ship_as_is
2. quick_fix
3. full_revision
```

Do not edit skills before this decision.

---

## I. Risks + Non-Obvious Gotchas

### I1. Skill trigger contamination

Risk:

- If the with-skill prompt explicitly pastes `SKILL.md`, the test no longer measures skill triggering.

Mitigation:

- The prompt must contain only the user task and fixture state.
- Do not include skill instructions inside prompts.

### I2. Baseline accidentally loads skills

Risk:

- Claude may discover repo-local skills even in the baseline condition.

Mitigation:

- Use isolated `CLAUDE_HOME`.
- Run baseline from a copied workspace where `skills/` is absent or hidden.
- Record environment in `timing.json`.

### I3. `rubrix.json` mutation leaks between runs

Risk:

- One run’s state can contaminate the next run, especially lock-state tests.

Mitigation:

- Each run gets a fresh copied fixture directory.
- Never run multiple cases against the same contract file.
- Always set `RUBRIX_CONTRACT=./rubrix.json`.

### I4. Order-sensitive locks create false positives

Risk:

- `/matrix`, `/plan`, and `/score` can pass only because a previous phase already ran in the same workspace.

Mitigation:

- Each case fixture explicitly defines initial state.
- No case depends on a previous case’s output.

### I5. Subagents may invoke other skills mid-run

Risk:

- A `/plan` run may call `/rubric` or `/matrix` behavior and hide missing state validation.

Mitigation:

- Assert exact state and lock behavior.
- Negative cases must fail if unrelated phases are mutated.

### I6. Skills can pass by writing prose only

Risk:

- The assistant may produce a good explanation but not update `rubrix.json`.

Mitigation:

- Primary assertions check `rubrix.json`.
- Prose-only output fails happy-path cases.

### I7. Skills can mutate too much

Risk:

- `/rubric` may also create matrix or plan; `/score` may rewrite rubric.

Mitigation:

- Assertions include downstream locks remaining false.
- Optional changed-file capture flags unexpected edits.

### I8. Natural-language prompts may undertrigger

Risk:

- Skill descriptions are currently not pushy enough, so prompts without slash commands may fall back to generic behavior.

Mitigation:

- Include one natural-language trigger case per skill.
- Compare with baseline to quantify whether the skill actually engages.

### I9. Error handling is hard to grade

Risk:

- Failed validate/lock/gate behavior may not have consistent stderr wording.

Mitigation:

- Use flexible text assertions with multiple allowed substrings.
- Keep state/lock assertions strict.

### I10. Path resolution inconsistency

Risk:

- Some skills may honor `$RUBRIX_CONTRACT`, while others assume `./rubrix.json`.

Mitigation:

- Every run sets `RUBRIX_CONTRACT=./rubrix.json`.
- Add a later iteration case for non-default path only if iteration 1 shows path failures.

### I11. Token usage may be unavailable

Risk:

- Claude Code may not expose `total_tokens` in the chosen output mode.

Mitigation:

- Store `null` for token fields when unavailable.
- Do not block benchmark pass/fail on token capture.

### I12. Viewer may overweight qualitative preference

Risk:

- Better-looking prose can distract from contract correctness.

Mitigation:

- Benchmark decision starts from objective P1 pass rate.
- Qualitative preference is secondary unless objective scores are close.

---

## J. Decision Tree at Iteration 1 Boundary

## J1. Decision 1: Skills already good enough, ship as-is

Choose this if all are true:

```text
with_skill P1 pass rate >= 95%
with_skill passes every negative lock/state case
with_skill beats baseline by >= 20 percentage points overall
user preference for with_skill >= 80%
no skill has more than one failed assertion
```

Evidence files:

```text
iteration-1/benchmark.json
iteration-1/benchmark.md
iteration-1/feedback.json
```

Action:

```text
Do not edit skills.
Archive iteration-1 as baseline evidence.
Optionally add benchmark summary to docs.
```

## J2. Decision 2: Apply Quick Fix P1 and rerun iteration 2

Choose this if any are true:

```text
with_skill P1 pass rate is 70%-94%
failures cluster around known P1 issues:
  - undertriggering descriptions
  - missing bootstrap path
  - missing failed lock/gate explanation
  - inconsistent RUBRIX_CONTRACT usage
negative cases mostly preserve rubrix.json correctly
baseline is clearly worse than with_skill
```

Quick fix scope:

```text
skills/rubric/SKILL.md:
  strengthen description triggers
  add missing rubrix.json bootstrap path
  mention RUBRIX_CONTRACT

skills/matrix/SKILL.md:
  strengthen description triggers
  add rubric-lock gate failure handling
  mention RUBRIX_CONTRACT

skills/plan/SKILL.md:
  strengthen description triggers
  add Failed-state handling
  mention RUBRIX_CONTRACT

skills/score/SKILL.md:
  strengthen description triggers
  add locks.plan=false handling
  mention RUBRIX_CONTRACT
```

Do not add examples or subagent invocation yet unless needed for a P1 failure.

Then run:

```bash
cd /Users/jaehoonseo/Desktop/JaehoonE/rubrix/.claude/worktrees/sleepy-pike-a5dc39

node scripts/eval/run-skill-benchmark.mjs \
  --iteration iteration-2 \
  --parallel 8 \
  --cases iteration-1/cases \
  --conditions with_skill,baseline
```

## J3. Decision 3: Apply Full Revision P1+P2+P3 and rerun iteration 2

Choose this if any are true:

```text
with_skill P1 pass rate < 70%
with_skill does not meaningfully beat baseline
two or more skills fail their natural-language trigger case
any negative case mutates rubrix.json into a later locked state
outputs are mostly prose and do not maintain the contract
user preference for with_skill < 60%
```

Full revision scope:

```text
P1:
  stronger descriptions
  bootstrap and lock/gate error handling
  consistent RUBRIX_CONTRACT resolution

P2:
  reference the 5 available subagents:
    rubric-architect
    matrix-auditor
    plan-critic
    evidence-finder
    output-judge

P3:
  add at least 2 realistic examples per skill:
    one happy path
    one invalid-state or missing-contract path
```

Subagent mapping:

```text
rubric:
  rubric-architect
  evidence-finder

matrix:
  matrix-auditor
  evidence-finder

plan:
  plan-critic
  evidence-finder

score:
  output-judge
  evidence-finder
```

Then rerun the same benchmark as iteration 2.

Do not change the test prompts between iteration 1 and iteration 2. Only add new prompts in iteration 3 if the original benchmark is fully passing and the remaining concern is broader coverage.


