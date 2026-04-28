# Rubrix — Claude Code 플러그인 (v1.0.0)

`rubrix.json`을 canonical 평가 계약으로 삼고, hooks · CLI · skills · subagents가 10-state lifecycle을 강제하는 evaluation-contract-first harness입니다.

## 설치

```bash
# 의존성 설치
cd cli && npm install

# Claude Code에 플러그인 등록
claude --plugin-dir <rubrix 체크아웃 경로>
```

플러그인 진입점은 `.claude-plugin/plugin.json`입니다. Skills는 `rubrix:` namespace로 로드됩니다 (예: `/rubrix:rubric`). Hook 스크립트는 `scripts/*.sh`에서 `node cli/bin/rubrix.js`를 호출합니다. `claude plugin validate .`으로 manifest 유효성을 확인할 수 있습니다.

## 라이프사이클

Rubrix는 10개 상태로 진행됩니다. lock은 단순 boolean이 아니라 cross-artifact 무결성 검사를 통과해야 `true`가 됩니다.

```
IntentDrafted
  → RubricDrafted → RubricLocked
  → MatrixDrafted → MatrixLocked
  → PlanDrafted   → PlanLocked
  → Scoring
  → Passed | Failed
              ↳ Failed → PlanDrafted (개선 루프, 이전 점수 초기화)
```

상태 전이 표와 lock 불변식 전체는 [`docs/lifecycle-state-machine.md`](docs/lifecycle-state-machine.md) 참고.

## Skills

`rubrix:` namespace로 4개 skill이 제공됩니다.

| Skill | 역할 | 트리거 조건 |
|---|---|---|
| `/rubrix:rubric` | `rubric.criteria[]` 작성 및 잠금 | 항상 실행 가능 |
| `/rubrix:matrix` | `matrix.rows[]` 작성 및 잠금 | `rubric.criteria[]`가 존재할 때 |
| `/rubrix:plan` | `plan.steps[]` 작성 및 잠금; `Failed` 복구 루프는 명시적 재계획 지시 필요 | `matrix`가 잠금된 상태 |
| `/rubrix:score` | 평가자 subagents 호출, `scores[]` 기록, `rubrix gate --apply` 실행 | `rubrix.json` 존재 + `state=PlanLocked` + 사용자가 명시적으로 verdict 요청 |

각 skill은 CLI를 호출하는 얇은 SKILL.md입니다. skill은 직접 `state`를 `Passed` / `Failed`로 바꾸지 않으며, 오직 `rubrix gate --apply`만이 최종 상태를 씁니다.

## CLI 명령어

```bash
node cli/bin/rubrix.js <command>
```

| 명령어 | 역할 | Exit code |
|---|---|---|
| `validate <path>` | `rubrix.json`을 JSON Schema로 검증 | `0` 유효, `1` 무효 |
| `state get <path>` | 현재 상태 조회 | `0` 성공, `2` 계약 오류 |
| `state set <path> <to>` | 상태 전이 (순방향 전용, gate-only 전이 차단) | `0` 성공, `2` 계약 오류, `3` 불법 전이 |
| `lock <key> <path>` | `rubric` · `matrix` · `plan` 중 하나를 잠금. criterion refs · covers refs · 중복 id를 cross-artifact 검사 후 통과해야 잠금 | `0` 성공, `2` 계약 오류, `3` 잘못된 상태 / artifact 없음 / 무결성 실패 |
| `gate <path> [--apply]` | 임계값·하한선 평가. `--apply`를 붙이면 `Passed` / `Failed`를 rubrix.json에 저장 | `0` 통과, `4` 실패, `2` 계약 오류, `3` 잘못된 상태 |
| `report <path> [--out <file>]` | Markdown 형식 보고서 렌더링 | `0` 성공, `2` 계약 오류 |
| `hook <event>` | Claude Code hook 어댑터: stdin에서 JSON 읽고, 이벤트별 JSON 또는 exit code 응답 | 이벤트별 상이 |

## Hook 동작

| Hook | 동작 방식 |
|---|---|
| **PreToolUse** | `Edit` / `Write` / `MultiEdit` / `NotebookEdit`를 세 lock이 모두 `true`가 될 때까지 차단. `rubrix.json` 자체 편집은 항상 허용. `/rubrix:score`는 `locks.plan=false`이면 차단. stdout에 `hookSpecificOutput.permissionDecision` JSON 출력, exit 0. |
| **UserPromptExpansion** | 현재 `state` + `locks`를 추가 컨텍스트로 주입. `locks.plan=false`인 상태에서 `/rubrix:score` 호출 시 exit 2 + stderr로 차단. |
| **Stop** | `state=Failed`일 때 종료를 exit 2 + stderr로 차단 → 개선 루프 강제. |
| **SessionStart** | 세션 시작 시 현재 상태 안내 (정보 전달만). |
| **PostToolUse** | 도구 실행 후 상태 요약 (정보 전달만). |
| **PostToolBatch** | 도구 배치 완료 후 요약 (정보 전달만). |
| **SubagentStop** | 하위 에이전트 종료 시 결과 요약 (정보 전달만). |

전체 설정은 [`hooks/hooks.json`](hooks/hooks.json) 참고 (Claude Code 3-level 중첩 event → matcher → handler 구조).

## 예제

| 예제 | 설명 | 상태 |
|---|---|---|
| [`examples/self-eval/`](examples/self-eval/) | Rubrix 자체를 평가하는 bootstrap rubric | validate 통과 |
| [`examples/ios-refactor/`](examples/ios-refactor/) | `Passed`까지 전체 lifecycle을 완주한 예제 | validate 통과 |

## 검증

```bash
# 개발자용 전체 검증
cd cli && npm install && npm test           # vitest 87개 통과
claude plugin validate .                    # plugin manifest 통과
node cli/bin/rubrix.js validate examples/self-eval/rubrix.json
node cli/bin/rubrix.js validate examples/ios-refactor/rubrix.json

# 빠른 확인
node cli/bin/rubrix.js report examples/ios-refactor/rubrix.json
```

전체 검증 체크리스트는 [`VERIFICATION.md`](VERIFICATION.md) 참고.

## v1.1+ 계획

- `/rubrix:improve`, `/rubrix:replay`, `/rubrix:learn` 스킬
- Run history 스냅샷 (`runs/`) 자동화
- `PostToolBatch`에서 Multi-evaluator aggregation
- Domain pack (iOS, web, infra)
- `@rubrix/cli` npm 배포 및 Claude Code Marketplace 등록
