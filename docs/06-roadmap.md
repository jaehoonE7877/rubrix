# 06 · Roadmap — 4 단계 + 재사용 자산

## Phase 1 — MVP: `/grasps` + CLI (1주)

**목표**: 사용자가 brief.md + rubric.json 을 만들어 낼 수 있다.

생성물:

- `.claude-plugin/plugin.json` + `marketplace.json`
- `skills/grasps/SKILL.md` + `templates/brief.template.md`
- `cli/src/commands/brief.ts`, `rubric.ts` (init/set/validate/compile)
- `agents/mirror-agent.md`, `role-audience-interviewer.md`, `standards-architect.md`, `rubric-validator.md`
- `hooks/hooks.json` (PostToolUse 검증만)
- `README.md` 진입점 문서

**Done 기준**: 예제 태스크로 `brief.md` + 스키마 유효한 `rubric.json` 이 생성되고, rubric-validator 가 주관어를 거부한다.

> 실제 파일 체크리스트는 [07-phase1-plan.md](07-phase1-plan.md) 참조.

## Phase 2 — Evaluation Loop: `/evaluate` (1주)

**목표**: rubric.json 으로 artifact 를 채점하고 점수 + 피드백 반환.

생성물:

- `skills/evaluate/SKILL.md`
- `agents/judge-persona-builder.md`, `judge-claude.md`, `judge-codex.md`, `judge-gemini.md`
- `cli/src/commands/rubric.ts` 에 `score`, `report` 추가
- `scripts/evaluation-save.sh`
- `docs/bias-in-llm-judges.md`

**Done 기준**: 3개 judge 병렬 호출, position bias 완화 (order swap), JSON 스코어 집계, floor AND-gate 판정.

## Phase 3 — Refinement: `/refine` (3–5일)

**목표**: 실패한 Standard 에 집중해 artifact 를 개선하는 자율 루프.

생성물:

- `skills/refine/SKILL.md`
- `agents/improvement-worker.md`
- Circuit breaker (max 5 rounds, iteration cap 15)
- `state.json` 에 라운드 추적

**Done 기준**: 실패 → 개선 → 재평가 → 통과 시나리오 성공.

## Phase 4 — Hardening & Docs (1주)

- Calibration: human gold-set 50개로 judge Spearman 상관 추적 리포트
- VERIFICATION.md 의 4-Tier 테스트 구현
- CONTRIBUTING.md, CLAUDE.md, PLUGIN-README.md
- `README.ko.md`, `README.md` 최종판
- 마켓플레이스 등록

## 재사용 가능한 hoyeon 자산 (복붙 + 수정)

- `edit-error-recovery.sh`, `large-file-recovery.sh` — 편집 실패 복구 hook
- `session-compact-hook.sh` — 세션 컴팩트 시 상태 정리
- `cli-version-sync.sh` — CLI / 플러그인 버전 일치
- `rulph` 스킬의 **checklist decomposition** 규칙 (binary observable 강제)
- `rulph` 스킬의 **multi-model parallel dispatch** 코드 패턴 (CLI availability check → AVAILABLE/SKIPPED/DEGRADED)
- `plan.schema.json` 자리에 `rubric.schema.json` 패턴 차용
