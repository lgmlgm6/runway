---
name: runway-prd-analysis
description: Reads a xuecheng PRD, clarifies ambiguities through structured questioning, and produces a structured requirements spec (with AC table) uploaded back to xuecheng. Invoke this skill whenever the user provides a km.sankuai.com link and wants to understand, analyze, or clarify requirements — even if they just paste a link without explanation. Also trigger when the user says "分析需求", "读一下PRD", "帮我梳理需求", or "produce requirements spec". Do NOT skip this skill just because the PRD looks simple — ambiguity clarification is always valuable.
version: 0.1.0
---

# PRD Analysis

Read a xuecheng PRD document, clarify ambiguities through structured questioning, produce a requirements spec, and upload it to xuecheng.

<HARD-GATE>
Do not proceed to runway-tech-design until the requirements spec is confirmed by the user and uploaded to xuecheng.
</HARD-GATE>

## When to Use

Activate when the user provides a xuecheng PRD link and asks for requirements analysis. This is Stage 1 of the dev workflow.

## Process

```
citadel getMarkdown → Ambiguity Score → [>20%: Socratic Q&A] → Spec → User Confirm → [changes?] → Knowledge Capture → citadel createDocument → return control to runway orchestrator
                                             ↓                                              ↓
                                  [still >20% after max rounds]                      [no changes: skip]
                                             ↓
                              Human decision on unresolved items
```

## Step 1: Read PRD + Quick Code Scan

```bash
oa-skills citadel getMarkdown --contentId <id-from-url> --mis <mis>
```

If this command fails:
- Ask the user to paste the PRD content directly into chat.
- Continue with pasted content as if it were read from xuecheng.
- Record `prd_content_id: manual-input` in the workflow state.

Extract: background/goal, functional description, user scenarios, constraints, acceptance criteria.

**After reading the PRD, before asking any clarification questions, do a 5-minute code scan:**

Identify which interfaces/services the PRD touches, then read their signatures:
```bash
# Find relevant service files mentioned in PRD
grep -rn "Service\|TService\|Gateway" --include="*.java" -l | head -20
# Read key method signatures to understand actual interface ownership
```

This prevents asking questions that the code already answers (e.g., "which interface owns this feature?"). Only ask questions that are **business decisions** the code cannot answer.

## Step 1.5: Load Past Corrections

```bash
RUNWAY_TOOLS="${CLAUDE_PLUGIN_ROOT:+${CLAUDE_PLUGIN_ROOT}/skills/runway/bin/runway-tools.cjs}"
RUNWAY_TOOLS="${RUNWAY_TOOLS:-$HOME/.claude/skills/runway/bin/runway-tools.cjs}"
KNOWLEDGE_S1=$(node "$RUNWAY_TOOLS" knowledge-read --root "$PWD" --inject-into-stage 1 --format prompt 2>/dev/null || echo "")
```

如果 `KNOWLEDGE_S1` 非空，在后续 Ambiguity Scoring 和 Socratic 提问时将其作为额外上下文：这些历史纠正记录揭示了哪类 PRD 容易遗漏哪类约束，在打分和提问时优先关注这些维度。

## Step 2: Ambiguity Scoring

Score three dimensions (0–100, 100 = fully clear):

| Dimension | Weight | Question |
|-----------|--------|----------|
| Goal Clarity | 40% | Can the problem be stated in one sentence? |
| Constraint Clarity | 30% | Are technical/business constraints explicit? |
| Success Criteria | 30% | Can acceptance tests be written from this? |

```
ambiguity = 1 - (goal×0.40 + constraints×0.30 + criteria×0.30) / 100
```

- ambiguity > 20% → proceed to Step 3
- ambiguity ≤ 20% → skip to Step 4

### Scoring rubric

Use the same anchors for all three dimensions so scoring is consistent:

| Score | Meaning | Evidence test |
|------:|---------|---------------|
| 20 | Mostly unclear. Multiple plausible interpretations remain. | Two independent readers would describe the scope differently; no single sentence captures the goal. |
| 50 | Partially clear. Core intent is visible, but important gaps block confident delivery. | Goal can be stated in one sentence, but at least one constraint or success criterion is missing or contradictory. |
| 80 | Clear enough to implement with only minor follow-up questions. | A developer could start coding with ≤ 2 clarification questions; all major edge cases are named even if not fully specified. |
| 100 | Unambiguous. A reviewer could derive the same scope and acceptance tests independently. | Two independent readers produce identical AC lists with no open items; no assumptions needed. |

When scoring, record 1–2 sentences explaining why the dimension received that score. The explanation must cite specific text from the PRD (quote or section reference) or name the exact missing information.

## Step 3: Socratic Clarification (only if ambiguity > 20%)

Ask **one question at a time**. Prefer multiple-choice. Target the lowest-scoring dimension each round. Recompute score every 3 rounds. Stop when ambiguity ≤ 20% or after 20 rounds.

See `references/clarification-questions.md` for question templates by dimension.

### Clarification rules

- Ask exactly one question per turn.
- Do not ask about implementation details — that is runway-tech-design's job.
- If the answer changes scope, update the current draft before asking the next question.
- Keep a running list of:
  - **Confirmed** — facts stated in the PRD or explicitly confirmed by the user
  - **Assumed** — working assumptions needed to make the spec coherent
  - **Open** — unresolved questions that still need an owner or later decision

### If ambiguity remains high after max rounds

If ambiguity is still > 20% after 20 rounds:
- Stop asking more questions.
- Produce the best current draft with `Confirmed / Assumed / Open` sections filled in.
- Clearly mark the remaining blockers.
- Present the following message and **STOP. Do not proceed until the user replies.**

> "已完成 20 轮澄清，以下问题仍未解决：{list blockers}。请选择：
> 1. 现在回答上述问题
> 2. 接受规格现状（将未解决项记录为 Open）
> 3. 暂停流程，待信息补全后继续"

**Wait for the user's explicit reply before taking any further action.** Do not auto-select an option, do not proceed to Step 4, and do not upload anything.

Only continue after the user replies with their choice:
- Choice 1 → resume clarification with the user's answers, then proceed to Step 4.
- Choice 2 → proceed to Step 4 with open items retained.
- Choice 3 → halt the workflow entirely and confirm to the user that it is paused.

## Step 4: Write Requirements Spec

Structure:

```markdown
# 需求规格：{功能名称}
## 背景与目标
## 需求状态
### 已确认
### 假设
### 待确认
## 用户场景
## 功能需求
### 功能总览
### 模块 / 页面详细说明
### 边界与约束
## 验收标准（Given/When/Then）
## 非功能说明
## 澄清历史
## 技术设计关注点
```

Only include unresolved requirements, external dependencies, boundary constraints, or risks that Stage 2 must explicitly carry forward.
Do not write solution proposals, module designs, interface designs, data models, or implementation steps here.

Run self-review checklist before presenting:
1. No placeholders (TBD, 待定, 后续确认)
2. No internal contradictions
3. No ambiguous statements (each requirement has exactly one interpretation)
4. Scope is focused
5. Every assumption is clearly separated from confirmed facts

See `references/spec-template.md` for full template.

## Step 5: User Confirmation (HARD GATE)

Before presenting the spec, save a snapshot of the current draft so changes can be detected later:

```bash
mkdir -p .runway/tmp
cat > .runway/tmp/spec-draft-stage1.md << 'DRAFT_EOF'
{CURRENT_SPEC_CONTENT}
DRAFT_EOF
```

Present the spec and ask:
> "Please confirm: (1) Is the goal and scope accurate? (2) Any missing requirements? (3) Are acceptance criteria testable? I'll upload to xuecheng after confirmation."

Wait for explicit confirmation. Revise and re-review if changes requested.

If the spec still contains open blockers, the user must explicitly approve uploading with those items recorded before proceeding.

## Step 5.5: Knowledge Capture — Stage 1 Hard Gate

Run this step after the user confirms, before uploading to xuecheng. Its purpose is to surface what the user changed so that the same corrections don't need to happen again next time.

**If the user confirmed with no modifications, skip this step entirely.**

### Detect and extract changes

Compare the saved draft (`.runway/tmp/spec-draft-stage1.md`) against the final confirmed spec. For each substantive difference, extract:

- **What the AI originally wrote** — the assumption or judgment that turned out to be wrong or incomplete
- **What the user changed it to** — the corrected version
- **Why** — the business reason behind the correction (infer from context if the user didn't state it explicitly)

Ignore formatting changes, wording polish, and reordering. Only capture changes that carry a business rule or reveal a constraint the AI missed.

### Classify each finding

- User added a constraint or rule the AI didn't know about → `implicit_constraint`
  - Will be injected into Stage 2 Planner so future designs respect this constraint
- User corrected an AI assumption or judgment → `ai_correction`
  - Will be injected into Stage 1 and Stage 2 so future analysis catches this earlier

### Present findings to the user for confirmation

Show each finding as a numbered item before writing anything:

```
我注意到你做了以下修改，准备沉淀到项目知识库：

1. [隐性约束] 接口字段只能新增，不能修改或删除
   原因：下游调用方未做版本隔离，改字段会导致线上反序列化失败

2. [AI纠正] 数据范围应限定为"当前 mis 下的数据"，不是全量
   原因：AI 草稿未考虑数据归属约束

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
      "type": "constraint",
      "captured_at_stage": 1,
      "trigger": "hard_gate_diff",
      "inject_into_stages": [2, 3, 5],
      "inject_as": "constraint",
      "scope": "project",
      "summary": "{一句话陈述性知识，描述业务约束或事实}",
      "confidence": 9
    }
  ]' || true
```

Field selection guide:
- `type`: `constraint` for business/architectural rules the AI missed; `correction` for wrong AI judgments
- `inject_into_stages`: `[2, 3, 5]` for constraints; `[1, 2, 3, 5]` for corrections
- `inject_as`: `constraint` for constraints; `warning` for corrections
- `scope`: `project` if this applies to future features; `feature` if one-time only
- `summary`: 写成陈述性事实，例如"接口字段只能新增，不能删除或修改类型，下游无版本隔离"
- `confidence`: 9–10 if the user explicitly confirmed; 7–8 if inferred from context

Write one entry per finding. Failure to write does not block the upload step (`|| true`).

## Step 6: Upload to Xuecheng

Upload as a child document under the parent document provided by the user at workflow start:

```bash
oa-skills citadel createDocument \
  --title "{name} - 需求规格" \
  --content "{markdown}" \
  --parentId <parent-content-id> \
  --mis <mis>
```

If parent document ID was not provided, ask: "请提供学城父文档ID（或父文档链接），用于上传需求规格文档。"

If `citadel createDocument` fails:
- Save the spec locally: `mkdir -p .runway/docs && cat > .runway/docs/requirements-spec-draft.md`
- Notify user: "学城上传失败，规格已保存到本地 `.runway/docs/requirements-spec-draft.md`。流程继续，Stage 2 将使用本地文件。"
- Record `requirements_spec_contentId: local:.runway/docs/requirements-spec-draft.md` and return to orchestrator.

Record the returned `contentId` for runway-tech-design input.

## Terminal State

Requirements spec uploaded to xuecheng, user confirmed. Return control to the calling orchestrator. **Do NOT invoke runway-tech-design directly — the orchestrator handles stage transitions.**

## Additional Resources

- **`references/clarification-questions.md`** — Question templates by dimension
- **`references/spec-template.md`** — Full requirements spec template with examples
