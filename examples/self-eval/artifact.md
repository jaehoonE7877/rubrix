# Artifact under evaluation: Rubrix v0.1 plugin scaffold

This document describes what the self-eval rubric scores. The "artifact" is the Rubrix v0.1 repo itself — the schema, CLI, hooks, skills, agents, registry, examples, and packaging metadata produced across Phases 1–6.

## Surfaces evaluated

| Surface | Source of truth |
| --- | --- |
| Plugin manifest | `.claude-plugin/plugin.json` |
| Schemas | `cli/schemas/{rubrix,evaluator-result,registry}.schema.json` |
| CLI | `cli/src/`, `cli/bin/`, `bin/rubrix` |
| Hooks | `hooks/hooks.json`, `scripts/*.sh` |
| Skills | `skills/{rubric,matrix,plan,score}/SKILL.md` |
| Agents | `agents/*.md` |
| Registry | `registry/{skills,agents,hooks}.json` |

## How evaluators should read this

1. Treat the repo as the artifact. Do not run `npm publish` or any side-effecting command.
2. For each criterion in `rubrix.json`, the evaluator should cite specific files/commands that prove (or disprove) the criterion.
3. The expected gate verdict on a clean repo is `PASS` — see `expected-report.md`.
