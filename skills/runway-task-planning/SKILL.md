---
name: runway-task-planning
description: Converts a tech spec into a zero-placeholder implementation plan with wave-based parallel grouping. Invoke this skill whenever the user wants to "break down tasks", "create implementation plan", "拆任务", "写执行计划", or after runway-tech-design is approved. Also trigger when the user asks "how do we implement this?" after a tech spec exists. Do NOT let the user skip straight to coding without a plan.
version: 0.1.0
---

# Task Planning

Convert a tech spec into a zero-placeholder implementation plan. Each step is 2–5 minutes of work, includes complete code and commands, and is tagged with a wave for parallel execution.

Default behavior: save the implementation plan and return it immediately so Runway can auto-advance into Stage 4 branch creation. Do not wait for explicit user confirmation unless the caller explicitly asks for a review pause.

## When to Use

Activate after runway-tech-design is approved. Input: tech spec (markdown or xuecheng link). This is Stage 3 of the dev workflow.

## Core Rules

- **Zero placeholders:** Every step contains complete code, exact commands, expected output. No "TBD", "implement here", "TODO".
- **2–5 min granularity:** Each step is one atomic operation.
- **Wave tagging:** Mark which tasks can run in parallel (same wave = no file overlap, no logical dependency).
- **Zero-context assumption:** The plan must be executable by someone with no codebase knowledge.
- **Dependency explicitness:** Every task must declare what it depends on and what later work depends on it.
- **Conflict safety:** No two tasks in the same wave may modify the same primary file.

## Process

```
Read tech spec → Explore codebase → Map file structure → Write plan (with waves + dependencies) → Self-review → return control to runway orchestrator with plan path
```

## Step 0: Load Role Context

Read the `role` field from the checkpoint (default: `"backend"`):

```bash
ROLE=$(jq -r '.role // "backend"' .runway/checkpoint-*.json 2>/dev/null | head -1)
SKILL_ROOT="${CLAUDE_PLUGIN_ROOT:+${CLAUDE_PLUGIN_ROOT}/skills/runway-task-planning}"
SKILL_ROOT="${SKILL_ROOT:-$HOME/.claude/skills/runway-task-planning}"
ROLE_FILE="${SKILL_ROOT}/roles/${ROLE}.md"
```

If `ROLE_FILE` exists, read it and inject its contents as task planning focus context for all subsequent steps. The role file defines module boundaries, wave dependency patterns, and known pitfalls specific to this project type (backend vs frontend).

If `ROLE_FILE` does not exist, continue with default backend behavior.

## Step 0.5: Load Pitfall Warnings

```bash
RUNWAY_TOOLS="${CLAUDE_PLUGIN_ROOT:+${CLAUDE_PLUGIN_ROOT}/skills/runway/bin/runway-tools.cjs}"
RUNWAY_TOOLS="${RUNWAY_TOOLS:-$HOME/.claude/skills/runway/bin/runway-tools.cjs}"
PROJECT_ROOT=$(git rev-parse --show-toplevel 2>/dev/null || echo "$PWD")
KNOWLEDGE_S3=$(node "$RUNWAY_TOOLS" knowledge-read --root "$PROJECT_ROOT" --inject-into-stage 3 --format prompt 2>/dev/null || echo "")
```

如果 `KNOWLEDGE_S3` 非空（包含 `<known-pitfalls>` 块），在 Step 3（Write the Plan）时：
- 对每个 pitfall，检查当前任务计划是否可能触发同类问题
- 如果可能触发，在对应任务的 Task Block 中加 `**Known Risk:**` 字段，引用 pitfall 摘要
- 如果 pitfall 要求额外任务（如"必须专门写 Converter 任务"），主动加入任务列表

## Step 1: Read Spec Context

Read `spec_context_path` from checkpoint:

```bash
SPEC_CONTEXT_PATH=$(jq -r '.spec_context_path // empty' .runway/checkpoint-*.json 2>/dev/null | head -1)
```

Read the local file at `$SPEC_CONTEXT_PATH`. Extract from its three sections:
- **接口设计** → 每个接口映射到至少一个实现任务；跨模块字段传递优先按 contract-first 顺序拆分
- **业务规则** → 每条规则映射到参数校验/错误码任务或已有任务的测试步骤
- **需求描述** → 理解业务意图，辅助代码库探索时找参照实现

Do not treat spec_context as file-level implementation truth. Focus on what needs to change, not how exactly.

## Step 2: Explore Codebase

Before writing any file path, verify it exists. Check:
- Relevant directory structure
- Existing similar implementations to reuse
- Test file conventions and locations
- Build/test/lint/typecheck commands
- Shared interfaces or files that would create wave conflicts

**Do not assume file paths. Verify first.**

**Language detection:** Before Step 2.5, detect the project's primary language by checking for these files in order:

```bash
# Check in project root:
[ -f pom.xml ] || [ -f mvnw ] && echo "java"
[ -f go.mod ]                  && echo "go"
[ -f package.json ]            && echo "typescript-or-javascript"
[ -f pyproject.toml ] || [ -f setup.py ] && echo "python"
```

Record the detected language as `PROJECT_LANG`. Use it in Step 2.5 to select the correct grep pattern.

## Step 2.5: Pre-Plan Dependency Verification

Before writing any task, verify all fields, methods, and classes referenced in the tech spec actually exist in the codebase. See `references/dependency-verification.md` for verification scripts, result classification, and fix patterns.

Three areas to verify:

1. **Field / method / class existence** — grep each symbol using the language-appropriate pattern based on `PROJECT_LANG` detected in Step 2:

   | Language | Grep command |
   |----------|-------------|
   | java | `grep -rn "$symbol" src/ --include="*.java"` |
   | go | `grep -rn "$symbol" . --include="*.go"` |
   | typescript-or-javascript | `grep -rn "$symbol" src/ --include="*.ts" --include="*.tsx" --include="*.js"` |
   | python | `grep -rn "$symbol" . --include="*.py"` |

   Classify each result as CONFIRMED / MISSING / ASSUMED. For each MISSING item, add a Wave 0 prerequisite task before proceeding. **Wave 0 grouping rule:** All MISSING items that have no dependency on each other go into the **same Wave 0** as parallel tasks. If MISSING item B depends on MISSING item A (e.g., a class must exist before a method on it can be added), place A in Wave 0 and B in Wave 0.1. Do not create a separate Wave 0 per MISSING item unless a dependency chain forces it.

2. **Cross-module field propagation** — for any new field that must flow across module boundaries (e.g., Request → BO → Converter → another module's BO → ES query), trace the **complete call chain end-to-end** before writing tasks:
   - List every hop: `ModuleA.ClassX` → `ModuleB.ClassY` → `ModuleC.ClassZ`
   - For each hop, identify whether the transformation is **auto-generated** (MapStruct, Lombok) or **hand-written** (manual converter/builder)
   - Hand-written converters are high-risk: create a **dedicated task** for each one, do not bundle with field-addition tasks
   - The plan must have a task for every hop — missing a middle converter is the most common source of "field silently dropped" bugs

3. **Reused method dependencies** — for every "reuse existing method X" decision, list ALL fields that X reads from its input objects and verify the new code path populates every required field.

Do not proceed to Step 3 until all MISSING items are either resolved as Wave 0 tasks or explicitly accepted as pre-conditions with a stated risk.

**Java Maven multi-module test commands:** Before writing test commands in tasks, check if the project is a Maven multi-module build:
```bash
# If pom.xml exists at root with <modules>, it's multi-module
grep -l "<modules>" pom.xml 2>/dev/null
```
For multi-module projects: sub-module tests require `mvn install -DskipTests` at the root first. Write tasks accordingly — either use root-level test commands (`mvn test -pl <module>` after install) or note the install prerequisite explicitly.

## Step 3: Write the Plan

See `references/plan-template.md` for full structure.

### Wave Assignment Rules

**Same wave (parallel):** tasks with no shared primary file, no shared interface-definition file, and no logical dependency between them.

**Different waves (serial):** task B depends on output of task A, both modify the same primary file, or both rely on a shared contract that one of them changes.

If in doubt, split into separate waves. Parallelism is optional; conflict-free execution is mandatory.

### Task Block Structure

```markdown
#### Task {N}.{M}: {Name}
**Primary File:** `{exact/path/to/file.ext}`
**Touches Files:** `{path1}`, `{path2}`
**Depends on:** `Task {X}.{Y}` or `none`
**Wave:** {N} — parallel with Task {N}.{X}
**Conflict Guard:** `No same-wave overlap with {files/interfaces}`

- [ ] Step 1: Implement
  ```{lang}
  {complete implementation — no placeholders}
  ```

- [ ] Step 2: Commit
  ```bash
  git add {file list}
  git commit -m "{type}: {description}"
  ```
```

### Wave completion section

For every wave, add an **Integration verification** block describing what must be run after all tasks in that wave finish. This check should confirm the wave's tasks work together before the next wave begins.

## Step 4: Self-Review

Run through `references/plan-review-checklist.md` before presenting. Key checks:
1. Every tech spec feature has ≥1 task
2. Zero placeholder scan (TBD / TODO / implement / placeholder / 待实现)
3. All file paths verified to exist or explicitly marked as new
4. Wave assignments valid — run automated conflict check (see below)
5. Dependencies are explicit and acyclic
6. Every wave has an integration verification step

### Wave Conflict Auto-Detection (mandatory before returning control)

For each wave, collect all primary files and verify uniqueness. If duplicates are found, follow this algorithm to auto-split:

1. **Identify conflicts:** For wave N, list all tasks sharing the same primary file. Group them: `conflicting_group = [Task N.A, Task N.B, …]`.
2. **Assign sub-wave numbers:** Promote the first task in the group to wave N (unchanged). Each subsequent conflicting task becomes wave N+0.1, N+0.2, … (or use the next available integer wave if N+0.1 collisions exist). Renumber all downstream waves accordingly to preserve ordering.
3. **Update dependencies:** For each promoted task (e.g., Task N.B now in wave N+0.1), add `Depends on: Task N.A` explicitly. Cascade: any task that previously depended on wave N now depends on the last sub-wave in the split group.
4. **Re-run the check:** After splitting, repeat the uniqueness check on all waves until no conflicts remain.

See `references/dependency-verification.md` for the detection pattern and fix procedure.

**Do NOT return the plan until all wave conflicts are resolved.** This check is mandatory, not optional.

## Step 5: Save and Return Plan

Save plan to: `.runway/plans/{YYYY-MM-DD}-{feature}.md`

在计划文档末尾追加「接口清单提纲」章节（供参考，Step 2c runway-tclist 将生成详细 HTTP 测试用例）：

```markdown
## 接口清单提纲（供参考）

本次涉及接口（PATH 来自技术方案 Step 4.5 完整化后）：

| HTTP 方法 | PATH | 描述 |
|----------|------|------|
| POST | /api/xxx/yyy | 接口功能描述 |

> 接口 HTTP 测试用例（TC- 编号）由 Step 2c runway-tclist 生成。
```

Present the wave summary and the saved plan path in a compact handoff block:
> "Plan ready: {N} waves, {M} tasks total.
> Wave 1 (parallel): {task list}
> Wave 2 (depends on Wave 1): {task list}
>
> Plan file: {plan_path}"

Return control to the orchestrator immediately after saving the plan so Stage 4 can start by default. If the caller explicitly asks for revisions, revise the plan and overwrite the saved output before returning.

## Terminal State

Plan saved and handed back to the orchestrator with `plan_path`. **Do NOT invoke runway-parallel-dev directly — the orchestrator handles stage transitions.**

## Additional Resources

- **`references/plan-template.md`** — Full plan document template with pre-plan verification tables
- **`references/plan-review-checklist.md`** — Self-review checklist including wave conflict and execution-readiness checks
- **`references/dependency-verification.md`** — Verification scripts, reused method analysis, wave conflict detection and fix patterns
