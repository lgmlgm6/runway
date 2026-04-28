---
name: runway-parallel-dev
description: Executes an implementation plan by dispatching isolated subagents per task with TDD enforcement and two-phase review (spec compliance + code quality). Waves run in parallel; waves are serial. Invoke this skill whenever the user wants to "start development", "execute the plan", "开始开发", "并行开发", or after runway-task-planning produces a plan. Also trigger when the user says "implement the tasks" or "run the plan". Do NOT implement tasks manually — always use this skill to ensure TDD and TC coverage are enforced per task.
version: 0.1.0
---

# Parallel Dev

Execute the implementation plan from runway-task-planning. Dispatch one fresh subagent per task, enforce TDD, run two-phase review per task. Tasks within the same wave run concurrently; waves are serial.

## When to Use

Activate after runway-task-planning saves the implementation plan and auto-advances into execution. Input: plan document path. This is Stage 5 of the Runway workflow.

## Core Rules

- **Context isolation:** Each subagent receives a self-contained task package. No shared session history.
- **TDD enforced:** Subagent must write a failing test before any implementation code and must show failure/pass evidence.
- **Two-phase review per task:** spec compliance check → code quality check.
- **Wave parallelism:** Tasks in the same wave are dispatched concurrently. Next wave starts only after current wave completes.
- **Wave conflict safety:** If same-wave tasks unexpectedly touch the same primary file or changed shared interface, stop and repair the plan before continuing.
- **No global CR here:** Whole-branch code review is handled by runway-code-review-fix (Stage 6).

## Process

```
Read plan → Create task tracker
FOR EACH WAVE (serial):
  Dispatch all tasks in wave concurrently
  Handle subagent states
  Run two-phase review per completed task
  Fix Critical issues before marking done
  Run wave integration verification
Wave complete → next wave
All waves done → execution report produced → return control to orchestrator
```

## Step 1: Read Plan and Create Tracker

**Before reading the plan, check if a pipeline state already exists (set by the main runway orchestrator). Only create one if running standalone (not invoked from runway):**

```bash
RUNWAY_TOOLS="${CLAUDE_PLUGIN_ROOT:+${CLAUDE_PLUGIN_ROOT}/skills/runway/bin/runway-tools.cjs}"
RUNWAY_TOOLS="${RUNWAY_TOOLS:-$HOME/.claude/skills/runway/bin/runway-tools.cjs}"
# Only create pipeline state if not already active (main orchestrator may have set it)
if [[ ! -f .claude/runway-state/pipeline.local.md ]] || \
   ! grep -q "^active: true" .claude/runway-state/pipeline.local.md 2>/dev/null; then
  mkdir -p .runway/tmp
  cat > .runway/tmp/pipeline-stage5-prompt.md << 'EOF'
你是 runway-parallel-dev 的编排器，并行开发流水线正在运行中。立即从当前位置继续：

- 如果计划尚未读取 → 读取计划，建立 tracker
- 如果当前 Wave 有任务未派发 → 并发派发该 Wave 所有任务
- 如果当前 Wave 有任务未完成 review → 继续 two-phase review
- 如果当前 Wave 已完成 → 运行 wave integration verification，自动进入下一个 Wave
- 如果所有 Wave 完成 → 生成 Execution Report，输出 <promise>PARALLEL DEV COMPLETE</promise>

**暂停规则（遇到以下情况必须先停用 pipeline state 再暂停）：**
- 出现真正 blocker（无法自动解决）且是下一 wave 的依赖
- 用户明确说 stop / cancel

停用命令：`node "$RUNWAY_TOOLS" state-update --root "$PWD" --name pipeline.local.md --active false`

不要等待用户输入。不要总结后询问"是否继续"。直接推进到下一个待执行步骤。
EOF
  node "$RUNWAY_TOOLS" state-init \
    --root "$PWD" \
    --name pipeline.local.md \
    --mode pipeline \
    --max-iterations 50 \
    --completion-promise "PARALLEL DEV COMPLETE" \
    --session-id "${CLAUDE_SESSION_ID:-$(date +%s%N)}" \
    --started-at "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
    --prompt-file .runway/tmp/pipeline-stage5-prompt.md
fi
```

Read the plan document. Create one tracker entry per task and record:
- task number
- wave number
- primary file
- touched files
- dependencies
- integration verification command for the wave

After Step 1 completes, dispatch Wave 1 in the same turn. Do not stop after reading the plan, printing tracker details, or summarizing the wave layout.
Subagent dispatch, in-flight task status, review handoffs, and wave banners are progress updates, not user pause points.
Do not ask the user whether to start the first wave, whether to continue after a task finishes, or whether to proceed after a progress banner.

### Wave Conflict Auto-Detection

Before dispatching any wave, collect all primary files for that wave and verify uniqueness. If duplicates are found, auto-split conflicting tasks into sequential sub-waves, update dependency declarations, log the correction, and proceed without asking the user.

See `references/dependency-verification.md` (Wave Conflict Detection section) for the detection pattern and fix procedure.

## Step 1.5: Load Pitfall Warnings

```bash
RUNWAY_TOOLS="${CLAUDE_PLUGIN_ROOT:+${CLAUDE_PLUGIN_ROOT}/skills/runway/bin/runway-tools.cjs}"
RUNWAY_TOOLS="${RUNWAY_TOOLS:-$HOME/.claude/skills/runway/bin/runway-tools.cjs}"
KNOWLEDGE_S5=$(node "$RUNWAY_TOOLS" knowledge-read --root "$PWD" --inject-into-stage 5 --format prompt 2>/dev/null || echo "")
```

如果 `KNOWLEDGE_S5` 非空，在派发每个 implementer subagent 时将其注入到 prompt 的 `## Known Project Pitfalls` 字段（见 `references/implementer-prompt.md`）。

## Step 2: Dispatch Subagents (per wave)

Dispatch all tasks in the current wave concurrently. Use the full prompt template from `references/implementer-prompt.md` — fill in all placeholders before dispatching. Never make the subagent read the plan file itself; provide the full task text directly.

Key fields to fill:
- `{FULL TEXT of task}` — copy exact steps from plan including all code
- `{Context}` — wave number, what previous waves completed, architectural context
- `{Relevant files}` — content of files the task touches or depends on
- `{directory}` — working directory
- `{expected failing output}` — what the initial red phase should prove
- `{KNOWLEDGE_S5}` — known project pitfalls (omit this field if empty)

### Model Selection

| Task type | Model |
|-----------|-------|
| Simple CRUD, config | fast (haiku) |
| Standard feature | standard (sonnet) |
| Architecture, complex logic | capable (opus) |

### Handling Subagent States

| State | Required report fields | Action |
|-------|------------------------|--------|
| DONE | changed files, failing-test evidence, passing-test evidence, commit SHA | Proceed to two-phase review |
| DONE_WITH_CONCERNS | DONE fields + explicit concerns and impacted files | Proceed to review; flag concerns for reviewer and handoff report |
| NEEDS_CONTEXT | exact missing context, why it is required, what was already tried | Supply missing context, re-dispatch. Max 2 retries, then BLOCKED. |
| BLOCKED | blocker, attempted probes, dependency impact, recommended next step | Record the blocker, continue other runnable tasks in the wave, and only pause Stage 5 later if Step 4's allowed conditions are met |

A task-level `BLOCKED` state is not by itself a Stage 5 user pause point. Record it, continue other runnable tasks in the same wave, and pause the stage only if Step 4's allowed conditions are later met.
NEEDS_CONTEXT retries, spec-review repair rounds, and code-quality fix rounds are internal execution loops, not user review gates.
Do not ask the user for confirmation between implementer → spec review → code quality review hops unless an explicit Step 4 pause condition is reached.

### Knowledge Capture on BLOCKED / DONE_WITH_CONCERNS

当任务状态为 `BLOCKED` 或 `DONE_WITH_CONCERNS` 时，在记录到 execution report 之前，立即执行根因提炼（内部步骤）：

判断：
1. 这是代码库中已存在但 AI 未意识到的隐性事实吗？（如：某个类的字段继承规则、某个工具的限制）
2. 根因是什么？不只是"遇到了问题"，而是"为什么会遇到这个问题"
3. 这条知识在未来类似任务中是否有预警价值？

如果 `confidence >= 7`，写入 knowledge.json：

```bash
RUNWAY_TOOLS="${CLAUDE_PLUGIN_ROOT:+${CLAUDE_PLUGIN_ROOT}/skills/runway/bin/runway-tools.cjs}"
RUNWAY_TOOLS="${RUNWAY_TOOLS:-$HOME/.claude/skills/runway/bin/runway-tools.cjs}"
ONES_ID=$(jq -r '.ones_work_item_id' .runway/checkpoint-*.json 2>/dev/null | head -1)
node "$RUNWAY_TOOLS" knowledge-append \
  --root "$PWD" \
  --ones-id "${ONES_ID:-unknown}" \
  --entries '[{
    "type": "pitfall_root_cause",
    "captured_at_stage": 5,
    "trigger": "task_blocked",
    "inject_into_stages": [3, 5],
    "inject_as": "warning",
    "scope": "project",
    "summary": "{根因一句话}",
    "detail": "{任务描述} — {遇到的问题} — {根因分析} — {解决方法}",
    "confidence": 8
  }]' || true
```

`confidence` 根据根因的确定程度填 7–10 的整数。捕获失败不阻塞主流程（`|| true`）。

## Step 3: Two-Phase Review (per task)

### Phase 1 — Spec Compliance

Use prompt template from `references/spec-reviewer-prompt.md`. Fill in:
- `{FULL TEXT of task requirements}` — from the plan
- `{implementer's report}` — status, files changed, commit SHA, TDD evidence
- `{task-start-sha}` — commit before this task began

Returns: `✅ COMPLIANT` or `❌ NON_COMPLIANT: {items with file:line}`.

On NON_COMPLIANT: send specific items back to implementer subagent to fix, then re-dispatch spec reviewer. Max 2 rounds. Treat this as an internal repair loop — do not pause for user confirmation unless a Step 4 allowed pause condition is reached.

### Phase 2 — Code Quality

Use prompt template from `references/code-quality-reviewer-prompt.md`. Fill in:
- `{BASE_SHA}` — commit before this task
- `{HEAD_SHA}` — current HEAD after implementer's commit
- `{implementer's report}` — what was built and concerns raised

Returns issues tagged `Critical` / `Important` / `Minor`.

- **Critical:** must fix before task is marked done — send back to implementer
- **Important:** log to execution report for runway-code-review-fix stage
- **Minor:** log to execution report, optional

Critical-fix loops are internal execution work, not user review gates. Keep the task moving until it is fixed or until the Step 4 escalation limit is reached.

## Step 4: Wave Completion Gate

A wave is complete when all tasks are either ✅ reviewed-and-done or ⏸️ BLOCKED.

Before starting the next wave:
- run the wave's integration verification step;
- confirm no same-wave file conflict occurred (auto-detected in Step 1);
- confirm no blocked task is a dependency of the next wave.

### Wave Auto-Advance

After integration verification passes, **automatically start the next wave without waiting for user input**. Do NOT print "Wave N complete, shall I proceed to Wave N+1?" — just proceed.

Print a compact banner and move on:
```
✅ Wave {N} complete ({M} tasks). Starting Wave {N+1}...
```

**Only pause** (wait for user input) when:
1. A BLOCKED task is a declared dependency of the next wave — explain the blocker and ask how to resolve
2. Integration verification FAILS — show the failure and ask how to proceed
3. Round 5 of fix attempts reached for a Critical issue

If a blocked task is an explicit dependency of the next wave, stop and ask the user how to resolve it.

If same-wave conflicts are discovered at runtime (not caught in Step 1), stop the wave, auto-reassign the conflicting task to the next wave, log the correction, and continue.

## Step 5: Execution Report

```markdown
# Execution Report: {feature}

**Completed:** {N} tasks
**Blocked:** {N} tasks
**HEAD_SHA:** {sha}

## Completed Tasks
| Task | Status | Changed Files | Commit SHA | Concerns |
|------|--------|---------------|------------|----------|

## Important Issues (for runway-code-review-fix)
{list}

## Minor Issues (logged)
{list}

## Spec Deviations
{any approved or unresolved differences from the plan}

## Blocked Tasks (need human input)
{task, blocker reason, dependency impact}

## Test Evidence Summary
{task → failing output proof → passing output proof}

## Commit Log
{git log --oneline {base}..HEAD}
```

Execution Report generation and Stage 5 → Stage 6 handoff are not review gates. Save the report, return control to the orchestrator, and let the pipeline continue in the same turn unless an allowed pause condition was hit.

### Required handoff to `runway-code-review-fix`

The execution report must provide:
- branch name
- `BASE_SHA`
- `HEAD_SHA`
- changed files across all completed tasks
- all Important issues
- all `DONE_WITH_CONCERNS` notes
- spec deviations

### Save report to `.runway/docs/`

After producing the execution report, save it locally and update the checkpoint:

```bash
RUNWAY_TOOLS="${CLAUDE_PLUGIN_ROOT:+${CLAUDE_PLUGIN_ROOT}/skills/runway/bin/runway-tools.cjs}"
RUNWAY_TOOLS="${RUNWAY_TOOLS:-$HOME/.claude/skills/runway/bin/runway-tools.cjs}"
ONES_ID=$(jq -r '.ones_work_item_id' .runway/checkpoint-*.json 2>/dev/null | head -1)
if [[ -n "$ONES_ID" ]]; then
  mkdir -p .runway/tmp
  cat > .runway/tmp/execution-report.md << 'EOF'
{EXECUTION_REPORT_CONTENT}
EOF
  node "$RUNWAY_TOOLS" report-write \
    --root "$PWD" \
    --ones-id "$ONES_ID" \
    --report execution_report \
    --content-file .runway/tmp/execution-report.md
fi
```

## Terminal State

All waves complete. Execution report produced. Return control to the calling orchestrator. **Do NOT invoke runway-code-review-fix directly — the orchestrator handles stage transitions.**

## Additional Resources

- **`references/implementer-prompt.md`** — Full prompt template for implementer subagent (includes subagent_type MANDATORY rule and Write tool fallback)
- **`references/spec-reviewer-prompt.md`** — Full prompt template for spec compliance reviewer
- **`references/code-quality-reviewer-prompt.md`** — Full prompt template for code quality reviewer
- **`references/subagent-prompt-guide.md`** — Tips for writing effective isolated task packages
- **`references/review-criteria.md`** — Detailed spec compliance and code quality criteria
- **`references/tdd-enforcement.md`** — TDD iron rule, common rationalizations, violation handling
- **`references/dependency-verification.md`** — Wave conflict detection and fix patterns (shared with runway-task-planning)
