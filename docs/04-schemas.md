# 04 · Schemas — brief.md & rubric.json

두 파일이 Rubrix 의 데이터 계약이다. `brief.md` 는 사람이 읽고 쓰고, `rubric.json` 은 CLI 가 컴파일해서 judge 가 기계적으로 읽는다.

## brief.md (사람이 작성/편집)

```markdown
---
name: user-dashboard
type: feature            # greenfield | feature | refactor | bugfix
ambition: mvp            # toy | mvp | product
risk: [sensitive-data]   # 다중 선택 가능
---

## G — Goal
신규 가입 후 7일 내 사용자가 자신의 구독 현황을 30초 안에 파악할 수 있는 대시보드.

## R — Role
프로덕트 엔지니어. 기존 Next.js 코드 스타일 따라가는 일관성 우선.

## A — Audience
비전공 일반 사용자 (바쁘고 충성도 낮음). CS 배경 없음.

## S — Situation
브라운필드. 인증/결제는 이미 있음. 디자인 시스템 Tailwind + shadcn/ui 고정.

## P — Product
`/dashboard` 라우트 + React 컴포넌트 트리 + E2E 테스트.

## S — Standards

### S1: 핵심 정보 가시성 (weight: 0.3, floor: 70)
- **Goal link**: G ("30초 안에 파악")
- **Question**: 상단 viewport 에 현재 플랜, 다음 결제일, 남은 기간이 모두 보이는가?
- **Metric** (checklist, score = checked/4 × 100):
  - [ ] 현재 플랜명이 첫 화면에 노출
  - [ ] 다음 결제 예정일이 첫 화면에 노출
  - [ ] 남은 무료 기간 / 트라이얼 상태가 첫 화면에 노출
  - [ ] 스크롤 없이 위 3개 모두 동시 가시

### S2: 반응성 (weight: 0.2, floor: 60)
- **Goal link**: G
- **Question**: LCP 가 2.5s 이하인가?
- **Metric** (anchor):
  - 0: LCP > 4s
  - 25: 3–4s
  - 50: 2.5–3s
  - 75: 2–2.5s
  - 100: < 2s

### S3: 비전공자 이해도 (weight: 0.3, floor: 70)
- **Goal link**: G, A
- **Question**: 용어가 기술 jargon 없이 일반인 수준인가?
- **Metric** (checklist):
  - [ ] "billing cycle" 대신 "결제 주기" 등 한국어 평이 용어
  - [ ] 약어 사용 시 풀이 표기
  - [ ] 상태 표시가 색 + 텍스트 이중 표기 (색맹 접근성)

### S4: 회귀 안전 (weight: 0.2, floor: 80)
- **Goal link**: S (Situation, 브라운필드)
- **Question**: 기존 인증/결제 플로우를 깨뜨리지 않는가?
- **Metric** (checklist):
  - [ ] `/api/auth/*` E2E 테스트 통과
  - [ ] `/api/billing/*` E2E 테스트 통과
  - [ ] 새 라우트가 기존 미들웨어 체인 준수

## Pass condition
- Overall weighted score ≥ 75
- AND every Standard ≥ its floor
```

## rubric.json (CLI 가 컴파일, 머신 용)

```json
{
  "schema": "rubrix-rubric/v1",
  "task_name": "user-dashboard",
  "judge_persona": {
    "role_context": "프로덕트 엔지니어로서 리뷰",
    "audience_perspective": "비전공 일반 사용자 관점에서 판단"
  },
  "pass_condition": {
    "overall_threshold": 75,
    "per_criterion_floor_aggregate": "AND"
  },
  "standards": [
    {
      "id": "S1",
      "name": "핵심 정보 가시성",
      "goal_link": "G",
      "question": "상단 viewport 에 현재 플랜, 다음 결제일, 남은 기간이 모두 보이는가?",
      "metric": {
        "type": "checklist",
        "items": [
          "현재 플랜명이 첫 화면에 노출",
          "다음 결제 예정일이 첫 화면에 노출",
          "남은 무료 기간 / 트라이얼 상태가 첫 화면에 노출",
          "스크롤 없이 위 3개 모두 동시 가시"
        ],
        "formula": "(checked / 4) * 100"
      },
      "weight": 0.3,
      "floor": 70
    }
    // S2, S3, S4 동일 구조
  ]
}
```

## 스키마 불변식 (validator 가 검사할 항목)

- **frontmatter**: `name`, `type`, `ambition` 필수. `type ∈ {greenfield, feature, refactor, bugfix}`. `ambition ∈ {toy, mvp, product}`.
- **Standards 개수**: 3 ≤ N ≤ 7.
- **각 Standard**: `goal_link`, `question`, `metric` 셋 다 비어있으면 안 됨.
- **Metric type**: `checklist` (items 5–10 개) 또는 `anchor` (레벨 5개, 0–100 범위).
- **Weight**: 모든 standard 의 weight 합 = 1.0 (±0.01).
- **Floor**: 0 ≤ floor ≤ 100.
- **주관어 금지**: question 과 metric items 에 blocklist (`clean`, `nice`, `좋은`, `깔끔한` 등) 매치 시 reject.
- **Pass condition**: `overall_threshold` 는 0–100 사이, `per_criterion_floor_aggregate ∈ {AND, OR}`.
