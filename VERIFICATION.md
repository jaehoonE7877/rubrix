# Rubrix v1.0.0 검증 체크리스트

플러그인 루트에서 실행합니다. **필수**: Node.js >= 18.17

## 1. 저장소 구조 확인

모든 필수 파일이 있는지 확인합니다.

```bash
find .claude-plugin cli/{schemas,bin,src,tests} hooks scripts skills agents examples -type f | sort
```

필수 파일 목록:

- `.claude-plugin/plugin.json`, `.claude-plugin/marketplace.json`
- `cli/schemas/{rubrix,evaluator-result}.schema.json`
- `cli/bin/rubrix.js`, `cli/src/cli.ts`
- `cli/src/core/{state,contract,integrity}.ts`
- `cli/src/commands/{validate,gate,report,state,lock,hook}.ts`
- `cli/src/hooks/handlers.ts`
- `cli/tests/*.test.ts` (12개 suite)
- `hooks/hooks.json`
- `scripts/*.sh` (7개, 모두 `chmod +x`)
- `skills/{rubric,matrix,plan,score}/SKILL.md`
- `agents/{rubric-architect,matrix-auditor,plan-critic,evidence-finder,output-judge}.md`
- `examples/{self-eval,ios-refactor}/{rubrix.json,artifact.md,expected-report.md}`

## 2. 플러그인 manifest 검증

```bash
claude plugin validate .
# 기대: ✔ Validation passed
```

## 3. CLI 타입체크 + 테스트

```bash
cd cli
npm install
npm run typecheck   # exit 0, 타입 오류 없음
npm test            # vitest 95개 통과
```

## 4. 예제 smoke test

```bash
node cli/bin/rubrix.js validate examples/self-eval/rubrix.json     # exit 0
node cli/bin/rubrix.js state get examples/self-eval/rubrix.json    # IntentDrafted
node cli/bin/rubrix.js validate examples/ios-refactor/rubrix.json  # exit 0
node cli/bin/rubrix.js state get examples/ios-refactor/rubrix.json # Passed
node cli/bin/rubrix.js gate examples/ios-refactor/rubrix.json      # PASS, exit 0
node cli/bin/rubrix.js report examples/ios-refactor/rubrix.json | head -10
```

## 5. Hook 스크립트 E2E

PreToolUse는 `hookSpecificOutput.permissionDecision` (exit 0), Stop은 exit-code path (차단 시 exit 2 + stderr).

```bash
# SessionStart — 상태 안내
echo '{"cwd":"'"$PWD"'","contract_path":"examples/self-eval/rubrix.json"}' \
  | bash scripts/session_start.sh
# 기대: {"systemMessage":"[rubrix] state=IntentDrafted locks=..."}, exit 0

# PreToolUse — lock 미완료 시 차단
echo '{"cwd":"'"$PWD"'","contract_path":"examples/self-eval/rubrix.json","tool_name":"Edit","tool_input":{"file_path":"src/main.ts"}}' \
  | bash scripts/pre_tool_use.sh
# 기대: permissionDecision="deny", exit 0

# 잘못된 JSON 입력
echo '{not-json' | bash scripts/pre_tool_use.sh
# 기대: stderr에 오류 메시지, exit 2

# PreToolUse — Passed 상태에서 허용
echo '{"cwd":"'"$PWD"'","contract_path":"examples/ios-refactor/rubrix.json"}' \
  | bash scripts/pre_tool_use.sh
# 기대: permissionDecision="allow", exit 0
```

## 6. Lock 무결성 검사

rubric에 없는 criterion을 matrix에 넣으면 `rubrix lock matrix`가 exit 3으로 거부합니다.

테스트 커버: `cli/tests/integrity.test.ts`, `cli/tests/lock.test.ts`

## 7. 원자적 파일 쓰기

temp 파일 → fsync → rename 패턴. symlink를 통한 쓰기도 symlink를 보존합니다.

테스트 커버: `cli/tests/contract.test.ts` (5개 테스트)

## 8. 패키징 dry run

```bash
(cd cli && npm pack --dry-run)
node -e 'JSON.parse(require("fs").readFileSync(".claude-plugin/plugin.json","utf8"))'
node -e 'JSON.parse(require("fs").readFileSync("hooks/hooks.json","utf8"))'
```

`npm publish`는 사용자 승인 없이 실행하지 않습니다.

## 9. 평가 스캐폴드 (선택, OAuth 비용 발생)

```bash
node scripts/eval/run-skill-benchmark.mjs --iteration iteration-N --parallel 8 --budget-usd 1 --model sonnet
node scripts/eval/grade-run.mjs --iteration iteration-N
node scripts/eval/aggregate.mjs --iteration iteration-N --skill-name rubrix-skills
```
