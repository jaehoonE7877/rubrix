# Rubrix v1.0.0 Verification

A repo-shape + smoke-test checklist. Run from the plugin root.

## 1. Repo shape

```bash
find .claude-plugin cli/{schemas,bin,src,tests} hooks scripts skills agents registry examples docs/reviews -type f \
  | sort
```

Required files:

- `.claude-plugin/plugin.json`, `.claude-plugin/marketplace.json`
- `cli/schemas/{rubrix,evaluator-result,registry}.schema.json`
- `cli/bin/rubrix.js`, `cli/src/cli.ts`
- `cli/src/core/{state,contract,integrity}.ts`
- `cli/src/commands/{validate,gate,report,state,lock,hook}.ts`
- `cli/src/hooks/handlers.ts`
- `cli/tests/{validate,gate,report,state,state.cli,lock,hook,hook-emit,integrity,contract}.test.ts`
- `hooks/hooks.json` (Claude Code 3-level nested config)
- `scripts/{session_start,user_prompt_expansion,pre_tool_use,post_tool_use,post_tool_batch,subagent_stop,stop}.sh` (all `chmod +x`)
- `skills/{rubric,matrix,plan,score}/SKILL.md`
- `agents/{rubric-architect,matrix-auditor,plan-critic,evidence-finder,output-judge}.md`
- `registry/{skills,agents,hooks}.json`
- `examples/{self-eval,ios-refactor}/{rubrix.json,artifact.md,expected-report.md}`
- `docs/lifecycle-state-machine.md`
- `docs/reviews/{phase-1..6,v1.0.0-codex-review}.md`
- `bin/rubrix`, `PLUGIN-README.md`, `VERIFICATION.md`, `README.md`, `CLAUDE.md`

## 2. Plugin manifest validation

```bash
claude plugin validate .
# expected: ✔ Validation passed (warnings allowed)
```

## 3. CLI typecheck + tests

```bash
cd cli
npm install
npm run typecheck   # exit 0
npm test            # 79+ vitest tests pass
```

## 4. CLI smoke tests on examples

```bash
node cli/bin/rubrix.js validate examples/self-eval/rubrix.json     # exit 0
node cli/bin/rubrix.js state get examples/self-eval/rubrix.json    # IntentDrafted
node cli/bin/rubrix.js report examples/self-eval/rubrix.json | head -10
node cli/bin/rubrix.js validate examples/ios-refactor/rubrix.json  # exit 0
node cli/bin/rubrix.js state get examples/ios-refactor/rubrix.json # Passed
node cli/bin/rubrix.js gate examples/ios-refactor/rubrix.json      # PASS, exit 0
```

## 5. Hook scripts end-to-end (Claude Code spec)

PreToolUse uses `hookSpecificOutput.permissionDecision` (exit 0); Stop uses exit-code path (block → exit 2 + stderr).

```bash
echo '{"cwd":"'"$PWD"'","contract_path":"examples/self-eval/rubrix.json"}' \
  | bash scripts/session_start.sh
# expected stdout: {"systemMessage":"[rubrix] state=IntentDrafted locks=rubric:false matrix:false plan:false"}, exit 0

echo '{"cwd":"'"$PWD"'","contract_path":"examples/self-eval/rubrix.json","tool_name":"Edit","tool_input":{"file_path":"src/main.ts"}}' \
  | bash scripts/pre_tool_use.sh
# expected stdout: {"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"cannot use Edit: locks.rubric=false ..."}}, exit 0

echo '{not-json' | bash scripts/pre_tool_use.sh
# expected: stderr "rubrix hook PreToolUse: stdin is not valid JSON: ...", exit 2

echo '{"cwd":"'"$PWD"'","contract_path":"examples/ios-refactor/rubrix.json"}' \
  | bash scripts/pre_tool_use.sh
# (ios-refactor is in Passed state, not Failed) — expected: permissionDecision="allow", exit 0
```

## 6. Lock semantic integrity

```bash
node cli/bin/rubrix.js validate examples/ios-refactor/rubrix.json  # exit 0 (schema ok)
# Manually edit a copy with criterion id "c99" not in rubric → rubrix lock matrix should exit 3.
```

Covered by `cli/tests/integrity.test.ts` and `cli/tests/lock.test.ts`.

## 7. Atomic + symlink-safe contract write

Covered by `cli/tests/contract.test.ts` (3 tests):
- No leftover `.tmp-*` after successful write
- Writing through a symlink preserves the symlink
- Schema-invalid contract is refused, file unchanged

## 8. Registry consistency

```bash
node -e '
  const fs = require("fs");
  for (const k of ["skills", "agents", "hooks"]) {
    const r = JSON.parse(fs.readFileSync("registry/" + k + ".json", "utf8"));
    for (const e of r.entries) {
      if (!fs.existsSync(e.path)) { console.error("missing", e.path); process.exit(1); }
    }
  }
  console.log("registry: ok");
'
# expected: registry: ok
```

## 9. Codex review logs

```bash
for n in 1 2 3 4 5 6; do
  f="docs/reviews/phase-${n}.md"
  if [ ! -f "$f" ]; then echo "phase-${n}: MISSING"
  elif ! grep -q "no further improvements" "$f"; then echo "phase-${n}: NOT yet approved"; fi
done
test -f docs/reviews/v1.0.0-codex-review.md || echo "v1.0.0 review log: MISSING"
```

Final v1.0.0 verification: no lines should be printed.

## 10. Packaging dry run

```bash
(cd cli && npm pack --dry-run)                                 # tarball OK
node -e 'JSON.parse(require("fs").readFileSync(".claude-plugin/marketplace.json","utf8"));'
node -e 'JSON.parse(require("fs").readFileSync(".claude-plugin/plugin.json","utf8"));'
node -e 'JSON.parse(require("fs").readFileSync("hooks/hooks.json","utf8"));'
```

**Do not run `npm publish` without explicit user approval.**

## 11. Eval scaffold (optional, costs OAuth quota)

```bash
node scripts/eval/run-skill-benchmark.mjs --iteration iteration-N --parallel 8 --budget-usd 1 --model sonnet
node scripts/eval/grade-run.mjs --iteration iteration-N
node scripts/eval/aggregate.mjs --iteration iteration-N --skill-name rubrix-skills
# Reference: iter-4 hit with_skill 96.9% / +43.1pp delta over baseline (13 cases × 2 conditions = 26 runs).
```
