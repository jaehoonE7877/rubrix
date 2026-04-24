# CLAUDE.md

## Project

Rubrix is an evaluation-contract-first harness for Claude Code agents.
It turns vague user requests into structured planning artifacts and a rubric
that can be used to judge, improve, and gate agent output.

The intended workflow is:

1. Capture intent with GRASPS-style questions.
2. Produce a brief and rubric/evaluation contract.
3. Let a worker agent, Claude Code, or a human implement the work.
4. Evaluate the output against the rubric.
5. Refine failed items one at a time until the gate passes.

## Current Repository State

This checkout is still an early scaffold. Do not assume the full documentation
tree, Claude plugin package, CLI, hooks, skills, agents, or marketplace files
already exist unless they are present in the working tree.

Current source documents:

- `README.md`: project summary and high-level workflow.
- `docs/extensible-plan.md`: plugin-first Claude Code harness direction.

If a README link points to a missing document, treat it as planned structure,
not implemented repo truth.

## Architecture Direction

Rubrix should be built as a Claude Code plugin/harness, not as a docs-only
runtime.

Keep these boundaries clear:

- `rubrix.json` is the canonical evaluation contract and state source.
- Hooks enforce lifecycle gates and state transitions.
- CLI commands perform validation, gating, reporting, and hook adaptation.
- Skills stay thin and delegate durable logic to the CLI/contracts.
- Subagents are used for separable judgment roles, not general orchestration.
- Examples should demonstrate complete flows with real artifacts.

Planned core surfaces:

These are target surfaces, not current command contracts. Do not claim they
work until the corresponding files, scripts, or package entries exist.

- Skills: `/rubric`, `/matrix`, `/plan`, `/score`
- CLI: `rubrix validate`, `rubrix gate`, `rubrix report`, `rubrix hook <event>`
- Hooks: `SessionStart`, `UserPromptExpansion`, `PreToolUse`,
  `PostToolUse`, `PostToolBatch`, `SubagentStop`, `Stop`

## Implementation Rules

- Prefer small, explicit, production-friendly code.
- Do not add large dependencies or framework layers for small features.
- Keep schemas strict and versioned.
- Make state transitions explicit and testable.
- Validate generated artifacts immediately after creating or modifying them.
- Refuse to overwrite user-authored artifacts unless the command contract
  explicitly permits it.
- Keep user-facing commands deterministic where possible.
- Separate contract data, observed evidence, and final judgment artifacts.

## Ask First

Get explicit user approval before:

- Running destructive git operations or deleting repo artifacts.
- Overwriting user-authored `rubrix.json`, plans, reports, or requirements.
- Making schema breaking changes to persisted artifacts.
- Publishing, installing globally, or changing npm/marketplace metadata.
- Adding large dependencies or new orchestration layers.

## Artifact Rules

Generated artifacts should be easy to inspect and safe to replay.

Use stable names and clear ownership:

- Evaluation contract/state: `rubrix.json`
- Brief or requirement summary: `brief.md` or `requirements.md`
- Evaluation matrix: `matrix.json` or `rubric.json`
- Execution plan: `plan.json`
- Reports and run output: `reports/` or `runs/`

When adding a new artifact format, update the schema or validation path in the
same change.

## Current Verification

Until a CLI, test suite, or package scaffold exists, use repo-shape checks as
the minimum verification:

- Use `rg --files` to confirm referenced local paths exist.
- Treat missing referenced paths as planned unless the text says implemented.
- For docs changes, verify new links or file references against the tree.
- Do not claim `rubrix` commands work until their executable path exists.
- Once CLI, schemas, hooks, or tests exist, run the narrowest relevant
  validation command for the changed surface.

## Development Workflow

Before editing code or docs:

1. Read the relevant current files, not only planned paths from README tables.
2. Check whether the requested surface is implemented or still only planned.
3. Make the smallest change that advances the harness.
4. Add or update validation when behavior changes.
5. Run the narrowest meaningful verification command or repo-shape check
   available.

When implementing lifecycle behavior:

- Start with contract validation.
- Add hook/CLI enforcement after the contract is clear.
- Keep hook scripts thin.
- Keep reusable logic in the CLI/core layer.
- Ensure failures explain what state is missing and how to proceed.

## Documentation Rules

- Keep docs concise and onboarding-friendly.
- Label planned behavior as planned.
- Label implemented behavior as implemented only after checking the tree.
- Prefer concrete file paths, command examples, and artifact contracts.
- Avoid broad rewrites when a focused update is enough.

## Out of Scope Unless Requested

- Replacing the harness direction with a generic task runner.
- Building a parallel workflow outside the Claude Code plugin surface.
- Adding complex orchestration before the contract, CLI, and hook path exist.
- Treating marketplace or npm packaging as complete before files exist.
