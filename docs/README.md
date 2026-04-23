# Rubrix 문서 — 진입점

> 내일 회사 컴퓨터에서 이 문서를 보고 바로 작업을 이어갈 수 있도록 만든 내부 설계 문서 모음입니다.

## 이 문서는 누구를 위한 건가

- **내일의 나** (회사 컴퓨터에서 처음 보는 사람 모드)
- Rubrix 가 **무엇**이고 **왜** 만드는지, **어떻게** 구현할지를 순서대로 파악해야 하는 사람

## 읽는 순서

아래 순서대로 읽으면 설계 의도 → 구조 → 실제 할 일 순으로 이해됩니다.

| # | 문서 | 한 줄 |
|---|---|---|
| 1 | [01-overview.md](01-overview.md) | 왜 만드는가 / 30초 요약 / 핵심 원리 (GRASPS × GQM-lite) |
| 2 | [02-architecture.md](02-architecture.md) | 파이프라인 흐름도 + 구성요소 지도 + 핵심 설계 결정 |
| 3 | [03-components.md](03-components.md) | Skills · Subagents · Hooks · CLI 각각의 역할과 스펙 |
| 4 | [04-schemas.md](04-schemas.md) | `brief.md` (사람용) 과 `rubric.json` (머신용) 전체 예시 |
| 5 | [05-walkthrough.md](05-walkthrough.md) | "사용자 대시보드 만들어줘" 시나리오 End-to-End |
| 6 | [06-roadmap.md](06-roadmap.md) | 4 단계 구현 로드맵 + hoyeon 에서 재사용할 자산 |
| 7 | [07-phase1-plan.md](07-phase1-plan.md) | **내일 당장 할 일**: Phase 1 MVP 파일 체크리스트 |
| 8 | [08-verification.md](08-verification.md) | 4-Tier 테스트 전략과 검증 커맨드 |
| 9 | [99-references.md](99-references.md) | 외부 참고 문헌 + hoyeon 링크 |

## 용어 한 장 정리

- **GRASPS** — Goal / Role / Audience / Situation / Product / Standards. UbD 교육학에서 온 과제 명세 6요소.
- **GQM-lite** — Goal-Question-Metric 의 축약 버전. Standards 각 항목이 이 triple 로 작성되도록 강제.
- **brief.md** — 사람이 읽고 쓰는 GRASPS 스펙 (YAML frontmatter + 본문).
- **rubric.json** — brief.md 의 Standards 를 CLI 가 컴파일한 머신 스펙. judge 가 이걸로 채점.
- **cross-family judges** — Claude / Codex / Gemini 등 서로 다른 모델 패밀리로 채점해 self-preference bias 완화.
- **floor AND-gate** — 평균이 높아도 Standard 하나라도 floor 미달이면 FAIL. 강점이 약점을 가리지 않도록.
- **hoyeon** — 이 프로젝트의 패턴·hook·CLI 레퍼런스가 된 선행 플러그인.

## 현재 상태 (2026-04-24 기준)

- 레포지토리: [github.com/jaehoonE7877/rubrix](https://github.com/jaehoonE7877/rubrix) (public)
- 커밋: 초기 스캐폴드 (README + .gitignore + docs/)
- 다음 단계: **Phase 1 MVP** — `/grasps` 스킬 + CLI 뼈대. [07-phase1-plan.md](07-phase1-plan.md) 참조.
