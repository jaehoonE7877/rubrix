<!--
  Rubrix PR 템플릿 — 한국어
  비어있는 섹션은 지워도 됩니다. 해당 없는 항목은 "해당 없음"으로 남겨주세요.
-->

## 요약

<!-- 1~3줄. 무엇을, 왜 바꿨는지. -->

## 연관 이슈

- Linear: <!-- 예) Closes RUB-19 · 부모 RUB-9 -->
- GitHub: <!-- 예) Closes #22 -->

## 변경 내용

<!-- 주요 변경을 bullet로. 파일 경로는 [path](path) 형식 권장. -->

-

## 변경 성격

- [ ] feat — 신규 기능 (additive)
- [ ] fix — 버그 수정
- [ ] chore — repo meta / 빌드 / 의존성 / 문서 외 정리
- [ ] docs — 문서만 변경
- [ ] refactor — 동작 변화 없는 내부 정리
- [ ] breaking — 기존 사용자에게 영향 (마이너 이상 bump 필요)

## 영향 범위

- [ ] CLI (`rubrix validate | gate | report | state | lock | hook | brief`)
- [ ] Skill (`/rubrix:rubric` / `/rubrix:matrix` / `/rubrix:plan` / `/rubrix:score` / `/rubrix:brief`)
- [ ] Agent (rubric-architect / matrix-auditor / plan-critic / output-judge / evidence-finder / brief-interviewer)
- [ ] Hook (PreToolUse / UserPromptExpansion / SessionStart / Stop ...)
- [ ] Schema (rubrix.schema.json) / contract validation
- [ ] 문서 (README / PLUGIN-README / VERIFICATION / extensible-plan / CLAUDE)
- [ ] Repo meta (.github / package metadata 등)

## 테스트 / 검증

```bash
npm --prefix cli ci
npm --prefix cli test
node cli/bin/rubrix.js validate ./rubrix.json
node cli/bin/rubrix.js gate ./rubrix.json
claude plugin validate .
```

<!-- 위 명령 외에 수동으로 확인한 시나리오가 있다면 적어주세요. -->

## 인수 기준

<!-- 연관 issue의 acceptance criteria를 옮겨오거나, 이 PR에서 새로 추가한 기준을 적어주세요. -->

- [ ]
- [ ]

## 스크린샷 / 출력 (선택)

<!-- UI 변경, report 출력 변화, hook 동작 변화 등이 있다면. -->

## 리뷰어 노트 (선택)

<!-- 리뷰 시 우선적으로 봐줬으면 하는 부분, 의도적으로 내린 trade-off, follow-up 예정 항목 등. -->

## 제출 전 확인

- [ ] 새 사용자 가이드 문서를 만들지 않았다 (5문서 정책 — README / PLUGIN-README / CLAUDE / VERIFICATION / docs/extensible-plan).
- [ ] per-run evidence (transcript, hook event log 등)를 repo에 commit하지 않았다.
- [ ] schema / artifact / 명령을 변경했다면 동일 PR에서 검증 경로(test / example / docs)도 함께 갱신했다.
- [ ] commit 메시지가 `<type>(<scope>/<version>): RUB-<n> — <one-line>` 컨벤션을 따른다.
