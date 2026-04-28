# Expected Report — examples/self-eval

This is the report `rubrix report examples/self-eval/rubrix.json` SHOULD produce after a clean Phase 1–6 implementation, with all evaluators returning the maximum score for the Phase 1–scoped rubric.

```
# Rubrix Report

- **Intent**: Self-evaluate the Rubrix v0.1 Phase 1 scaffold (schema + plugin manifest + lifecycle doc).
- **State**: IntentDrafted
- **Locks**: rubric=false matrix=false plan=false

## Rubric (threshold 0.8)

| id | weight | floor | description |
| --- | --- | --- | --- |
| schema_self_validates | 0.3 | 1 | examples/self-eval/rubrix.json validates against cli/schemas/rubrix.schema.json with no errors. |
| state_enum_complete | 0.25 | 1 | cli/schemas/rubrix.schema.json state enum lists all 10 lifecycle states from docs/lifecycle-state-machine.md in the documented order. |
| lock_invariants_encoded | 0.25 | 0.8 | cli/schemas/rubrix.schema.json conditional allOf branches encode the lock invariants for every state listed in docs/lifecycle-state-machine.md, not only the Locked/Scoring states. |
| plugin_manifest_valid | 0.2 | 0.8 | .claude-plugin/plugin.json parses as JSON and contains name, version, description, license consistent with the Claude Code plugin convention. |
```

Note: this example deliberately stays in `IntentDrafted` so the report does not include a Gate section. To see the full pipeline, copy this file to a working directory, then run `/rubric → /matrix → /plan → /score` to walk it through to `Passed`.
