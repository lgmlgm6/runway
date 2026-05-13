---
name: runway-tech-design
description: Produces a review-ready technical spec via an admission-based review path (Level 0 Planner-only by default, Level 1 Planner→Architect, Level 2 Planner→Architect→Critic), then uploads the approved spec to xuecheng. Invoke this skill whenever the user wants to "design technical solution", "write tech spec", "做技术方案", "写技术设计", or after runway-prd-analysis completes. Also trigger when the user asks to review or improve an existing technical approach. Do NOT skip this skill for "simple" features — the admission model automatically keeps lightweight tasks fast.
version: 0.1.0
---

# Tech Design

Produce a high-quality technical solution through an admission-based review path, upload the approved result to xuecheng, and return control to the calling orchestrator after the Hard Gate is satisfied.

<HARD-GATE>
Do not proceed to runway-task-planning until the tech spec is explicitly approved by the user.
</HARD-GATE>

## When to Use

Activate after runway-prd-analysis completes. Input: requirements spec (xuecheng link or markdown). This is Stage 2 of the dev workflow.

**编排器传入的额外参数（Step 4.5 使用）：**
- `papi_base_url` — 新增接口 PATH 前缀，来自 project.json（如 `/api/freelance`）；缺失时新增接口 PATH 不加前缀

## Process

```
Read requirements spec
    ↓
Quick admission scan
    ↓
Admission decision (L0 / L1 / L2) + deliberate-mode overlay if needed
    ↓
Targeted exploration only as required by the admitted level
    ↓
Execute only the required review path
    ├─ Level 0: Planner only
    ├─ Level 1: Planner → Architect
    └─ Level 2: Planner → Architect → Critic
    ↓
[deliberate] → pre-mortem + full test planning
    ↓
[ADR-triggered] → optional ADR capture
    ↓
Self-review → User review (HARD GATE) → [changes?] → Knowledge Capture → citadel upload → return control to runway orchestrator
                                                             ↓
                                                      [no changes: skip]
```

Use a lightweight-by-default 3-level admission model.
Stage 2 still produces the same review-friendly tech spec artifact for every level; lightweight mode changes depth, not deliverable type.
Start with a quick admission scan rather than the full Code Reality Report.
For Level 0, prefer concise section content grounded in repo facts instead of exhaustive inventories or reviewer-style essays.
If a required section has no meaningful change, write a brief explicit reason rather than expanding it for completeness theatre.

Only Step 6 (User Review) is a user pause point. Steps 1-5 and Step 7 must continue in the same turn unless a true blocker is hit.
Do not ask the user whether to continue before Step 6. Do not wait for "继续" or similar confirmation before the Hard Gate.
Step 4 (deliberate mode) and Step 5 (self-review) are internal quality steps, not review pauses or confirmation points.

## Step 0.5: Load Project Knowledge

```bash
RUNWAY_TOOLS="${CLAUDE_PLUGIN_ROOT:+${CLAUDE_PLUGIN_ROOT}/skills/runway/bin/runway-tools.cjs}"
RUNWAY_TOOLS="${RUNWAY_TOOLS:-$HOME/.claude/skills/runway/bin/runway-tools.cjs}"
PROJECT_ROOT=$(git rev-parse --show-toplevel 2>/dev/null || echo "$PWD")
KNOWLEDGE_S2=$(node "$RUNWAY_TOOLS" knowledge-read --root "$PROJECT_ROOT" --inject-into-stage 2 --format prompt 2>/dev/null || echo "")
```

如果 `KNOWLEDGE_S2` 非空，将其拼接到 Planner prompt 中 `<code-reality-report>` 之前：

```
{KNOWLEDGE_S2}

<requirements>
{REQUIREMENTS_SPEC}
</requirements>

<code-reality-report>
{CODE_REALITY_REPORT}
</code-reality-report>
```

这确保 Planner 在起草方案前就知道本项目的业务约束和历史纠正记录。

## Step 1: Read Requirements Spec + Lightweight Admission Scan

If a xuecheng link is provided:
```bash
oa-skills citadel getMarkdown --contentId <id> --mis <mis>
```

Extract: core features, constraints, acceptance criteria, open questions.

Start with a quick admission scan rather than the full Code Reality Report. The scan should identify only the minimum repo facts needed to classify the work:
1. The likely owner module / service / page for the feature
2. The primary entrypoint or main flow that will change
3. Whether there are clear interface / storage / external dependency changes
4. Whether there is unresolved uncertainty that justifies deeper exploration before drafting

### Exploration depth by admitted level

- **Level 0** — routine work should stay focused. Level 0 should stay on a focused exploration path: only inspect the exact modules, contracts, and dependencies needed to draft the current solution.
- **Level 1 / Level 2** — expand into the full Code Reality Report so the review stays grounded in repo facts.
- **Level 0 with clear unresolved uncertainty** — expand only the missing parts needed to remove that uncertainty; do not default to a full-repo inventory.

Only Level 1/2, or Level 0 work with clear unresolved uncertainty, should expand into the full Code Reality Report.

When deeper exploration is required, the full Code Reality Report must cover:
1. **Interface map** — for each feature, which exact method/class owns it (file path + method signature)
2. **DTO/BO field inventory** — for each mentioned model, all existing fields (including inherited ones)
3. **Converter/Mapper inventory** — for each transformation hop, whether it is MapStruct-generated or hand-written
4. **Cross-module call chains** — for fields crossing module boundaries, the full end-to-end path

Pass the admission scan and any deeper exploration findings into the Planner prompt as `{CODE_REALITY_REPORT}`.
After Step 1 and Step 2 complete, continue directly into the admitted review path in the same turn. Do not stop after scan results, admission choice, or exploration notes.

## Step 2: Admission Decision

Classify the work on two independent axes: **review level** (L0/L1/L2) and **deliberate mode** (standard/high-risk).

See `references/admission-rules.md` for full classification rules, boundary examples, deliberate mode triggers, and ADR trigger criteria.

## Artifact Boundary

Stage 2 produces a review-friendly tech spec, not an executable implementation plan.

Keep outward-facing interface/API contract changes in this document, but leave internal parameter details, concrete class names, file paths, field numbers, test code, Wave splitting, and TDD task steps to runway-task-planning.

Split the reviewer-facing document with clear section ownership:
- **二、详细设计** — 只写实现方案、业务逻辑、关键流程、状态变化、模块边界
- **三、接口协议变更** — 只写对外请求/响应或契约变化、兼容性说明；若只是模块内参数、内部 RPC、内部事件、内部数据结构调整，不写在这里；但若是对外暴露的 Thrift/RPC 能力（需要经 Shepherd / PAPI 暴露、供前端或外部系统调用），则属于对外接口契约，必须写在这里
- **七、架构ADR** — 仅在 ADR 触发时提供紧凑决策表，直观写出方案对比、选型依据、决策理由

Place rollout or risk notes inside the most relevant required section.

## Step 3: Admission-Based Review Path

**Before starting the review path**, record the triangle-loop state so Runway can resume cleanly if the session is interrupted:

```bash
RUNWAY_TOOLS="${CLAUDE_PLUGIN_ROOT:+${CLAUDE_PLUGIN_ROOT}/skills/runway/bin/runway-tools.cjs}"
RUNWAY_TOOLS="${RUNWAY_TOOLS:-$HOME/.claude/skills/runway/bin/runway-tools.cjs}"
node "$RUNWAY_TOOLS" loop-init \
  --root "$PROJECT_ROOT" \
  --stage 2 \
  --session-id "${CLAUDE_SESSION_ID:-$(date +%s%N)}" \
  --started-at "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  --prompt-text "你是 runway-tech-design 的主编排器，Stage 2 方案评审正在进行中。立即从当前位置继续：如果尚未完成准入判断 → 完成 L0/L1/L2 与 deliberate mode 判定；如果 Planner 未完成 → 继续运行；Level 1/2 且 Architect 未运行 → 运行 Architect；Level 2 且 Critic 未运行 → 运行 Critic；达到结束条件 → Step 4 deliberate → Step 5 自检 → Step 6 Hard Gate → Step 7 上传学城 → 停用 triangle state → 返还控制权。不要等待用户确认，直接推进。"
```

This state file is resume metadata for Stage 2 only. Unlike the Stage 5-12 pipeline loop, it should not block user exit.

**Loop lifecycle:** Keep the triangle state active through Step 4-7 so resume context survives interruption. This means the metadata may remain present while later stages run; it does **not** mean the Stop hook should protect Stage 2 exit. Deactivate it only **after** explicit Hard Gate approval and successful xuecheng upload.

**Skip rule:** Level 0 may stay Planner-only. Once work is admitted to Level 1 or Level 2, the required review passes cannot be skipped.

### Mandatory output structure

Sections 一到六 are required; 七、架构ADR appears only when ADR trigger fires. See `references/tech-spec-template.md` for the full structure and field-level guidance.

### Execution: Agent-based admission path

Run each pass as a **separate subagent** via the `Agent` tool. Do not perform these passes yourself.
When using subagents, await each required result and continue in the same turn. Do not stop after dispatching Planner, Architect, or Critic.

**CRITICAL sequencing rule:** Architect and Critic MUST run sequentially. Always await the Architect result before issuing the Critic task.

#### Pass 1 — Planner (draft)

Read the full Planner prompt from `references/review-agent-prompts.md` → **Pass 1 — Planner** section. Substitute `{REQUIREMENTS_SPEC}` and `{CODE_REALITY_REPORT}` before dispatching.

After Pass 1 completes, output the progress summary format defined in `references/review-convergence.md`. Continue in the same turn — do not stop for user confirmation.

#### Pass 2 — Architect (technical review)

**Await Pass 1 result before starting this pass. Only required for Level 1 and Level 2.**

Read the full Architect prompt from `references/review-agent-prompts.md` → **Pass 2 — Architect** section. Substitute `{PLANNER_OUTPUT}` before dispatching.

#### Pass 3 — Critic (gap and failure mode analysis)

**Await Pass 2 result before starting this pass. Only required for Level 2.**

Read the full Critic prompt from `references/review-agent-prompts.md` → **Pass 3 — Critic** section. Substitute `{PLANNER_OUTPUT}` and `{ARCHITECT_OUTPUT}` before dispatching.

#### Admission-specific convergence rules

See `references/review-convergence.md` for full convergence rules per level (L0/L1/L2), revision caps, progress display formats, and the targeted Planner revision prompt.

## Step 4: Deliberate Mode Additions (high-risk only)

**Pre-mortem:** "Assume a serious incident occurs post-launch. What are the top 3 most likely causes?" List causes + preventions.

**Full test plan:** unit / integration / E2E / performance baselines / rollback procedure.

**Rollout readiness:** define blast-radius controls, success metrics, rollback trigger, and who owns launch observation.

See `references/deliberate-checklist.md` for full checklist.

## Step 4.5: 接口分类与新增接口 PATH 生成（Step 2b 前置）

对「三、接口协议变更」中的每个接口标注变更类型（新增/修改/删除），为新增接口生成语义 PATH，存量修改接口 URL 路径留空由 Step 2b 匹配。

See `references/interface-path-completion.md` for full classification rules, PATH generation format, AC table backfill, and completion criteria.

## Step 5: Self-Review

Run through all 15 items in `references/self-review-checklist.md` before presenting to the user.

## Step 6: User Review (HARD GATE)

Before presenting the spec, save a snapshot of the current draft so changes can be detected later:

```bash
mkdir -p .runway/tmp
cat > .runway/tmp/spec-draft-stage2.md << 'DRAFT_EOF'
{COMPLETE_TECH_SPEC_CONTENT}
DRAFT_EOF
```

Output the **complete tech spec in full** — every section, no summarizing, no truncating. Then ask the user to confirm:

---

{COMPLETE_TECH_SPEC_CONTENT}

---

> 请 review 完整方案后确认：
> 1. 技术方案方向是否正确？
> 2. 是否符合团队规范？
> 3. 风险是否可接受？
>
> 确认后将上传学城并进入任务规划阶段。

If changes are requested: revise the spec, re-run the required admission path from Pass 1, then re-present the full spec at this gate. Only proceed on explicit approval.

## Step 6.5: Knowledge Capture — Stage 2 Hard Gate

Run after user approves, before uploading. Skip entirely if the user approved with no modifications.

See `references/knowledge-capture.md` for diff detection logic, classification rules, user confirmation flow, and the knowledge-append command.

## Step 7: Upload to Xuecheng (after user confirms)

Upload as a child document under the parent document provided at workflow start:

```bash
oa-skills citadel createDocument \
  --title "{feature} - 技术方案" \
  --content "{markdown}" \
  --parentId <parent-content-id> \
  --mis <mis>
```

Record the returned `contentId` and construct the xuecheng link: `https://km.sankuai.com/collabpage/{contentId}`

Print the xuecheng link to the user:

> 技术方案已上传学城：https://km.sankuai.com/collabpage/{contentId}

Then deactivate the triangle-loop state:

```bash
RUNWAY_TOOLS="${CLAUDE_PLUGIN_ROOT:+${CLAUDE_PLUGIN_ROOT}/skills/runway/bin/runway-tools.cjs}"
RUNWAY_TOOLS="${RUNWAY_TOOLS:-$HOME/.claude/skills/runway/bin/runway-tools.cjs}"
node "$RUNWAY_TOOLS" state-update --root "$PROJECT_ROOT" --name triangle-loop.local.md --active false
```

## Terminal State

Tech spec uploaded, user approved. Return control to the calling orchestrator. **Do NOT invoke runway-task-planning directly — the orchestrator handles stage transitions.**

## Additional Resources

- **`references/tech-spec-template.md`** — Full tech spec structure with field guidance
- **`references/deliberate-checklist.md`** — Pre-mortem and full test planning checklist
- **`references/self-review-checklist.md`** — 15-item self-review checklist for Step 5
- **`references/admission-rules.md`** — L0/L1/L2 classification rules, deliberate mode triggers, ADR criteria
- **`references/review-convergence.md`** — Convergence rules per level, revision caps, progress display
- **`references/interface-path-completion.md`** — PATH generation, AC backfill, completion criteria
- **`references/knowledge-capture.md`** — Hard Gate diff detection, classification, knowledge-append command
