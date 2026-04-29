# Phase 6 — Codex Review Log

**Scope reviewed**:
- `.claude-plugin/marketplace.json`
- `cli/package.json` (publish metadata boost)
- `cli/README.md`
- `docs/publication-cleanup.md`
- `docs/versioning-and-migration.md`

## Round 1 — initial findings (3)

| # | Severity | Finding | Resolution |
|---|----------|---------|------------|
| 1 | P2 | `publication-cleanup` section 1 required plugin name to match the npm scope, but plugin id is `rubrix` and npm package is `@rubrix/cli`. The check would always fail. | Section 1 split: `plugin.json` `name` only needs to match the marketplace plugin id (`rubrix`); a separate item asserts `marketplace.json` `cli.package` === `cli/package.json` `name`. |
| 2 | P2 | `versioning-and-migration` omitted `cli/package-lock.json` from the version lockstep. A documented bump could leave the lockfile stale. | Lockstep table now includes `package-lock.json` (top-level + `packages[""]`). Workflow uses `npm version --no-git-tag-version` (which updates both files) and a manual mirror into `.claude-plugin/*.json`. |
| 3 | P3 | Doc claimed `rubrix.schema.json` `$id` embeds the major version, but the checked-in schema uses an unversioned `$id`. | "Versions tracked" no longer mentions a `$id`-embedded major. Added a "Schema `$id` policy" callout: `$id` is currently unversioned; document `version` carries compatibility; future major bump may switch to versioned `$id`, in which case this doc must be updated. |

## Round 2 — additional finding (1)

| # | Severity | Finding | Resolution |
|---|----------|---------|------------|
| 4 | P2 | `cli/src/cli.ts` hard-coded `program.version("0.1.0")`, so the documented `npm version` workflow would leave `rubrix --version` stale. | `cli.ts` now reads `cli/package.json` at startup and derives the CLI version from it. `cli/package.json` `files[]` explicitly lists `package.json` so the tarball ships it. Verified via `node cli/bin/rubrix.js --version` → `0.1.0`. |

## Round 3 — verification

Re-ran `codex review` after the dynamic-version fix. Codex installed the packed tarball, ran the binary, and confirmed `0.1.0`. Verbatim conclusion:

> The version now comes from package.json and the packaged tarball includes package.json; an installed tarball also reports 0.1.0 via the bin. **no further improvements**.

## Local verification

- `npm run typecheck` exits 0
- `npm test` — 50 tests pass
- `node cli/bin/rubrix.js --version` → `0.1.0`
- Versions in lockstep:
  - `.claude-plugin/plugin.json` → 0.1.0
  - `.claude-plugin/marketplace.json` → 0.1.0
  - `cli/package.json` → 0.1.0
- `cd cli && npm pack --dry-run` succeeds: 17 files, 10.4 kB tarball, includes `package.json`, `bin/`, `src/`, `schemas/`, `tsconfig.json`, `README.md`
- `node -e 'JSON.parse(fs.readFileSync(".claude-plugin/marketplace.json","utf8"))'` succeeds
- **No `npm publish` was executed.** Per CLAUDE.md "승인 필요 작업", that requires explicit user approval.

## Gate

Phase 6 passes. v0.1 MVP scaffold is complete. See the "Final v0.1 verification" section at the top of this directory's reviews.
