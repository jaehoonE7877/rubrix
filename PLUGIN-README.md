# Rubrix — Claude Code 플러그인 사용 가이드 (v1.1.0)

작업 전에 평가 기준을 정하고, 기준을 통과해야 완료를 선언할 수 있게 하는 evaluation-contract-first 플러그인.

## 설치

**필수**: Node.js >= 18.17

```bash
cd cli && npm install                        # 의존성 설치
claude --plugin-dir <체크아웃-경로>           # 플러그인 등록
claude plugin validate .                     # manifest 유효성 확인 (선택)
```

진입점은 `.claude-plugin/plugin.json`. Skills는 `rubrix:` namespace로 로드됩니다.

## 라이프사이클

10개 상태를 순서대로 거칩니다. 각 lock은 cross-artifact 무결성 검사를 통과해야 `true`가 됩니다.

```
IntentDrafted (← /rubrix:brief 보정) → RubricDrafted → RubricLocked → MatrixDrafted → MatrixLocked
→ PlanDrafted → PlanLocked → Scoring → Passed | Failed
                                                  ↳ Failed → PlanDrafted (재시도)
```

상태·lock 불변식의 정의: [`cli/schemas/rubrix.schema.json`](cli/schemas/rubrix.schema.json)

## Skills

| Skill | 하는 일 | 언제 실행 가능한가 |
|---|---|---|
| `/rubrix:brief` | `intent.brief` 보정 (project_type, situation, ambition, axis_depth) | state=IntentDrafted (idempotent) |
| `/rubrix:rubric` | 평가 기준(`criteria[]`) 작성·잠금 | brief가 calibrated이거나 `RUBRIX_SKIP_BRIEF=1`일 때 |
| `/rubrix:matrix` | 기준별 증거 매트릭스(`rows[]`) 작성·잠금 | rubric이 잠겼을 때 |
| `/rubrix:plan` | 실행 계획(`steps[]`) 작성·잠금. Failed 복구 시 명시적 재계획 지시 필요 | matrix 잠금 후 |
| `/rubrix:score` | 채점 → `rubrix gate --apply`로 통과/실패 판정 | state=PlanLocked + 사용자가 verdict 요청 |

각 skill은 CLI를 호출하는 얇은 playbook. 최종 상태(`Passed`/`Failed`)는 오직 `rubrix gate --apply`만 기록합니다.

**Brief의 효과**: `intent.brief.axis_depth.<axis>="deep"`인 축에 매핑된 `criteria[].axis` 항목은 효과 floor가 `max(criterion.floor ?? 0, 0.7)`로 상승합니다. `ambition="demo"`는 모든 축을 `light`로 단축시켜 무거운 평가를 회피합니다.

## CLI

```bash
node cli/bin/rubrix.js <command>
```

| 명령 | 역할 | Exit code |
|---|---|---|
| `validate <path>` | 스키마 검증. v1.1+에서 brief 미calibrated이면 stderr warning만 (gate 통과) | 0 유효 · 1 무효 |
| `brief init <path> [--summary --project-type --situation --ambition --axis name=depth --risk]` | 신규 IntentDrafted 계약 생성 또는 기존 IntentDrafted brief 재보정 | 0 성공 · 2 잘못된 호출 · 3 IntentDrafted 외 거부 |
| `brief get <path> [--axis <name>] [--json]` | brief 조회. `--axis`는 effective depth (skip env / demo / per-axis 적용) 출력 | 0 성공 · 2 알 수 없는 축 |
| `state get <path>` | 현재 상태 조회 | 0 성공 · 2 계약 오류 |
| `state set <path> <to>` | 상태 전이 (순방향만) | 0 성공 · 2 계약 오류 · 3 불법 전이 |
| `lock <key> <path> [--threshold <n>] [--force <reason>]` | rubric·matrix·plan 잠금. 무결성 검사 후 v1.2+ contract는 clarity-scorer를 호출해 `score >= threshold`까지 통과해야 잠금. `--threshold`로 임계값 override(0–1), `--force <reason>`은 임계값 미달이어도 audit 정보(`forced=true`, `forced_at`, `force_reason`)를 남기며 잠금 | 0 성공 · 2 계약 오류·잘못된 force · 3 무결성·clarity 실패 |
| `score-clarity <key> <path> [--threshold <n>]` | (v1.2+) read-only clarity 점수 표시. `rubrix.json`은 절대 수정하지 않음. v1.0/v1.1 contract는 `scorer_active=false`로 score=1 (read-compat) | 0 성공 · 2 계약 오류 · 3 artifact 누락 |
| `gate <path> [--apply]` | 임계값·하한선 평가. `--apply` 시 Passed/Failed 저장. v1.2+에서 clarity invariant 위반 시 거부(exit 2) | 0 통과 · 4 실패 · 2 계약 오류 |
| `report <path> [--out <file>]` | Markdown 보고서 렌더링. v1.2+ contract는 마지막에 "Forced Locks" 섹션을 표시 | 0 성공 · 2 계약 오류 |
| `hook <event>` | Claude Code hook 어댑터 (stdin JSON → 결정 출력) | 이벤트별 상이 |

### v1.2+ clarity threshold 공식

`rubrix lock`이 사용하는 임계값은 base에 axis_depth modifier를 더해 결정합니다.

- base: `rubric=0.75`, `matrix=0.80`, `plan=0.70`
- modifier (multi-axis는 max만 적용): `deep=+0.10`, `standard=0`, `light=-0.10`
- precedence: CLI `--threshold` > `intent.brief.axis_depth`
- `RUBRIX_SKIP_BRIEF=1` 또는 uncalibrated brief는 standard로 fallback
- `intent.brief.ambition === "demo"`는 모든 axis를 light로 강제

deduction code enum: `vague_description`, `missing_evidence`, `unmeasurable_floor`, `dangling_reference`, `uncovered_axis`. 각 deduction은 actionable한 메시지(어느 필드를 어떻게 고쳐야 하는지)와 weight를 가집니다.

## Hook 동작

| Hook | 동작 | 차단 여부 |
|---|---|---|
| PreToolUse | 세 lock 모두 true 전까지 Edit/Write/MultiEdit 차단. `rubrix.json` 편집은 허용. v1.1+: brief 미calibrated 시 `/rubrix:rubric` 호출도 차단 (`RUBRIX_SKIP_BRIEF=1`로 우회). v1.2+: 임의의 v1.2 contract가 잠긴 artifact에 clarity가 없거나 score<threshold + forced≠true이면 즉시 차단 (rubrix.json 편집은 escape hatch로 계속 허용) | **차단** |
| UserPromptExpansion | state+locks 컨텍스트 주입. plan 미잠금 시 `/rubrix:score` 차단. v1.1+: IntentDrafted + brief 미calibrated이면 `<rubrix-suggestion>` 힌트 추가. v1.2+: clarity invariant 위반 시 `/rubrix:rubric`·`/rubrix:score`도 차단 | **조건부 차단** |
| PostToolUse | (v1.2+) 직전 `rubrix lock` 실패의 stderr deduction을 `<rubrix-suggestion>`으로 surface하고, 현재 contract에 forced=true 인 artifact가 있으면 `rubrix report` 안내 | 정보만 |
| Stop | state=Failed일 때 종료 차단 → 개선 루프 강제 | **차단** |
| SessionStart · PostToolBatch · SubagentStop | 상태 정보 전달 | 정보만 |

**Hook이 차단했다면?** `rubrix.json`의 `state`와 `locks`를 확인하고, 해당 단계의 skill을 실행하세요. stdin 5초 내 무응답 시 gate hook은 안전하게 차단(fail-closed), 정보 hook은 통과(fail-open)합니다.

설정 파일: [`hooks/hooks.json`](hooks/hooks.json)

## 예제

| 예제 | 설명 |
|---|---|
| [`examples/self-eval/`](examples/self-eval/) | Rubrix 자체를 평가하는 bootstrap rubric |
| [`examples/ios-refactor/`](examples/ios-refactor/) | Passed까지 전체 lifecycle 완주 |

```bash
node cli/bin/rubrix.js report examples/ios-refactor/rubrix.json
```

## 검증

```bash
cd cli && npm install && npm test              # vitest 136개 통과
node cli/bin/rubrix.js validate examples/self-eval/rubrix.json
node cli/bin/rubrix.js validate examples/ios-refactor/rubrix.json
```

전체 체크리스트: [`VERIFICATION.md`](VERIFICATION.md) · 로드맵: [`docs/extensible-plan.md`](docs/extensible-plan.md)
