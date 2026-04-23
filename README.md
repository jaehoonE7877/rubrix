# Rubrix

**Rubrix** 는 GRASPS 프레임(Goal / Role / Audience / Situation / Product / Standards)과 GQM-lite 평가 지표를 결합한 AI agent harness 입니다. 사용자의 모호한 요구사항을 구조화된 기획(brief)과 평가 매트릭스(rubric)로 동시에 변환해, agent 산출물의 완성도를 심사·개선할 수 있게 합니다.

## 30초 요약

```
[User]  "사용자 대시보드 만들어줘"
   ↓
[/grasps]  → 6가지 질문으로 brief.md + rubric.json 생성
   ↓
[Worker]  실제 작업 수행 (Claude Code / 다른 agent / 사람)
   ↓
[/evaluate] → 3개 cross-family judge 가 rubric 으로 채점
   ↓
통과 → ✓ 종료      미달 → [/refine] → 한 항목씩 개선 → 재채점
```

## 문서

설계와 구현 계획은 [`docs/`](docs/) 아래에 정리되어 있습니다. 진입점: [`docs/README.md`](docs/README.md).

| # | 문서 | 요약 |
|---|---|---|
| 1 | [Overview](docs/01-overview.md) | 왜 만드는가, 핵심 원리 |
| 2 | [Architecture](docs/02-architecture.md) | 파이프라인 + 구성요소 지도 (Mermaid) |
| 3 | [Components](docs/03-components.md) | Skills · Subagents · Hooks · CLI |
| 4 | [Schemas](docs/04-schemas.md) | brief.md · rubric.json 전체 예시 |
| 5 | [Walkthrough](docs/05-walkthrough.md) | End-to-End 시나리오 |
| 6 | [Roadmap](docs/06-roadmap.md) | 4 단계 구현 계획 |
| 7 | [Phase 1 Plan](docs/07-phase1-plan.md) | 당장의 작업 체크리스트 |
| 8 | [Verification](docs/08-verification.md) | 테스트 전략 |
| 9 | [References](docs/99-references.md) | 학술 · 선행 구현 링크 |

## 현재 상태

초기 스캐폴드 + 설계 문서. Claude Code 플러그인 + CLI 구현은 Phase 1 에서 시작합니다. 자세한 파일 체크리스트는 [docs/07-phase1-plan.md](docs/07-phase1-plan.md) 참조.
