---
name: runway-tclist
description: 根据 PRD 和 API 文档自动生成接口测试用例，写入学城文档。支持 KM 文档链接、本地文件、直接粘贴内容作为输入，覆盖正常流程、入参校验、业务规则三类场景，并包含端到端联合用例。当用户说：生成测试用例、生成用例、帮我写测试用例、generate test cases、test case 时触发。
version: 0.1.0
---

# API Test Case Generator

根据 PRD + API 文档生成测试用例，写入学城文档。

---

## P1 收集输入材料

**runway 编排器调用时，优先从 checkpoint 判断 pipeline_mode：**

```bash
PIPELINE_MODE=$(jq -r '.pipeline_mode // "standard"' .runway/checkpoint-*.json 2>/dev/null | head -1)
```

**lite 模式（pipeline_mode = "lite"）：**

直接读取本地文件，不调用学城接口：

```bash
SPEC_CONTEXT_PATH=$(jq -r '.spec_context_path // empty' .runway/checkpoint-*.json 2>/dev/null | head -1)
MINI_SPEC_PATH=$(jq -r '.mini_spec_path // empty' .runway/checkpoint-*.json 2>/dev/null | head -1)
```

- 从 `$SPEC_CONTEXT_PATH` 读取「需求描述」章节作为需求输入
- 从 `$MINI_SPEC_PATH` 读取接口设计（含字段定义和业务规则）

**standard/fullstack 模式（默认）：**

优先从 checkpoint 读取学城文档 ID，直接调学城获取内容，无需询问用户：

```bash
REQUIREMENTS_SPEC_ID=$(jq -r '.requirements_spec_content_id // empty' .runway/checkpoint-*.json 2>/dev/null | head -1)
TECH_SPEC_ID=$(jq -r '.tech_spec_content_id // empty' .runway/checkpoint-*.json 2>/dev/null | head -1)
MIS=$(jq -r '.mis // empty' .runway/project.json 2>/dev/null)
```

- 若 `REQUIREMENTS_SPEC_ID` 非空 → `oa-skills citadel getMarkdown --contentId "$REQUIREMENTS_SPEC_ID" --mis "$MIS"` 读取需求规格（含业务规则、AC 表）
- 若 `TECH_SPEC_ID` 非空 → `oa-skills citadel getMarkdown --contentId "$TECH_SPEC_ID" --mis "$MIS"` 读取技术方案（含接口定义、字段）
- 若两者均为空（手动调用场景）→ 走下方通用识别逻辑

**通用识别逻辑（手动调用时）：**

| 输入类型 | 识别方式 | 处理 |
|---------|---------|------|
| KM 文档链接 | URL 含 `km.sankuai.com` | 【最高优先级】用 `oa-skills citadel getMarkdown --contentId <id>` 读取；失败时降级用 `get_km_doc` MCP 工具 |
| 本地文件路径 | 用户提供本地路径 | 用 Read 工具读取 |
| 直接粘贴内容 | 对话中包含接口定义或 PRD 文本 | 直接使用 |
| 无输入 | 用户未提供任何材料 | 询问：需要 PRD 链接或 API 文档路径 |

从材料中提取：
- **接口列表**：METHOD + PATH + 描述
- **字段定义**：每个接口的入参字段、类型、是否必填、枚举值
- **业务规则**：`**业务规则**:` 章节下的所有规则

以技术方案的接口字段定义为准，需求规格用于补充业务规则和 AC 验收条件。

---

## P2 确认写入位置

**runway 编排器调用场景（自动获取，无需询问用户）：**

编排器通过 checkpoint 传入 `citadel_parent_id`，直接用作父文档 ID，**不询问用户**：
```bash
PARENT_ID=$(jq -r '.citadel_parent_id' .runway/checkpoint-*.json 2>/dev/null | head -1)
```

生成前还需读取 `test_data_km_url`（project.json），提取已有占位符 key，生成用例时优先复用已有命名，防止 Stage 10 执行时占位符缺失：
```bash
TEST_DATA_URL=$(jq -r '.test_data_km_url // empty' .runway/project.json 2>/dev/null)
if [[ -n "$TEST_DATA_URL" ]]; then
  # 读取测试数据文档，提取已有 key 列表
  TEST_DATA_CONTENT=$(oa-skills citadel getMarkdown --contentId "{id_from_url}" --mis "{mis}" 2>/dev/null)
fi
```

**手动调用场景：**

询问用户（若未提供）：
- **写入位置**：测试用例文档写入哪个学城文档下（提供父文档链接）

---

## P3 生成测试用例

**开始生成前，必须先读取以下两个文件，完整理解后再生成，不得跳过**：
- `references/test-case-spec.md`：用例编号规则、三类场景的生成策略、占位符规范、E2E 设计原则
- `references/test-case-template.md`：文档结构模版，输出格式必须与模版完全一致

**强制格式要求**（违反任一条视为不合格）：
- **严禁竖向两列表格**（项目/内容格式），必须使用横向多列表格
- 每个接口用**一张横向多列表格**，列顺序固定为：`编号 | 场景类型 | 场景描述 | 请求体 | 预期结果`
- **请求体禁止用反引号包裹**，直接写 `key=value, key2=value2` 格式，不写 JSON 对象
- 文档头部使用 `>` 引用块，包含测试环境和用例总数，格式：`单接口 {tc_total} 条 + E2E {e2e_total} 步，共 {total} 条`
- 表格内行按 **正常流程 → 入参校验 → 业务规则** 顺序排列，不拆分成多个子表
- 用例编号格式：`TC-{接口序号}-{用例序号}`，E2E 步骤：`E2E-{序号}-Step{步骤序号}`
- E2E 用例用独立章节，表格列固定为：`编号 | 接口 | 请求体 | 预期结果`
- 动态值用 `{占位符}` 表示，固定参数直接写具体值（如 `pageNum=1`）
- 生成完毕后统计实际用例数，填入文档头部

---

## P4 写入学城文档

【最高优先级】统一使用 `oa-skills citadel` CLI 操作学城文档，禁止优先使用 MCP 工具：

1. 从父文档 URL 中提取 `contentId`
2. 用 `oa-skills citadel createDocument --title "{模块名} - 测试用例" --parentId <contentId> --content "<markdown>"` 创建子文档
3. 失败时降级用 `create_km_doc` MCP 工具（需先用 `get_doc_or_space_info` 确认 `spaceId`）
4. 写入完成后在对话中输出文档链接

**禁止**：直接执行用例；本 skill 只生成文档，不执行任何 HTTP 请求。
