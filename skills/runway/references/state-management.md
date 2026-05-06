# State Management — Checkpoint & Pipeline State Commands

## checkpoint-write 参数规范

`RUNWAY_TOOLS` 路径：
```bash
RUNWAY_TOOLS="${CLAUDE_PLUGIN_ROOT:+${CLAUDE_PLUGIN_ROOT}/skills/runway/bin/runway-tools.cjs}"
RUNWAY_TOOLS="${RUNWAY_TOOLS:-$HOME/.claude/skills/runway/bin/runway-tools.cjs}"
```

### Stage 1 完成后（current-stage → 2）
```bash
node "$RUNWAY_TOOLS" checkpoint-write \
  --root "$PWD" \
  --ones-id "{ones_work_item_id}" \
  --citadel-parent-id "{citadel_parent_id}" \
  --prd-content-id "{prd_content_id}" \
  --requirements-spec-content-id "{requirements_spec_contentId}" \
  --current-stage 2 \
  --updated-at "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
```

### Stage 2 完成后（current-stage → 3）
```bash
node "$RUNWAY_TOOLS" checkpoint-write \
  --root "$PWD" \
  --ones-id "{ones_work_item_id}" \
  --citadel-parent-id "{citadel_parent_id}" \
  --prd-content-id "{prd_content_id}" \
  --requirements-spec-content-id "{requirements_spec_contentId}" \
  --tech-spec-content-id "{tech_spec_contentId}" \
  --current-stage 3 \
  --updated-at "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
```

### Stage 3 完成后（current-stage → 4）
```bash
node "$RUNWAY_TOOLS" checkpoint-write \
  --root "$PWD" \
  --ones-id "{ones_work_item_id}" \
  --citadel-parent-id "{citadel_parent_id}" \
  --prd-content-id "{prd_content_id}" \
  --requirements-spec-content-id "{requirements_spec_contentId}" \
  --tech-spec-content-id "{tech_spec_contentId}" \
  --plan-path "{plan_path}" \
  --current-stage 4 \
  --updated-at "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
```

### Stage 4 完成后（current-stage → 5）
```bash
node "$RUNWAY_TOOLS" checkpoint-write \
  --root "$PWD" \
  --ones-id "{ones_work_item_id}" \
  --citadel-parent-id "{citadel_parent_id}" \
  --prd-content-id "{prd_content_id}" \
  --requirements-spec-content-id "{requirements_spec_contentId}" \
  --tech-spec-content-id "{tech_spec_contentId}" \
  --plan-path "{plan_path}" \
  --branch-name "{branch_name}" \
  --base-sha "{BASE_SHA}" \
  --current-stage 5 \
  --updated-at "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
```

---

## pipeline state 激活 / 停用

### 激活（进入 Stage 5 前）
```bash
node "$RUNWAY_TOOLS" state-update \
  --root "$PWD" \
  --name pipeline.local.md \
  --active true
```

### 停用（遇到 blocker 需人工处理时）
```bash
node "$RUNWAY_TOOLS" state-update \
  --root "$PWD" \
  --name pipeline.local.md \
  --active false
```

---

## knowledge-append 命令模板（Stage 8）

```bash
node "$RUNWAY_TOOLS" knowledge-append \
  --root "$PWD" \
  --ones-id "{ones_id}" \
  --entries '[{
    "type": "pitfall",
    "captured_at_stage": 8,
    "trigger": "retrospective",
    "inject_into_stages": [3, 5],
    "inject_as": "warning",
    "scope": "project",
    "summary": "{一句话陈述性知识}",
    "confidence": 8
  }]' || true
```

字段说明：
- `type`: `pitfall`（技术陷阱）或 `pattern`（可复用正确做法）
- `inject_as`: pitfall → `warning`；pattern → `pattern`
- `summary`: 写成陈述性事实，不写现象-根因结构
- `confidence`: 1-10，建议低于 7 的条目在 Step 8a-extra 考虑删除
- 只记录有真实复用价值的发现，无值可跳过
