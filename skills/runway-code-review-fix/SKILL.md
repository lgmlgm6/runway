---
name: runway-code-review-fix
description: Runs a full branch-level code review across functional (AC/TC coverage), security, and quality dimensions in parallel, then fixes issues by severity until no Critical or Important issues remain. Invoke this skill whenever the user wants to "do code review", "review the branch", "跑CR", "fix review issues", or after runway-parallel-dev completes. Also trigger when the user says "check the code" or "review my changes" on a feature branch. Do NOT skip this skill even if the change looks small — AC coverage verification requires it.
version: 0.1.0
---

# Code Review Fix

Run a full branch-level code review across functional, security, and quality dimensions. Fix issues by severity. Loop until no Critical or Important issues remain.

## When to Use

Activate after runway-parallel-dev produces its execution report. Input: branch name, BASE_SHA, HEAD_SHA. This is Stage 6 of the Runway workflow.

## Core Rules

- **Verify before implementing:** Validate the technical correctness of each suggestion before acting on it.
- **Severity-driven:** Critical → fix now. Important → fix this round. Minor → log only.
- **YAGNI check:** If a suggestion adds functionality with no current usage in the codebase, reject it.
- **Push-back:** Reject suggestions that break functionality, lack codebase context, or are technically incorrect.
- **Loop convergence:** After fixing, re-review the changed files first, then expand scope when impacted contracts/callers require it. Exit when no Critical/Important remain, or after 5 rounds.
- **Deduplicate findings:** Merge equivalent reviewer findings into one issue cluster before deciding whether to fix or reject.

## Process

```
Get branch SHAs
    ↓
Dispatch 3 review subagents in parallel
    ↓
Aggregate and dedupe findings by severity
    ↓
LOOP (max 5 rounds):
  Fix Critical issues
  Fix Important issues
  Re-review changed files (+ impacted callers when needed)
  Exit if no Critical/Important remain
    ↓
Log Minor issues
    ↓
Produce review report → return control to orchestrator
```

## Step 1: Get Branch Info

**Before resolving branch info, check if a pipeline state already exists (set by the main runway orchestrator). Only create one if running standalone:**

```bash
RUNWAY_TOOLS="${CLAUDE_PLUGIN_ROOT:+${CLAUDE_PLUGIN_ROOT}/skills/runway/bin/runway-tools.cjs}"
RUNWAY_TOOLS="${RUNWAY_TOOLS:-$HOME/.claude/skills/runway/bin/runway-tools.cjs}"
if [[ ! -f .claude/runway-state/pipeline.local.md ]] || \
   ! grep -q "^active: true" .claude/runway-state/pipeline.local.md 2>/dev/null; then
  mkdir -p .runway/tmp
  cat > .runway/tmp/pipeline-stage6-prompt.md << 'EOF'
你是 runway-code-review-fix 的编排器，代码 Review 流水线正在运行中。立即从当前位置继续：

- 如果分支信息尚未获取 → 获取 BASE_SHA / HEAD_SHA
- 如果 3 个 reviewer 尚未派发 → 并发派发
- 如果 findings 尚未聚合 → 聚合并去重
- 如果仍有 Critical/Important 问题且未达 5 轮 → 继续修复循环
- 如果无 Critical/Important 或已达 5 轮 → 生成 Review Report，输出 <promise>CODE REVIEW COMPLETE</promise>

**暂停规则：**
- 同一 issue cluster 出现 3 轮 → 停用 state，上报用户
- 用户明确说 stop / cancel

停用命令：`node "$RUNWAY_TOOLS" state-update --root "$PWD" --name pipeline.local.md --active false`

不要等待用户输入。直接推进到下一个待执行步骤。
EOF
  node "$RUNWAY_TOOLS" state-init \
    --root "$PWD" \
    --name pipeline.local.md \
    --mode pipeline \
    --max-iterations 30 \
    --completion-promise "CODE REVIEW COMPLETE" \
    --session-id "${CLAUDE_SESSION_ID:-$(date +%s%N)}" \
    --started-at "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
    --prompt-file .runway/tmp/pipeline-stage6-prompt.md
fi
```

Resolve the base branch first. Do not hard-code `main`.

```bash
BASE_BRANCH=${BASE_BRANCH:-<repo default branch or user-provided branch>}
BASE_SHA=$(git merge-base HEAD "$BASE_BRANCH")
HEAD_SHA=$(git rev-parse HEAD)
git diff --stat "$BASE_SHA".."$HEAD_SHA"
git log --oneline "$BASE_SHA".."$HEAD_SHA"
```

If the repository default branch is unclear, ask the user or inspect the repo configuration before continuing.

## Step 2: Dispatch Review Subagents (parallel)

Dispatch all three simultaneously. Each receives `git diff $BASE_SHA..$HEAD_SHA` plus focused context.

Use the prompt templates from `references/reviewer-prompts.md`. Fill in `{BASE_SHA}`, `{HEAD_SHA}`, `{feature name}`, `{requirements spec summary}`, and `{base branch}` before dispatching.

**Reviewer 1 — Functional & Logic**
Focus: requirements coverage, logic correctness, edge cases, test adequacy.

**Reviewer 2 — Security**
Focus: OWASP Top 10, sensitive data handling, auth/permission gaps, dependency vulnerabilities.

**Reviewer 3 — Code Quality**
Focus: naming, single responsibility, DRY, error handling consistency, performance (N+1, unnecessary loops).

Each reviewer returns findings tagged `Critical` / `Important` / `Minor`. See `references/severity-guide.md`.

## Step 3: Aggregate Findings

Before fixing anything:
- cluster duplicate findings across reviewers into one canonical issue;
- keep a list of which reviewers raised the issue;
- preserve the highest severity assigned to the cluster;
- note whether the issue is in scope, out of scope, incorrect, or YAGNI.

Use issue clusters in the review report so the same problem is not fixed or rejected multiple times.

## Step 4: Process Each Finding

For every finding, run the validation flow before acting:

```
Read finding
  → Understand the technical claim
  → Verify: is this claim correct for THIS codebase?
  → [Correct + in scope] → implement fix
  → [Incorrect / out of scope / YAGNI] → reject with reason
```

**YAGNI check:** Search the codebase for usage of the suggested addition. If none found → reject.

**Push-back format:**
> "Not implementing: {reason}. The current behavior {X} is correct because {explanation}."

**Fix commit format:**
```bash
git add {files}
git commit -m "fix: {description} (cr-round-{N})"
```

## Step 5: Loop Control

After fixing Critical and Important issues, re-review the changed files first:
```bash
git diff {prev-HEAD}..HEAD
```

Then expand review scope if the fix changed:
- a shared interface or type;
- a public API contract;
- auth / permission behavior;
- a module with multiple callers or downstream consumers.

**Exit conditions:**
- No Critical, no Important → exit loop ✅
- Same issue cluster appears 3 rounds in a row → stop, escalate to user
- Round 5 reached with remaining issues → stop, produce failure report

## Step 6: Review Report

```markdown
# Code Review Report: {feature}

**Rounds:** {N}
**Status:** Passed / Needs human input
**Base branch:** {base branch}
**BASE_SHA:** {sha}
**HEAD_SHA:** {sha}

## Fixed Issues
| Severity | Issue Cluster | Reviewers | Fix |
|----------|---------------|-----------|-----|

## Rejected Suggestions
| Suggestion | Reviewers | Reason |
|------------|-----------|--------|

## Minor Issues (logged)
{list}

## Escalated (if any)
{unresolved issue clusters + reason}
```

### Save report to `.runway/docs/`

After producing the review report, save it locally and update the checkpoint:

```bash
RUNWAY_TOOLS="${CLAUDE_PLUGIN_ROOT:+${CLAUDE_PLUGIN_ROOT}/skills/runway/bin/runway-tools.cjs}"
RUNWAY_TOOLS="${RUNWAY_TOOLS:-$HOME/.claude/skills/runway/bin/runway-tools.cjs}"
ONES_ID=$(jq -r '.ones_work_item_id' .runway/checkpoint-*.json 2>/dev/null | head -1)
if [[ -n "$ONES_ID" ]]; then
  mkdir -p .runway/tmp
  cat > .runway/tmp/cr-report.md << 'EOF'
{CR_REPORT_CONTENT}
EOF
  node "$RUNWAY_TOOLS" report-write \
    --root "$PWD" \
    --ones-id "$ONES_ID" \
    --report cr_report \
    --content-file .runway/tmp/cr-report.md
fi
```

## Terminal State

No Critical/Important issues. Report produced. Return control to the calling orchestrator. **Do NOT invoke runway-qa-verify directly — the orchestrator handles stage transitions.**

## Additional Resources

- **`references/reviewer-prompts.md`** — Full prompt templates for all 3 reviewer subagents
- **`references/review-dimensions.md`** — Full checklist per review dimension
- **`references/severity-guide.md`** — Severity classification with examples
- **`references/pushback-examples.md`** — Concrete examples of when and how to reject reviewer suggestions
