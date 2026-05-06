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

Before fixing anything, group findings into clusters. Two findings belong in the same cluster when **all three** conditions hold:

1. **Same file**
2. **Line numbers within 10 of each other** (same function scope)
3. **Same fix action** — normalize each `how to fix` to `verb + primary object`, lowercase, strip articles and qualifiers:
   - `"add null check before accessing field"` → `add null check` ✓ same
   - `"add a null check"` → `add null check` ✓ same  
   - `"add @NonNull annotation"` → `add annotation` ✗ different fix, different cluster
   - `"add input validation"` → `add validation` ✗ different fix, different cluster

**End-to-end example** — three reviewers report on `UserService.java:45`:

| Reviewer | Issue Key | How to fix (raw) | Normalized |
|----------|-----------|-----------------|------------|
| R1 Functional | LOGIC-001 Critical | "add null check before accessing userRole" | add null check |
| R2 Security | SEC-001 Critical | "add null check before field access" | add null check |
| R3 Quality | QUAL-001 Important | "add @NonNull annotation to parameter" | add annotation |

Result: LOGIC-001 + SEC-001 → **one cluster** (same file, line 45, same fix). QUAL-001 → **separate cluster** (different fix action). Fix the LOGIC-001 cluster once; QUAL-001 gets its own fix.

For each cluster:
- assign the canonical Issue Key from the highest-severity contributor
- record all contributing reviewers (`Reviewers: R1, R2`)
- use the highest severity across contributors
- note disposition: `in-scope` / `out-of-scope` / `incorrect` / `YAGNI`

Maintain the cluster table across rounds using the canonical Issue Key — the same key appearing unresolved in re-review output triggers the 3-round repeat detection in Step 5.

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
