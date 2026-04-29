# Publication Cleanup Checklist

Run before any external publication of Rubrix (npm, Claude Code Marketplace, public repo announcement). Each item must be true; if not, fix before publishing.

## 1. Plugin manifests

- [ ] `.claude-plugin/plugin.json` `name` matches the marketplace plugin id (currently `rubrix`). The CLI's npm package name (`@rubrix/cli`) is independent and tracked in section 2.
- [ ] `.claude-plugin/plugin.json` `version` matches `.claude-plugin/marketplace.json` `version` and `cli/package.json` `version` (the 4-way lockstep is detailed in `docs/versioning-and-migration.md`)
- [ ] `.claude-plugin/marketplace.json` `entry` points at `.claude-plugin/plugin.json`
- [ ] `.claude-plugin/marketplace.json` `cli.bin` matches `cli/package.json` `bin` key
- [ ] `.claude-plugin/marketplace.json` `cli.package` matches `cli/package.json` `name`

## 2. CLI package

- [ ] `cli/package.json` `name`, `version`, `license`, `repository.url`, `bugs.url`, `homepage`, `engines.node` are correct
- [ ] `cli/package.json` `files` includes `bin`, `src`, `schemas`, `tsconfig.json`, `README.md`
- [ ] `cli/README.md` exists and matches the actual CLI surface (`rubrix --help` output)
- [ ] `cd cli && npm pack --dry-run` succeeds and lists every file expected by hooks/skills/agents
- [ ] `cd cli && npm run typecheck` exits 0
- [ ] `cd cli && npm test` — all vitest tests pass

## 3. Hooks & scripts

- [ ] `hooks/hooks.json` paths all begin with `${CLAUDE_PLUGIN_ROOT}/scripts/`
- [ ] All `scripts/*.sh` are `chmod +x`
- [ ] No business logic has leaked into `scripts/*.sh` — each is a 3–4 line shim that `exec node "${ROOT}/cli/bin/rubrix.js" hook <Event>`
- [ ] No script contains hard-coded paths outside `${CLAUDE_PLUGIN_ROOT}` or `${BASH_SOURCE}`

## 4. Skills & agents

- [ ] All 4 SKILL.md frontmatter (`name`, `description`) parse and match `registry/skills.json`
- [ ] No skill mutates `state` to `Passed` / `Failed` directly — only `rubrix gate --apply` does
- [ ] All 5 agent files have `tools:` restricted to read-class only (`Read`, `Glob`, `Grep`; optionally `Bash` for `evidence-finder`)
- [ ] Agent system prompts state explicitly that they MUST NOT mutate `rubrix.json`

## 5. Registry

- [ ] `registry/{skills,agents,hooks}.json` validate against `cli/schemas/registry.schema.json`
- [ ] Every `entries[].path` resolves to a real file
- [ ] `kind=skills` entries reference one of the 10 lifecycle states
- [ ] `kind=agents` entries have a `responsibility`
- [ ] `kind=hooks` entries have a valid `event`

## 6. Examples

- [ ] Every `examples/<name>/rubrix.json` validates with `rubrix validate`
- [ ] Every `examples/<name>/expected-report.md` is verbatim from the actual `rubrix report` output (regenerate via `node cli/bin/rubrix.js report examples/<name>/rubrix.json`)
- [ ] No example references files outside its own example directory unless those files exist

## 7. Documentation

- [ ] `PLUGIN-README.md` distinguishes implemented vs planned (no `npm publish` claims, no v0.2 features marked done)
- [ ] `VERIFICATION.md` commands all succeed against the current tree (with the documented Phase 5/Phase 6 boundary)
- [ ] `docs/lifecycle-state-machine.md` matches `cli/src/core/state.ts` STATES + TRANSITIONS + LOCK_INVARIANTS exactly
- [ ] `docs/extensible-plan.md` is preserved as the source of truth (do not rewrite during publication)
- [ ] `docs/reviews/phase-{1..6}.md` all exist and end with a `no further improvements` codex verdict

## 8. Secrets and noise

- [ ] No `.env`, `credentials.json`, private keys, or auth tokens anywhere in the tree
- [ ] No `node_modules/` checked in (`.gitignore` covers it)
- [ ] No commented-out debug code or `console.log` debugging in `cli/src/`
- [ ] No `TODO`/`FIXME` comments referencing internal-only context

## 9. Publication step (only after all above are checked)

```bash
cd cli && npm publish --access public
```

Then update the marketplace catalog with the published version. **All publication steps require explicit user approval per CLAUDE.md "승인 필요 작업".**
