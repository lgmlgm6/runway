# Stage 9 — 自动部署详细执行规范

## 前端部署分支（role=frontend）

Invoke the **ee-talos** skill with:
- `branch_name`（checkpoint）
- 当前 git 仓库路径（ee-talos 内部自动查询 app/template/platform）

The skill handles: `talos app ls -c`（自动探测 v1/v2）→ `talos template ls` 获取 newtest 模板 → `talos flow publish` 触发发布 → 每 20s 轮询 `talos flow describe` 检查顶层 `status` 字段至 `success`。

**发布成功后：**

```bash
FRONTEND_URL=$(jq -r '.frontend_base_url // empty' .runway/project.json 2>/dev/null)
TALOS_FLOW_ID=<flow id returned by ee-talos>
```

Update checkpoint:
```bash
node "$RUNWAY_TOOLS" checkpoint-write \
  --root "$PROJECT_ROOT" --ones-id "{ones_work_item_id}" \
  --talos-flow-id "$TALOS_FLOW_ID" \
  --frontend-url "$FRONTEND_URL" \
  --current-stage 12 \
  --updated-at "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
```

Print:
```
✅ Stage 9 完成 — 前端发布
- Flow ID：{talos_flow_id}
- 页面验收 URL：{frontend_url}（来自 project.json frontend_base_url）
- 进入 Stage 12（Stage 10/11 跳过）
```

Skip Stage 10 and Stage 11. Proceed directly to Stage 12.

---

## 后端部署分支（role=backend，默认）

### cargo_release_name 处理（编排器负责，不依赖 ee-cargo 内部写回）

```bash
# 1. 先从 project.json 读取缓存值
RELEASE_NAME=$(jq -r '.cargo_release_name // empty' .runway/project.json 2>/dev/null)

# 2. 无缓存则主动调用 get-releases 查询
if [[ -z "$RELEASE_NAME" ]]; then
  CARGO_APPKEY=$(jq -r '.appkey // empty' .runway/project.json 2>/dev/null)
  RELEASES_JSON=$(cargo-cli stack get-releases --appkey "$CARGO_APPKEY" --output json 2>/dev/null)
  COUNT=$(echo "$RELEASES_JSON" | jq 'length')

  if [[ "$COUNT" -eq 1 ]]; then
    RELEASE_NAME=$(echo "$RELEASES_JSON" | jq -r '.[0].releaseName')
  elif [[ "$COUNT" -gt 1 ]]; then
    # 多个 release：AskUserQuestion 单选，用户确认后取值（不能自动取第一个）
    :
  fi

  # 3. 写入 project.json 持久化
  TMP=$(mktemp)
  jq --arg v "$RELEASE_NAME" '.cargo_release_name = $v' .runway/project.json > "$TMP" \
    && mv "$TMP" .runway/project.json
  echo "✅ cargo_release_name 已写入 project.json: $RELEASE_NAME"
fi
```

### 调用 ee-cargo

Invoke the **ee-cargo** skill with:
- `CARGO_APPKEY`（等于 `project.json` 的 `appkey`，直接复用：`jq -r '.appkey' .runway/project.json`）
- `cargo_release_name`（$RELEASE_NAME，已确保有值）
- `branch_name`（checkpoint）

The skill handles: stack search → create/复用 → deploy → status 轮询至 running（30s 间隔，最多 10 分钟）。

**唯一人工停顿**：轮询 10 分钟后仍未 running → `state-update --active false`，暂停等待用户检查。

### checkpoint 写入 + cargo_test_url 拼接

```bash
node "$RUNWAY_TOOLS" checkpoint-write \
  --root "$PROJECT_ROOT" --ones-id "{ones_work_item_id}" \
  --cargo-stack-uuid "{uuid}" --cargo-swimlane "{swimlane}" \
  --current-stage 10 \
  --updated-at "$(date -u +%Y-%m-%dT%H:%M:%SZ)"

TEST_BASE_DOMAIN=$(jq -r '.test_base_domain // empty' .runway/project.json 2>/dev/null)
if [[ -n "$TEST_BASE_DOMAIN" ]]; then
  CARGO_TEST_URL="https://${CARGO_SWIMLANE}-sl-${TEST_BASE_DOMAIN}"
  echo "✅ 测试 URL：$CARGO_TEST_URL"
else
  CARGO_TEST_URL=""
  echo "⚠️ test_base_domain 未配置，Stage 10 将跳过接口自动测试"
fi
node "$RUNWAY_TOOLS" checkpoint-write \
  --root "$PROJECT_ROOT" --ones-id "{ones_work_item_id}" \
  --cargo-test-url "$CARGO_TEST_URL" \
  --updated-at "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
```

Print:
```
✅ Stage 9 完成 — 自动部署
- 泳道：{cargo_swimlane}
- 测试 URL：{cargo_test_url}（空则 Stage 10 跳过）
- 进入 Stage 10：接口自动测试
```
