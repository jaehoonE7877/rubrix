# CLAUDE.md

## 역할

이 저장소는 Rubrix를 Claude Code용 evaluation-contract-first harness로 만들기 위한 초기 스캐폴드다. Rubrix는 모호한 요청을 `rubrix.json` 중심의 평가 계약으로 구조화하고, `hooks`, `CLI`, `skills`, `subagents`를 통해 agent 작업을 검증 가능한 lifecycle로 묶는 것을 목표로 한다.

주요 기준 문서는 `docs/extensible-plan.md`다. `README.md`는 고수준 소개로만 보고, 세부 구현 방향은 `docs/extensible-plan.md`를 우선한다.

## 현재 상태

현재 repo에 실제 존재하는 파일과 디렉터리를 먼저 확인한다.

- `CLAUDE.md`
- `README.md`
- `docs/extensible-plan.md`

`docs/extensible-plan.md`에 나오는 plugin 구조는 목표 구조다. 실제 구현 시에는 Claude Code plugin 관습을 우선해 plugin root에 `.claude-plugin/`, `skills/`, `agents/`, `hooks/`, `cli/`, `scripts/`, `docs/`를 둔다. 해당 경로가 working tree에 없으면 구현 완료로 취급하지 않는다.

## 핵심 방향

Rubrix는 문서화 전용 runtime이 아니라 Claude Code plugin/harness로 설계한다.

- `rubrix.json`은 canonical evaluation contract이자 state source다.
- `hooks`는 lifecycle gate와 상태 전이를 강제한다.
- `CLI`는 validation, gate, report, hook adapter를 담당한다.
- `skills`는 thin playbook으로 유지하고 durable logic은 CLI/schema 쪽에 둔다.
- `subagents`는 판단과 검증 책임을 분리할 때 사용한다.
- `npm` packaging과 Claude Code Marketplace 배포를 염두에 두되, 실제 파일이 생기기 전에는 계획으로만 표기한다.

## 목표 구조

다음 구조는 목표 구조다. 공식 Claude Code plugin 관습처럼 runtime component는 plugin root에 두고, `.claude-plugin/` 안에는 manifest/marketplace metadata만 둔다. CLI 구현은 `cli/` 아래에 두고, plugin에서 bare executable이 필요하면 root `bin/`은 얇은 shim으로만 둔다.

```text
.
├── .claude-plugin/
│   ├── plugin.json
│   └── marketplace.json          # marketplace metadata가 필요할 때만
├── skills/
├── agents/
├── hooks/hooks.json
├── cli/
│   ├── package.json
│   ├── bin/
│   ├── src/
│   ├── schemas/
│   └── tests/
├── bin/rubrix                    # optional PATH shim to cli/bin
├── scripts/
├── examples/
├── docs/
├── PLUGIN-README.md
└── VERIFICATION.md
```

## 계획된 표면

아래 항목은 target surface다. 실행 가능하다고 말하기 전에 실제 파일, script, package entry가 존재하는지 확인한다.

- Skills: `/rubric`, `/matrix`, `/plan`, `/score`
- CLI: `rubrix validate`, `rubrix gate`, `rubrix report`, `rubrix hook <event>`
- Hooks: `SessionStart`, `UserPromptExpansion`, `PreToolUse`, `PostToolUse`, `PostToolBatch`, `SubagentStop`, `Stop`
- State machine: `IntentDrafted -> RubricDrafted -> RubricLocked -> MatrixDrafted -> MatrixLocked -> PlanDrafted -> PlanLocked -> Scoring -> Passed/Failed`

## 구현 원칙

- 작은 단위로 구현한다.
- heavy abstraction이나 큰 dependency를 먼저 들이지 않는다.
- schema와 artifact contract를 먼저 정하고 그 다음 CLI/hooks를 붙인다.
- hook script는 얇게 유지하고 재사용 로직은 CLI/core layer에 둔다.
- 상태 전이는 명시적이고 검증 가능해야 한다.
- 생성 artifact는 만든 직후 validation path를 같이 제공한다.
- 계획 문서의 경로나 명령을 실제 구현으로 단정하지 않는다.

## Artifact 규칙

새 artifact를 만들 때는 이름과 소유권을 분명히 한다.

- Plugin manifest: `.claude-plugin/plugin.json`
- Marketplace metadata: `.claude-plugin/marketplace.json`
- Skills: `skills/<skill-name>/SKILL.md`
- Agents: `agents/<agent-name>.md`
- Hooks: `hooks/hooks.json`
- Hook/helper scripts: `scripts/<name>.sh` 또는 `scripts/<name>.js`
- CLI package: `cli/package.json`, `cli/bin/`, `cli/src/`, `cli/tests/`
- CLI schemas: `cli/schemas/<artifact>.schema.json`
- Optional plugin executable shim: `bin/rubrix`
- Contract/state: `rubrix.json`
- Requirements: `requirements.md`
- Plan: `plan.json`
- Run history/evidence: `runs/` 또는 `reports/`
- Example: `examples/<name>/rubrix.json`, `examples/<name>/artifact.md`, `examples/<name>/expected-report.md`

새 artifact format을 추가하면 같은 변경에서 schema나 validation 기준도 같이 추가한다.

## 승인 필요 작업

다음 작업은 먼저 사용자 승인을 받는다.

- 기존 사용자가 작성한 `rubrix.json`, plan, report, requirement artifact 덮어쓰기
- schema breaking change
- npm package metadata 또는 marketplace metadata 변경
- global install, publish, release 관련 작업
- destructive git 작업 또는 대량 파일 삭제
- 큰 dependency 추가나 새 orchestration layer 도입

## 검증 규칙

현재 repo는 초기 스캐폴드이므로 최소 검증은 repo-shape check다.

- `rg --files`로 참조한 local path 존재 여부를 확인한다.
- 문서 링크나 파일 경로를 추가하면 현재 tree와 맞는지 확인한다.
- `rubrix` 명령은 `bin/rubrix` 또는 package entry가 생기기 전까지 실행 가능하다고 말하지 않는다.
- CLI, schema, hook, test가 추가된 뒤에는 변경한 표면에 맞는 가장 좁은 검증 명령을 실행한다.

## Done Criteria

- Docs-only 변경: `rg --files`로 참조 경로를 확인하고, 계획된 경로와 구현된 경로를 구분했다.
- Schema 변경: `cli/schemas/` 아래 schema와 예제 artifact를 함께 갱신하고 validator가 있으면 실행했다.
- CLI 변경: `cli/tests/` 또는 가장 좁은 CLI validation command를 실행했다.
- Hook 변경: `hooks/hooks.json`과 연결 script 경로를 확인하고, script 실행 권한/입력 계약을 검증했다.
- Plugin packaging 변경: `.claude-plugin/plugin.json`, marketplace metadata, README/verification 문서가 같은 runtime contract를 말하는지 확인했다.

## 문서 작성 규칙

- 구현된 것과 계획된 것을 구분해서 쓴다.
- `docs/extensible-plan.md`의 plugin-first harness 방향을 유지한다.
- 문서는 짧고 실행 가능한 정보 중심으로 쓴다.
- 넓은 rewrite보다 필요한 파일만 좁게 수정한다.
- code identifier, command, path는 원문 그대로 유지한다.

## 하지 말 것

- Rubrix를 generic task runner처럼 바꾸지 않는다.
- `rubrix.json` 없이 hooks나 skills부터 크게 만들지 않는다.
- CLI/core 없이 hook script에 business logic을 몰아넣지 않는다.
- 실제 파일이 없는데 Marketplace, npm package, CLI, hooks가 완성된 것처럼 문서화하지 않는다.
