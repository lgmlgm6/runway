# Runway

AI-driven development workflow skill suite for Claude Code. Takes a PRD link and drives the full development pipeline end-to-end.

## Pipeline

```
PRD (xuecheng) → Requirements Spec → Tech Design → Task Planning / PAPI Sync / Test Case Gen → Branch Creation → Parallel Dev → Code Review → Shepherd → QA Verify → Deploy → Autotest → Bug Analysis / Fix Loop → Retrospective
```

Each stage is a self-contained skill. The `runway` orchestrator drives them in sequence, pausing only at the Stage 1 and Stage 2 Hard Gates for your approval.

## Prerequisites

- [Claude Code](https://claude.ai/code) installed
- `node` (≥18) and `jq` installed
- Access to `km.sankuai.com` (xuecheng) and `ones.sankuai.com` (ONES)
- [citadel skill](https://km.sankuai.com) installed (美团内部学城操作)
- [ee-ones skill](https://ones.sankuai.com) installed (美团内部ONES操作)

## Install

```bash
git clone <this-repo> ~/runway
cd ~/runway
bash install.sh
```

Restart Claude Code after installation.

## Uninstall

```bash
bash install.sh --uninstall
```

## Usage

Just say:

```
帮我开发这个需求 https://km.sankuai.com/collabpage/2748397739 ones工作项 93833807
```

Claude will:
1. Read the PRD from xuecheng
2. Clarify ambiguities and produce a requirements spec → upload to xuecheng
3. **[Pause]** Wait for your confirmation
4. Design the technical solution
   - Stage 2 uses a lightweight-by-default review path: Level 0 stays Planner-only, and it escalates to Architect/Critic review only when the design risk requires it
5. **[Pause]** Wait for your review and approval
6. Generate the implementation plan, optionally sync APIs to PAPI, and optionally generate test cases
7. Hand off to ee-ones for feature branch creation
8. Execute development in parallel waves with two-phase review
   - Stage 5 has no review gate: plan load, tracker creation, wave banners, and execution-report packaging should auto-continue unless a real blocker stops the pipeline.
9. Run code review across functional / security / quality dimensions, auto-fix issues
10. Configure Shepherd when needed, then run QA verification
11. Optionally deploy to a cargo swimlane and execute autotest
12. If autotest fails, run bug analysis and the fix loop
13. Run retrospective and report completion with evidence summary

## Skills

| Skill | Stage | Description |
|-------|-------|-------------|
| `runway` | Orchestrator | Entry point, drives the full pipeline |
| `runway-prd-analysis` | Stage 1 | Read PRD, clarify requirements, produce spec |
| `runway-tech-design` | Stage 2 | Admission-based technical solution design |
| `runway-task-planning` | Stage 3 | Zero-placeholder implementation plan with wave grouping |
| `runway-papi` | Stage 3 | Sync approved interface definitions to PAPI |
| `runway-tclist` | Stage 3 | Generate KM test case documents from PRD + tech spec |
| `runway-parallel-dev` | Stage 5 | Wave-parallel subagent execution with two-phase review |
| `runway-code-review-fix` | Stage 6 | Multi-dimension CR with auto-fix loop |
| `runway-shepherd` | Stage 7 | Configure Shepherd gateway for new interfaces when needed |
| `runway-qa-verify` | Stage 8 | Build/lint/test verification with evidence summary |
| `runway-autotest` | Stage 10 | Execute generated API test cases against the deployed stack |
| `runway-bug-analysis` | Stage 11 | Analyze failed autotest cases and drive the fix loop |

Stage 12 retrospective is orchestrated inside `runway`; it is part of the control plane, not a separately installed skill.

## Hooks installed

| Event | Hook | Purpose |
|-------|------|---------|
| `PreToolUse` (Edit/Write) | read-before-edit guard | Prevents editing files without reading first |
| `PreToolUse` (Edit/Write) | workflow advisory | Soft-reminds when an active Runway workflow exists during direct edits |
| `PostToolUse` (Bash) | failure reminder | Prompts investigation on command failure |
| `Stop` | pipeline continuation | Keeps the Stage 5-12 pipeline loop running until completion |

## What gets installed

```
~/.claude/skills/runway/
  ├── SKILL.md
  ├── bin/
  │   ├── runway-tools.cjs
  │   └── runway-mcp.cjs
  └── lib/
      ├── artifacts.cjs
      ├── contracts.cjs
      ├── reports.cjs
      ├── state.cjs
      ├── status.cjs
      └── workflow-advisory.cjs
~/.claude/skills/runway-prd-analysis/
~/.claude/skills/runway-tech-design/
~/.claude/skills/runway-task-planning/
~/.claude/skills/runway-papi/
~/.claude/skills/runway-tclist/
~/.claude/skills/runway-parallel-dev/
~/.claude/skills/runway-code-review-fix/
~/.claude/skills/runway-shepherd/
~/.claude/skills/runway-qa-verify/
~/.claude/skills/runway-autotest/
~/.claude/skills/runway-bug-analysis/

~/.claude/settings.json    ← hook entries added
~/.claude/hooks/runway/
  ├── pre-tool-guard.js
  ├── workflow-advisory.js
  ├── post-tool-verifier.js
  └── runway-stop-hook.sh
```

`install.sh` copies the skill directories into `~/.claude/skills/`, including the shared runtime helpers under `~/.claude/skills/runway/bin/` and `~/.claude/skills/runway/lib/`, and installs hooks under `~/.claude/hooks/runway/`.

## Shared runtime surfaces

- `node "$HOME/.claude/skills/runway/bin/runway-tools.cjs" status --root "$PWD" --ones-id <id>` — query checkpoint, reports, and active loop state.
- `node "$HOME/.claude/skills/runway/bin/runway-mcp.cjs"` — optional read-only MCP entrypoint exposing `runway_status` and `runway_active_workflow`.
- `workflow-advisory.js` — soft reminder hook when direct edits happen while an active Runway workflow is still in progress.
- `triangle-loop.local.md` records Stage 2 design-loop ownership so Runway can resume cleanly after an interruption; it should not block user exit.
- `pipeline.local.md` records the Stage 5-12 auto-running pipeline loop; the Stop hook protects this loop from accidental exit.

During install, any legacy top-level skill and hook artifacts are removed.

## Design principles

- **Self-contained**: no dependency on superpowers, OMC, or GSD plugins
- **Hard Gates**: human approval required at stages 1 and 2; Stage 3 auto-advances by default
- **Zero-placeholder**: all implementation plans contain complete code, no TBD
- **Evidence-based**: completion requires fresh verification output, not assertions
- **Canonical checkpoint**: `.runway/checkpoint-{ones_id}.json` is the cross-stage source of truth; `.claude/runway-state/*.md` only tracks active loop ownership
- **Idempotent install**: running `install.sh` twice is safe

## Resuming after a Hard Gate

If you close Claude Code mid-workflow, resume by saying:

```
继续开发，当前阶段是技术方案，需求规格 contentId 是 27557783399
```

## Troubleshooting

See `runway/references/troubleshooting.md` for per-stage error handling.

Common issues:
- **citadel auth fails**: `oa-skills citadel --clear-cache --mis <your-mis>`
- **ones auth fails**: `ones sso login --ciba`
- **jq not found**: `brew install jq` (macOS) or `apt install jq` (Linux)
