<!--
  Rubrix PR 템플릿. 해당 없는 섹션은 지워도 됩니다.
  연관 이슈가 있다면 본문에 `Closes #N` 또는 `Closes RUB-N`을 포함해주세요.
-->

## 설명

<!-- 무엇을 변경했는지 1~3줄로. -->

## 동기

<!-- 왜 이 변경이 필요한가? 어떤 문제를 푸는가? -->

## 변경 종류

- [ ] 🐞 버그 수정
- [ ] ✨ 신규 기능
- [ ] 💥 Breaking change
- [ ] 📝 문서 / repo meta

## 테스트 방법

```bash
npm --prefix cli test
```

<!-- 위 외에 수동으로 확인한 시나리오가 있다면 적어주세요. -->

## 체크

- [ ] 5문서 정책을 위반하지 않았다 (README · PLUGIN-README · CLAUDE · VERIFICATION · docs/extensible-plan).
- [ ] schema · CLI · hook을 변경했다면 같은 PR에서 검증 경로(test / example)도 갱신했다.
