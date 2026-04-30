# Rubrix

Claude Code가 작업을 마치기 전에 **"잘 만들었는가"를 계약으로 검증**하는 플러그인.

## 왜 필요한가

"대시보드 만들어줘"라고 시키면 Claude는 만들고 끝이라고 합니다. 하지만 진짜 끝났는지는 아무도 모릅니다. Rubrix는 **작업 전에 평가 기준을 먼저 정하고**, 기준을 통과해야만 완료를 선언할 수 있게 합니다.

## 흐름

```
요청 → 평가 기준 작성 → 증거 매트릭스 → 실행 계획 → 작업 → 채점 → 통과/실패
         /rubrix:rubric    /rubrix:matrix   /rubrix:plan          /rubrix:score
```

- 기준·매트릭스·계획이 모두 잠기기 전에는 코드 편집이 차단됩니다.
- 실패하면 종료가 차단되고, 개선 후 재채점합니다.

## 시작하기

**필수**: Node.js >= 18.17

```bash
cd cli && npm install                        # 의존성 설치
claude --plugin-dir <체크아웃-경로>           # 플러그인 등록
/rubrix:rubric                               # 첫 skill 실행
```

## 기능 요약

### Skills

| Skill | 하는 일 | 상태 전이 |
|---|---|---|
| `/rubrix:rubric` | 평가 기준 작성·잠금 | IntentDrafted → RubricLocked |
| `/rubrix:matrix` | 기준별 증거 매트릭스 작성·잠금 | RubricLocked → MatrixLocked |
| `/rubrix:plan` | 실행 계획 작성·잠금 | MatrixLocked → PlanLocked |
| `/rubrix:score` | 채점 후 통과/실패 판정 | PlanLocked → Passed / Failed |

### CLI

```bash
node cli/bin/rubrix.js <command>
```

| 명령 | 역할 | 주요 exit code |
|---|---|---|
| `validate <path>` | 스키마 검증 | 0 유효 · 1 무효 |
| `state get/set <path>` | 상태 조회·전이 | 0 성공 · 3 불법 전이 |
| `lock <key> <path>` | artifact 잠금 (무결성 검사 포함) | 0 성공 · 3 무결성 실패 |
| `gate <path> [--apply]` | 임계값·하한선 평가 | 0 통과 · 4 실패 |
| `report <path> [--out]` | Markdown 보고서 | 0 성공 |
| `hook <event>` | Claude Code hook 어댑터 | 이벤트별 상이 |

### Hooks

| Hook | 동작 |
|---|---|
| PreToolUse | 세 lock 모두 true 전까지 Edit/Write 차단 |
| Stop | Failed 상태에서 종료 차단 |
| 나머지 5개 | 상태 정보 전달 (차단 없음) |

> Hook이 작업을 차단했다면 `rubrix.json`의 `state`와 `locks`를 확인하세요. 해당 단계의 skill을 실행하면 잠금이 풀립니다.

## 예제

```bash
node cli/bin/rubrix.js report examples/ios-refactor/rubrix.json   # 완전한 lifecycle 예제
node cli/bin/rubrix.js validate examples/self-eval/rubrix.json    # bootstrap 예제
```

## 검증

```bash
cd cli && npm install && npm test              # vitest 95개 통과
claude plugin validate .                       # manifest 검증
```

전체 체크리스트: [`VERIFICATION.md`](VERIFICATION.md) · 상세 가이드: [`PLUGIN-README.md`](PLUGIN-README.md) · 로드맵: [`docs/extensible-plan.md`](docs/extensible-plan.md)
