---
name: runway-autotest
description: 读取学城测试用例文档和测试数据文档，自动执行 HTTP 接口测试，输出测试报告并写入学城。当用户说：执行测试用例、执行用例、跑接口测试、测一下接口、run tests、api test、生成测试报告 时触发。
version: 0.1.0
---

# API Test Executor

读取用例文档 + 测试数据文档，执行用例，输出测试报告。

---

## P1 收集输入

| 必要输入 | 说明 | runway 编排器场景来源 |
|---------|------|---------------------|
| 用例文档 KM 链接 | 测试用例文档 | checkpoint `tclist_content_id` |
| 测试数据文档 KM 链接 | 包含占位符对应的实际数据值，以及认证信息 | project.json `test_data_km_url` |
| Base URL | 接口部署的 host，如 `https://xxx.test.sankuai.com` | checkpoint `cargo_test_url`（编排器传入，不询问用户） |

**runway 编排器调用场景**：以上三个输入均从 checkpoint / project.json 自动读取，**不询问用户**。若 `cargo_test_url` 缺失则编排器会处理，autotest 收到时已有值。

**手动调用场景**：若以上任一缺失，一次性询问用户。

---

## P2 读取文档

**读取用例文档**：【最高优先级】用 `oa-skills citadel getMarkdown --contentId <id>` 读取；失败时降级用 `get_km_doc` MCP 工具。解析出所有用例行（编号、接口路径、场景描述、请求体、预期结果）。

**读取测试数据文档**：【最高优先级】用 `oa-skills citadel getMarkdown --contentId <id>` 读取；失败时降级用 `get_km_doc` MCP 工具。提取：
- **占位符映射**：`{key}` → 实际值，如 `{published_post_id}` → `2043523659695411258`
- **认证信息**（二选一）：
  - Cookie：`Cookie: xxx=yyy; zzz=www`
  - Token：`Authorization: Bearer xxxxx`

将用例请求体中的所有占位符替换为测试数据文档中的实际值（`{StepN.字段名}` 类占位符在执行时动态替换）。

---

## P3 执行测试

**执行工具**：统一使用 `curl`，详见 `references/request-guide.md`。

**编排器调用场景的执行范围**：
- Stage 10 首轮执行：默认执行用例文档中的**全部**用例
- FIX LOOP / F4 复测：若编排器传入 `test_failed_ids`，则**只执行这些失败用例**，其余用例不重跑
- `test_failed_ids` 是过滤条件，不改变用例顺序；命中的用例仍按文档原始顺序执行
- 若 `test_failed_ids` 为空数组，视为无需复测，直接返回“无待执行失败用例”并交还编排器

**手动调用场景**：默认执行全部用例；除非用户明确给出要重跑的用例编号列表。

**执行顺序**：
1. 按编号顺序逐条执行本轮选中的单接口用例
2. 单接口 Happy Path 失败时，跳过该接口其余已选中的用例，标记为 Skip
3. 所有已选中的单接口用例执行完毕后，执行已选中的 E2E 用例
4. E2E 任一步骤失败，后续步骤标记为 Skip，整体标记为 Fail

**E2E 变量传递**：执行步骤时，将上一步响应中的字段提取为变量，替换后续步骤请求体中的 `{StepN.字段名}` 占位符。

**每条用例执行后立即记录**：Pass / Fail / Skip，以及 TraceId（从响应 header `M-TraceId` 提取）。

**TraceId 强制要求**：
- 所有实际执行的用例（Pass 和 Fail）**必须**使用 `curl -si` 带 `-i` flag，确保输出响应 header
- 从 header 中提取 `M-TraceId` 字段填入报告；若服务端未返回该 header 则填 `（未返回）`
- **禁止**对已执行的用例填 `—`，`—` 仅用于 Skip（未执行）的用例

---

## P4 输出测试报告

所有用例执行完毕后，**先在对话中输出完整报告**，再写入学城子文档。

**报告写入位置**：在用例文档下新建子文档。

- parentId = 用例文档 contentId（runway 编排器场景从 checkpoint `tclist_content_id` 读取）
- 标题格式：`{模块名} - 接口测试报告 - {YYYY-MM-DD}`（含日期后缀，区分不同执行批次）

```bash
oa-skills citadel createDocument \
  --title "{模块名} - 接口测试报告 - $(date +%Y-%m-%d)" \
  --parentId <用例文档contentId> \
  --content "<markdown>" \
  --mis {mis}
```

失败时降级用 `create_km_doc` MCP 工具。

**开始生成报告前，必须先读取 `references/test-report-template.md`，完整理解后再生成，不得跳过。**

**强制格式要求**（直接来自模版，违反任一条视为不合格）：
- 头部用 `>` 引用块：`执行时间 · 环境 · 执行人`
- 总览使用固定表格，含总用例数、通过/失败/跳过数、通过率；全部通过显示 🎉，存在失败显示 ⚠️，二选一
- 章节顺序固定：总览 → 用例明细（仅通过子表）→ E2E 联合用例 → 失败/跳过用例 → 结论与建议
- 用例明细章节只含「通过用例」子表；列顺序：`编号 | 接口路径 | 场景描述 | 实际请求体 | 预期结果 | 实际响应摘要 | TraceId`；接口路径必须写完整路径，禁止用 `...` 省略
- E2E 联合用例每个场景单独子表；无 E2E 时整个章节省略
- 失败/跳过用例作为独立章节（`## ❌ 失败 / 跳过用例`），放在 E2E 章节之后；列顺序：`编号 | 接口路径 | 场景描述 | 实际请求体 | 预期结果 | 实际响应摘要 | 状态 | TraceId | 根因 & 建议`；同时汇总单接口和 E2E 中的失败/跳过条目；无失败跳过时整个章节省略
- 实际请求体填替换占位符后的**真实值**，不保留占位符；Skip 用例填 `—`
- 结论与建议明确区分「需修复」和「可接受/暂不处理」两类；全部通过时写一句话结论即可

---

## 边界处理

| 情况 | 处理方式 |
|-----|---------|
| 占位符在测试数据文档中找不到对应值 | 停止执行，提示用户补充测试数据文档中的对应 key |
| 网络不通 | 标记为 Error（不计入 Fail），说明连接失败原因 |
| 响应非 JSON | 标记为 Error，原始响应截取前 200 字符展示 |
| E2E StepN 变量提取失败 | 该 E2E 用例整体标记为 Fail，后续步骤 Skip |
| 认证信息不在测试数据文档中 | 停止执行，提示用户在测试数据文档中补充 Cookie 或 Authorization |
