# Knowledge Capture — Step 6.5

Run this step after the user approves the tech spec, before uploading to xuecheng.
**If the user approved with no modifications, skip this step entirely.**

## Detect and Extract Changes

Compare the saved draft (`.runway/tmp/spec-draft-stage2.md`) against the final approved spec. Focus on:

- `二、详细设计` — did the user change the implementation approach or module boundaries?
- `三、接口协议变更` — did the user modify interface fields, directions, or compatibility rules?
- `四、基础设施设计` — did the user reject a storage, config, or messaging choice?
- Any place the user said "不行", "应该用 X", "我们规定", or "上次就是这样出问题的"

Ignore formatting changes, wording polish, and reordering. Only capture changes that carry a business rule or reveal a constraint the AI missed.

## Classify Each Finding

- User added a constraint the AI didn't know about → `implicit_constraint`
  - Will be injected into future Stage 2 Planners so designs respect this constraint from the start
- User corrected an AI assumption or judgment → `ai_correction`
  - Will be injected into Stage 1 and Stage 2 so future analysis catches this class of mistake earlier

## Present Findings for Confirmation

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

Wait for the user's response before writing. If the user selects (c) or doesn't respond, skip the write step entirely.

## Write Confirmed Entries

```bash
RUNWAY_TOOLS="${CLAUDE_PLUGIN_ROOT:+${CLAUDE_PLUGIN_ROOT}/skills/runway/bin/runway-tools.cjs}"
RUNWAY_TOOLS="${RUNWAY_TOOLS:-$HOME/.claude/skills/runway/bin/runway-tools.cjs}"
node "$RUNWAY_TOOLS" knowledge-append \
  --root "$PROJECT_ROOT" \
  --ones-id "{ones_work_item_id}" \
  --entries '[
    {
      "type": "constraint",
      "captured_at_stage": 2,
      "trigger": "hard_gate_diff",
      "inject_into_stages": [2, 3, 5],
      "inject_as": "constraint",
      "scope": "project",
      "summary": "{一句话陈述性知识，描述业务约束或事实}",
      "confidence": 9
    }
  ]' || true
```

Field guide:
- `type`: `constraint` for missed business/architectural rules; `correction` for wrong AI judgments
- `inject_into_stages`: `[2, 3, 5]` for constraints; `[1, 2, 3, 5]` for corrections
- `inject_as`: `constraint` for constraints; `warning` for corrections
- `scope`: `project` if applies to future features; `feature` if one-time only
- `summary`: 陈述性事实，如"灰度开关必须走 Lion 配置，不能用环境变量，因为环境变量在容器重启后不可动态调整"
- `confidence`: 9–10 if user explicitly confirmed; 7–8 if inferred from context

Write one entry per finding. Failure to write does not block the upload step (`|| true`).
