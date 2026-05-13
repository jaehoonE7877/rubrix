# Rubrix Extensible Documentation Plan

> Claude Code Harness First

> **Status (v1.5.0):** v1.0 target surface and v1.1–v1.5 minor releases all delivered (`intent.brief` calibration, clarity-based lock gates, multi-evaluator cascade, drift detection and recovery loop, esbuild self-contained packaging, `/rubrix:goal` skill + `rubrix goal` CLI for Claude Code `/goal` convergence). `claude plugin validate .` passes, 635 vitest tests pass. v1.5 introduces an **upgrade boundary**: v1.4 CLIs reject v1.5 contracts that carry the optional `goal` artifact (schema top-level keeps `additionalProperties:false`). The previously planned v1.5 (event-log run history) is moved to v1.6. See [`PLUGIN-README.md`](../PLUGIN-README.md) for the production-ready surface; release review history lives in GitHub Release notes per `CLAUDE.md`'s 문서 작성 규칙.

## 목적과 기본 방향

기존 문서는 Rubrix를 문서화 전용 runtime으로 설명하고 있었습니다. 그러나 Rubrix의 목표는 Claude Code 환경에서 검증 가능한 lifecycle을 강제하는 evaluation-contract-first harness를 구현하는 것입니다.

이 수정본에서는 Rubrix를 단순한 4단계 파이프라인 제품이 아닌, Claude Code의 `plugin` / `harness`로 설계하는 방향을 강조합니다. 즉, v0부터 실제 작동하는 `hooks`, `subagent`, `CLI`, 라이프사이클 제어가 포함된 패키지로 계획합니다.

또한 `npm`을 통한 배포와 Claude Code Marketplace 등록을 염두에 둡니다.

### 핵심 정의

> **Evaluation-contract-first harness for Claude Code agents.**

Rubrix는 `rubrix.json`으로 평가 기준을 먼저 정의하고, `hooks`를 통해 라이프사이클을 강제하며, `subagent`를 통해 판단과 검증을 분리하는 harness입니다.

## 핵심 변경 사항 요약

| 영역 | 변경 방향 |
| --- | --- |
| Hook system | v0부터 필수 포함. `rubrix.json`의 상태 전이와 gate를 Claude Code hook 이벤트에 매핑합니다. |
| Plugin packaging | 문서뿐만 아니라 Claude Code plugin으로 패키징하여 `npm` 및 marketplace 배포를 준비합니다. |
| CLI | `rubrix validate`, `rubrix gate`, `rubrix report`에 더해 `rubrix hook <event>` adapter를 제공합니다. |
| Skills | v0의 four skill(`/rubric`, `/matrix`, `/plan`, `/score`)은 유지하되, hook 기반 state machine 위에서 동작하게 합니다. |
| Subagents | evaluator와 domain pack은 v0에서 자리만 열고, 심판 역할은 subagent 패턴으로 분리합니다. |

## Plugin 구조

Rubrix는 Claude Code plugin으로 배포될 예정이며, 다음 구조를 따릅니다.

```text
.
├── .claude-plugin/
│   ├── plugin.json             # Claude Code 플러그인 메타데이터
│   └── marketplace.json        # marketplace metadata
├── skills/
│   ├── rubric/SKILL.md         # /rubrix:rubric
│   ├── matrix/SKILL.md         # /rubrix:matrix
│   ├── plan/SKILL.md           # /rubrix:plan
│   └── score/SKILL.md          # /rubrix:score
├── agents/
│   ├── rubric-architect.md     # rubric 생성 책임
│   ├── matrix-auditor.md       # matrix 검증 책임
│   ├── plan-critic.md          # plan 검증 책임
│   ├── evidence-finder.md      # evidence 추출 책임
│   └── output-judge.md         # 결과물 평가 책임
├── hooks/
│   └── hooks.json              # Claude Code 3-level hook 매핑
├── scripts/
│   ├── session_start.sh
│   ├── user_prompt_expansion.sh
│   ├── pre_tool_use.sh
│   ├── post_tool_use.sh
│   ├── post_tool_batch.sh
│   ├── subagent_stop.sh
│   └── stop.sh
├── cli/
│   ├── package.json
│   ├── bin/rubrix.js           # CLI entrypoint (Node/TS)
│   ├── src/
│   ├── schemas/                # rubrix/evaluator-result schemas
│   └── tests/
├── examples/
└── docs/extensible-plan.md
```

### `hooks/hooks.json` 예시 (Claude Code 3-level nested config)

```json
{
  "hooks": {
    "SessionStart": [
      {
        "matcher": "",
        "hooks": [
          { "type": "command", "command": "${CLAUDE_PLUGIN_ROOT}/scripts/session_start.sh" }
        ]
      }
    ],
    "PreToolUse": [
      {
        "matcher": "",
        "hooks": [
          { "type": "command", "command": "${CLAUDE_PLUGIN_ROOT}/scripts/pre_tool_use.sh" }
        ]
      }
    ]
  }
}
```

전체 7개 이벤트(`SessionStart`, `UserPromptExpansion`, `PreToolUse`, `PostToolUse`, `PostToolBatch`, `SubagentStop`, `Stop`)가 동일한 패턴으로 매핑되어 있다. 실제 SSoT는 `hooks/hooks.json`이다.

각 스크립트는 `rubrix.json`의 상태와 파일시스템을 읽어 라이프사이클을 강제합니다.

예를 들어 `pre_tool_use.sh`는 `rubric`, `matrix`, `plan`이 lock되지 않았을 때 code-editing tool 호출을 차단할 수 있습니다.

## 라이프사이클과 Hook 매핑

Rubrix의 상태 전이는 다음과 같습니다.

```mermaid
flowchart LR
    A[IntentDrafted] --> B[RubricDrafted]
    B --> C[RubricLocked]
    C --> D[MatrixDrafted]
    D --> E[MatrixLocked]
    E --> F[PlanDrafted]
    F --> G[PlanLocked]
    G --> H[Scoring]
    H --> I[Passed]
    H --> J[Failed]
```

이를 Claude Code hook 이벤트에 매핑하면 다음과 같습니다.

| Rubrix 상태 / 단계 | Claude Code Hook | 역할 |
| --- | --- | --- |
| 세션 초기화 | `SessionStart` | `.rubrix` 디렉토리 준비, 상태 요약 출력 |
| Rubric 생성 | `UserPromptExpansion` | `/rubric` 실행 전 rubric 존재 여부 확인, 새로운 rubric 생성을 승인 |
| Plan lock 사전 차단 | `UserPromptExpansion` | plan이 lock되지 않은 상태에서 `/rubrix:score` prompt 자체를 prompt-time(stderr + exit 2)에 차단 |
| Rubric lock 검사 | `PreToolUse` | `rubric` / `matrix`가 lock되지 않은 상태에서 코드 수정 tool 호출 차단 |
| Plan lock 검사 | `PreToolUse` | plan이 승인되지 않은 상태에서 `/score` tool-time 호출도 차단 (UserPromptExpansion과 이중 방어층) |
| 출력 후 검증 | `PostToolUse` | code diff 생성 후 rubrix validator 실행, 오류가 있으면 skill 종료 |
| 병렬 평가 후 | `PostToolBatch` | multi-evaluator 판정 집계, disagreement report 생성 |
| Subagent 종료 | `SubagentStop` | 각 evaluator 결과의 schema 검증 및 confidence 계산 |
| 게이트 처리 | `Stop` | threshold / floor 미달 시 loop 지속 여부를 판단하고 Claude가 멈추지 못하게 차단 |
| Convergence runner (v1.5+ 계획) | `Stop` + Claude Code `/goal` | 사용자가 PlanLocked 이후 `/rubrix:goal`로 transcript-evaluable termination condition을 합성하고 Claude Code 내장 `/goal`에 paste. 매 turn 종료마다 small-fast evaluator가 `gate --json`의 `overall_pass`+`state`를 transcript에서 확인 → 미충족 시 다음 turn 자동 재개, 충족 시 goal auto-clear. Rubrix `handleStop`은 변함없이 fail-closed로 Failed를 block; `/goal`은 별도 layer로 turn 자동 연장(둘은 같은 방향). |

## 문서 구조

문서화는 여전히 중요합니다. 그러나 기존 `documentation-first` 관점에서, 이제는 `plugin-first harness` 관점으로 재구성합니다.

다음 구조를 제안합니다.

```text
docs/
├── index.md                     # 프로젝트 개요 및 주요 링크
├── philosophy.md                # Evaluation-contract harness 철학
├── architecture.md              # plugin/harness 구조, rubrix-core, 라이프사이클, hooks
├── artifact-contract.md         # rubrix.json schema, versioning, extensions
├── lifecycle-state-machine.md   # 상태 전이 & hook 매핑
├── registry.md                  # skill/agent/evaluator/hook registry 형식
├── evaluator-contract.md        # EvaluatorResult schema, deterministic vs probabilistic evaluator 구분
├── scoring-and-gating.md        # 점수 계산, threshold/floor, gate logic
├── domain-packs.md              # domain pack 구조와 충돌 정책
├── versioning-and-migration.md  # schema migration 정책, backward compatibility
├── run-history-and-evidence.md  # runs/ 디렉토리 구조, evidence snapshot
├── mvp-plan.md                  # v0.1~v1.0 로드맵, plugin 배포 일정
├── roadmap.md                   # 장기 발전 계획
└── publication-cleanup.md       # 외부 공개 전 문서 정리 가이드
```

### 문서에 반드시 포함할 내용

- v0.1부터 `hooks`를 반드시 구현한다는 점을 명시합니다.
- `plugin packaging`, `npm` 배포, marketplace 등록 절차를 설명합니다.
- 배포 관련 내용은 `versioning-and-migration.md` 또는 `publication-cleanup.md`에 포함합니다.

## v0.1 MVP 계획

Rubrix v0.1은 다음을 목표로 합니다.

- [ ] **Plugin scaffold**
  - `rubrix-claude-plugin` 디렉토리 생성
  - `.claude-plugin/plugin.json` 작성
  - 빈 `skills/`, `agents/`, `hooks/`, `bin/` 골격 구축

- [ ] **라이프사이클 강제 hooks**
  - `SessionStart`, `UserPromptExpansion`, `PreToolUse`, `PostToolUse`, `Stop` 이벤트 지원
  - 기본 스크립트와 validation 로직 구현

- [ ] **4개의 thin skill**
  - `/rubric`, `/matrix`, `/plan`, `/score`를 plugin에 포함
  - 각 `SKILL.md`는 `rubrix.json`을 읽고 필요한 부분만 갱신
  - 직접 실행보다 `rubrix validator`와 `hooks`를 통해 상태 전이를 강제

- [ ] **CLI 명령**
  - `rubrix validate`
  - `rubrix gate`
  - `rubrix report`
  - `rubrix hook <event>`

- [ ] **Schema & registry**
  - `schemas/rubrix.schema.json`
  - `registry/skills.json`
  - `registry/agents.json`
  - `registry/hooks.json`

- [ ] **Examples**
  - self-eval 예제
  - 간단한 iOS refactor 예제
  - `examples/<name>/rubrix.json`
  - `examples/<name>/artifact.md`
  - `examples/<name>/expected-report.md`

## v1.1+ 확장 계획

### 출시 완료

- **v1.1.0** — Intent brief & depth calibration (`/rubrix:brief`, `intent.brief.{project_type,situation,ambition,axis_depth}`, brief gate hook).
- **v1.2.0** — Measurement-based lock gates (`{rubric,matrix,plan}.clarity`, `clarity-scorer` agent, `--force` audit).
- **v1.3.0** — Multi-evaluator cascade (`mechanical-checker` / `semantic-judge` / `consensus-panel`, `evaluation_policy`, invisible cascade redirect).
- **v1.4.0** — Drift detection & recovery loop (`drift_policy`, `drift-detector` agent, `--accept-drift` 1-shot lock, `accepted_drift_history` / `lock_history` audit).
- **v1.4.1** — Cascade + drift agent manifest 등록 fix.
- **v1.4.2** — `cli/dist/cli.js` esbuild single-file bundle 도입으로 marketplace 캐시본의 hook 실패(tsx + 모든 runtime dep 부재) 해소.

### v1.5 — `/goal` as convergence runner (계획)

**핵심 가치**: Rubrix의 "끝점을 명확히 한 뒤 평가항목을 만들어서 자동 수렴" 중 **자동 수렴**을 Claude Code의 `/goal` 명령으로 위임.

`/goal`은 세션 1회용 prompt-based Stop hook 래퍼다. 매 turn 종료마다 small-fast 모델(Haiku)이 transcript surface만 보고 종료 조건을 판정 — 도구 호출 불가. 한 세션 active goal 1개, condition 최대 4,000자, `disableAllHooks` / `allowManagedHooksOnly` 시 비활성. (공식 docs: `https://code.claude.com/docs/en/goal`.)

Rubrix는 이를 **PlanLocked 이후 lifecycle**(rubric/matrix/plan은 사람이 단계 진행)에 다음과 같이 통합한다.

- 신규 skill `/rubrix:goal`: `rubrix.json`의 `rubric.threshold` + `criteria[].id`+`floor`를 transcript-evaluable한 condition으로 합성. PlanLocked / Scoring / Failed 상태에서만 트리거. 사용자에게 fenced block으로 출력해 `/goal <condition>`을 직접 paste하도록 안내(skill 자체가 `/goal` 호출 불가).
- 신규 CLI `rubrix goal print|validate`: condition 합성과 evaluator-friendly 검사(`gate --json` / `overall_pass` / `Passed` 키워드 포함, file-read 지시어 거부).
- 신규 schema field `goal?` (optional, v1.5+, top-level): condition 본문 + `max_chars: 4000` invariant + `derived_from_contract_hash`.
- `handleStop`의 state=Failed reason 끝에 ` (if /goal is active, the next turn will auto-revise the plan)` append.
- `report`에 `## /goal status` 섹션 추가 — `contract.goal.condition`(truncated) + 현재 state + last gate result. 이 섹션이 transcript surface로 박혀 다음 turn evaluator가 직접 읽음.

**Failed → PlanDrafted 회복 루프 자동화**: `/goal` active 동안 `/rubrix:score` → Failed → `/rubrix:plan` mutation mode → `/rubrix:score` → Passed가 사용자 prompt 없이 자동 반복.

**Linear template + Notion 페이지**도 이 시점에 재정렬해 새 ticket이 description에 작업 시작 프롬프트를 내장한다 (5문서 정책 대상 외 — Linear/Notion UI 자산).

### v1.6 — Event log & run history (계획, 이전 v1.5)

Append-only event log + read-only history projection. 본 PR 시점에는 한 줄 placeholder만 두고 본문은 별도 PR/Notion 페이지에서 v1.6 시점에 작성한다. 기존 Linear RUB-13 ticket은 본 v1.5 시리즈 머지 직후 label을 `v1.6`으로 변경하면서 description도 새 template으로 마이그레이션한다.

### v2.0 — Convergence loop & breaking schema cleanup (계획)

v1.5의 `/goal` runner가 single-generation manual convergence를 흡수하므로 v2.0은 **multi-generation convergence** (여러 generation을 비교해 수렴 여부 판정) + **breaking schema cleanup**으로 scope 축소. Linear RUB-14 트래킹.

### 그 외 (잠재 backlog)

- `/rubrix:improve`, `/rubrix:replay`, `/rubrix:learn` 스킬
- Domain pack (iOS, web, infra)
- `@rubrix/cli` npm 배포 및 Claude Code Marketplace 정식 publish (현재는 directory source).

## 배포 및 Marketplace 등록

Rubrix harness는 `npm` 패키지와 Claude Code Marketplace 모두에서 배포할 수 있습니다. 이를 위해 다음 항목을 문서에 포함합니다.

### npm 패키징

`packages/rubrix-claude-plugin` 아래에 `package.json`을 구성하고, 빌드 스크립트와 `bin/rubrix` entrypoint를 설정합니다.

```bash
npm install -g @your-scope/rubrix-claude-plugin
rubrix --help
```

### Marketplace 카탈로그

`marketplace/rubrix.json`에 plugin metadata와 다운로드 경로를 작성합니다.

Claude Code에서 marketplace를 통해 설치할 때 이 JSON을 참조합니다.

### 배포 문서

공개 배포 전에 다음 항목을 `publication-cleanup.md`에서 점검합니다.

- `.claude-plugin/plugin.json`
- `hooks` 파일의 코드 주석
- 외부 참조 링크
- npm package metadata
- marketplace catalog metadata

## 요약 및 결론

Rubrix는 더 이상 “문서화 전용 runtime”이 아닙니다. 이 계획은 Rubrix를 Claude Code harness로 설계하고, v0부터 hooks를 강제함으로써 표준 plugin 확장성을 확보합니다.

핵심은 다음과 같습니다.

1. `rubrix.json`이 유일한 canonical contract입니다.
2. `hooks`는 라이프사이클을 강제하는 첫 번째 클래스 시민이며, v0.1부터 구현합니다.
3. `skills`는 thin playbook으로 남기고, core logic과 state validation은 `CLI`와 `hooks`에서 처리합니다.
4. `subagents`와 `multi-evaluator`는 확장 포인트로 문서화하고, v1.1+ 기능에 대비합니다.
5. `plugin packaging`과 marketplace 등록을 문서에 포함하여 실제 배포를 준비합니다.

이 계획을 따라 Rubrix는 검증 가능한 lifecycle을 갖춘 Claude Code harness로 발전할 수 있습니다.
