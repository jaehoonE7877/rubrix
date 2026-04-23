# 05 · Walkthrough — End-to-End 예시

> 설계가 실제 상호작용으로 어떻게 드러나는지 보여주는 시나리오. 처음 읽는 사람이 "이게 어떻게 동작하는 건지" 감을 잡는 용도.

**상황**: 사용자가 "사용자 대시보드 만들어줘" 라고만 말한 경우.

## Step-by-step

1. 사용자가 `/grasps 사용자 대시보드 만들어줘` 입력.

2. **Mirror**: mirror-agent 가 "이해한 건 '신규 가입자가 자기 구독을 빨리 파악하도록 하는 대시보드' 맞나요?" 되묻기. 사용자 Approve.

3. **WHERE**: AskUserQuestion 으로 Project type=User-facing app, Ambition=MVP, Risk=none 선택. 이 3축이 이후 인터뷰 깊이를 보정.

4. **Interview**: role-audience-interviewer 가 G/R/A/S/P 를 채움.
   - Role → "프로덕트 엔지니어"
   - Audience → "비전공 일반 사용자"
   - Situation → "브라운필드, Tailwind 고정"
   - Product → "Next.js 라우트 + E2E 테스트"

5. **Standards 도출**: standards-architect 가 초안 5개 제시, 사용자가 4개로 합의 + weight/floor 조정.

6. **Validate**: rubric-validator 가 "S3 에 '깔끔하다' 같은 주관어 있음" 지적 → 구체화 요구.

7. **Commit**: `rubrix-cli rubric compile` 이 `rubric.json` 빌드, PostToolUse hook 이 스키마 검증 통과 확인.

8. (사용자가 실제로 코드 작성 — 다른 agent 나 손으로)

9. `/evaluate --artifact ./dashboard/` 실행.

10. judge-persona-builder 가 Role="프로덕트 엔지니어" + Audience="비전공자" 에서 judge persona 3개 생성. Claude / Codex / Gemini 가 각자 rubric.json 으로 채점 → JSON 반환.

11. Aggregator: overall 82, S2 가 floor 60 보다 낮은 55 → **FAIL**.

12. `/refine` 자동 제안, improvement-worker 가 S2 (반응성) 만 집중 개선 → LCP 최적화 커밋.

13. 재평가 → 전 기준 통과 → ✓.

## 이 시나리오에서 드러나는 설계 의도

- **3번 WHERE**: 똑같은 "대시보드" 라도 toy/mvp/product 에 따라 질문 개수와 깊이가 달라져야 한다. WHERE 가 없으면 MVP 에 프로덕션 수준 질문을 쏟아붓는 참사.
- **5번 Standards 초안 제시**: 사용자에게 "평가 기준 뭘로 할까요?" 빈 칸을 주지 않는다. standards-architect 가 먼저 맥락을 읽고 안을 제시, 사용자는 검토·수정.
- **6번 주관어 거부**: "깔끔함" 같은 단어는 judge 마다 해석이 다름 → rubric-validator 가 block.
- **11번 floor AND-gate**: overall 82 로 통과시키지 않는다. S2 한 축이 무너지면 fail.
- **12번 한 Standard 집중**: S1, S3, S4 는 건드리지 않고 S2 만 개선. 회귀 원인을 명확히.
