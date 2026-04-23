# 07 · Phase 1 Plan — 내일 당장 할 일

> **대전제**: Phase 1 의 Done 기준은 "vague 한 goal 한 줄을 받아 스키마 유효한 brief.md + rubric.json 이 떨어진다" 이다. `/evaluate`, `/refine` 은 Phase 2·3.

## 레포지토리 최종 레이아웃 (Phase 1 기준)

```
rubrix/
├── .claude-plugin/
│   ├── plugin.json              # name, version, description
│   └── marketplace.json         # 마켓플레이스 등록용
├── .claude/
│   ├── settings.json            # 권한 + hook 등록
│   ├── skill-rules.json         # skill 트리거 메타
│   ├── agents -> ../agents      # symlink
│   ├── skills  -> ../skills     # symlink
│   └── scripts -> ../scripts    # symlink
├── agents/
│   ├── mirror-agent.md
│   ├── role-audience-interviewer.md
│   ├── standards-architect.md
│   └── rubric-validator.md
├── skills/
│   └── grasps/
│       ├── SKILL.md
│       ├── references/
│       │   ├── brookhart-six.md      # 6 품질 특성 가이드
│       │   ├── gqm-lite-template.md  # triple 작성법
│       │   └── where-grounding.md
│       └── templates/
│           └── brief.template.md
├── hooks/
│   └── hooks.json
├── scripts/
│   ├── brief-init.sh
│   ├── brief-validate.sh
│   ├── rubric-compile.sh
│   └── rubric-validate.sh
├── cli/
│   ├── src/
│   │   ├── commands/
│   │   │   ├── brief.ts
│   │   │   └── rubric.ts
│   │   ├── schemas/
│   │   │   ├── brief.schema.json
│   │   │   └── rubric.schema.json
│   │   └── lib/
│   ├── build.mjs
│   └── package.json
├── docs/                       # (이미 존재)
├── CLAUDE.md                   # 개발 관행 (Phase 4 에서 풍부화)
├── PLUGIN-README.md            # 마켓플레이스 설명 (Phase 4)
├── README.md                   # 진입점 (이미 존재, Phase 완료마다 업데이트)
└── LICENSE                     # 아직 미정 (회사 컴퓨터에서 추가)
```

Phase 2 이후에 `skills/evaluate/`, `skills/refine/`, `agents/judge-*`, `agents/improvement-worker.md` 가 추가된다.

## 핵심 생성 파일 20 — Phase 1 MVP

| # | 경로 | 유형 | 역할 |
|---|---|---|---|
| 1 | `.claude-plugin/plugin.json` | manifest | Claude Code 플러그인 매니페스트 |
| 2 | `.claude-plugin/marketplace.json` | manifest | 마켓플레이스 메타 |
| 3 | `.claude/settings.json` | config | 권한 + hook 등록 |
| 4 | `.claude/skill-rules.json` | config | skill 트리거 조건 |
| 5 | `skills/grasps/SKILL.md` | skill | `/grasps` 절차 |
| 6 | `skills/grasps/templates/brief.template.md` | template | 초기 스텁 |
| 7 | `skills/grasps/references/brookhart-six.md` | doc | rubric 품질 가이드 |
| 8 | `skills/grasps/references/gqm-lite-template.md` | doc | Standards triple 작성법 |
| 9 | `skills/grasps/references/where-grounding.md` | doc | 깊이 보정 3축 |
| 10 | `agents/mirror-agent.md` | agent | 의도 되비추기 |
| 11 | `agents/role-audience-interviewer.md` | agent | G/R/A/S/P 인터뷰 |
| 12 | `agents/standards-architect.md` | agent | Standards 초안 생성 |
| 13 | `agents/rubric-validator.md` | agent | Brookhart 6 검증 |
| 14 | `cli/package.json` | config | Node deps, bin entry |
| 15 | `cli/src/commands/brief.ts` | CLI | brief init/set/validate |
| 16 | `cli/src/commands/rubric.ts` | CLI | rubric compile/validate |
| 17 | `cli/src/schemas/brief.schema.json` | schema | frontmatter 스키마 |
| 18 | `cli/src/schemas/rubric.schema.json` | schema | rubric.json 스키마 |
| 19 | `hooks/hooks.json` | config | PostToolUse 검증 |
| 20 | `scripts/rubric-compile.sh` · `brief-validate.sh` | script | CLI wrapper |

## 권장 작업 순서 (회사 컴퓨터에서)

1. **Clone & 읽기** (15 min)
   - `git clone git@github.com:jaehoonE7877/rubrix.git`
   - `docs/README.md` → 01 → 02 → 07 순서로 다시 읽기
2. **뼈대 scaffold** (30 min)
   - 위 디렉토리 트리 전부 `mkdir -p`
   - `.claude-plugin/plugin.json` + `marketplace.json` 먼저 작성 → `claude plugin list` 로 인식 확인
3. **CLI 골격** (2h)
   - `cli/package.json` + `build.mjs` + `bin/rubrix-cli`
   - `schemas/brief.schema.json`, `rubric.schema.json` 작성 (docs/04-schemas.md 의 불변식 그대로)
   - `commands/brief.ts`: `init`, `validate` 만 우선
   - `commands/rubric.ts`: `compile`, `validate` 만 우선
4. **Skill + Templates** (2h)
   - `templates/brief.template.md` 작성 (docs/04-schemas.md 본문을 뼈대로)
   - `references/brookhart-six.md` · `gqm-lite-template.md` · `where-grounding.md` — 각 1페이지
   - `skills/grasps/SKILL.md` — Phase 0–7 단계를 YAML frontmatter + 본문으로
5. **Agents** (2h)
   - hoyeon 의 agent 파일 스타일 그대로 가져와서 rename + 내용 교체
   - mirror-agent 부터 (가장 짧고 독립적) → rubric-validator 까지
6. **Hooks** (1h)
   - `hooks/hooks.json` 에 PostToolUse 만 등록 (Phase 1 에서는 최소)
   - `scripts/brief-validate.sh`, `rubric-compile.sh` — CLI 호출 + exit 코드 전파
7. **로컬 smoke test**
   - `claude plugin add .` → `/grasps "간단한 todo 앱"` → `.rubrix/todo-app/` 생성 확인
   - `rubrix-cli brief validate .rubrix/todo-app` → pass
   - `rubrix-cli rubric compile .rubrix/todo-app` → `rubric.json` 생성
   - 주관어 넣은 버전으로 validator 가 reject 하는지 확인 (docs/08-verification.md)

## 의사결정 보류 목록 (내일 결정)

- **LICENSE**: MIT vs Apache-2.0. hoyeon 이 뭘 쓰는지 확인 후 통일.
- **CLI 패키지명**: `rubrix-cli` 를 그대로 쓸지, `@rubrix/cli` scoped 로 갈지. npm 등록 여부에 따라 결정.
- **모델 배정**: `standards-architect` 의 기본 모델이 sonnet 이 적절한지 opus 인지 — Phase 1 에선 sonnet 으로 시작, Phase 4 calibration 에서 교체 판단.
- **외부 judge CLI 경로**: codex·gemini CLI 가 회사 컴퓨터에 있는지 확인. 없으면 Phase 2 로 미루고 Claude 단독 DEGRADED 모드로 시작.

## 빠뜨리기 쉬운 것

- `.claude/agents`, `.claude/skills`, `.claude/scripts` 를 레포 루트의 같은 이름 디렉토리로 symlink 해두기 — Claude Code 는 `.claude/` 아래만 읽는데, 레포 루트에 두면 GitHub 에서도 잘 보임.
- `scripts/*.sh` 에 `chmod +x` 잊지 말기.
- CLI 의 `package.json` `bin` 필드 + `npm link` 로 개발 중 경로 해결.
- schema validator 가 **frontmatter 없는 brief.md** 를 어떻게 처리할지 먼저 결정 (reject 권장).
