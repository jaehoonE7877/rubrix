# 08 · Verification — 테스트 전략

## Phase 1 완료 시 smoke-test 시나리오

```bash
# 1. 플러그인 로드 확인
claude plugin add ./rubrix
claude plugin list | grep rubrix

# 2. 샘플 태스크 실행
/grasps "간단한 todo 앱 만들어줘"
# → AskUserQuestion 5회 이내, brief.md + rubric.json 생성 확인

# 3. 스키마 검증
rubrix-cli brief validate .rubrix/todo-app
rubrix-cli rubric validate .rubrix/todo-app

# 4. 주관어 거부 테스트
# Standards 에 "코드가 깔끔하다" 작성 → rubric-validator 가 block 해야 함

# 5. Phase 2 완료 시 추가
echo "임시 구현물" > .rubrix/todo-app/artifacts/v1/main.py
/evaluate .rubrix/todo-app --artifact .rubrix/todo-app/artifacts/v1/
# → scores.json 출력, overall + per-standard 점수 확인
```

## 4-Tier 테스트 (VERIFICATION.md 에 최종판 이관 예정)

| Tier | 대상 | 도구 | 예시 |
|---|---|---|---|
| **1 Unit** | CLI schema validator | vitest / node:test | `rubric.json` 에 weight 합 ≠ 1.0 → reject |
| **2 Integration** | Skill ↔ CLI 왕복 | bash 스크립트 | `/grasps` 가 `brief.md` 쓰면 CLI 가 읽어 `rubric.json` 생성 |
| **3 E2E** | 전체 파이프라인 | bash 시나리오 | /grasps → /evaluate → /refine 까지 통과까지 진행 |
| **4 Agent Sandbox** | 생성된 rubric 의 품질 | 메타 LLM 평가 | 다양한 vague goal 20개에 대해 별도 LLM 이 rubric 품질 채점 |

## 검증 항목 — `/grasps` 출력이 반드시 만족해야 할 것

Phase 1 Done 기준으로 다음을 전부 pass 해야 한다.

- [ ] `brief.md` 가 frontmatter + 6개 섹션 (G/R/A/S/P/S + Pass condition) 모두 포함
- [ ] `rubric.json` 이 `rubric.schema.json` 에 대해 valid
- [ ] Standards 개수 ∈ [3, 7]
- [ ] 모든 Standard 에 `goal_link`, `question`, `metric` 셋 다 non-empty
- [ ] weight 합 = 1.0 (±0.01)
- [ ] 모든 metric 이 checklist (5–10 items) 또는 anchor (5 levels)
- [ ] 주관어 blocklist 통과 (샘플: "clean", "nice", "좋은", "깔끔한")
- [ ] `judge_persona.role_context`, `audience_perspective` 가 brief 의 R/A 에서 파생

## 회귀 방지 — 샘플 corpus

`tests/fixtures/` 에 다음을 넣어두고 CI 로 재실행.

- **golden**: `user-dashboard`, `data-pipeline-refactor`, `bugfix-auth-redirect` 3건. 각각 brief.md + rubric.json 확정본.
- **adversarial**: 주관어 포함, weight 합 불일치, Standard 개수 2개 등 실패해야 하는 10건.

## Phase 별 검증 체크포인트

- **Phase 1**: 위 "Phase 1 완료 시 smoke-test" 전부 통과.
- **Phase 2**: 3개 judge 호출 → position bias 완화 (order swap) 확인 → JSON 스코어 집계 정합 검증.
- **Phase 3**: 실패 → refine → 재평가 → 통과 시나리오가 circuit breaker 내에서 수렴.
- **Phase 4**: 50개 human gold-set 에 대해 Spearman ρ 측정, 임계값 (예: 0.7) 이상 유지.
