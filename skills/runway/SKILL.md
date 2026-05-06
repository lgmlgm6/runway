---
name: runway
description: End-to-end development pipeline — PRD analysis → tech design → task planning → parallel dev → code review → QA verification. Invoke this skill whenever the user provides a km.sankuai.com PRD link with a ones work item ID, or says anything like "开发这个需求", "帮我开发", "实现这个功能", "help me develop", "implement this PRD", or "start development". Do NOT wait for the user to explicitly say "runway" — any request to go from a requirement to working code should trigger this skill immediately, even if phrased casually or in Chinese.
version: 0.1.0
---

# Runway Orchestrator

End-to-end development pipeline. Takes a xuecheng PRD link and a ones work item ID, drives all stages to completion, pauses at the Stage 1 and Stage 2 Hard Gates for user confirmation, and auto-advances from Stage 3 onward unless blocked.

## Pipeline Overview

```
INPUT: xuecheng PRD URL + ones work item ID
  ↓
Stage 1: runway-prd-analysis    → requirements spec (spec) uploaded to xuecheng
  ↓ [HARD GATE: user confirms spec]
Stage 2: runway-tech-design     → review-friendly tech spec uploaded to xuecheng
  ↓ [HARD GATE: user approves tech spec]
Stage 3: runway-task-planning   → executable plan/tasks saved locally
  ↓ [auto-advance to branch creation]
Stage 4: ee-ones branch         → feature branch created and linked
  ↓
Stage 5: runway-parallel-dev    → all tasks implemented, execution report
  ↓
Stage 6: runway-code-review-fix → CR passed, no Critical/Important issues
  ↓
Stage 7: runway-qa-verify       → all tests/build/lint pass
  ↓
OUTPUT: verified working code on feature branch
```

## How to Start

### Step 0: Load Project Memory and Check Checkpoint

**Step 0a — Load project memory:**

Check if `.runway/project.json` exists:

```bash
cat .runway/project.json 2>/dev/null
```

If the file exists, read and load these **project-level fixed fields** (do NOT ask the user for these):
- `mis` — user identity, fixed per project
- `app_id` — ONES application ID, fixed per repo
- `ones_space_id` — ONES space ID, fixed per project
- `build_cmd`, `test_cmd`, `lint_cmd` — project build/test/lint commands
- `notes` — known codebase traps and conventions

If the file does not exist, these fields will be collected during the workflow and saved at the end of Stage 4.

**Always ask the user for these per-feature inputs regardless of project memory:**
- `ones_work_item_id` — different for every feature
- `citadel_parent_id` — may differ per feature (the parent doc for this feature's spec/tech-spec)

**Step 0b — Load project knowledge:**

```bash
RUNWAY_TOOLS="${CLAUDE_PLUGIN_ROOT:+${CLAUDE_PLUGIN_ROOT}/skills/runway/bin/runway-tools.cjs}"
RUNWAY_TOOLS="${RUNWAY_TOOLS:-$HOME/.claude/skills/runway/bin/runway-tools.cjs}"

if [[ -f .runway/knowledge.json ]]; then
  KNOWLEDGE_COUNT=$(jq 'length' .runway/knowledge.json 2>/dev/null || echo 0)
  echo "📚 项目知识库：${KNOWLEDGE_COUNT} 条"
  echo "   最近沉淀（pitfall / pattern）："
  jq -r '.[] | select(.type == "pitfall" or .type == "pattern") | "  [\(.type)] \(.summary)"' \
    .runway/knowledge.json 2>/dev/null | tail -5
fi
```

These entries inform the current workflow — knowledge.json entries are injected automatically at each stage; pay attention to any `pitfall` learnings that may affect the current feature.

**Step 0c — Check for unfinished work (checkpoint restore):**

After loading project memory but before starting Stage 1, scan for checkpoint files:

```bash
ls .runway/checkpoint-*.json 2>/dev/null
```

If one or more checkpoint files exist, display them to the user:

```
🔔 检测到未完成的工作项：
- .runway/checkpoint-{ones_work_item_id}.json（最后阶段：Stage {N}，更新时间：{updated_at}）

是否恢复？(y/n)
```

If user says yes:
1. Read the checkpoint file and inspect the latest canonical stage/artifact state
2. **Validate checkpoint integrity**: verify that `current_stage` is a number between 1–7 and that all fields required by that stage are present (e.g., Stage 3+ requires `prd_content_id` and `requirements_spec_content_id`; Stage 5+ also requires `branch_name` and `base_sha`). If the file cannot be parsed (malformed JSON) or any required field is missing/null, print:
   ```
   ⚠️ Checkpoint 文件损坏或字段缺失，无法自动恢复。
   - 问题：{描述缺失字段或解析错误}
   - 建议：从 Stage 1 重新开始，或手动修复 .runway/checkpoint-{ones_work_item_id}.json 后重试。
   是否从 Stage 1 重新开始？(y/n)
   ```
   If the user confirms, proceed with a fresh workflow from Stage 1.
3. Print a compact restored status summary for the user
4. Resume from `current_stage` (skip all earlier stages)

If user says no: proceed with a fresh workflow starting from Stage 1.

### Inputs Required

User provides:
1. **xuecheng PRD URL** — e.g. `https://km.sankuai.com/collabpage/2748397739`
2. **ones work item ID** — e.g. `93833807`
3. **MIS** — skip if loaded from project memory
4. **xuecheng parent document ID** (optional) — the parent document under which requirements spec and tech spec will be uploaded. If not provided, ask once: "请提供学城父文档ID（或父文档链接），用于上传需求规格和技术方案文档。"

Extract contentId from PRD URL directly using these rules:
- `/collabpage/2748397739` → contentId = `2748397739`
- `/collabpage/2748397739?xxx=yyy` → contentId = `2748397739` (strip query string)
- `/page/2748397739` → contentId = `2748397739` (same numeric segment after `/page/`)
- If the URL contains no recognisable numeric segment, ask the user: "无法从链接中解析 contentId，请直接提供学城文档 ID（纯数字）。"

Extract parentId from parent document URL if provided (`km.sankuai.com/collabpage/{parentId}`). Do not ask for confirmation on items already provided or loaded from project memory.

## Auto-Advance Rule

After each stage completes, **automatically invoke the next stage WITHOUT waiting for user input**, UNLESS:
1. A `<HARD-GATE>` is explicitly reached — requires user confirmation before proceeding
2. A `BLOCKED` status is reported with no path forward — pause and explain clearly
3. An unrecoverable error requires human decision

**Do NOT** pause between stages to summarize or ask "shall I continue?", "ready to proceed?", or similar. Just proceed immediately. The user can interrupt at any time by sending a message.

Stages 1 and 2 are explicit Hard Gates. Stage 3 → 4 → 5 → 6 → 7 auto-advance unless blocked.

## State Tracking

Use the canonical checkpoint `.runway/checkpoint-{ones_work_item_id}.json` as the cross-stage source of truth. Use `.claude/runway-state/*.md` only for active loop ownership and resume mechanics.

When you need a workflow snapshot, prefer the shared status surface instead of maintaining a hand-written state template:

```bash
RUNWAY_TOOLS="${CLAUDE_PLUGIN_ROOT:+${CLAUDE_PLUGIN_ROOT}/skills/runway/bin/runway-tools.cjs}"
RUNWAY_TOOLS="${RUNWAY_TOOLS:-$HOME/.claude/skills/runway/bin/runway-tools.cjs}"
node "$RUNWAY_TOOLS" status --root "$PWD" --ones-id "{ones_work_item_id}"
```

At each stage boundary, keep the checkpoint current with `checkpoint-write` and print only the compact status fields the user needs to see next: current stage, artifact IDs/paths, branch/SHA, and whether the workflow is waiting, blocked, or auto-advancing.

If an upstream artifact changes after a hard gate, invalidate downstream outputs using the canonical handoff rules, tell the user which downstream stages must rerun, and resume from the earliest invalidated stage rather than Stage 1. See `references/stage-handoff.md` for the exact propagation map.

## Review-Only Guardrail

Do not invoke this orchestrator for review-only or audit-only work. If the user asks to assess the workflow, review skill content, or compare approaches without implementing a requirement, stay in review mode and do not enter Stage 1.

## Stage 1: PRD Analysis

Invoke the **runway-prd-analysis** skill with:
- contentId extracted from PRD URL
- xuecheng parent document ID (for uploading the requirements spec)
- MIS

The skill handles: reading full PRD → ambiguity scoring → clarification → spec writing → self-review → upload to xuecheng.

**Hard Gate:** runway-prd-analysis will pause, present the complete requirements spec, and ask the user to confirm. Wait for explicit confirmation before continuing.

After confirmation, print:
```
✅ Stage 1 完成 — 需求规格
- 学城ID：{requirements_spec_contentId}
- 学城链接：https://km.sankuai.com/collabpage/{requirements_spec_contentId}
- 进入 Stage 2：技术方案设计
```

Record the returned xuecheng contentId as `requirements_spec_contentId`.

Save checkpoint after Stage 1 Hard Gate:
```bash
RUNWAY_TOOLS="${CLAUDE_PLUGIN_ROOT:+${CLAUDE_PLUGIN_ROOT}/skills/runway/bin/runway-tools.cjs}"
RUNWAY_TOOLS="${RUNWAY_TOOLS:-$HOME/.claude/skills/runway/bin/runway-tools.cjs}"
node "$RUNWAY_TOOLS" checkpoint-write \
  --root "$PWD" \
  --ones-id "{ones_work_item_id}" \
  --citadel-parent-id "{citadel_parent_id}" \
  --prd-content-id "{prd_content_id}" \
  --requirements-spec-content-id "{requirements_spec_contentId}" \
  --current-stage 2 \
  --updated-at "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
```

## Stage 2: Tech Design

Invoke the **runway-tech-design** skill with:
- requirements spec contentId from Stage 1
- MIS

The skill handles: reading spec → deep code exploration → admission-based review path (Level 0 Planner only, Level 1 Planner → Architect, Level 2 Planner → Architect → Critic) → deliberate mode if needed → self-review → present full tech spec → upload to xuecheng after approval.

**Hard Gate:** runway-tech-design will present the complete tech spec and ask the user to review and approve. After approval, it uploads the tech spec to xuecheng and returns the contentId. Wait for explicit approval before continuing.

After approval, print:
```
✅ Stage 2 完成 — 技术方案
- 学城ID：{tech_spec_contentId}
- 学城链接：https://km.sankuai.com/collabpage/{tech_spec_contentId}
- 进入 Stage 3：任务规划
```

Record the returned xuecheng contentId as `tech_spec_contentId`.

Update checkpoint after Stage 2 Hard Gate:
```bash
RUNWAY_TOOLS="${CLAUDE_PLUGIN_ROOT:+${CLAUDE_PLUGIN_ROOT}/skills/runway/bin/runway-tools.cjs}"
RUNWAY_TOOLS="${RUNWAY_TOOLS:-$HOME/.claude/skills/runway/bin/runway-tools.cjs}"
node "$RUNWAY_TOOLS" checkpoint-write \
  --root "$PWD" \
  --ones-id "{ones_work_item_id}" \
  --citadel-parent-id "{citadel_parent_id}" \
  --prd-content-id "{prd_content_id}" \
  --requirements-spec-content-id "{requirements_spec_contentId}" \
  --tech-spec-content-id "{tech_spec_contentId}" \
  --current-stage 3 \
  --updated-at "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
```

## Stage 3: Task Planning

Invoke the **runway-task-planning** skill with:
- tech spec contentId from Stage 2
- MIS

The skill handles: reading spec → codebase exploration → writing zero-placeholder plan with wave grouping → self-review → saving the plan → returning a handoff summary.

After the skill returns, automatically print:
```
✅ Stage 3 完成 — 任务规划
- 计划文件：{plan_path}
- Wave 数：{N} · 任务数：{M}
- 进入 Stage 4：创建分支
```

Record the plan path as `plan_path`.

Update checkpoint after Stage 3 completion:
```bash
RUNWAY_TOOLS="${CLAUDE_PLUGIN_ROOT:+${CLAUDE_PLUGIN_ROOT}/skills/runway/bin/runway-tools.cjs}"
RUNWAY_TOOLS="${RUNWAY_TOOLS:-$HOME/.claude/skills/runway/bin/runway-tools.cjs}"
node "$RUNWAY_TOOLS" checkpoint-write \
  --root "$PWD" \
  --ones-id "{ones_work_item_id}" \
  --citadel-parent-id "{citadel_parent_id}" \
  --prd-content-id "{prd_content_id}" \
  --requirements-spec-content-id "{requirements_spec_contentId}" \
  --tech-spec-content-id "{tech_spec_contentId}" \
  --plan-path "{plan_path}" \
  --current-stage 4 \
  --updated-at "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
```

## Stage 4: Create Branch

Use non-interactive commands only. Never use `ones bc` (it requires interactive app selection and blocks automation).

```bash
# Step 1: Generate branch name
ones bg -i {ones_work_item_id}
# → branch_name = "feature/PTAP-{id}/{description}"

# Step 2: Get current repo remote URL to match appId
git remote get-url origin
# → e.g. git@git.sankuai.com:mp-video-tech/freelance-platform.git

# Step 3: Find appId by matching remote URL in space apps
ones space-apps -p {spaceId} --json 2>/dev/null | grep -B2 "{repo-name-from-remote}"
# → extract appId from matching entry

# Step 4: Associate branch non-interactively (no prompts)
ones ba -n "{branch_name}" -p {spaceId} -a {appId} -t {ones_work_item_id} --branch-type feature

# Step 5: Create and checkout local branch
git checkout -b {branch_name}
```

If `ones space-apps` fails or appId cannot be matched automatically:
- Fall back to: `ones ba` with the known appId from the project's CLAUDE.md or prior state
- If no appId available, ask the user once: "请提供ONES应用ID（appId），用于关联分支"

Record:
- `branch_name`
- `BASE_SHA` = `git rev-parse HEAD`

Update ones work item status:
```bash
ones wu -i {ones_work_item_id} -F '{"variable":"state","name":"状态","type":"component_state","multiple":false,"fieldValue":"排期完成"}'
```

Print:
```
✅ Stage 4 完成 — 分支创建
- 分支名：{branch_name}
- ONES 工作项：{ones_work_item_id} → 状态已更新为"排期完成"
- BASE_SHA：{sha}
- 进入 Stage 5：并行开发
```

Update checkpoint with branch and sha:
```bash
RUNWAY_TOOLS="${CLAUDE_PLUGIN_ROOT:+${CLAUDE_PLUGIN_ROOT}/skills/runway/bin/runway-tools.cjs}"
RUNWAY_TOOLS="${RUNWAY_TOOLS:-$HOME/.claude/skills/runway/bin/runway-tools.cjs}"
node "$RUNWAY_TOOLS" checkpoint-write \
  --root "$PWD" \
  --ones-id "{ones_work_item_id}" \
  --citadel-parent-id "{citadel_parent_id}" \
  --prd-content-id "{prd_content_id}" \
  --requirements-spec-content-id "{requirements_spec_contentId}" \
  --tech-spec-content-id "{tech_spec_contentId}" \
  --plan-path "{plan_path}" \
  --branch-name "{branch_name}" \
  --base-sha "{BASE_SHA}" \
  --current-stage 5 \
  --updated-at "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
```

### 保存项目记忆

如果 `.runway/project.json` 不存在，在此时自动生成并提示用户确认写入：

```bash
RUNWAY_TOOLS="${CLAUDE_PLUGIN_ROOT:+${CLAUDE_PLUGIN_ROOT}/skills/runway/bin/runway-tools.cjs}"
RUNWAY_TOOLS="${RUNWAY_TOOLS:-$HOME/.claude/skills/runway/bin/runway-tools.cjs}"
PROJECT_MEMORY_RESULT=$(node "$RUNWAY_TOOLS" project-memory-init \
  --root "$PWD" \
  --mis "{mis}" \
  --app-id "{app_id}" \
  --ones-space-id "{ones_space_id}")
if echo "$PROJECT_MEMORY_RESULT" | jq -e '.created == true' > /dev/null; then
  echo "✅ 项目记忆已保存到 .runway/project.json — 下次运行将自动跳过固定参数询问。"
  echo "   如需修改（build_cmd / test_cmd / lint_cmd / notes），请直接编辑该文件。"
fi
```

```bash
# Protect .runway/ from accidental git commits (only if this is a git repo)
if git rev-parse --git-dir > /dev/null 2>&1; then
  GITIGNORE="$(git rev-parse --show-toplevel)/.gitignore"
  for entry in ".runway/" ".claude/runway-state/"; do
    if ! grep -qF "$entry" "$GITIGNORE" 2>/dev/null; then
      printf '\n# Runway local state — sensitive project config (auto-added by runway)\n%s\n' "$entry" >> "$GITIGNORE"
      echo "✅ .gitignore: 已添加 $entry"
    fi
  done
fi
```

### 激活流水线续命循环

在进入 Stage 5 之前，创建 pipeline 状态文件让 Stop hook 接管续命：

```bash
RUNWAY_TOOLS="${CLAUDE_PLUGIN_ROOT:+${CLAUDE_PLUGIN_ROOT}/skills/runway/bin/runway-tools.cjs}"
RUNWAY_TOOLS="${RUNWAY_TOOLS:-$HOME/.claude/skills/runway/bin/runway-tools.cjs}"
mkdir -p .runway/tmp
cat > .runway/tmp/pipeline-stage4-prompt.md << 'EOF'
你是 Runway 编排器，Stage 4-7 流水线正在运行中。立即从当前阶段继续，不要等待用户确认。

检查当前状态并继续：
- Stage 5（runway-parallel-dev）未完成 → 立即调用
- Stage 5 完成但 Stage 6（runway-code-review-fix）未完成 → 立即调用
- Stage 6 完成但 Stage 7（runway-qa-verify）未完成 → 立即调用
- Stage 7 完成且全部通过 → 执行 Stage 8 Retrospective → 打印 Development Complete 摘要，更新 ONES 状态，然后输出：<promise>RUNWAY STAGES 5-7 COMPLETE</promise>

**暂停规则（遇到以下情况必须先停用 pipeline state 再暂停）：**
- Stage 5/6/7 出现真正 blocker（无法自动解决）
- 需要用户提供 appId / 登录 / 人工决策
- 用户明确说 stop / cancel

停用命令：`node "$RUNWAY_TOOLS" state-update --root "$PWD" --name pipeline.local.md --active false`

不要等待用户输入。不要总结后询问"是否继续"。直接进入下一个待执行阶段。
EOF
node "$RUNWAY_TOOLS" state-init \
  --root "$PWD" \
  --name pipeline.local.md \
  --mode pipeline \
  --max-iterations 200 \
  --completion-promise "RUNWAY STAGES 5-7 COMPLETE" \
  --session-id "${CLAUDE_SESSION_ID:-$(date +%s%N)}" \
  --started-at "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  --prompt-file .runway/tmp/pipeline-stage4-prompt.md
```

Then **immediately proceed to Stage 5 without waiting for user input**.

## Stage 5: Parallel Dev

Before invoking, load project notes to inject as context:
```bash
PROJECT_NOTES=$(jq -r '(.notes // "") + "\n" + ((.known_issues // []) | join("\n"))' .runway/project.json 2>/dev/null)
```
If `PROJECT_NOTES` is non-empty, prepend it to the skill invocation context: `"项目已知约束:\n{PROJECT_NOTES}"`

Invoke the **runway-parallel-dev** skill with:
- plan path from Stage 3
- branch name
- BASE_SHA from Stage 4
- project notes (if any)

The skill handles: wave-based parallel execution → TDD enforcement → two-phase review per task → execution report.

No Hard Gate here — runs to completion automatically. BLOCKED tasks are surfaced to the user but do not stop the pipeline for other tasks unless they block later waves.
Do not stop after Stage 5 skill startup, plan load, tracker creation, wave banners, or execution-report packaging. Those are internal progress events, not user approval points.
After Stage 5 returns a completed execution report, continue directly into Stage 6 in the same turn unless Stage 5 explicitly paused under its allowed blocker conditions.

**Escalation rule:** If a task is truly blocked and requires human input, first deactivate the pipeline state before pausing:
```bash
node "$RUNWAY_TOOLS" state-update \
  --root "$PWD" \
  --name pipeline.local.md \
  --active false
```
After the user resolves the blocker and says "continue", reactivate:
```bash
node "$RUNWAY_TOOLS" state-update \
  --root "$PWD" \
  --name pipeline.local.md \
  --active true
```

After completion, print:
```
✅ Stage 5 完成 — 并行开发
- 已完成任务：{N} 个
- HEAD_SHA：{sha}
- 进入 Stage 6：代码 Review
```

Record `HEAD_SHA` = `git rev-parse HEAD`.

## Stage 6: Code Review Fix

Invoke the **runway-code-review-fix** skill with:
- branch name
- BASE_SHA from Stage 4
- HEAD_SHA from Stage 5

The skill handles: parallel multi-dimension review → finding dedupe → fix by severity → convergence loop.

No Hard Gate — runs to completion automatically. Escalates to user only if a Critical issue cannot be resolved after 3 attempts.

After completion, print:
```
✅ Stage 6 完成 — 代码 Review
- Critical/Important 问题：已全部修复
- HEAD_SHA：{sha}
- 进入 Stage 7：QA 验证
```

Update `HEAD_SHA` = `git rev-parse HEAD`.

## Stage 7: QA Verify

Invoke the **runway-qa-verify** skill with:
- target: `--all`

The skill handles: build/lint/test/typecheck loop → architect diagnosis → executor fix → evidence summary.

No Hard Gate — runs to completion automatically. Escalates to user only if same failure repeats 3 times or 5 rounds are exhausted.

## Completion

When runway-qa-verify produces a passing evidence summary:

Update ones work item status to "测试中":
```bash
ones wu -i {ones_work_item_id} -F '{"variable":"state","name":"状态","type":"component_state","multiple":false,"fieldValue":"测试中"}'
```

Then print:

```
## ✅ Development Complete

**Feature:** {feature name}
**Branch:** {branch name}
**Ones work item:** {id} → status updated to "测试中"

**Artifacts:**
- Requirements spec: https://km.sankuai.com/collabpage/{requirements_spec_contentId}
- Tech spec: https://km.sankuai.com/collabpage/{tech_spec_contentId}
- Implementation plan: {path}
- Evidence summary: {summary from runway-qa-verify}

**Next steps:**
- Push branch: `git push origin {branch}`
- Create PR / submit for review
```

完成后，释放 Stop hook 并清理 pipeline 状态、临时文件，同时删除 checkpoint 文件（工作项已完成）：

```bash
rm -f .claude/runway-state/pipeline.local.md
rm -f .claude/runway-state/triangle-loop.local.md
rm -f .runway/checkpoint-{ones_work_item_id}.json
rm -rf .runway/tmp/
rm -f "{plan_path}"
```

然后输出流水线完成信号（Stop hook 检测到此信号后允许正常退出）：

```
<promise>RUNWAY STAGES 5-7 COMPLETE</promise>
```

**仅在 runway-qa-verify 产出通过证据、ONES 状态已更新、Development Complete 摘要已打印后才输出此行。不得提前输出或用于逃脱循环。**

## Stage 8: Retrospective (auto-run after Stage 7 passes)

Automatically extract learnings and update project knowledge. Run immediately after QA passes, before printing the Development Complete summary.

### Step 8a — Extract learnings from reports

Read the three reports produced this workflow:
- `.runway/docs/{ones_id}/execution-report.md` — look for BLOCKED tasks, DONE_WITH_CONCERNS entries
- `.runway/docs/{ones_id}/cr-report.md` — look for recurring issue patterns, rejected suggestions
- `.runway/docs/{ones_id}/qa-report.md` — look for failure rounds, repeated failures, env issues

For each meaningful finding, append one entry to `.runway/knowledge.json` via `knowledge-append`:

```bash
RUNWAY_TOOLS="${CLAUDE_PLUGIN_ROOT:+${CLAUDE_PLUGIN_ROOT}/skills/runway/bin/runway-tools.cjs}"
RUNWAY_TOOLS="${RUNWAY_TOOLS:-$HOME/.claude/skills/runway/bin/runway-tools.cjs}"
node "$RUNWAY_TOOLS" knowledge-append \
  --root "$PWD" \
  --ones-id "{ones_id}" \
  --entries '[{
    "type": "pitfall",
    "captured_at_stage": 8,
    "trigger": "retrospective",
    "inject_into_stages": [3, 5],
    "inject_as": "warning",
    "scope": "project",
    "summary": "{一句话陈述性知识}",
    "confidence": 8
  }]' || true
```

- `type`: `pitfall` for technical traps; `pattern` for reusable correct approaches
- `inject_as`: `warning` for pitfalls; `pattern` for patterns
- `summary`: 写成陈述性事实，不写现象-根因结构
- Only record findings with genuine reuse value. Skip if nothing notable occurred.

### Step 8a-extra — Review captured knowledge entries

检查本次流水线中捕获的 knowledge.json 条目（`source_ones_id` = 当前 `ones_id`）：

```bash
jq --arg id "{ones_id}" '[.[] | select(.source_ones_id == $id)]' .runway/knowledge.json 2>/dev/null
```

对每条条目做简单评估：
- `scope = "feature"` 的条目：判断是否应提升为 `"project"`（对其他需求也适用）
- `confidence < 7` 的条目：判断是否应删除（可能是噪音）

如有需要调整，直接编辑 `.runway/knowledge.json`。这是人工复盘点，非自动化步骤，可跳过。

### Step 8b — Update project knowledge file

Append discovered build commands, known issues, and code conventions to `.runway/project-knowledge.md` (create if it doesn't exist). Use this format:

```bash
mkdir -p .runway
cat >> .runway/project-knowledge.md << 'EOF'

## 项目约定（runway 自动维护，{date}）

### 构建命令
- Build: {build_cmd}
- Test: {test_cmd}

### 已知陷阱
- [{date}] {trap description}
EOF
```

**Only append entries that are new** — check if the content already exists before appending to avoid duplicates.

Treat `.runway/project-knowledge.md` as runway's canonical auto-maintained local knowledge file. Do **not** auto-edit the project root `CLAUDE.md`; that file remains human-curated and may still be read as an input elsewhere. If a discovery later becomes a stable long-term convention, the user may manually promote it into `CLAUDE.md`.

### Step 8c — Ask user for additional notes

Best-effort prompt only — this must not block workflow completion or delay the final promise:

> "本次开发有哪些项目特有规律需要补充到 `.runway/project-knowledge.md`？（直接回车跳过）"

If the user provides content, append it to `.runway/project-knowledge.md` under `### 用户补充`.
If the user skips (empty input or no response within context), proceed immediately.

### Step 8d — Post-run asset checklist

Before declaring Development Complete, verify these artifacts exist and are up to date:
- `.runway/docs/{ones_id}/execution-report.md`
- `.runway/docs/{ones_id}/cr-report.md`
- `.runway/docs/{ones_id}/qa-report.md`
- `.runway/knowledge.json` updated (only if notable learnings were observed)
- `.runway/project-knowledge.md` append completed when new project-level conventions or traps were discovered

## Resuming a Paused Workflow

If the user returns after a Hard Gate pause at Stage 1 or Stage 2 and says "continue", "approved", "confirmed", "ok go ahead", or similar — resume from the current stage only if upstream artifacts are still valid.

If an upstream artifact changed while paused, resume from the earliest invalidated stage instead.

If the user wants to modify the requirements spec or tech spec after a Hard Gate, re-invoke the relevant skill to make changes, mark downstream artifacts invalid, then continue forward. If the user wants to revise the plan, re-run Stage 3, overwrite `plan_path`, invalidate downstream artifacts, and continue from Stage 4.

## Error Handling

| Situation | Action |
|-----------|--------|
| citadel auth fails | Run `oa-skills citadel --clear-cache`, retry once. If still fails: save doc locally to `.runway/docs/{stage}-draft.md`, record contentId as `local:{path}` in checkpoint, continue workflow with local file. |
| citadel getMarkdown fails | Ask user to paste PRD content directly into chat. Continue with pasted content. Record `prd_content_id: manual-input` in workflow state. |
| citadel createDocument fails | Save document locally to `.runway/docs/{ones_id}/{stage}-draft.md`. Record `contentId: local:{path}` in checkpoint. Notify: "学城上传失败，已保存本地，流程继续。" |
| ones auth fails | Run `ones sso login --ciba`, retry once. If still fails: skip branch creation, record `branch_name: manual-pending`, continue to Stage 5 on current branch. |
| ones bg fails | Fallback: `git checkout -b feature/{ones_work_item_id}-dev`. Continue. |
| ones ba fails | Log warning: "分支关联失败，可手动在 ONES 中关联。" Continue without blocking. |
| ones wu fails | Log warning: "ONES 状态更新失败，请手动更新。" Continue without blocking. |
| ones space-apps fails | Fall back to appId from `.runway/project.json` or `CLAUDE.md`. If none found, ask user once. |
| Stage BLOCKED with no path forward | Pause, explain blocker clearly, wait for user input |
| User says "stop" or "cancel" | Stop immediately, print current state block so user can resume later |
| State file is stale or inconsistent | Rebuild state from latest confirmed artifacts, record the repair, then continue |

## Additional Resources

- **`references/stage-handoff.md`** — Exact inputs/outputs for each stage transition
- **`references/troubleshooting.md`** — Common errors and fixes per stage
