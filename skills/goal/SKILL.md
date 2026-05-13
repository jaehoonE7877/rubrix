---
name: goal
description: Synthesize a transcript-evaluable termination condition from rubrix.json so the user can paste it into Claude Code's /goal command. Trigger ONLY when ALL of these hold (a) `rubrix.json` exists in the working directory, (b) state ∈ {PlanLocked, Scoring, Failed}, AND (c) the user asks to "set a goal", "auto-loop until passed", "let it run until Passed", "run /goal", or equivalent. Do NOT trigger pre-PlanLocked or on generic "keep going" prompts that aren't about Rubrix convergence.
---

# /rubrix:goal

Read-only skill. Owns the **synthesis** of the Claude Code `/goal` termination condition from `rubrix.json`. Never mutates the contract. The user must paste the synthesized string into the built-in `/goal <condition>` command — this skill cannot invoke `/goal` itself.

**Why a separate skill, not `/rubrix:score` extension?**: `/goal` is a Claude Code built-in that wraps a session-scoped Stop hook. Every turn end, a small-fast model (Haiku by default) reads the transcript and decides if the condition holds. It cannot call tools. So the condition must point at a verdict that Rubrix emits **into the transcript** within a turn — namely `rubrix gate --json` output with `overall_pass: true` and `state: "Passed"`.

## Preconditions

- `rubrix state get rubrix.json` reports one of: `PlanLocked`, `Scoring`, `Failed`.
- If state is `IntentDrafted`/`RubricDrafted`/`MatrixDrafted`/`PlanDrafted`, refuse and tell the user to lock the plan first via `/rubrix:plan`.
- Claude Code `/goal` requires the trust dialog accepted and is unavailable when `disableAllHooks` or `allowManagedHooksOnly` is set. If a `/goal` invocation later reports unavailable, the skill cannot work around it — surface the reason to the user.

## Steps

1. Run `node cli/bin/rubrix.js state get rubrix.json` to confirm state ∈ {PlanLocked, Scoring, Failed}. Refuse if not.
2. Run `node cli/bin/rubrix.js goal print rubrix.json` — the CLI synthesizes a condition string from the contract's `rubric.threshold`, every `criteria[].id` + `floor`, and the current state. Output is capped at 4,000 chars (the `/goal` hard limit); criteria are weight-ordered and trimmed with a `(+K more — see rubric.)` tail if they don't fit.
3. Show the printed string to the user **inside a fenced ```text block** with a literal `/goal ` prefix line above it, so the user can copy-paste straight into the Claude Code prompt. Example output to the user:

   ```text
   /goal Run `node cli/bin/rubrix.js gate rubrix.json --json` and check that the JSON output has `overall_pass: true` and `state: "Passed"`. Each of these per-criterion floors must be met: `c1>=0.7`, `c2>=0.6`. If state is `Failed`, run `/rubrix:plan` with "revise the plan now" then `/rubrix:score`. ...
   ```

4. Tell the user the recommended loop once `/goal` is active:
   - First turn: `/rubrix:score` → cascade runs → contract becomes `Passed` or `Failed`.
   - If `Failed`: the `Stop` hook blocks exit (state=Failed → reason `rubrix gate failed; iterate ...`). `/goal`'s evaluator sees `overall_pass: false` in the transcript and triggers another turn. In that next turn, ask `/rubrix:plan` to "revise the plan now" (mutation mode) — this resets `locks.plan=false` and clears stale `scores[]`, then re-locks the plan.
   - Then `/rubrix:score` again. Repeat until `Passed`.
   - On `Passed`: the transcript line carrying `state: "Passed"` lets `/goal`'s evaluator confirm completion and auto-clear the goal.
5. If the user wants to stop the loop early without reaching `Passed`, instruct them to run `/goal clear` (or any of the aliases `stop`/`off`/`reset`/`none`/`cancel`). `/clear` (new conversation) also drops the active goal.

**Decision rule — do not mutate the contract.** This skill never runs `rubrix state set`, never writes `scores[]`, and never edits `rubrix.json` directly. All mutations during the `/goal` loop come from `/rubrix:score` and `/rubrix:plan`. If the contract needs to advance state, send the user back to the right Rubrix skill — not direct edits.

## Why the CLI rejects some conditions

`rubrix goal validate <path> <condition>` checks a user-supplied condition (e.g. when they hand-edit the synthesized one) for:

- **Length cap**: ≤ 4,000 chars (the Claude Code `/goal` limit).
- **Evaluator-visible verdict marker**: at least one of `rubrix gate`, `overall_pass`, `Passed` — without these, the small-fast evaluator has no transcript signal to check against.
- **No filesystem-read directives**: phrases like `cat rubrix.json`, `read the file`, `readFileSync` are rejected because the evaluator cannot call tools; such conditions will never be satisfiable.

A failing validate returns exit code 3 with concrete reasons on stderr.

## Worked example

```jsonc
// state=PlanLocked, rubric.threshold=0.8, criteria=[c1(weight=0.5,floor=0.7), c2(weight=0.5,floor=0.6)]
// User: "let it run until Passed"
```

```bash
$ node cli/bin/rubrix.js goal print rubrix.json
Run `node cli/bin/rubrix.js gate rubrix.json --json` and check that the JSON output has `overall_pass: true` and `state: "Passed"`. Each of these per-criterion floors must be met: `c1>=0.7`, `c2>=0.6`. If state is `Failed`, run `/rubrix:plan` with "revise the plan now" then `/rubrix:score`. If overall_pass is false but state is `Scoring`, run `/rubrix:score` first.
```

The user then pastes that line after `/goal ` into their Claude Code prompt. The next turn they run `/rubrix:score`. If Failed, the loop continues automatically; if Passed, the goal clears on the following turn.

## Postconditions

- A transcript line containing the suggested `/goal ` command exists for the user to copy.
- `rubrix.json` is unchanged (read-only skill).
- The user understands the recovery loop and the `/goal clear` aliases.
