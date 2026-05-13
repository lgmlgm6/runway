# State Management — Checkpoint & Pipeline State Commands

## checkpoint-write 参数规范

`RUNWAY_TOOLS` 路径，以及所有工具命令必须使用的 `PROJECT_ROOT`：
```bash
RUNWAY_TOOLS="${CLAUDE_PLUGIN_ROOT:+${CLAUDE_PLUGIN_ROOT}/skills/runway/bin/runway-tools.cjs}"
RUNWAY_TOOLS="${RUNWAY_TOOLS:-$HOME/.claude/skills/runway/bin/runway-tools.cjs}"
# 必须用 git 仓库根目录，不能用 $PWD（插件上下文中 $PWD 可能指向插件目录）
PROJECT_ROOT=$(git rev-parse --show-toplevel 2>/dev/null || echo "$PWD")
```

### Stage 1 完成后（current-stage → 2）
```bash
node "$RUNWAY_TOOLS" checkpoint-write \
  --root "$PROJECT_ROOT" \
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
  --root "$PROJECT_ROOT" \
  --ones-id "{ones_work_item_id}" \
  --citadel-parent-id "{citadel_parent_id}" \
  --prd-content-id "{prd_content_id}" \
  --requirements-spec-content-id "{requirements_spec_contentId}" \
  --tech-spec-content-id "{tech_spec_contentId}" \
  --current-stage 3 \
  --updated-at "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
```

### 全栈模式状态位（中性流程状态，不是 leader 身份）

当 `--fullstack` 启用时，在 backend repo checkpoint 额外写入：

```bash
node "$RUNWAY_TOOLS" checkpoint-write \
  --root "$PROJECT_ROOT" \
  --ones-id "{ones_work_item_id}" \
  --pipeline-mode "fullstack" \
  --fullstack-handoff-status "pending" \
  --updated-at "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
```

字段语义：
- `pipeline_mode = standard | fullstack`
- `fullstack_handoff_status = none | pending | dispatched`

约束：
- checkpoint 只记录流程模式与 handoff 状态，不记录 leader 身份
- **禁止**写入 `is_leader=true`、`role=leader` 等会污染 teammate 恢复语义的字段
- `fullstack_handoff_status=pending` 表示共享阶段已完成、尚未派发
- `fullstack_handoff_status=dispatched` 表示已完成 team 派发，leader 不得继续本地 Stage 3

Step 2b/2c 完成后的恢复/分支规则：
- `pipeline_mode=standard` → 正常进入 Stage 3
- `pipeline_mode=fullstack` + `fullstack_handoff_status=pending` → 调用 `runway-fullstack`
- `pipeline_mode=fullstack` + `fullstack_handoff_status=dispatched` → 不重派发，不进入本地 Stage 3

### Fullstack handoff 派发成功后

由 leader 在 team 创建并成功发送两侧任务后写入：

```bash
node "$RUNWAY_TOOLS" checkpoint-write \
  --root "$PROJECT_ROOT" \
  --ones-id "{ones_work_item_id}" \
  --fullstack-handoff-status "dispatched" \
  --updated-at "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
```

请注意：这里只更新 handoff 状态，不引入任何 leader 角色字段。

### Step 2b 完成后（papi_sync_status 写入）
```bash
node "$RUNWAY_TOOLS" checkpoint-write \
  --root "$PROJECT_ROOT" \
  --ones-id "{ones_work_item_id}" \
  --papi-sync-status "{papi_sync_status}" \
  --papi-synced-apis '{papi_synced_apis_json}' \
  --updated-at "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
```

### Step 2c 完成后（tclist_content_id 写入）
```bash
node "$RUNWAY_TOOLS" checkpoint-write \
  --root "$PROJECT_ROOT" \
  --ones-id "{ones_work_item_id}" \
  --tclist-content-id "{tclist_content_id}" \
  --updated-at "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
```

### Stage 3 完成后（current-stage → 4）
```bash
node "$RUNWAY_TOOLS" checkpoint-write \
  --root "$PROJECT_ROOT" \
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
  --root "$PROJECT_ROOT" \
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

### Stage 7 完成后（shepherd_config_status 写入）
```bash
node "$RUNWAY_TOOLS" checkpoint-write \
  --root "$PROJECT_ROOT" \
  --ones-id "{ones_work_item_id}" \
  --shepherd-config-status "{shepherd_config_status}" \
  --updated-at "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
```

### Stage 9 完成后（cargo 部署信息写入）
```bash
node "$RUNWAY_TOOLS" checkpoint-write \
  --root "$PROJECT_ROOT" \
  --ones-id "{ones_work_item_id}" \
  --cargo-stack-uuid "{cargo_stack_uuid}" \
  --cargo-swimlane "{cargo_swimlane}" \
  --cargo-test-url "{cargo_test_url}" \
  --current-stage 10 \
  --updated-at "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
```

### Stage 10 / F4 完成后（测试结果写入）
```bash
node "$RUNWAY_TOOLS" checkpoint-write \
  --root "$PROJECT_ROOT" \
  --ones-id "{ones_work_item_id}" \
  --test-report-content-id "{test_report_content_id}" \
  --test-failed-count "{test_failed_count}" \
  --test-failed-ids '{test_failed_ids_json}' \
  --updated-at "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
```

### FIX LOOP 状态更新
```bash
# 进入 Stage 11
node "$RUNWAY_TOOLS" checkpoint-write \
  --root "$PROJECT_ROOT" \
  --ones-id "{ones_work_item_id}" \
  --fix-loop-status "stage11" \
  --updated-at "$(date -u +%Y-%m-%dT%H:%M:%SZ)"

# F1 修复完成后
node "$RUNWAY_TOOLS" checkpoint-write \
  --root "$PROJECT_ROOT" \
  --ones-id "{ones_work_item_id}" \
  --bug-analysis-content-id "{bug_analysis_content_id}" \
  --fix-loop-status "f1" \
  --updated-at "$(date -u +%Y-%m-%dT%H:%M:%SZ)"

# 循环完成或退出
node "$RUNWAY_TOOLS" checkpoint-write \
  --root "$PROJECT_ROOT" \
  --ones-id "{ones_work_item_id}" \
  --fix-round "{fix_round}" \
  --fix-loop-status "complete" \
  --updated-at "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
```

**fix_loop_status 合法值**：`idle | stage11 | f1 | f2 | f3 | f4 | exhausted | complete`
- 用于会话中断后续命时精确恢复到中断的步骤，而非从 Stage 11 重新开始

---

## pipeline state 激活 / 停用

### 激活（进入 Stage 5 前）
```bash
node "$RUNWAY_TOOLS" state-update \
  --root "$PROJECT_ROOT" \
  --name pipeline.local.md \
  --active true
```

### 停用（遇到 blocker 需人工处理时）
```bash
node "$RUNWAY_TOOLS" state-update \
  --root "$PROJECT_ROOT" \
  --name pipeline.local.md \
  --active false
```

---

## knowledge-append 命令模板（Stage 12）

```bash
node "$RUNWAY_TOOLS" knowledge-append \
  --root "$PROJECT_ROOT" \
  --ones-id "{ones_id}" \
  --entries '[{
    "type": "pitfall",
    "captured_at_stage": 12,
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
- `confidence`: 1-10，建议低于 7 的条目在 Step 12a-extra 考虑删除
- 只记录有真实复用价值的发现，无值可跳过
