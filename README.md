# Rubrix

**Rubrix v1.0.0** — Claude Code 플러그인입니다. 모호한 요청을 `rubrix.json` 중심의 평가 계약(evaluation contract)으로 구조화하고, `hooks` + `CLI` + `skills` + `subagents`로 agent 작업을 검증 가능한 lifecycle에 가둡니다.

## 30초 요약

```
[User]  "사용자 대시보드 만들어줘"
   ↓
[/rubrix:rubric]  → 요구사항과 평가 기준을 rubrix.json 으로 구조화
   ↓
[/rubrix:matrix]  → criterion ↔ evidence 매트릭스 작성
   ↓
[/rubrix:plan]    → 실행 계획과 검증 단계 생성
   ↓
[Worker]          → Claude Code / agent / 사람이 작업 수행
   ↓
[/rubrix:score]   → 평가자(subagent)로 채점 → rubrix gate --apply
   ↓
Passed → 종료      Failed → 한 항목씩 개선 → 재평가
```

> 플러그인 namespace: 4개 skill은 모두 `/rubrix:<name>`으로 노출됩니다 (`/rubrix:rubric`, `/rubrix:matrix`, `/rubrix:plan`, `/rubrix:score`).

## v1.0.0 surface

이 저장소는 production-ready Claude Code 플러그인입니다. 다음 표면이 모두 구현되어 있습니다.

- **Skills**: `/rubrix:rubric`, `/rubrix:matrix`, `/rubrix:plan`, `/rubrix:score` — 각각 `skills/<name>/SKILL.md`.
- **Subagents**: `rubric-architect`, `matrix-auditor`, `plan-critic`, `evidence-finder`, `output-judge` — `agents/`.
- **CLI**: `rubrix validate | gate | report | state | lock | hook` — `cli/` (TypeScript + ajv + commander, vitest 87 tests).
- **Hooks**: `SessionStart`, `UserPromptExpansion`, `PreToolUse`, `PostToolUse`, `PostToolBatch`, `SubagentStop`, `Stop` — `hooks/hooks.json` + `scripts/*.sh`.
- **Schemas**: `cli/schemas/{rubrix,evaluator-result,registry}.schema.json` (JSON Schema draft-2020-12).
- **Examples**: `examples/{self-eval,ios-refactor}/` — validate 통과.
- **Plugin manifest**: `.claude-plugin/{plugin.json,marketplace.json}` — `claude plugin validate .` pass.

## 평가 결과

`scripts/eval/` 의 24-26 case benchmark harness로 4 iteration 진행:

| iteration | with_skill | baseline | delta |
|---|---|---|---|
| iter-1 | 78.3% | 53.3% | +25.0 pp |
| iter-2 | 85.0% | 46.7% | +38.3 pp |
| iter-3 | 91.7% | 46.7% | +45.0 pp |
| **iter-4** | **96.9%** (63/65) | 53.8% | **+43.1 pp** |

iter-4의 hold-out case (`score-04-no-contract-verdict-holdout`)에서도 5/5 — bounded skill description이 false-positive trigger 차단을 검증.

## 목표 구조

```text
.
├── .claude-plugin/
│   ├── plugin.json          # plugin manifest
│   └── marketplace.json     # marketplace catalog (claude plugin validate 통과)
├── skills/
│   ├── rubric/SKILL.md
│   ├── matrix/SKILL.md
│   ├── plan/SKILL.md
│   └── score/SKILL.md
├── agents/                  # 5 evaluator subagents
├── hooks/hooks.json         # 7 lifecycle hook events
├── cli/
│   ├── package.json         # @rubrix/cli v1.0.0
│   ├── bin/rubrix.js
│   ├── src/{cli,commands,core,hooks}/
│   ├── schemas/
│   └── tests/               # 87 vitest tests
├── bin/rubrix               # PATH shim
├── scripts/                 # hook entry points + scripts/eval/
├── examples/                # self-eval + ios-refactor
├── registry/                # skills/agents/hooks catalog
├── docs/
├── PLUGIN-README.md
└── VERIFICATION.md
```

## 구현 원칙

- `rubrix.json`을 canonical evaluation contract와 state source로 둡니다.
- 10-state 라이프사이클은 `cli/src/core/state.ts` 와 schema enum이 동시에 강제합니다.
- Lock(`locks.{rubric,matrix,plan}`)은 단순 boolean이 아니라 cross-artifact semantic integrity 검사를 통과해야 true가 됩니다 (Phase E `cli/src/core/integrity.ts`).
- Hook script는 얇은 shim, 모든 결정 로직은 `cli/src/hooks/handlers.ts`에 있습니다.
- `saveContract`는 atomic + symlink-safe (temp + fsync + rename) — `cli/src/core/contract.ts`.

## 검증

```bash
# 전체 검증 (개발자)
cd cli && npm install && npm test           # 87 vitest pass
claude plugin validate .                    # plugin manifest 통과
node cli/bin/rubrix.js validate examples/self-eval/rubrix.json
node cli/bin/rubrix.js validate examples/ios-refactor/rubrix.json

# 사용자 dry-run
node cli/bin/rubrix.js report examples/ios-refactor/rubrix.json
```

자세한 검증 절차는 [`VERIFICATION.md`](VERIFICATION.md), 사용 가이드는 [`PLUGIN-README.md`](PLUGIN-README.md), 라이프사이클 상세는 [`docs/lifecycle-state-machine.md`](docs/lifecycle-state-machine.md) 참고.

## v1.1+ 계획

- Multi-evaluator aggregation
- Run history (`runs/`) 자동화
- `/improve`, `/replay`, `/learn` skills
- Domain pack (iOS, web, infra)

자세한 로드맵은 [`docs/extensible-plan.md`](docs/extensible-plan.md) 참고.
