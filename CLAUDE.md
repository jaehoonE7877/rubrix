# CLAUDE.md

## 역할

이 저장소는 **Rubrix v1.5.0** — Claude Code용 evaluation-contract-first plugin 이다. 모호한 요청을 `rubrix.json` 중심의 평가 계약으로 구조화하고, `hooks` + `CLI` + `skills` + `subagents`로 agent 작업을 검증 가능한 lifecycle에 가둔다.

주요 기준 문서는 [`PLUGIN-README.md`](PLUGIN-README.md) (사용자 가이드)와 [`docs/extensible-plan.md`](docs/extensible-plan.md) (v1.0 surface 설계 기록 + v1.1+ 확장 계획). 라이프사이클 상태/락 불변식의 SSoT는 [`cli/schemas/rubrix.schema.json`](cli/schemas/rubrix.schema.json)이다.

## 현재 상태 (v1.5.0)

`.claude-plugin/`, `skills/`, `agents/`, `hooks/`, `cli/`, `scripts/`, `examples/` 모든 표면이 구현 완료. `claude plugin validate .` 통과, `cli/tests/` 635개 전체 통과. `cli/dist/cli.js`로 self-contained ESM bundle 배포 (marketplace 캐시본은 `npm install`을 돌리지 않으므로 모든 runtime dep가 bundle에 인라인되어야 hook이 동작). v1.5는 **upgrade boundary**: `rubrix.json`에 새 optional `goal` artifact가 추가되어, v1.4 이하 설치된 CLI는 v1.5 contract을 reject한다 (schema의 top-level `additionalProperties:false` 때문).

새 기능을 더하기 전에 현재 구현된 표면을 깨지 않는지부터 확인한다. v1.5+ 기능은 `docs/extensible-plan.md`의 "v1.1+ 확장 계획" 섹션 참고.

## 핵심 방향

Rubrix는 문서화 전용 runtime이 아니라 Claude Code plugin/harness로 설계한다.

- `rubrix.json`은 canonical evaluation contract이자 state source다.
- `hooks`는 lifecycle gate와 상태 전이를 강제한다.
- `CLI`는 validation, gate, report, hook adapter를 담당한다.
- `skills`는 thin playbook으로 유지하고 durable logic은 CLI/schema 쪽에 둔다.
- `subagents`는 판단과 검증 책임을 분리할 때 사용한다.
- `npm` packaging과 Claude Code Marketplace 배포를 염두에 두되, 실제 파일이 생기기 전에는 계획으로만 표기한다.

## 목표 구조

다음 구조는 목표 구조다. 공식 Claude Code plugin 관습처럼 runtime component는 plugin root에 두고, `.claude-plugin/` 안에는 manifest/marketplace metadata만 둔다. CLI 구현은 `cli/` 아래에 둔다.

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
├── scripts/
├── examples/
├── docs/
├── PLUGIN-README.md
└── VERIFICATION.md
```

## 계획된 표면

v1.5.0까지 구현된 표면 (변경 시 기존 동작 유지 확인 필수):

- Skills (plugin namespace): `/rubrix:brief`, `/rubrix:rubric`, `/rubrix:matrix`, `/rubrix:plan`, `/rubrix:score`, `/rubrix:goal`
- CLI: `rubrix validate | gate | report | state | lock | hook | brief | score-clarity | score | drift | goal`
- Hooks (Claude Code spec — 3-level nested config): `SessionStart`, `UserPromptExpansion`, `PreToolUse`, `PostToolUse`, `PostToolBatch`, `SubagentStop`, `Stop`
- State machine (10 states): `IntentDrafted → RubricDrafted → RubricLocked → MatrixDrafted → MatrixLocked → PlanDrafted → PlanLocked → Scoring → Passed | Failed; Failed → PlanDrafted (recovery loop)`
- Hook contract: PreToolUse는 `hookSpecificOutput.permissionDecision` 사용 (exit 0); Stop은 exit-code path (block 시 exit 2 + stderr).
- Lock semantic integrity: `rubrix lock matrix/plan`은 cross-artifact 참조 검증 + 중복 id 검사 통과해야 진행 (`cli/src/core/integrity.ts`).
- Packaging (v1.4.2+): `cli/dist/cli.js` self-contained ESM bundle (esbuild). `cli/bin/rubrix.js`가 dist를 직접 import — marketplace 캐시본이 `npm install` 없이도 모든 hook 동작.

v1.5+에서 계획된 표면 (구현 전):

- `/rubrix:goal` skill + `rubrix goal print|validate` CLI: Claude Code `/goal` 명령(2026-05-11 v2.1.139)과 통합. PlanLocked 이후 `rubrix.json`을 transcript-evaluable termination condition으로 합성해 `/goal`이 매 turn 종료마다 `gate --json`의 `overall_pass`+`state`를 검증. Failed→PlanDrafted 회복 루프 자동화.
- `contract.goal?` schema field (optional, v1.5+).
- `handleStop`의 Failed reason에 `/goal` active 시 안내 한 줄.
- `report`의 `## /goal status` 섹션 (evaluator가 transcript에서 직접 읽음).

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
- Contract/state: `rubrix.json`
- Requirements: `requirements.md`
- Plan: `plan.json`
- Run evidence (per-release): GitHub Release asset (`evidence-bundle.tar.gz`); 로컬 보관은 `~/rubrix-evidence/v<version>/` — repo에 commit하지 않는다.
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
- `rubrix` 명령은 `cli/bin/rubrix.js` 또는 npm package entry가 생기기 전까지 실행 가능하다고 말하지 않는다.
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
- 정식 release 이전에는 `README.md`, `PLUGIN-README.md`, `CLAUDE.md`, `VERIFICATION.md`, `docs/extensible-plan.md` 5개 외에는 신규 user-facing 문서를 만들지 않는다. 외부 사용자가 harness를 처음 만났을 때 읽어야 할 문서량이 늘어나지 않도록 한다. Linear template / Notion 페이지는 외부 SaaS UI 자산이므로 5문서 정책 대상 외다.
- release 부산물(CHANGELOG, release notes, codex review summary 등)은 git tag 메시지 또는 GitHub Release notes로만 보관하고 repo에 commit하지 않는다.
- repo에 commit 하는 것은 (a) SSoT 파일 (`rubrix.json`, `cli/schemas/*.schema.json`, `plan.json`, `requirements.md`, `examples/<name>/{rubrix.json,artifact.md,expected-report.md}`) 과 (b) in-repo test 자산 (`cli/tests/`, `examples/<name>/expected-report.md`) 만 허용한다. per-run evidence(transcript, hook events, run-specific rubrix.json contracts, codex review markdown)는 repo에 commit하지 않고 GitHub Release asset(`evidence-bundle.tar.gz`)으로만 첨부한다 (annotated tag 메시지에 SHA-256 박제). 원격 main은 항상 production 급으로 유지한다.

## 하지 말 것

- Rubrix를 generic task runner처럼 바꾸지 않는다.
- `rubrix.json` 없이 hooks나 skills부터 크게 만들지 않는다.
- CLI/core 없이 hook script에 business logic을 몰아넣지 않는다.
- 실제 파일이 없는데 Marketplace, npm package, CLI, hooks가 완성된 것처럼 문서화하지 않는다.
