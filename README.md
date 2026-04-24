# Rubrix

**Rubrix** 는 Claude Code용 evaluation-contract-first harness 입니다. 모호한 요청을 `rubrix.json` 중심의 평가 계약으로 구조화하고, `hooks`, `CLI`, `skills`, `subagents`를 통해 agent 작업을 검증 가능한 lifecycle로 묶는 것을 목표로 합니다.

## 30초 요약

```
[User]  "사용자 대시보드 만들어줘"
   ↓
[/rubric]  → 요구사항과 평가 기준을 rubrix.json 으로 구조화
   ↓
[/matrix]  → lifecycle gate 와 scoring matrix 정리
   ↓
[/plan]    → 실행 계획과 검증 조건 생성
   ↓
[Worker]   → Claude Code / agent / 사람이 작업 수행
   ↓
[/score]   → rubric 기준으로 산출물 평가
   ↓
통과 → 종료      미달 → 한 항목씩 개선 → 재평가
```

## 현재 상태

이 저장소는 아직 초기 스캐폴드입니다. 현재 존재하는 주요 파일은 다음뿐입니다.

- [`CLAUDE.md`](CLAUDE.md): repo-local 작업 지침
- [`README.md`](README.md): 프로젝트 개요와 현재 상태
- [`docs/extensible-plan.md`](docs/extensible-plan.md): Claude Code plugin/harness 설계 계획

아래 항목은 아직 계획된 표면입니다. 실제 파일, script, package entry가 생기기 전까지는 구현 완료로 보지 않습니다.

- Skills: `/rubric`, `/matrix`, `/plan`, `/score`
- CLI: `rubrix validate`, `rubrix gate`, `rubrix report`, `rubrix hook <event>`
- Hooks: `SessionStart`, `UserPromptExpansion`, `PreToolUse`, `PostToolUse`, `PostToolBatch`, `SubagentStop`, `Stop`

## 목표 구조

Rubrix는 Claude Code plugin 관습을 따릅니다. Runtime component는 plugin root에 두고, `.claude-plugin/` 안에는 manifest/marketplace metadata만 둡니다.

```text
.
├── .claude-plugin/
│   ├── plugin.json
│   └── marketplace.json
├── skills/
├── agents/
├── hooks/hooks.json
├── cli/
│   ├── package.json
│   ├── bin/
│   ├── src/
│   ├── schemas/
│   └── tests/
├── bin/rubrix
├── scripts/
├── examples/
├── docs/
├── PLUGIN-README.md
└── VERIFICATION.md
```

## 구현 원칙

- `rubrix.json`을 canonical evaluation contract와 state source로 둡니다.
- Schema와 artifact contract를 먼저 정하고, 그 다음 CLI/hooks를 붙입니다.
- Hook script는 얇게 유지하고 재사용 로직은 CLI/core layer에 둡니다.
- 새 artifact format을 추가하면 같은 변경에서 schema나 validation 기준도 추가합니다.
- `rubrix` 명령은 `bin/rubrix` 또는 package entry가 생기기 전까지 실행 가능하다고 말하지 않습니다.

## 검증

현재 단계의 최소 검증은 repo-shape check입니다.

```bash
rg --files
```

CLI, schema, hook, test가 추가된 뒤에는 변경한 표면에 맞는 가장 좁은 검증 명령을 실행합니다.
