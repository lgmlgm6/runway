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
KNOWLEDGE_S2=$(node "$RUNWAY_TOOLS" knowledge-read --root "$PWD" --inject-into-stage 2 --format prompt 2>/dev/null || echo "")
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

Classify the work on two independent axes before writing the tech spec:
1. **Review level** — how much design review is required (`Level 0 / Level 1 / Level 2`)
2. **Deliberate mode** — whether high-risk rollout / pre-mortem / full test-planning rigor must be added

### Review level selection

- **Level 0 (default)** — routine / localized / familiar changes with clear requirements, bounded module impact, and no material architectural uncertainty → **Planner only**
- **Level 1** — non-trivial design review is needed (for example interface/API contract changes, several modules touched, meaningful rollout/observability questions, or a real design tradeoff) → **Planner → Architect**
- **Level 2** — genuinely high-risk or high-uncertainty work (for example auth/security changes, schema/data migration, core architecture shifts, feature affecting >100k DAU, multi-system integration across 3+ external systems, or unresolved design contention) → **Planner → Architect → Critic**

Escalate only when the design risk justifies it. Do not send routine work through the heaviest path by default.

### Deliberate mode trigger rule

Trigger **deliberate mode** if any of the following apply:
- Data migration or schema changes
- Auth / permissions / security mechanisms
- Core architecture changes
- Feature affecting >100k DAU
- Multi-system integration (3+ external systems)

Otherwise use **standard mode**.

Level 2 and deliberate mode often overlap, but they are not identical decisions: Level 2 controls review depth; deliberate mode adds pre-mortem, rollout-readiness, and full test-planning rigor.

### Trigger recording rule

For every deliberate-mode trigger, record the source as one of:
- **Observed** — directly stated in the requirements spec
- **Inferred** — not stated directly, but strongly implied by the requirements or existing system
- **User-confirmed** — confirmed explicitly during review

If trigger evidence is weak, call it out instead of silently guessing.

### ADR trigger rule

ADR is optional. Generate a separate ADR only when the decision itself needs long-term traceability.

Generate an ADR when any of the following apply:
- 3+ serious alternatives were evaluated and the final rationale is likely to be revisited later
- The decision changes module boundaries, shared contracts, or cross-team interfaces and the rationale must remain traceable
- The decision introduces a hard-to-reverse platform, storage, or dependency choice
- The user explicitly asks to preserve a decision record

If none apply, keep the rationale in the tech spec only and do not force an ADR artifact.
When ADR is not triggered, keep any decision rationale inside the relevant required sections and do not label it as ADR.
When ADR is not triggered, do not emit `七、架构ADR`, `ADR`, or the table headers `方案对比 | 选型依据 | 决策理由` anywhere in the output.

## Artifact Boundary

Stage 2 produces a review-friendly tech spec, not an executable implementation plan.

Keep outward-facing interface/API contract changes in this document, but leave internal parameter details, concrete class names, file paths, field numbers, test code, Wave splitting, and TDD task steps to runway-task-planning.

Split the reviewer-facing document with clear section ownership:
- **二、详细设计** — 只写实现方案、业务逻辑、关键流程、状态变化、模块边界
- **三、接口协议变更** — 只写对外请求/响应或契约变化、兼容性说明；若只是模块内参数、内部 RPC、内部事件、内部数据结构调整，不写在这里
- **七、架构ADR** — 仅在 ADR 触发时提供紧凑决策表，直观写出方案对比、选型依据、决策理由

Place rollout or risk notes inside the most relevant required section.

## Step 3: Admission-Based Review Path

**Before starting the review path**, record the triangle-loop state so Runway can resume cleanly if the session is interrupted:

```bash
RUNWAY_TOOLS="${CLAUDE_PLUGIN_ROOT:+${CLAUDE_PLUGIN_ROOT}/skills/runway/bin/runway-tools.cjs}"
RUNWAY_TOOLS="${RUNWAY_TOOLS:-$HOME/.claude/skills/runway/bin/runway-tools.cjs}"
mkdir -p .runway/tmp
cat > .runway/tmp/triangle-loop-prompt.md << 'EOF'
你是 runway-tech-design 的主编排器，Stage 2 方案评审正在进行中。立即从当前位置继续：

- 如果尚未完成准入判断 → 完成 L0 / L1 / L2 与 deliberate mode 判定
- 如果 Planner 尚未完成 → 继续运行 Planner
- 如果当前为 Level 1 或 Level 2，且 Architect 尚未运行 → 运行 Architect，展示完整审查结果
- 如果当前为 Level 2，且 Critic 尚未运行 → 运行 Critic，展示完整审查结果
- 如果当前为 Level 1，且存在阻断性的 [MUST] 项且尚未完成一次定向修订 → 带上修订清单重新运行 Planner，然后再次运行 Architect
- 如果当前为 Level 2，且 Critic 返回 ITERATE/REJECT 且尚未完成一次定向修订 → 带上修订清单重新运行 Planner，然后再次运行 Architect → Critic
- 如果达到当前级别的结束条件 → 继续 Step 4（deliberate mode）→ Step 5（自检）→ Step 6（展示方案 + Hard Gate）→ Step 7（用户确认后上传学城）→ 停用 triangle state → 将控制权交还给主 orchestrator

中途展示 Planner / Architect / Critic 结果后，必须在同一轮继续推进；不要把这些展示当成暂停点或确认点。
不要等待用户确认。不要询问是否继续。直接推进到下一个待执行步骤。
EOF
node "$RUNWAY_TOOLS" state-init \
  --root "$PWD" \
  --name triangle-loop.local.md \
  --mode triangle \
  --max-iterations 20 \
  --session-id "${CLAUDE_SESSION_ID:-$(date +%s%N)}" \
  --started-at "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  --prompt-file .runway/tmp/triangle-loop-prompt.md
```

This state file is resume metadata for Stage 2 only. Unlike the Stage 4-7 pipeline loop, it should not block user exit.

**Loop lifecycle:** Keep the triangle state active through Step 4-7 so resume context survives interruption. This means the metadata may remain present while later stages run; it does **not** mean the Stop hook should protect Stage 2 exit. Deactivate it only **after** explicit Hard Gate approval and successful xuecheng upload.

**Skip rule:** Level 0 may stay Planner-only. Once work is admitted to Level 1 or Level 2, the required review passes cannot be skipped.

### Mandatory output structure

The Planner's draft and every later revision must follow the structure below. Sections 一到六 are required. **七、架构ADR** is optional and should appear only when the ADR trigger fires.

**一、背景与目标**
- 需求背景、设计目标、范围边界、关键信息来源
- complex 方案可在本节补一张总览 Mermaid 图，帮助 reviewer 快速建立整体认知

**二、详细设计** — 只写实现方案、业务逻辑、关键流程、状态变化、模块边界
- **模块总览** — 改动模块列表，含风险级别
- **每个模块** — 改动目标、设计说明（含必要的数据/状态变化）、模块级图示（按需）、实现边界

**三、接口协议变更** — 只写对外请求/响应或契约变化、兼容性说明
- 按对外接口 / API 逐项列出，明确写出改的是哪个接口
- request/input 与 response/output 分开写
- 每个新增 / 修改 / 删除字段至少写清：字段名、数据类型、字段含义
- 不要用大段文字笼统概括接口变更
- 若只是模块内参数、内部 RPC、内部事件、内部数据结构调整，不写在这里
- 若无变化，明确写“无接口协议变更 — 原因”

**四、基础设施设计**
- **配置（Lion）/ 存储（DB / Cache / ES）/ 消息（Mafka）/ 定时任务（Crane）/ 外部依赖**
- 涉及则必填；不涉及写 "不涉及 — 原因"；不得留空

**五、验证策略（Test Strategy）** — 含覆盖风险列，与关键风险互相映射

**六、待决策项（Open Decisions）** — 含负责人和确认时间

**七、架构ADR** — 仅在 ADR 触发时提供紧凑决策表，直观写出方案对比、选型依据、决策理由
- 未触发 ADR 时不要创建这一节

See `references/tech-spec-template.md` for the full structure.

### Execution: Agent-based admission path

Run each pass as a **separate subagent** via the `Agent` tool. Do not perform these passes yourself.
When using subagents, await each required result and continue in the same turn. Do not stop after dispatching Planner, Architect, or Critic.

**CRITICAL sequencing rule:** Architect and Critic MUST run sequentially. Always await the Architect result before issuing the Critic task.

#### Pass 1 — Planner (draft)

```
Agent(
  subagent_type="general-purpose",
  model="opus",
  prompt="""You are Planner. Your mission: produce an initial tech spec draft.

Role constraints:
- Draft only. Do NOT review or critique.
- Sections 一到六 must be present and non-empty. Section 七（架构ADR） is optional and appears only when the ADR trigger fires.
- No placeholders (TBD, 待定, TODO). Use a concrete answer or an explicit "Not applicable — reason."
- Exclude runway-task-planning detail: file paths, concrete class names, field numbers, test code, Wave splitting, and TDD task steps.
- Keep outward-facing interface/API contract changes in the tech spec; keep internal parameter details out of this section.
- Keep section ownership strict: 详细设计写实现方案与模块边界；接口协议变更只写对外请求/响应或契约变化、兼容性说明。 Internal RPCs, internal events, and module-local parameter changes do not belong there. Do not duplicate content.
- If ADR is not triggered, keep decision rationale in the relevant required sections only. Do not label any content as `ADR`, do not emit `七、架构ADR`, and do not emit the table headers `方案对比 | 选型依据 | 决策理由`.
- If `七、架构ADR` appears, use a compact table with 方案对比 / 选型依据 / 决策理由.
- Keep rollout or risk notes inside the most relevant required section.

Requirements spec:
<requirements>
{REQUIREMENTS_SPEC}
</requirements>

Code reality report:
<code-reality-report>
{CODE_REALITY_REPORT}
</code-reality-report>

Mandatory output structure:

一、背景与目标
- 需求背景、设计目标、范围边界、关键信息来源
- complex 方案可补一张总览 Mermaid 图，帮助 reviewer 快速建立整体认知

二、详细设计
- 模块总览：表格，含模块名 / 改动概述 / 风险级别 / 来源
- 每个模块展开（M1 / M2 ...）：改动目标、设计说明（含必要的数据/状态变化）、模块级图示（按需）、实现边界

三、接口协议变更
- 按对外接口 / API 逐项列出，明确写出改的是哪个接口
- request/input 与 response/output 分开写
- 每个新增 / 修改 / 删除字段至少写清：字段名、数据类型、字段含义
- 不要用大段文字笼统概括接口变更
- 若只是模块内参数、内部 RPC、内部事件、内部数据结构调整，不写在这里
- 若无变化，明确写“无接口协议变更 — 原因”

四、基础设施设计
- 配置（Lion）/ 存储（DB / Cache / ES）/ 消息（Mafka）/ 定时任务（Crane）/ 外部依赖
- 涉及则必填；不涉及写 "不涉及 — 原因"；不得留空

五、验证策略（Test Strategy）
- 表格含覆盖风险列，与关键风险互相映射

六、待决策项（Open Decisions）
- 含负责人和确认时间

七、架构ADR（仅在 ADR 触发时出现）
- 紧凑表格，至少含方案对比 / 选型依据 / 决策理由

Output the complete tech spec draft. Nothing else."""
)
```

**After Pass 1 completes, output a progress summary before proceeding to the next required pass:**

```
## 📝 Planner 草稿完成（第 N 轮）

- 主线设计：{一句话概括当前实现方案}
- 主要影响模块：{模块列表}
- 接口协议变更：{有 / 无，若有列出关键接口}
- ADR：{未触发 / 已触发}
- 当前准入级别：{Level 0 / Level 1 / Level 2}
- Level 0 → 进入自检；Level 1 / Level 2 → 开始 Architect 技术审查
- 这是进度同步，不是暂停点。输出后不得停下等待用户确认；必须在同一轮继续进入下一个必需步骤。
```

中途展示 Planner / Architect / Critic 结果时，仅用于透明同步，不是确认点，也不是新的 Hard Gate。
展示后必须在同一轮继续执行下一步；除非已经到达 Step 6 Hard Gate 或遇到真正 blocker，否则不得停下来等待用户回复。


#### Pass 2 — Architect (technical review)

**Await Pass 1 result before starting this pass. Only required for Level 1 and Level 2.**

```
Agent(
  subagent_type="general-purpose",
  model="sonnet",
  prompt="""You are Architect. Your mission: technical review of this tech spec draft.

Role constraints:
- READ-ONLY. Do not rewrite the spec.
- Cite a specific section or quote for every finding.
- Provide the strongest steelman antithesis against the favored direction.
- Surface at least one real tradeoff tension.
- Tag every finding: [MUST], [SUGGEST], or [OPTIONAL].

Tech spec to review:
<tech-spec>
{PLANNER_OUTPUT}
</tech-spec>

Review for:
- Module boundary clarity and single responsibility
- Scalability and extensibility under realistic load
- Technical debt introduced and its long-term cost
- Conformance with existing architecture patterns
- Whether `二、详细设计` and `三、接口协议变更` have clear ownership without duplicated content
- Whether interface / compatibility changes are concrete enough for reviewers to judge upstream and downstream impact
- Whether infrastructure notes and verification strategy are concrete enough to execute
- If `七、架构ADR` exists, whether the comparison and rationale are fair rather than strawmen

Output format:
## Architect Review

**Antithesis (steelman):** [Strongest counterargument against the favored approach]
**Tradeoff tension:** [Meaningful tension the spec must address]

**[MUST] Findings:**
1. [Section/quote] — [issue] — [required fix]

**[SUGGEST] Findings:**
1. [Section/quote] — [issue] — [suggested fix]

**[OPTIONAL] Findings:**
1. [Section/quote] — [observation]"""
)
```

#### Pass 3 — Critic (gap and failure mode analysis)

**Await Pass 2 result before starting this pass. Only required for Level 2.**

```
Agent(
  subagent_type="general-purpose",
  model="sonnet",
  prompt="""You are Critic — the final quality gate, not a helpful assistant providing feedback.

Role constraints:
- READ-ONLY. Do not rewrite the spec.
- A false approval costs 10-100x more than a false rejection.
- Be direct. No politeness padding or praise.
- Evaluate what ISN'T present as much as what IS.

Tech spec:
<tech-spec>
{PLANNER_OUTPUT}
</tech-spec>

Architect findings:
<architect-review>
{ARCHITECT_OUTPUT}
</architect-review>

Investigation protocol:
1. Predict 3-5 likely failure modes before detailed reading.
2. Verify technical claims against referenced modules/interfaces/patterns.
3. Run a pre-mortem: "Assume this design was implemented exactly as written and failed post-launch. What are the top 3 most likely causes?"
4. Ask: what's missing, which edge case is uncovered, which assumption may be wrong?
5. Check whether Architect [MUST] items were actually addressed; escalate if not.
6. Readability check — can a reviewer read this in 10 minutes and decide?

Verdict options: APPROVE / ITERATE (revisions needed) / REJECT (fundamental issues)

Output format:
**VERDICT: [APPROVE / ITERATE / REJECT]**

**Pre-commitment predictions:** [What you expected vs what you found]

**Critical findings** (blocks approval):
1. [Quote/section] — [issue] — [required fix]

**Major findings** (significant rework needed):
1. [Quote/section] — [issue] — [fix]

**What's Missing:**
- [Gap 1]
- [Gap 2]

**Pre-mortem scenarios:**
1. [Failure scenario] — [does the spec address it? yes/no]

**Verdict justification:** [Why this verdict. What must change for an upgrade.]"""
)
```

#### Admission-specific convergence rules

**After each Architect pass, display findings to the user immediately, then continue in the same turn unless Step 6 Hard Gate or a true blocker has been reached:**

```
## 🔍 架构师审查结果（第 N 轮）

{ARCHITECT_OUTPUT — 完整展示，不要截断}
```

**After each Critic pass, display verdict and findings to the user immediately, then continue in the same turn unless Step 6 Hard Gate or a true blocker has been reached:**

```
## ⚖️ 挑战者审查结果（第 N 轮）

{CRITIC_OUTPUT — 完整展示，不要截断}
```

**Level 0:**
- Planner completes → proceed directly to Step 5 self-review.

**Level 1:**
- Planner → Architect.
- If Architect has no blocking `[MUST]` items, proceed to Step 5 self-review.
- If Architect returns blocking `[MUST]` items, run one targeted Planner revision addressing all `[MUST]` items, then run Architect once more and stop there.

**Level 2:**
- Planner → Architect → Critic.
- If Critic verdict is **APPROVE**, proceed to Step 4.
- If Critic verdict is **ITERATE** or **REJECT**, collect all Architect `[MUST]` items plus Critic Critical/Major findings, run one targeted Planner revision, then rerun Architect → Critic once more.
- Level 2 is capped at **at most one revision cycle** and **2 total cycles**. Do not keep looping after the second cycle; present the best version plus unresolved issues to the user.

If a targeted Planner revision is required, treat it as an internal repair step, then continue immediately to the required next pass in the same turn.

Use this revision prompt whenever a targeted Planner revision is required:

```
Agent(
  subagent_type="general-purpose",
  model="opus",
  prompt="""You are Planner. Revise the tech spec based on review feedback.

Previous spec:
<tech-spec>
{PREVIOUS_PLANNER_OUTPUT}
</tech-spec>

Required revisions (address ALL of these):
<revisions>
{ARCHITECT_MUST_ITEMS}
{CRITIC_CRITICAL_AND_MAJOR_FINDINGS}
</revisions>

Output the complete revised tech spec. All mandatory sections must remain present. No placeholders."""
)
```

If unresolved issues remain after the allowed review cycles, include them in the Step 6 Hard Gate presentation instead of creating a separate pre-Hard-Gate stop.

## Step 4: Deliberate Mode Additions (high-risk only)

**Pre-mortem:** "Assume a serious incident occurs post-launch. What are the top 3 most likely causes?" List causes + preventions.

**Full test plan:** unit / integration / E2E / performance baselines / rollback procedure.

**Rollout readiness:** define blast-radius controls, success metrics, rollback trigger, and who owns launch observation.

See `references/deliberate-checklist.md` for full checklist.

## Step 5: Self-Review

1. 一到六必填章节均已填写；七、架构ADR 仅在 ADR 触发时出现
2. `二、详细设计` 只写实现方案、业务逻辑、关键流程、状态变化、模块边界
3. `三、接口协议变更` 只写对外请求/响应或契约变化、兼容性说明；与详细设计无重复叙述；若只是模块内参数、内部 RPC、内部事件、内部数据结构调整，不写在这里；若存在接口协议变更，每个新增/修改/删除字段已写清字段名、数据类型、字段含义；request/input 与 response/output 已分开列出
4. complex 方案：在 `一、背景与目标` 已提供足够的整体视图，必要时补至少一张 Mermaid 图
5. 每个模块：满足补图条件时已在模块内补图（异步链路 / 复杂状态流转 / 多存储协同）
6. 基础设施各章节：涉及则填写，不涉及明确写原因，无留空
7. 验证策略包含覆盖风险列，并覆盖关键实现风险或兼容性风险
8. Readability check — can a reviewer read this in 10 minutes and decide? 无代码、字段编号、文件路径、Wave / TDD 等执行细节。
9. 每条接口定义无歧义，可直接用于任务拆解
10. 若存在 `七、架构ADR`，其表格已直接写清方案对比、选型依据、决策理由
11. 无 TBD、待定、后续确认等模糊占位符
12. 触发来源已记录（deliberate 模式下必填）

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

Run this step after the user approves, before uploading to xuecheng. Its purpose is to surface what the user changed so that the same corrections don't need to happen again next time.

**If the user approved with no modifications, skip this step entirely.**

### Detect and extract changes

Compare the saved draft (`.runway/tmp/spec-draft-stage2.md`) against the final approved spec. Focus on these sections where corrections carry the most reuse value:

- `二、详细设计` — did the user change the implementation approach or module boundaries?
- `三、接口协议变更` — did the user modify interface fields, directions, or compatibility rules?
- `四、基础设施设计` — did the user reject a storage, config, or messaging choice?
- Any place the user said "不行", "应该用 X", "我们规定", or "上次就是这样出问题的"

For each substantive difference, extract what the AI wrote, what the user changed it to, and why.

Ignore formatting changes, wording polish, and reordering. Only capture changes that carry a business rule or reveal a constraint the AI missed.

### Classify each finding

- User added a constraint or rule the AI didn't know about → `implicit_constraint`
  - Will be injected into future Stage 2 Planners so designs respect this constraint from the start
- User corrected an AI assumption or judgment → `ai_correction`
  - Will be injected into Stage 1 and Stage 2 so future analysis catches this class of mistake earlier

### Present findings to the user for confirmation

Show each finding as a numbered item before writing anything:

```
我注意到你做了以下修改，准备沉淀到项目知识库：

1. [隐性约束] 灰度开关必须走 Lion 配置，不能用环境变量
   原因：环境变量在容器重启后不可动态调整，Lion 支持实时生效

2. [AI纠正] 不需要加降级开关，这个功能没有降级场景
   原因：AI 默认加了 Lion 开关，但用户明确说此功能无需降级

请确认：
  a) 全部保留
  b) 告诉我哪条需要修改或删除
  c) 跳过，不沉淀
```

Wait for the user's response before writing anything. If the user selects (c) or doesn't respond, skip the write step entirely.

### Write confirmed entries

After the user confirms (a) or provides edits (b), write each approved entry:

```bash
RUNWAY_TOOLS="${CLAUDE_PLUGIN_ROOT:+${CLAUDE_PLUGIN_ROOT}/skills/runway/bin/runway-tools.cjs}"
RUNWAY_TOOLS="${RUNWAY_TOOLS:-$HOME/.claude/skills/runway/bin/runway-tools.cjs}"
node "$RUNWAY_TOOLS" knowledge-append \
  --root "$PWD" \
  --ones-id "{ones_work_item_id}" \
  --entries '[
    {
      "type": "implicit_constraint",
      "captured_at_stage": 2,
      "trigger": "hard_gate_diff",
      "inject_into_stages": [2],
      "inject_as": "constraint",
      "scope": "project",
      "summary": "{用户确认的一句话摘要}",
      "detail": "{AI原判断} → {用户修改为} — {业务原因}",
      "confidence": 9
    }
  ]' || true
```

Field selection guide:
- `type`: `implicit_constraint` for new constraints the AI missed; `ai_correction` for wrong AI judgments
- `inject_into_stages`: `[2]` for constraints; `[1, 2]` for AI corrections
- `inject_as`: `constraint` for constraints; `past_error` for AI corrections
- `scope`: `project` if this applies to future features; `feature` if one-time only
- `confidence`: 9–10 if the user explicitly confirmed; 7–8 if inferred from context

Write one entry per finding. Failure to write does not block the upload step (`|| true`).

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
node "$RUNWAY_TOOLS" state-update --root "$PWD" --name triangle-loop.local.md --active false
```

## Terminal State

Tech spec uploaded, user approved. Return control to the calling orchestrator. **Do NOT invoke runway-task-planning directly — the orchestrator handles stage transitions.**

## Additional Resources

- **`references/tech-spec-template.md`** — Full tech spec structure with field guidance
- **`references/deliberate-checklist.md`** — Pre-mortem and full test planning checklist
