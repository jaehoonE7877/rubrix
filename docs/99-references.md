# 99 · References

## 학술 / 교육학 원전

- [UbD / GRASPS — Vanderbilt CFT](https://cft.vanderbilt.edu/guides-sub-pages/understanding-by-design/)
- [GQM — Basili (1994)](https://www.cs.umd.edu/~mvz/handouts/gqm.pdf)
- [Brookhart, "How to Create and Use Rubrics"](https://www.ascd.org/books/how-to-create-and-use-rubrics-for-formative-assessment-and-grading)
- [AAC&U VALUE Rubrics](https://www.aacu.org/initiatives/value-initiative/value-rubrics)

## LLM-as-Judge 계열 연구

- [G-Eval (Liu et al., 2023)](https://arxiv.org/abs/2303.16634)
- [LLM-as-a-Judge / MT-Bench (Zheng et al., 2023)](https://arxiv.org/abs/2306.05685)
- [BiGGen Bench (Kim et al., 2025)](https://arxiv.org/abs/2406.05761)
- [Constitutional AI (Anthropic)](https://arxiv.org/abs/2212.08073)

## 선행 구현 참조

- [hoyeon](https://github.com/team-attention/hoyeon) — 플러그인 구조, hook, CLI 패턴의 레퍼런스. `/specify`, `/blueprint`, `/execute`, `/rulph` 에서 다음 조각들을 재사용할 계획.
  - `edit-error-recovery.sh`, `large-file-recovery.sh`
  - `session-compact-hook.sh`
  - `cli-version-sync.sh`
  - `rulph` 의 checklist decomposition 규칙
  - `rulph` 의 multi-model parallel dispatch 패턴
  - `plan.schema.json` 패턴 → `rubric.schema.json`

## Claude Code 공식 문서 (내일 확인용)

- [Plugins overview](https://docs.claude.com/en/docs/claude-code/plugins) — `plugin.json`, `marketplace.json` 필드 확인
- [Skills](https://docs.claude.com/en/docs/claude-code/skills) — YAML frontmatter, `references/`, `templates/` 규약
- [Subagents](https://docs.claude.com/en/docs/claude-code/sub-agents) — agent 파일 포맷, `allowed-tools`, model 지정
- [Hooks](https://docs.claude.com/en/docs/claude-code/hooks) — 이벤트 종류, matcher 문법, exit code 전파
- [Settings](https://docs.claude.com/en/docs/claude-code/settings) — `.claude/settings.json` 스키마
