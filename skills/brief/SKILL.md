---
name: brief
description: Calibrate intent.brief on rubrix.json before any rubric/matrix/plan work. Use this skill at the very start of a Rubrix run, before /rubrix:rubric. Idempotent — re-running on IntentDrafted just refreshes the brief.
---

# /rubrix:brief

Owns `intent.brief.calibrated` and the `IntentDrafted -> IntentDrafted (refreshed)` self-loop. All persistence goes through the `rubrix brief init` CLI; this skill never edits `rubrix.json` directly.

## Preconditions

- Current state must be `IntentDrafted`. Run `rubrix state get rubrix.json` to confirm.
- If the contract is past `IntentDrafted`, the brief is already locked into the lifecycle and cannot be re-briefed (the CLI returns exit 3); ask the user to start a new run instead of editing this one.

## Steps

1. Read `rubrix.json` and the user's intent. Decide whether to call `brief-interviewer` first.
   - **Skip the agent and just call `rubrix brief init` directly** when the user already supplied enough signal to fill all five fields (project_type, situation, ambition, axis_depth, optional risk_modifiers).
   - **Delegate to `brief-interviewer`** when fields are missing. The agent asks at most 5 questions and returns a JSON object matching the brief schema. Do NOT paraphrase its output — pass the enum values straight to the CLI.
2. Run `rubrix brief init rubrix.json` with explicit flags:
   ```bash
   rubrix brief init rubrix.json \
     --summary "<one-line intent>" \
     --project-type <greenfield|brownfield_refactor|brownfield_feature|infra|doc> \
     --situation <prototype|internal_tool|customer_facing|regulated> \
     --ambition <demo|mvp|production|hardened> \
     --axis security=<light|standard|deep> \
     --axis correctness=<light|standard|deep> \
     [--axis data=... --axis ux=... --axis perf=...] \
     [--risk <free-form>] [--risk <free-form>]
   ```
3. Verify with `rubrix validate rubrix.json` (warning section should be empty for IntentDrafted) and `rubrix brief get rubrix.json --json`.
4. State stays at `IntentDrafted`. Hand off to `/rubrix:rubric`.

   **Decision rule:** if the user explicitly says "demo" or "throwaway", set `--ambition demo`. Demo short-circuits every axis to `light` regardless of the per-axis flags, by design (Codex Q1 axis_depth contract).

## When to escalate axis_depth to `deep`

- `security` → user names sensitive data, auth boundaries, external input, or regulated context.
- `data` → user mentions migrations, irreversible writes, or schema breakage risk.
- `correctness` → public API, library, or anything other code will depend on.
- `ux` → customer-facing surface where confusion has measurable cost.
- `perf` → user calls out a latency/throughput target as a goal, not a wish.

A `deep` axis raises the effective floor of every criterion tagged with that axis to `max(criterion.floor ?? 0, 0.7)` at score time. This is enforced by `rubrix gate` (PR #3 of v1.1).

## Skip path

If the user really wants to bypass calibration (legacy v1.0 contracts, throwaway exploration), tell them to set `RUBRIX_SKIP_BRIEF=1` in their shell. That env var:
- bypasses the PreToolUse `/rubrix:rubric` deny gate, AND
- forces axis_depth fallback to all `standard` at score time.

Do not set this env var on behalf of the user without confirmation.

## Worked example

```jsonc
// Before
{ "state": "IntentDrafted", "intent": { "summary": "Add OAuth login" }, ... }

// After: rubrix brief init rubrix.json --summary "Add OAuth login" \
//          --project-type brownfield_feature --situation customer_facing \
//          --ambition production --axis security=deep --axis ux=standard \
//          --risk "third_party_idp" --risk "session_storage"
{
  "state": "IntentDrafted",
  "intent": {
    "summary": "Add OAuth login",
    "brief": {
      "calibrated": true,
      "project_type": "brownfield_feature",
      "situation": "customer_facing",
      "ambition": "production",
      "risk_modifiers": ["third_party_idp", "session_storage"],
      "axis_depth": { "security": "deep", "ux": "standard" }
    }
  }
}
```

## Postconditions

- `rubrix brief get rubrix.json` shows `calibrated=true` and the chosen depths.
- `rubrix validate rubrix.json` shows no warnings at any state.
- `/rubrix:rubric` is now safe to invoke (PreToolUse gate will allow it).
