---
name: runway-task-planning
description: Converts a tech spec into a zero-placeholder implementation plan with wave-based parallel grouping, AC-driven TC lists, and TDD-ready task steps. Invoke this skill whenever the user wants to "break down tasks", "create implementation plan", "拆任务", "写执行计划", or after runway-tech-design is approved. Also trigger when the user asks "how do we implement this?" after a tech spec exists. Do NOT let the user skip straight to coding without a plan — this step generates the TC list that drives test coverage downstream.
version: 0.1.0
---

# Task Planning

Convert a tech spec into a zero-placeholder implementation plan. Each step is 2–5 minutes of work, includes complete code and commands, and is tagged with a wave for parallel execution.

Default behavior: save the implementation plan and return it immediately so Runway can auto-advance into Stage 4 branch creation. Do not wait for explicit user confirmation unless the caller explicitly asks for a review pause.

## When to Use

Activate after runway-tech-design is approved. Input: tech spec (markdown or xuecheng link). This is Stage 3 of the dev workflow.

## Core Rules

- **Zero placeholders:** Every step contains complete code, exact commands, expected output. No "TBD", "implement here", "TODO".
- **TDD order:** For every feature task — write failing test first, verify failure, then implement.
- **2–5 min granularity:** Each step is one atomic operation.
- **Wave tagging:** Mark which tasks can run in parallel (same wave = no file overlap, no logical dependency).
- **Zero-context assumption:** The plan must be executable by someone with no codebase knowledge.
- **Dependency explicitness:** Every task must declare what it depends on and what later work depends on it.
- **Conflict safety:** No two tasks in the same wave may modify the same primary file.

## Process

```
Read tech spec → Explore codebase → Map file structure → Write plan (with waves + dependencies) → Self-review → return control to runway orchestrator with plan path
```

## Step 1: Read Tech Spec

If xuecheng link provided:
```bash
oa-skills citadel getMarkdown --contentId <id> --mis <mis>
```

Extract: design constraints, interface contracts, module boundaries, rollout/risk constraints, and open decisions that affect implementation sequencing.

Do not treat the tech spec as file-level implementation truth.

If an ADR is provided, read it for decision rationale and non-negotiable constraints.

Then convert the approved Stage 2 formal sections into explicit planning coverage instead of relying on implicit understanding alone:
- `二、详细设计` → 每个模块至少映射到一个任务或显式写明无需单独任务的原因
- `三、接口协议变更` → 每个接口 / API / 事件 / 数据契约变化至少映射到一个任务；若存在跨模块契约变化，优先按 contract-first 顺序拆分
- `四、基础设施设计` → 每个“涉及”的配置 / 存储 / 消息 / 定时任务 / 外部依赖项，必须归类为任务、前置条件，或显式写“不需要任务 — 原因”
- `五、验证策略` → 每个关键风险必须映射到任务内测试步骤或 Wave integration verification
- `六、待决策项` → 每项必须归类为：已解决 / Wave 0 前置 / blocker / 风险接受

Keep Stage 2 and Stage 3 boundaries intact: do not add a new Stage 2 handoff chapter, and do not turn the tech spec into an execution plan.

### Step 1.5: Extract AC Table and Generate TC List

If the requirements spec contains an AC table (columns: AC编号, Given, When, Then, 覆盖需求, 优先级), extract it and generate a TC list before writing any tasks.

For each AC row, generate one or more TC entries:
- TC编号 format: `TC-{AC编号}-{a/b/c…}` (e.g. AC-01 → TC-01-a, TC-01-b)
- Inherit Given/When/Then from the AC; supplement with concrete input values and assertion fields from the tech spec interface contracts
- Inherit priority from the AC (P0/P1)
- Assign each TC to the most relevant task

Write the TC list to `.runway/tmp/tc-list.md` before proceeding to Step 2:

```markdown
# TC List

| TC编号   | AC编号 | Given              | When               | Then（断言条件）        | 优先级 | 归属任务 |
|---------|--------|--------------------|--------------------|----------------------|--------|--------|
| TC-01-a | AC-01  | {具体前置条件}       | {具体调用/操作}      | {具体可断言的结果}      | P0     | Task 1 |
| TC-01-b | AC-01  | {边界/异常前置条件}  | {具体调用/操作}      | {降级/异常结果}         | P0     | Task 1 |
```

If no AC table exists in the requirements spec, skip this step and proceed to Step 2 without TC list generation. Do not invent ACs.

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

   Classify each result as CONFIRMED / MISSING / ASSUMED. For each MISSING item, add a Wave 0 prerequisite task before proceeding.

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

- [ ] Step 1: Write failing test
  ```{lang}
  {complete test code — no placeholders}
  ```
  Run: `{exact command}`
  Expected: FAIL — `{exact failure message}`

- [ ] Step 2: Verify test fails
  Run: `{exact command}`
  Confirm: `{failure keyword}`

- [ ] Step 3: Implement
  ```{lang}
  {complete implementation — no placeholders}
  ```

- [ ] Step 4: Verify test passes
  Run: `{exact command}`
  Expected: PASS

- [ ] Step 5: Commit
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

For each wave, collect all primary files and verify uniqueness. If duplicates are found, auto-split the conflicting tasks into sequential sub-waves before returning control to the orchestrator. See `references/dependency-verification.md` for the detection pattern and fix procedure.

**Do NOT return the plan until all wave conflicts are resolved.** This check is mandatory, not optional.

## Step 5: Save and Return Plan

Save plan to: `.runway/plans/{YYYY-MM-DD}-{feature}.md`

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
