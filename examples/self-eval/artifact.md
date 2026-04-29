# Artifact under evaluation: Rubrix v1.0 plugin scaffold

This document describes what the self-eval rubric scores. The "artifact" is the Rubrix v1.0 repo itself — the schema, CLI, hooks, skills, agents, examples, and packaging metadata.

## Surfaces evaluated

| Surface | Source of truth |
| --- | --- |
| Plugin manifest | `.claude-plugin/plugin.json` |
| Schemas | `cli/schemas/{rubrix,evaluator-result}.schema.json` |
| CLI | `cli/src/`, `cli/bin/rubrix.js` |
| Hooks | `hooks/hooks.json`, `scripts/*.sh` |
| Skills | `skills/{rubric,matrix,plan,score}/SKILL.md` |
| Agents | `agents/*.md` |

## How evaluators should read this

1. Treat the repo as the artifact. Do not run `npm publish` or any side-effecting command.
2. For each criterion in `rubrix.json`, the evaluator should cite specific files/commands that prove (or disprove) the criterion.
3. The expected gate verdict on a clean repo is `PASS` — see `expected-report.md`.
