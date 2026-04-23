# 03 · Components — 역할과 스펙

## 1. Skills (user-invocable)

| Skill | 역할 | 핵심 입력 → 출력 |
|---|---|---|
| **`/grasps`** | 과제 brief + rubric 생성 | 사용자 자연어 → `brief.md` + `rubric.json` |
| **`/evaluate`** | Artifact 채점 | artifact + rubric.json → scores + feedback |
| **`/refine`** | 개선 루프 | artifact + 평가결과 → 새 artifact |

각 스킬은 `skills/<name>/SKILL.md` 에 YAML frontmatter + 단계별 절차로 작성. hoyeon 의 디렉토리 + `references/` + `templates/` 패턴을 그대로 차용.

### `/grasps` 상세 단계

```
Phase 0: Mirror  — 사용자 의도를 되비추고 Approve/Revise 승인
Phase 1: WHERE   — Project type × Ambition × Risk 로 인터뷰 깊이 보정
Phase 2: G 도출  — Goal 한 줄 문장 고정
Phase 3: R·A     — Role, Audience 수집 (AskUserQuestion 배칭)
Phase 4: S·P     — Situation, Product 수집
Phase 5: Standards 도출
         ├─ standards-architect 가 G/R/A/S/P 맥락에서 3–7개 Standard 초안 제시
         ├─ 각 Standard = {Goal link, Question, Metric} triple 강제
         ├─ Metric 은 checklist (5–10개 binary observable) 또는 5-level anchor
         └─ Weight + per-criterion floor (AND-gate) 합의
Phase 6: Validate — rubric-validator 가 Brookhart 6 특성 점검
Phase 7: Compile  — rubrix-cli 가 brief.md → rubric.json 빌드
```

## 2. Subagents (`agents/*.md`)

| Agent | Model | 읽기/쓰기 | 책임 |
|---|---|---|---|
| `mirror-agent` | haiku | read | 사용자 말을 되비춰 오해 조기 발견 |
| `role-audience-interviewer` | sonnet | read + AskUser | 5 필드 (G/R/A/S/P) 깊이 보정 질문 |
| `standards-architect` | sonnet/opus | read | Standards triple 초안 생성, GQM 구조 강제 |
| `rubric-validator` | sonnet | read | Brookhart 6 (Observable/Distinct/Complete 등) 체크 |
| `judge-persona-builder` | sonnet | read | Role+Audience → LLM judge 페르소나 프롬프트 |
| `judge-claude` / `judge-codex` / `judge-gemini` | 외부 CLI | exec | cross-family 채점 (self-preference bias 완화) |
| `improvement-worker` | opus | write | 실패한 1개 Standard 에 집중 개선 |

### agent 파일 형식 (hoyeon 호환)

```markdown
---
name: standards-architect
description: "Given G/R/A/S/P brief fields, derive Standards as GQM-lite triples."
model: sonnet
allowed-tools: [Read, Grep, AskUserQuestion]
validate_prompt: |
  Must produce 3–7 Standards. Each Standard must have goal_link, question, metric.
  Metric must be either checklist (5–10 binary observable items) or 5-level anchor.
  Subjective adjectives ("clean", "nice") must be blocked.
---

# standards-architect

...본문...
```

## 3. Hooks (`hooks/hooks.json` + `scripts/*.sh`)

| 이벤트 | 매처 | 역할 |
|---|---|---|
| SessionStart | — | CLI 버전 확인, 세션 요약 파일 오픈 |
| UserPromptSubmit | — | "평가해줘" 가 brief 없이 오면 `/grasps` 먼저 권유 |
| PreToolUse | `Skill: /grasps` | `.rubrix/<task>/` 디렉토리 초기화 |
| PostToolUse | `Skill: /grasps` | `rubrix-cli brief validate` + `rubric compile` 자동 실행 |
| PostToolUse | `Skill: /evaluate` | 결과를 `evaluations/<timestamp>.json` 저장 |
| PostToolUseFailure | `Edit/Write` | 실패한 편집 복구 (hoyeon 패턴 재사용) |
| Stop | — | 현재 세션 채점 통과 여부 세션 상태에 기록 |
| SessionEnd | — | 채점 로그 cleanup |

핵심 원칙: **hook 은 강제 검증, skill 은 대화.** brief 나 rubric 이 스키마를 어기면 hook 이 차단해서 하류로 흐르지 못하게 한다.

## 4. CLI (`cli/`) — Node.js/TypeScript, esbuild

```
rubrix-cli brief init <spec_dir>                   # 빈 스텁 생성
rubrix-cli brief set <spec_dir> --field G "..."    # 필드 설정
rubrix-cli brief validate <spec_dir>               # 스키마 검증
rubrix-cli rubric compile <spec_dir>               # brief.md → rubric.json
rubrix-cli rubric validate <spec_dir>              # Brookhart 6 체크
rubrix-cli rubric score <spec_dir> --artifact <path> [--judges claude,codex,gemini]
rubrix-cli rubric report <spec_dir>                # 누적 평가 리포트
rubrix-cli session get/set --sid <id> --json '…'   # 상태 관리 (hoyeon 패턴)
```

### CLI 원칙 (hoyeon 에서 차용)

- **LLM 은 자연어 처리 담당, CLI 는 스키마·상태 담당** 으로 역할 분리.
- CLI 는 `brief.md` 를 파싱하지 않음 (LLM 의 일). `rubric.json` 자기 정합성만 검증.
- CLI 버전과 플러그인 버전은 sync hook 으로 강제 일치.

## 5. Artifact 레이아웃

```
.rubrix/<task-name>/
├── brief.md                 # 사람이 읽는 GRASPS 스펙
├── rubric.json              # brief.md 의 Standards 를 컴파일한 머신 스펙
├── judge-prompts/
│   ├── claude.md            # Role+Audience 로부터 파생된 judge 페르소나
│   ├── codex.md
│   └── gemini.md
├── evaluations/
│   └── 2026-04-24T15-22-33.json   # 채점 원본
├── artifacts/
│   └── v1/ v2/ …            # 개선 루프 산출물 버전
└── state.json               # 현재 라운드, 통과 여부
```
