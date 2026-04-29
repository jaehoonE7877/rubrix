# Rubrix

Claude Code 에이전트 작업을 **검증 가능한 lifecycle**로 구조화하는 evaluation-contract-first 플러그인입니다.

## 왜 Rubrix인가

Claude Code가 작업을 수행할 때, "잘 만든 건지" 판단하는 명확한 기준이 없으면 완료를 선언하기 어렵습니다. Rubrix는 모호한 요청을 `rubrix.json` **평가 계약**으로 분해합니다 — 평가 기준을 먼저 정하고, 증거 매트릭스와 실행 계획을 잠근 뒤에야 코드를 건드릴 수 있습니다. 채점은 subagent가 계약 기준으로 수행하고, hook이 lifecycle 순서를 강제합니다.

## 어떻게 동작하나

```
[User]  "사용자 대시보드 만들어줘"
   ↓
[/rubrix:rubric]   → 요구사항과 평가 기준을 rubrix.json 으로 구조화
   ↓
[/rubrix:matrix]   → 각 기준(criterion)에 대한 증거 매트릭스 작성
   ↓
[/rubrix:plan]     → 실행 계획과 검증 단계 생성, 계획 잠금
   ↓
[Worker]           → Claude Code / subagent / 사람이 작업 수행
   ↓
[/rubrix:score]    → 평가자 subagent로 채점 → rubrix gate --apply
   ↓
Passed → 종료    Failed → 한 항목씩 개선 → 재평가
```

> 모든 skill은 `/rubrix:<name>` 형태로 호출합니다. PreToolUse hook이 세 가지 lock(rubric · matrix · plan)이 모두 `true`가 되기 전까지 Edit / Write를 차단하고, Stop hook이 `Failed` 상태에서 종료를 막아 개선 루프를 강제합니다.

## 시작하기

```bash
# 1. 의존성 설치
cd cli && npm install

# 2. Claude Code에 플러그인 등록
claude --plugin-dir <rubrix 체크아웃 경로>

# 3. 새 프로젝트에서 첫 번째 skill 실행
/rubrix:rubric
```

`/rubrix:rubric`을 실행하면 Claude가 요구사항을 인터뷰하고 `rubrix.json`을 생성합니다.

## 기능 요약

### Skills

| Skill | 역할 | 시작 상태 → 완료 상태 |
|---|---|---|
| `/rubrix:rubric` | 평가 기준(criteria) 작성 및 잠금 | `IntentDrafted` → `RubricLocked` |
| `/rubrix:matrix` | criterion ↔ evidence 매트릭스 작성 및 잠금 | `RubricLocked` → `MatrixLocked` |
| `/rubrix:plan` | 실행 계획 작성 및 잠금; Failed 복구 루프 지원 | `MatrixLocked` → `PlanLocked` |
| `/rubrix:score` | 평가자 subagent로 채점 후 gate 적용 | `PlanLocked` → `Passed/Failed` |

### CLI 명령어

```bash
node cli/bin/rubrix.js <command>
```

| 명령어 | 역할 | Exit code |
|---|---|---|
| `validate <path>` | `rubrix.json`을 스키마로 검증 | `0` 유효, `1` 무효 |
| `state get/set <path>` | 상태 조회 / 전이 (순방향만, gate-only 전이 차단) | `0` 성공, `2` 계약 오류, `3` 불법 전이 |
| `lock <key> <path>` | rubric · matrix · plan 잠금, cross-artifact 무결성 검사 포함 | `0` 성공, `2` 계약 오류, `3` 무결성 실패 |
| `gate <path> [--apply]` | 임계값/하한선 평가; `--apply`시 Passed/Failed 저장 | `0` 통과, `4` 실패, `2` 계약 오류 |
| `report <path> [--out]` | Markdown 보고서 렌더링 | `0` 성공, `2` 계약 오류 |
| `hook <event>` | Claude Code hook 어댑터 (stdin JSON → 결정 출력) | 이벤트별 상이 |

### Hooks

7가지 lifecycle 이벤트를 `hooks/hooks.json`에서 처리합니다.

| Hook | 동작 |
|---|---|
| `PreToolUse` | 세 lock이 모두 true 되기 전까지 Edit / Write 차단 (rubrix.json 편집은 허용) |
| `UserPromptExpansion` | 현재 state + locks를 컨텍스트로 주입; plan 미잠금 시 /rubrix:score 차단 |
| `Stop` | `state=Failed`일 때 종료 차단 → 개선 루프 강제 |
| `SessionStart` / `PostToolUse` / `PostToolBatch` / `SubagentStop` | 정보 전달 전용 |

### Subagents

`agents/` 에 5개의 평가자 subagent가 있습니다: `rubric-architect`, `matrix-auditor`, `plan-critic`, `evidence-finder`, `output-judge`.

## 예제

- [`examples/self-eval/`](examples/self-eval/) — Rubrix 자체를 평가하는 bootstrap 예제
- [`examples/ios-refactor/`](examples/ios-refactor/) — `Passed`까지 완전한 lifecycle 예제

```bash
# 예제 dry-run
node cli/bin/rubrix.js report examples/ios-refactor/rubrix.json
```

## 검증

```bash
cd cli && npm install && npm test           # vitest 93개 통과
claude plugin validate .                    # plugin manifest 통과
node cli/bin/rubrix.js validate examples/self-eval/rubrix.json
node cli/bin/rubrix.js validate examples/ios-refactor/rubrix.json
```

전체 검증 체크리스트는 [`VERIFICATION.md`](VERIFICATION.md), 상세 사용 가이드는 [`PLUGIN-README.md`](PLUGIN-README.md) 참고. 라이프사이클 상태 enum과 락 불변식은 [`cli/schemas/rubrix.schema.json`](cli/schemas/rubrix.schema.json)이 SSoT.

## v1.1+ 로드맵

- `/rubrix:improve`, `/rubrix:replay`, `/rubrix:learn` 스킬
- Run history 자동화 (`runs/`)
- Multi-evaluator aggregation
- Domain pack (iOS, web, infra)
- `@rubrix/cli` npm 배포 및 Claude Code Marketplace 등록

자세한 로드맵은 [`docs/extensible-plan.md`](docs/extensible-plan.md) 참고.
