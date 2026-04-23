# 01 · Overview — 왜 만드는가

## 한 문장

> 사용자가 "뭘 만들래"라고 말하면 6가지 질문으로 **완성도 있는 기획(brief)** 과 **수준급 평가 매트릭스(rubric)** 를 동시에 만들어 주고, 작업이 끝나면 cross-family LLM 심사단이 채점·개선 루프를 돌리는 Claude Code 플러그인 harness.

## 문제 — 두 가지 병목

AI agent 작업의 결과물 품질은 두 지점에서 결정된다.

1. **요구사항 병목** — "다크모드 추가해줘" 한 문장에 숨은 100가지 결정이 외현화되지 않음.
2. **평가 병목** — 뭐가 "완성"인지 합의 없이 시작하면 심사와 반복이 LLM 주관에 흔들림.

기존 hoyeon 은 `/specify → /blueprint → /execute` 로 요구사항 병목을, `/rulph` 로 평가 병목을 푼다. 하지만 **두 관문이 분리**되어 있고, `/rulph` 의 rubric 이 과제 맥락과 느슨하게 연결된다.

**Rubrix 는 요구사항 정의와 평가 기준 설계를 하나의 프레임으로 묶는다.** 교육학의 UbD/GRASPS 로 과제를 명세하면서, 마지막 Standards 필드를 SW 측정의 GQM (Goal-Question-Metric) 삼요소로 작성하게 강제해 _맥락 풍부 + 추적 가능_ 두 마리 토끼를 잡는다.

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

## 핵심 원리

### GRASPS 6요소 (과제 스펙)

| 필드 | 역할 | 질문 예 |
|---|---|---|
| **G**oal | 달성 목표 | 뭐가 되면 "된 것"인가? |
| **R**ole | 수행자 정체 | 누구로서 만드는가? (시니어/주니어/디자이너…) |
| **A**udience | 이용자/심사자 | 누가 쓰는가? 뭘 중시하나? |
| **S**ituation | 맥락 | 어떤 제약/환경인가? |
| **P**roduct | 산출물 | 뭐가 손에 쥐어지는가? |
| **S**tandards | 평가 기준 | 어떻게 "잘함"을 판정하나? |

### Standards 필드의 GQM-lite 강제

Standards 의 각 항목은 **반드시** 세 요소 triple 로 작성:

```
S_n:
  Goal link  : 어떤 G 를 검증하는가 (상위 목표 연결)
  Question   : 어떤 관찰 가능한 질문으로 확인하는가
  Metric     : 어떤 증거/지표로 yes/no 또는 0–100 점수를 내는가
```

이것이 Brookhart 의 "observable criteria" + Wiggins 의 "authentic standards" + Basili 의 "GQM traceability" 를 한 필드에 녹인 구조.

### 왜 GRASPS 를 골격으로 골랐나 (요약)

독립 비교표의 결론:

- **GRASPS 단독 채택 + Standards 만 GQM-lite triple 강제**
- 사유:
  1. 하나의 프레임이 요구사항 + 평가 기준 두 문제를 동시에 해결
  2. Role/Audience 가 LLM-as-Judge 의 persona 프롬프트에 직접 매핑
  3. 서사형 빈칸 채우기 방식이 GQM 의 방법론 학습 비용보다 훨씬 낮음
  4. 창작·리서치 같은 metric 저항적 작업도 포괄
- 포기하지 않는 GQM 의 강점: Standards 내부에 traceability (Goal link) 와 observability (Metric) 를 내장해 보존.

비교 상세는 원본 분석 문서 참조 (이 레포 외부).
