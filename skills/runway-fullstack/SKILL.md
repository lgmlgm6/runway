---
name: runway-fullstack
description: Fullstack Team Leader mode for runway. Runs shared phases (PRD analysis + tech design + Step 2b/2c), then launches backend-dev and frontend-dev teammates via runway-agentteam, dispatches them, and waits for both to complete. Invoked by runway orchestrator when --fullstack or --litefull flag is present.
version: 0.1.0
---

# Runway Fullstack Leader

全栈模式 Leader。只负责共享阶段 + 团队启动 + 派发 + 汇合。Stage 3 及以后由 teammate 执行，Leader 不涉及。

支持两种模式：
- `pipeline_mode=fullstack`：Stage 1+2 已完成，接收 `requirements_spec_content_id` + `tech_spec_content_id`
- `pipeline_mode=litefull`：Stage 0.5 已完成，接收 `mini_spec_path` + `spec_context_path`

## 输入参数

从调用方（runway orchestrator）接收：
- `prd_url` — xuecheng PRD 链接
- `ones_work_item_id` — ONES 工作项 ID
- `pipeline_mode` — `"fullstack"` 或 `"litefull"`
- `tclist_content_id` — Step 2c 产出（已由主 runway 完成，可能为 skipped）
- `mis` — 用户 MIS

**fullstack 模式额外参数：**
- `requirements_spec_content_id` — Stage 1 产出
- `tech_spec_content_id` — Stage 2 产出

**litefull 模式额外参数：**
- `mini_spec_path` — Stage 0.5 产出（本地文件路径）
- `spec_context_path` — Stage 0.5 产出（本地文件路径）

## Step 1: 读取仓库路径

从 `.runway/project.json` 读取：
- `frontend_repo_path`
- `backend_repo_path`

若不存在，用 `AskUserQuestion` 询问用户一次，写入 project.json。

## Step 2: 创建 Leader 状态文件

写入 `~/.runway/fullstack-{ones_work_item_id}.json`，按 `pipeline_mode` 写入不同字段：

**fullstack 模式：**
```json
{
  "ones_work_item_id": "{ones_work_item_id}",
  "pipeline_mode": "fullstack",
  "requirements_spec_content_id": "{requirements_spec_content_id}",
  "tech_spec_content_id": "{tech_spec_content_id}",
  "tclist_content_id": "{tclist_content_id}",
  "mis": "{mis}",
  "backend_repo_path": "{backend_repo_path}",
  "frontend_repo_path": "{frontend_repo_path}",
  "backend_status": "running",
  "frontend_status": "running"
}
```

**litefull 模式：**
```json
{
  "ones_work_item_id": "{ones_work_item_id}",
  "pipeline_mode": "litefull",
  "mini_spec_path": "{mini_spec_path}",
  "spec_context_path": "{spec_context_path}",
  "tclist_content_id": "{tclist_content_id}",
  "mis": "{mis}",
  "backend_repo_path": "{backend_repo_path}",
  "frontend_repo_path": "{frontend_repo_path}",
  "backend_status": "running",
  "frontend_status": "running"
}
```

注意：leader 身份只存在于这个用户级状态文件，不写入 backend repo checkpoint。
checkpoint 只维护中性的流程状态：`pipeline_mode=fullstack|litefull` 与 `fullstack_handoff_status=pending|dispatched`。

如果发现 checkpoint 已经是 `fullstack_handoff_status=dispatched`，说明此前已完成派发，不应再次创建团队或重派发。

## Step 3: 启动团队

调用 `runway-agentteam` skill，传入：
- team name: `runway-fullstack-{ones_work_item_id}`
- member 1: name=`backend-dev`, working dir=`{backend_repo_path}`
- member 2: name=`frontend-dev`, working dir=`{frontend_repo_path}`

`runway-agentteam` 全权负责：TeamCreate、mc --code 进程启动、等待初始化、trust folder 确认。
**不要自己调用 TeamCreate。**

## Step 4: 预写 Checkpoint + 派发任务

### 4a: 预写两个 repo 的 checkpoint（派发前执行）

在发送任何 SendMessage 之前，先将所有上下文写入各 repo 的 checkpoint。Teammate 启动后通过 Step 0c 恢复路径读取，无需从消息解析参数。

**fullstack 模式（`pipeline_mode=fullstack`）：**

```bash
# 写入 backend repo checkpoint
node "$RUNWAY_TOOLS" checkpoint-write \
  --root "{backend_repo_path}" \
  --ones-id "{ones_work_item_id}" \
  --pipeline-mode "fullstack" \
  --requirements-spec-content-id "{requirements_spec_content_id}" \
  --tech-spec-content-id "{tech_spec_content_id}" \
  --spec-context-path "{spec_context_path}" \
  --tclist-content-id "{tclist_content_id}" \
  --current-stage 3 \
  --role "backend" \
  --team-mode true \
  --leader-name "runway-fullstack-{ones_work_item_id}" \
  --updated-at "$(date -u +%Y-%m-%dT%H:%M:%SZ)"

# 写入 frontend repo checkpoint
node "$RUNWAY_TOOLS" checkpoint-write \
  --root "{frontend_repo_path}" \
  --ones-id "{ones_work_item_id}" \
  --pipeline-mode "fullstack" \
  --requirements-spec-content-id "{requirements_spec_content_id}" \
  --tech-spec-content-id "{tech_spec_content_id}" \
  --spec-context-path "{spec_context_path}" \
  --tclist-content-id "{tclist_content_id}" \
  --current-stage 3 \
  --role "frontend" \
  --team-mode true \
  --leader-name "runway-fullstack-{ones_work_item_id}" \
  --updated-at "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
```

**litefull 模式（`pipeline_mode=litefull`）：**

```bash
# 写入 backend repo checkpoint
node "$RUNWAY_TOOLS" checkpoint-write \
  --root "{backend_repo_path}" \
  --ones-id "{ones_work_item_id}" \
  --pipeline-mode "litefull" \
  --mini-spec-path "{mini_spec_path}" \
  --spec-context-path "{spec_context_path}" \
  --tclist-content-id "{tclist_content_id}" \
  --current-stage 3 \
  --role "backend" \
  --team-mode true \
  --leader-name "runway-fullstack-{ones_work_item_id}" \
  --updated-at "$(date -u +%Y-%m-%dT%H:%M:%SZ)"

# 写入 frontend repo checkpoint
node "$RUNWAY_TOOLS" checkpoint-write \
  --root "{frontend_repo_path}" \
  --ones-id "{ones_work_item_id}" \
  --pipeline-mode "litefull" \
  --mini-spec-path "{mini_spec_path}" \
  --spec-context-path "{spec_context_path}" \
  --tclist-content-id "{tclist_content_id}" \
  --current-stage 3 \
  --role "frontend" \
  --team-mode true \
  --leader-name "runway-fullstack-{ones_work_item_id}" \
  --updated-at "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
```

### 4b: 发送简化派发消息

Checkpoint 已就绪，消息只需传达角色说明和执行指令，不再传递参数。

```
SendMessage to backend-dev:
  "你是后端开发工程师，负责在 {backend_repo_path} 完成后端开发任务。
   需求背景：{prd_url}

   Checkpoint 已就绪，所有上下文已预写入 {backend_repo_path}/.runway/checkpoint-{ones_work_item_id}.json。

   请立即在 {backend_repo_path} 目录执行 /runway，系统会自动从 checkpoint 恢复并从 Stage 3（任务规划）继续。不需要等待用户确认，直接开始。
   完成后发消息给我，包含：branch_name、cargo_test_url、test_report_url。"

SendMessage to frontend-dev:
  "你是前端开发工程师，负责在 {frontend_repo_path} 完成前端开发任务。
   需求背景：{prd_url}

   Checkpoint 已就绪，所有上下文已预写入 {frontend_repo_path}/.runway/checkpoint-{ones_work_item_id}.json。

   请立即在 {frontend_repo_path} 目录执行 /runway，系统会自动从 checkpoint 恢复并从 Stage 3（任务规划）继续。不需要等待用户确认，直接开始。
   完成后发消息给我，包含：branch_name、frontend_url、ac_checklist。"
```

### 4c: 回写 leader repo checkpoint

```bash
node "$RUNWAY_TOOLS" checkpoint-write \
  --root "$PROJECT_ROOT" \
  --ones-id "{ones_work_item_id}" \
  --fullstack-handoff-status "dispatched" \
  --updated-at "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
```

只写 `fullstack_handoff_status=dispatched`，不写任何 `is_leader` / `role=leader` 字段。

## Step 5: 等待汇合

Turn 结束，进入 idle 等待。收到消息时：

**收到一侧完成信号（status: complete）：**
1. 更新 `~/.runway/fullstack-{ones_work_item_id}.json` 对应侧字段
2. 回复：
   ```
   收到 {backend/frontend}-dev 完成信号 ✓
   等待另一侧完成中...（{另一侧} 仍在运行）
   ```

**收到 BLOCKED 信号：**
透传给用户，不做其他操作，等 teammate 自行继续。

**两侧均完成：**
1. 更新 ONES 状态为「测试中」：
   ```bash
   ones wu -i {ones_work_item_id} -F '{"variable":"state","name":"状态","type":"component_state","multiple":false,"fieldValue":"测试中"}'
   ```
2. 打印 Completion 摘要：

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

3. 清理状态文件：`rm ~/.runway/fullstack-{ones_work_item_id}.json`

## 消息格式参考

**backend-dev → leader（完成）：**
```json
{
  "status": "complete",
  "backend_branch": "{branch_name}",
  "cargo_test_url": "{url}",
  "test_report_url": "{km_url}"
}
```

**frontend-dev → leader（完成）：**
```json
{
  "status": "complete",
  "frontend_branch": "{branch_name}",
  "frontend_url": "{url}",
  "ac_checklist": ["AC-01: ...", "AC-02: ..."]
}
```

**teammate → leader（BLOCKED）：**
```json
{
  "status": "blocked",
  "stage": "{stage_number}",
  "reason": "{blocker description}",
  "question": "{what needs user input}"
}
```
