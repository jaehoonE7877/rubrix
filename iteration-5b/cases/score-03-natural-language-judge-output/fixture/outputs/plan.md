# Plan: Improve skill triggering

## Steps

1. Update SKILL.md frontmatter description with trigger keywords.
2. Add Examples section showing happy-path Input/Output.
3. Add explicit error-handling branches for failed validate/lock/gate.

## Verification

- Run `node cli/bin/rubrix.js validate <fixture>` after each edit.
- Re-run the eval harness and check delta in benchmark.json.

## Notes

This plan does not document a rollback procedure. If iteration-2 regresses, the plan does not say what to revert.
