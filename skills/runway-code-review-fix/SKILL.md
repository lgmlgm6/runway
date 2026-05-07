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

**Before resolving branch info, ensure the pipeline loop state is active (standalone path creates it; orchestrated path reuses the existing one):**

```bash
RUNWAY_TOOLS="${CLAUDE_PLUGIN_ROOT:+${CLAUDE_PLUGIN_ROOT}/skills/runway/bin/runway-tools.cjs}"
RUNWAY_TOOLS="${RUNWAY_TOOLS:-$HOME/.claude/skills/runway/bin/runway-tools.cjs}"
node "$RUNWAY_TOOLS" loop-init \
  --root "$PWD" \
  --stage 6 \
  --session-id "${CLAUDE_SESSION_ID:-$(date +%s%N)}" \
  --started-at "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  --prompt-text "你是 runway-code-review-fix 的编排器，代码 Review 流水线正在运行中。立即从当前位置继续：分支信息未获取 → 获取 BASE_SHA/HEAD_SHA；3 个 reviewer 未派发 → 并发派发；findings 未聚合 → 聚合去重；有 Critical/Important 且未达 5 轮 → 继续修复；无 Critical/Important 或达 5 轮 → 生成 Review Report，输出 <promise>CODE REVIEW COMPLETE</promise>。同一 issue cluster 出现 3 轮或用户 stop/cancel 时先停用 state 再暂停。不要等待用户输入，直接推进。"
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

Dispatch all three simultaneously using the full prompt templates from `references/reviewer-prompts.md`.

**Before dispatching, collect these inputs:**
- `{BASE_SHA}` / `{HEAD_SHA}` — from Step 1
- `{feature name}` — from branch name or checkpoint
- `{base branch}` — resolved in Step 1
- `{requirements spec summary}` — from `.runway/docs/{ones_id}/` or the xuecheng spec link
- `{AC table}` — from requirements spec (AC编号 | Given | When | Then | 优先级)
- `{TC list}` — from `.runway/tmp/tc-list.md` if it exists
- `{接口协议变更}` — paste Section 三 from the tech spec
- `{验证策略}` — paste Section 五 from the tech spec

**Reviewer 1 — Functional & Logic** (use template in `references/reviewer-prompts.md`)

Key focus areas:
- AC coverage: for each P0 AC, is there a test method whose name contains the TC编号?
- Does each test's assertion actually verify the AC's Then condition (not just "no exception")?
- Logic correctness: branches, state transitions, boundary conditions, concurrency safety
- Edge cases: null/empty input, max values, partial failure, repeated submission

Critical triggers: any P0 AC with zero test coverage; wrong output for valid input.

**Reviewer 2 — Security** (use template in `references/reviewer-prompts.md`)

Key focus areas:
- Injection: SQL, command, path traversal, XSS — are external inputs validated at system boundaries?
- Auth/authz: are protected flows gated correctly? can a user reach another user's data?
- Sensitive data: passwords/tokens/PII in logs, errors, or storage?
- Misconfiguration: unsafe defaults, missing permission checks, weak dependency pinning

Critical triggers: exploitable injection; missing auth gate on protected resource.

**Reviewer 3 — Code Quality** (use template in `references/reviewer-prompts.md`)

Key focus areas:
- Single responsibility, DRY without over-abstraction, error handling consistent with codebase
- YAGNI: did this add functionality with no current callers? → flag for rejection
- Scope expansion check: did the fix touch a shared interface, public API, or common type?
- Performance: N+1 queries, avoidable repeated work, blocking calls in hot paths

Critical triggers: N+1 in hot path; introduced shared-interface change without updating callers.

Each reviewer tags every finding with an **Issue Key** (`LOGIC-001`, `SEC-001`, `QUAL-001`) and severity `Critical` / `Important` / `Minor`. The Issue Key is used for deduplication and repeat-round tracking. See `references/severity-guide.md` for classification examples.

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

After fixing Critical and Important issues in this round, re-review using the **same reviewer(s) whose findings were fixed**:

```bash
git diff {prev-round-HEAD}..HEAD   # diff of this round's fixes only
```

- If only Reviewer 1 (functional) findings were fixed → re-dispatch Reviewer 1 only on changed files
- If only Reviewer 2 (security) findings were fixed → re-dispatch Reviewer 2 only on changed files
- If multiple reviewer dimensions were fixed → re-dispatch all affected reviewers in parallel

Expand scope beyond the changed files if the fix touched:
- a shared interface or type → re-review all known callers
- a public API contract → re-review all consumers visible in the diff
- auth / permission behavior → re-review the full auth path
- a module with multiple downstream consumers → re-review impacted modules

**Repeat-round tracking:** Track each open Issue Key across rounds. An Issue Key is "repeating" if it appears in the re-review output with the same finding for the 3rd consecutive round (same file:line region and same root cause — not just same label).

**Exit conditions:**
- No Critical, no Important across all reviewers → exit loop ✅
- Any Issue Key appears unresolved for 3 consecutive rounds → stop, escalate that cluster to user
- Round 5 reached with remaining issues → stop, produce failure report

Before escalating to the user, deactivate the pipeline state so the Stop hook does not re-inject a continuation prompt:
```bash
node "$RUNWAY_TOOLS" state-update --root "$PWD" --name pipeline.local.md --active false
```

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
