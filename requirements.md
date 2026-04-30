# Rubrix v1.1.0 — Intent Elicitation & Depth Calibration

> Source of truth: [`rubrix.json`](rubrix.json) (calibrated intent.brief)
> Linear: [RUB-9](https://linear.app/rubrix/issue/RUB-9) (parent) · [RUB-15](https://linear.app/rubrix/issue/RUB-15) · [RUB-16](https://linear.app/rubrix/issue/RUB-16) · [RUB-17](https://linear.app/rubrix/issue/RUB-17)

## Why

v1.0.1은 모든 run을 같은 rigor로 평가한다. demo 프로토타입과 regulated production이 동일한 rubric 구조를 받는다. v1.1은 intent를 구조화된 depth-calibrated brief로 교체해, downstream artifact가 프로젝트 성격에 맞는 rigor를 상속하도록 만든다.

## Scope (additive minor)

- `intent.brief` 객체 추가 (project_type, situation, ambition, risk_modifiers, axis_depth, calibrated). `intent.summary`는 deprecated-but-preserved.
- `rubric.criteria[].axis` enum 필드 추가 (security|data|correctness|ux|perf).
- `/rubrix:brief` skill + `brief-interviewer` agent.
- `rubrix brief init/get` CLI + `rubrix validate` brief-warning.
- PreToolUse gate: brief 미calibrated 시 `/rubrix:rubric` 호출 deny.
- Scoring: deep 축 매핑 criteria의 effective floor = `max(criterion.floor ?? 0, 0.7)`.

## Non-goals

- State machine 변경.
- Cryptographic seed freeze (v1.5).
- 자동 brief 재교정 / drift 감지 (v1.4).
- multi-axis interview parallel extraction.

## Acceptance criteria

1. `rubrix brief init && rubrix validate` → calibrated=true contract 생성.
2. v1.0 fixture (brief 없음) 로드 시 validate ok + warning만 (gate는 통과).
3. brief schema enum 위반은 validation fail.
4. brief 미calibrated 상태에서 `/rubrix:rubric` 호출 → PreToolUse stdout JSON에 `hookSpecificOutput.permissionDecision=deny` + `permissionDecisionReason` (예: `Run /rubrix:brief first to calibrate intent ...`), exit code 0.
5. `RUBRIX_SKIP_BRIEF=1` env override 동작 (deny 우회 + all-`standard` fallback).
6. `axis_depth.<axis>=deep` 매핑 criterion 점수 < 0.7 → Fail (다른 축 보상 없음).
7. `axis_depth.<axis>=standard` 동일 입력은 v1.0 동작과 동일.
8. `brief-interviewer` 출력이 schema 검증 통과 (enum 위반 fixture 포함).
9. Root `rubrix.json` v1.1 release 시점 state=`Passed`.
10. 신규 user-facing 문서 0개 (5문서 정책 유지).

## Risks & mitigations

- 기존 사용자 PreToolUse gate 충돌 → `RUBRIX_SKIP_BRIEF=1` env override + 첫 deny 시 마이그레이션 안내.
- trivial run brief 부담 → `ambition=demo` short-circuit (모든 axis=`light`).
- axis_depth 적용 contract underspecified → floor-only 단일 rule (`max(criterion.floor ?? 0, 0.7)` for deep axis).
- brief-interviewer 자연어 폭주 → JSON-only schema, enum 위반 fail.
- dogfood bootstrap 무한루프 → hook gate는 PR #3, brief skill은 PR #2 (시간차).
