# Fullstack Handoff Reference

全栈模式（`--fullstack`）下的前后端分叉/汇合契约。

---

## Leader 状态文件

Leader 的编排状态存储于用户主目录，与需求绑定：

```
~/.runway/fullstack-{ones_work_item_id}.json
```

字段：

```json
{
  "ones_work_item_id": "xxx",
  "requirements_spec_content_id": "abc",
  "tech_spec_content_id": "def",
  "tclist_content_id": "ghi",
  "mis": "your-mis",
  "backend_repo_path": "/path/to/backend",
  "frontend_repo_path": "/path/to/frontend",
  "backend_status": "running | complete",
  "frontend_status": "running | complete",
  "backend_branch": "feature/xxx",
  "frontend_branch": "feature/xxx",
  "cargo_test_url": "https://...",
  "test_report_url": "https://km.sankuai.com/...",
  "frontend_url": "https://...",
  "ac_checklist": ["AC-01: ...", "AC-02: ..."]
}
```

生命周期：leader 执行 `/runway --fullstack` 时创建，Completion 摘要打印后可清理。

---

## Repo checkpoint 中的 fullstack 状态位

backend repo 的 `.runway/checkpoint-{ones_work_item_id}.json` 只记录**中性流程状态**：

- `pipeline_mode = standard | fullstack`
- `fullstack_handoff_status = none | pending | dispatched`

约束：
- checkpoint **不记录** leader 身份
- 禁止写入 `is_leader=true`、`role=leader` 等字段
- `pending` 表示共享阶段已完成、等待派发
- `dispatched` 表示已完成 team 派发，leader 不再进入本地 Stage 3

恢复/分支规则：
- `pipeline_mode=standard` → 正常 Stage 3
- `pipeline_mode=fullstack` + `fullstack_handoff_status=pending` → 调用 `runway-fullstack`
- `pipeline_mode=fullstack` + `fullstack_handoff_status=dispatched` → 不重派发，不进入本地 Stage 3

leader 身份、两侧汇合上下文、最终摘要所需字段，只存在 `~/.runway/fullstack-{ones_work_item_id}.json`。

生命周期：leader 执行 `/runway --fullstack` 时创建，Completion 摘要打印后可清理。

---

## 派发时机

共享阶段由 leader 串行完成：
- Stage 1
- Stage 2
- Step 2b / Step 2c

只有当 Step 2b/2c 完成且 checkpoint 为 `pipeline_mode=fullstack` + `fullstack_handoff_status=pending` 时，才允许调用 `runway-fullstack` 做 team 派发。
派发成功后，leader 立即把 `fullstack_handoff_status` 更新为 `dispatched`。

---

## leader / teammate 状态边界

- leader 的 `~/.runway/fullstack-{ones_id}.json`：负责汇合
- backend repo checkpoint：负责 backend 流程恢复
- frontend repo checkpoint：负责 frontend 流程恢复

backend teammate 后续也会在 backend repo 中继续执行，因此 backend repo checkpoint 里不能带 leader 身份语义。

---

## SendMessage 消息格式

### backend-dev → leader（完成信号）

```json
{
  "status": "complete",
  "backend_branch": "{branch_name}",
  "cargo_test_url": "{cargo_test_url}",
  "test_report_url": "{km_url}"
}
```

### frontend-dev → leader（完成信号）

```json
{
  "status": "complete",
  "frontend_branch": "{branch_name}",
  "frontend_url": "{frontend_base_url from project.json}",
  "ac_checklist": [
    "AC-01: {description}",
    "AC-02: {description}"
  ]
}
```

### teammate → leader（BLOCKED 信号）

```json
{
  "status": "blocked",
  "stage": "{stage_number}",
  "reason": "{blocker description}",
  "question": "{what needs user input}"
}
```

---

## Leader 汇合行为

1. **派发完成后**：leader turn 结束，进入 idle 等待状态。
2. **收到第一侧完成信号**：
   - 写入 `~/.runway/fullstack-{ones_id}.json` 对应侧字段
   - 回复：
     ```
     收到 {backend/frontend}-dev 完成信号 ✓
     等待另一侧完成中...（{另一侧} 仍在运行）
     ```
3. **收到 BLOCKED 消息**：透传给用户，不做额外操作，等 teammate 自行继续。
4. **两侧均完成**：汇合，更新 ONES 状态为「测试中」，打印 Completion 摘要。

---

## Completion 摘要格式

```
## ✅ Fullstack Development Complete

**Feature:** {feature_name}
**Ones Work Item:** {ones_work_item_id} → status updated to "测试中"

**后端：**
- Branch: {backend_branch}
- 接口测试环境: {cargo_test_url}
- 接口测试报告: {test_report_url}

**前端：**
- Branch: {frontend_branch}
- 页面验收 URL: {frontend_url}

**待验收 AC 清单：**
{ac_checklist 逐行展示}

**共享产物：**
- 需求规格: https://km.sankuai.com/collabpage/{requirements_spec_content_id}
- 技术方案: https://km.sankuai.com/collabpage/{tech_spec_content_id}
- 测试用例: https://km.sankuai.com/collabpage/{tclist_content_id}
```

---

## teammate 完成信号发送时机

teammate 在 Stage 12 执行 Completion 后（`skip_retrospective=true` 时跳过 12a-12d 直接到 Completion）：

1. 更新 ONES 状态为「测试中」
2. 打印本侧 Development Complete 摘要
3. 检查 `team_mode == true` 且 `leader_name` 有值
4. 执行 `SendMessage to {leader_name}` 发送完成信号
5. teammate turn 结束

---

## 注意事项

- `leader_name` 由 leader 在 SendMessage 派发时注入到 teammate 的参数中（`--leader-name runway-fullstack-{ones_work_item_id}`）
- teammate 的 `~/.runway/fullstack-{ones_id}.json` **不存在**，该文件只在 leader 侧创建
- 两个 teammate 使用同一个 `ones_work_item_id` 作为 checkpoint namespace，但在不同 repo 目录下，互不干扰
