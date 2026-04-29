# Versioning & Migration Policy

## Versions tracked

These fields carry a `version`. They MUST stay in lockstep:

| What | Where | Format |
| --- | --- | --- |
| Rubrix plugin | `.claude-plugin/plugin.json` `version` | semver `MAJOR.MINOR.PATCH` |
| Marketplace metadata | `.claude-plugin/marketplace.json` `version` | same as plugin |
| CLI npm package | `cli/package.json` `version` | same as plugin |
| CLI lockfile | `cli/package-lock.json` top-level `version` AND `packages[""].version` | same as plugin |
| Contract schema document | the runtime `version` field of each `rubrix.json` document | semver; only `MAJOR.MINOR` is significant for compatibility |
| Registry schema | `registry/*.json` `version` field | semver matching the registry schema, not the plugin |

A release commit MUST update plugin / marketplace / cli `package.json` / cli `package-lock.json` together when the plugin version changes. The simplest workflow is:

```bash
cd cli && npm version <patch|minor|major> --no-git-tag-version   # bumps both package.json and package-lock.json
# then manually mirror the same version into .claude-plugin/{plugin,marketplace}.json
```

CI can enforce parity via `node -e` checks, listed in `docs/publication-cleanup.md` section 1.

> **Schema `$id` policy:** the contract schema `$id` is currently the unversioned URL `https://rubrix.dev/schemas/rubrix.schema.json`. Backward / forward compatibility is carried entirely by the `version` field inside each `rubrix.json` document, NOT by the schema URL. If a future major bump introduces an incompatible schema, the policy will switch to a versioned `$id` (e.g. `…/v2/rubrix.schema.json`); when that happens, this document MUST be updated alongside the schema rename.

## Compatibility rules

### Patch (`0.1.0 → 0.1.1`)

- Bug fixes only. No new fields. No removed fields.
- A `rubrix.json` from any older `0.1.x` MUST validate against the new schema unchanged.

### Minor (`0.1.0 → 0.2.0`)

- New optional fields. New optional commands. New skills/agents/hooks.
- Existing `rubrix.json` files from `0.1.x` MUST still validate. The new schema MAY tighten `additionalProperties: false` for new sub-objects only.
- The CLI MUST keep accepting the older `version` string in `rubrix.json` and read it as if it were the current minor. If a feature added in `0.2.0` is requested but the document declares `version: "0.1.0"`, the CLI MUST refuse with a clear "feature added in 0.2.0; bump rubrix.json version" message.

### Major (`0.1.0 → 1.0.0` or `1.x.x → 2.x.x`)

- Breaking schema changes are allowed. A `rubrix.json` from the previous major MAY fail validation.
- Each major bump MUST ship a migration script under `cli/migrations/<from>-to-<to>.ts` and a CLI command `rubrix migrate <path> --from <ver>` that rewrites the file in place (with a `.bak` next to it).
- Migration MUST be idempotent and round-trip safe.
- The state machine MAY add states only at minor bumps. Removing or renaming a state requires a major bump.

## Schema migration mechanics (planned for v0.2+)

The first migration scenario will appear when `0.2.0` introduces multi-evaluator aggregation in `PostToolBatch`. The schema will likely add an optional `runs[]` array. That is a minor change (additive), so:

- No migration script needed.
- The CLI's contract loader will populate `runs: []` on read if missing, and never write it back as empty.

The first true *major* migration is not anticipated for v0.x; if it becomes necessary, follow the major rules above.

## Deprecation

- A field is "deprecated" when a future minor will remove or rename it, but the current minor still accepts it.
- Mark deprecated fields by adding a `deprecated: true` annotation in the schema and emitting a warning to stderr from `rubrix validate` when the field is present.
- Remove the field only at the next major bump.

## What never changes without a major bump

- The 10 lifecycle state names in their canonical order.
- The 7 hook event names.
- The semantics of `locks.{rubric, matrix, plan}` as the cheap gate source.
- The exit code policy of the CLI commands documented in `PLUGIN-README.md`.

## Publishing a new version

1. Run `docs/publication-cleanup.md` checklist top-to-bottom.
2. Bump the four version fields together via a single commit titled `release: vX.Y.Z`.
3. Tag the commit `vX.Y.Z`.
4. `cd cli && npm publish --access public` — requires explicit user approval per CLAUDE.md "승인 필요 작업".
5. Push the tag.
6. Update the marketplace catalog entry.
