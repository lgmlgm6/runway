---
name: runway-bug-analysis
description: "测试报告分析 skill。读取 KM 学城或本地测试报告，自动提取失败用例，通过 MTrace 获取调用链、LogCenter 获取详细日志，生成结构化失败分析报告并写入 KM 子目录。当用户提到「分析测试报告」「失败用例分析」「测试报告日志分析」「trace 分析」时激活。"
version: 0.1.0
---

# 测试报告分析（test-report-analysis）

## 你的角色

你是一名资深测试工程师，擅长分布式调用链分析和日志排查。本 skill 被触发后，你将**主动驱动**整个分析流程，自动从测试报告中提取失败用例，通过 MTrace 查询每个 traceId 的调用链、通过 LogCenter 获取详细日志堆栈，提炼根因，生成结构化分析报告并输出到 KM。

**目标**：对测试报告中的失败用例，**每个用例输出一个独立表格**，包含 TraceId、接口、方法名、输入参数、输出参数、根因、错误代码摘要、Bug 性质、修复建议，结果写入 KM 子文档，供代码修复模块直接消费。

---

## 工作流程

```
Step 1 读取报告 → Step 2 提取失败用例 → Step 3 MTrace 查询 → Step 3.5 LogCenter 补充日志 → Step 4 生成报告 → Step 5 写入 KM
```

每步完成后**主动推进**，不等用户发起。

---

## Step 1：读取测试报告

**你的行为**：skill 触发后，立即收集以下输入：

### 1.1 测试报告来源

优先从用户消息中提取，支持以下方式：

| 方式 | 处理 |
|------|------|
| KM 文档链接（`km.sankuai.com/collabpage/<id>`） | 调用 `oa-skills citadel getMarkdown --contentId <id>` 读取 |
| 本地文件路径（`.md` / `.json`） | 直接读取文件内容 |
| `.specify/<feature>/reports/` 目录 | 自动探测最新报告文件 |

### 1.2 报告写入位置

**runway 编排器调用场景（自动获取，规则如下）：**

编排器通过 checkpoint 传入 `tclist_content_id` 和 `bug_analysis_content_id`，按以下逻辑决定写入行为：

- `bug_analysis_content_id` **不存在**（首轮）→ **新建模式**：
  - parentId = `tclist_content_id`（来自 checkpoint）
  - 标题 = `{功能名} - 失败用例分析`
  - 创建后写入 `bug_analysis_content_id` 到 checkpoint

- `bug_analysis_content_id` **已存在**（后续轮）→ **追加模式**：
  - 读取现有文档内容，在末尾追加 `## Round {fix_round}（{时间戳}）` 章节
  - 通过 `updateDocumentByMd` 更新，**不新建文档**

**轮次 diff 防编造（fix_round > 0 时必须执行）：**

在输出新分析前，先读取上一轮 `bug_analysis_content_id` 的内容做 diff：
- 本轮「服务 Bug」列表与上一轮完全相同（TC 编号 + 根因一致）→ 输出「无新发现，已知问题未收敛」，直接进入循环退出判断，不重新描述
- AI 换角度重述同一 bug → 视为重复，不算新发现
- 只有新增 TC 编号或新增根因定位才算「新发现」

**超出 FIX LOOP 范围的问题：**

若分析发现属于以下情况，立即退出 FIX LOOP，在分析报告中标记「需求级别问题」并说明根因，然后直接返回编排器继续后续阶段：
- 接口设计有根本性错误（根因在 Stage 2 接口设计层）
- 业务逻辑在需求阶段理解错误（根因在 Stage 1 需求理解层）

不暂停流水线，不等待用户回复。若后续无其他阶段，编排器直接进入 Stage 12 汇总结果。FIX LOOP 自身不触发任何 Stage 回退。

**手动调用场景（默认行为）：**

分析报告作为子文档写入来源测试报告所在的**同一 KM 文档**（即输入报告的 `contentId` 即为 `parentId`）。

- 来源报告是 KM 链接 `km.sankuai.com/collabpage/<id>` → 分析报告的 `parentId = <id>`
- 来源报告是本地文件 → 提示用户提供 KM 父文档链接，或留空输出到对话中

> ⚠️ **不主动询问写入位置**：仅当来源报告为本地文件、且用户未提供 KM 链接时，才询问。

### 1.3 环境

从报告内容中自动识别测试环境，用于 MTrace 查询，**不询问用户**。按优先级依次尝试：

1. **报告头部环境字段**（优先）：读取报告元信息中明确标注的「环境」「测试环境」「env」等字段，值含 `test`/`staging` → `true`，含 `prod`/`production` → `false`
2. **请求 URL 推断**（降级）：报告中出现的完整请求 URL 含 `.test.` 或 `test.sankuai.com` → `true`；含 `prod` 或不含 `test` 关键字 → `false`
3. **无法识别**：以上均不适用时，询问用户

| 识别方式 | is_test_env |
|---------|-------------|
| 头部字段含 `test`/`staging` | `true` |
| 头部字段含 `prod`/`production` | `false` |
| URL 含 `.test.` 或 `test.sankuai.com` | `true` |
| URL 含 `prod` 或不含 `test` | `false` |
| 无法识别 | 询问用户 |

**完成标志**：报告内容已读取，输出摘要（功能名、执行时间、总用例数、失败数），主动推进到 Step 2。

---

## Step 2：提取失败用例

**你的行为**：从报告中提取所有 ❌ 失败用例，构造待分析列表。

### 提取规则

从报告的「失败用例」区块中，逐用例提取：

| 字段 | 提取规则 |
|------|---------|
| 用例名 | 报告中的用例名称 |
| API | `HTTP方法 /路径` |
| M-TraceId | 从 `M-TraceId` 字段直接读取（可含负数）；若字段缺失则标记为「无 TraceId」 |
| 请求输入 | 报告中的「输入」段 |
| 期望输出 | 报告中的「期望输出」段 |
| 实际输出 | 报告中的「实际输出」段 |

> ⚠️ **注意负数 TraceId**：MTrace 接受原始负数，直接传入，无需转换。

**无 TraceId 用例**：跳过 MTrace 查询，直接在 Step 4 根据报告中的错误信息判断根因，在分析表格中注明「无可查调用链，根据报告错误信息判断」。**仅分析状态为 Fail 的用例**，Skip（跳过）用例不提取、不分析、不写入报告。

输出提取摘要：共 N 个失败用例（含 TraceId: M 个，无 TraceId: N-M 个），列出用例名和 TraceId。主动推进到 Step 3。

---

## Step 3：MTrace 查询调用链

**你的行为**：对每个 TraceId 调用 MTrace MCP 工具，获取调用链详情。

**并行策略**：
1. 所有 TraceId 的 MTrace 查询**同时发起**（一次并行发出所有调用）
2. 某个用例的 MTrace 返回后，**立即**判断是否触发该用例的 LogCenter 查询（Step 3.5），不等其余用例的 MTrace 结果
3. Step 3 的完成标志是：**所有用例的 MTrace + LogCenter 均已完成**，此时一并推进到 Step 4

### 查询方式

```
mcp__plugin_meituan-local-mcp_mtrace_mcp__get_trace_by_trace_id(
  trace_id = "<TraceId>",
  is_test_env = true/false,   # 根据 Step 1.3 环境决定
  show_events = true          # 开启事件，可获取异常名称
)
```

### 从调用链提取信息

| 目标字段 | 提取位置 |
|---------|---------|
| 方法名 | 最深层 Span 的 method，通常是业务服务的 RPC/HTTP 方法 |
| serverAppKey | 出错 Span 的 `serverAppKey`，用于 Step 3.5 定位 logName |
| 输入参数 | 网关层 HTTP Span 的 Tags（clientIp、path），结合报告中的 request body |
| 输出参数 | 报告中的「实际输出」（MTrace 不含 response body，以报告数据为准） |
| 失败原因 | Span 的 `exceptionName`、`Events` 中的异常信息，结合报告中的错误消息综合判断 |

### 无数据处理

| 情况 | 处理 |
|------|------|
| MTrace 返回 `NoneType` 或空 | 标注「MTrace 无数据（Span 未上报或已过期）」，根据同类用例推断根因 |
| 根 Span 缺失（虚拟 Span） | 标注「根 Span 缺失」，分析已有下游 Span |
| TraceId 为负数查询失败 | 直接传负数重试，不做符号转换 |

**完成标志**：所有用例的 MTrace 查询已发起，且每个用例的 LogCenter 查询（Step 3.5）均已完成（或被跳过），主动推进到 Step 4。

---

## Step 3.5：LogCenter 补充日志

**你的行为**：每个用例 MTrace 查完后立即判断是否触发；不等其他用例的 MTrace 结果。所有查询均通过 MCP 工具完成，不使用 LogCenter CLI。

### 何时触发

| 条件 | 是否查询 LogCenter |
|------|-------------------|
| MTrace Span 有 `exceptionName` | ✅ 查询 |
| MTrace Span Status 为 `EXCEPTION` 或 `TIMEOUT` | ✅ 查询 |
| MTrace 无数据（Span 未上报/已过期） | ✅ 查询（作为唯一日志来源） |
| MTrace 调用链完整、无异常、Status SUCCESS，但报告含业务错误码（非 50102） | ✅ 查询（业务层可能有 WARN 日志含变量值） |
| MTrace 调用链完整、无异常、Status SUCCESS，报告无业务错误码 | ❌ 跳过 |
| 无 TraceId 用例 | ✅ 尝试按接口路径 + 时间范围查询 |

### 查询方式

**第一步：定位 logName**

从 MTrace 出错 Span 的 `serverAppKey` 查找对应日志名：

```
mcp__plugin_meituan-local-mcp_logcenter_mcp__search_log_name_by_keywords_or_appkey(
  appkey = "<serverAppKey>",
  is_test_env = true/false
)
```

返回结果中优先选择名称含 `error`、`warn`、`exception` 的 logName；若无，选 appkey 对应的主业务日志。同时记录返回的 `storage` 字段（`1` = Eagle/ES，`2` = InfluxDB），决定后续查询 DSL 格式。

**无 TraceId 用例 / MTrace 无数据**：无法从 Span 提取 `serverAppKey`，改用报告的接口路径或用例所属服务名作为 keyword 搜索：

```
mcp__plugin_meituan-local-mcp_logcenter_mcp__search_log_name_by_keywords_or_appkey(
  keyword = "<服务名关键词>",
  is_test_env = true/false
)
```

**第二步：查询日志**

使用 `execute_query` MCP 工具，注意以下坑点：

> ⚠️ **时间格式**：`mt_datetime` 字段的 range 查询必须用 `"2026-05-08 11:00:00+08:00"` 格式（含时区 `+08:00`），不能用空格分隔的无时区格式，否则报 `parse_exception`。

Eagle 存储（`storage=1`）— ES JSON DSL：

```
mcp__plugin_meituan-local-mcp_logcenter_mcp__execute_query(
  logName = "<logName>",
  is_test_env = true/false,
  esJsonDSL = {
    "query": {
      "bool": {
        "must": [
          {"term": {"traceId__": "<traceId>"}},
          {"terms": {"mt_level": ["ERROR", "WARN", "INFO"]}}
        ],
        "filter": [{"range": {"mt_datetime": {
          "gte": "<报告执行时间 -12h，格式 2026-05-08 00:00:00+08:00>",
          "lte": "<报告执行时间 +12h，格式 2026-05-08 23:59:00+08:00>"
        }}}]
      }
    },
    "sort": [{"mt_datetime": {"order": "asc"}}],
    "size": 10
  }
)
```

> 若 traceId 查不到结果（日志未打 traceId），去掉 `traceId__` 条件，改用接口路径关键词过滤 `message` 字段，缩小时间范围至报告执行时间 ±1h。

InfluxDB 存储（`storage=2`）— SQL 语法：

> ⚠️ **InfluxDB 负数 traceId 必须用 `esJsonDSL.sql` 字段**：`-q` 参数对负数值报错，统一改用 `sql` 字段传入完整 SELECT 语句。

```
# 按 traceId 查询（traceId 为负数时同样适用）
mcp__plugin_meituan-local-mcp_logcenter_mcp__execute_query(
  logName = "<logName>",
  is_test_env = true/false,
  esJsonDSL = {
    "sql": "SELECT time, mt_level, message FROM log WHERE traceId__ = '<traceId>' AND mt_level IN ('ERROR', 'WARN', 'INFO') AND time >= '<报告执行时间 -12h，格式 2026-05-08 00:00:00>' AND time <= '<报告执行时间 +12h，格式 2026-05-08 23:59:00>' LIMIT 10"
  }
)

# 降级：按接口路径关键词过滤 message（查不到 traceId 结果时）
mcp__plugin_meituan-local-mcp_logcenter_mcp__execute_query(
  logName = "<logName>",
  is_test_env = true/false,
  esJsonDSL = {
    "sql": "SELECT time, mt_level, message FROM log WHERE message LIKE '%<接口路径关键词>%' AND mt_level IN ('ERROR', 'WARN', 'INFO') AND time >= '<报告执行时间 -1h>' AND time <= '<报告执行时间 +1h>' LIMIT 10"
  }
)
```

> InfluxDB 时间格式不含时区后缀（服务端默认 UTC+8），与 Eagle 的 `+08:00` 格式不同，注意区分。

### 从日志提取信息

| 目标字段 | 提取位置 |
|---------|---------|
| 完整堆栈 | `message` 字段中的 `Exception` + `at ...` 行 |
| 出错类名/方法名 | 堆栈第一行 `at com.xxx.ClassName.method(File.java:行号)` |
| 业务变量值 | `message` 中打印的入参、ID、状态值等 |
| 日志级别 | `mt_level`（ERROR/WARN） |

### 无数据处理

| 情况 | 处理 |
|------|------|
| LogCenter 无结果 | 标注「LogCenter 无日志（未打印/已过期）」，仅凭 MTrace 和报告数据分析 |
| logName 找不到 | 标注「未找到对应 logName」，跳过该用例的 LogCenter 查询 |

**完成标志**：所有触发条件的用例均已尝试 LogCenter 查询，主动推进到 Step 4。

---

## Step 4：生成分析报告

**你的行为**：综合 Step 2 的报告数据、Step 3 的 MTrace 调用链、Step 3.5 的 LogCenter 日志，生成结构化分析报告。

> ⚠️ **报告面向代码修复模块消费**：结构需精简、字段需准确，避免冗余文本影响下游解析。

### 报告结构

```markdown
# <功能名> 失败用例日志分析报告

- 功能 / 分析时间 / 环境 / 来源报告链接 / 失败用例数

---

## 失败用例分析

---

### <用例编号>：<用例名>

| 字段 | 内容 |
|------|------|
| TraceId | `xxx` |
| 接口 | `HTTP方法 /路径` |
| 方法名 | `ServiceName.method`（MTrace 最深业务层 Span） |
| 输入参数 | 完整请求体 JSON |
| 输出参数 | `code=N, msg="..."` |
| 根因 | 一句话：异常类型 + 触发位置 + 触发原因 |
| 错误代码摘要 | 指出出错的类名/方法名，说明哪行逻辑有问题，可含关键代码片段或常量值 |
| Bug 性质 | 服务 Bug / 测试数据缺口 / 待确认 |
| 修复建议 | 具体到类名/方法名的修复方向，说明应加什么校验或改什么逻辑 |

---

### <下一个用例>

...（每个失败用例独立一节）
```

> ❌ **不生成跳过用例（Skip）说明章节**：Skip 用例属于测试数据缺口，不是服务 Bug，不在本报告范围内。报告只包含「失败用例分析」章节，不输出「跳过用例说明」或类似内容。

### 各字段撰写规则

| 字段 | 规则 |
|------|------|
| **方法名** | 取 MTrace 最深层的业务服务 Span method，通常是 `XxxService.method` 形式 |
| **根因** | 写明：异常类型（如 `NumberFormatException`）+ 触发位置（如「业务层 ID 解析」）+ 触发条件（如「输入超 Long 范围」）；若 LogCenter 有堆栈，精确到类名+行号 |
| **错误代码摘要** | 优先引用 LogCenter 堆栈中的第一帧（如 `at com.xxx.Foo.bar(Foo.java:42)`），说明该行逻辑的问题；无堆栈时指向 MTrace 出错 Span 的方法，可附关键常量或边界值 |
| **Bug 性质** | 明确三选一：`服务 Bug` / `测试数据缺口` / `待确认` |
| **修复建议** | 具体到类名 + 操作（如「在 `XxxValidator.validateXxx` 中增加 ID 格式校验，过滤非法格式而非报错」）；不写「后续行动」「联系研发」等模糊表述 |

> ❌ **不生成以下内容**（会导致 token 超长且对代码修复模块无用）：
> - 调用链树形详情（网关 → SSO → 业务层的完整 Span 树）
> - MTrace 查询结果原始数据附录
> - 后续行动 / 跟进人 / 时间计划
> - 跳过用例（Skip）说明章节

### 同根因合并提示

生成完所有用例表格后，检查是否存在根因相同的用例。若有，在报告末尾追加（此内容也必须写入 KM 文档，不能只在对话中输出）：

> ⚠️ TC-X-X / TC-X-X（共 N 个用例）根因相同，定位到同一处代码缺陷，可一次性修复。

**完成标志**：每个失败用例均已生成独立表格（含同根因合并提示），主动推进到 Step 5。

---

## Step 5：写入 KM

**你的行为**：将报告写入 KM 子文档，并自动添加目录。

**runway 编排器调用场景优先级最高，严格按 checkpoint 执行：**
- `bug_analysis_content_id` 不存在 → 以 `tclist_content_id` 作为 `parentId` 新建分析文档
- `bug_analysis_content_id` 已存在 → 直接更新该文档，**不要**改用来源测试报告的 `contentId`
- `mis` 由编排器 / checkpoint 提供，收到后直接复用，**不要**再用 `whoami` 推断，也不要再次询问用户

**手动调用场景（仅 fallback）**：
- 来源报告为 KM 链接时，可将分析报告写到该报告所在目录
- 来源报告为本地文件且用户未提供 KM 父文档时，才退化为仅输出到对话中或询问一次

### 5.1 内容预处理

写入前对 Markdown 做以下替换（KM 严格区分大小写）：

| 原始 | 替换为 | 原因 |
|------|--------|------|
| ` ```json ` | ` ```JSON ` | KM 只认大写 JSON |
| 裸 ` ``` `（无语言标识） | ` ```Shell ` | 调用链树形图用 Shell 高亮 |

### 5.2 获取 MIS 号

`oa-skills citadel` 的所有写操作均需 `--mis` 参数。

- **runway 编排器调用场景**：直接使用编排器提供的 `mis`
- **手动调用场景**：若用户未提供，再尝试 `whoami`；只有推断失败时才询问用户

```bash
# 仅手动调用场景需要时使用
whoami
```

### 5.3 创建文档（占位）

> ⚠️ **禁止通过 `--content` 传入报告正文**：`--content` 参数在传入含双引号、反引号的长文本时，shell 转义不可靠，会导致内容截断（表格末行丢失、整节缺失等）。正文必须走文件写入流程。

仅用 `--content` 传一行占位摘要，拿到 `contentId`：

```bash
oa-skills citadel createDocument \
  --title "<功能名> 失败用例日志分析报告 <日期>" \
  --parentId <父文档ID> \
  --content "（报告生成中，请稍候）" \
  --mis <MIS号>
```

记录返回的 `contentId`，推进到 5.3。

### 5.4 写入完整内容并添加目录（必须执行）

**用 Write 工具**将完整报告以 CitadelMD 格式写入临时文件，再通过 `updateDocumentByMd --file` 回传。CitadelMD 文件须以 `:::title:::` + `:::catalog:::` 开头：

```
:::title{nodeId="title-001"}
<功能名> 失败用例日志分析报告 <日期>
:::

:::catalog{style="none" nodeId="toc-auto-001"}:::

<报告正文的 Markdown 内容>
```

完整流程：

```bash
# 1. 用 Write 工具将上述 CitadelMD 内容写入 /tmp/report-citadelmd.txt
#    （Write 工具直接写文件，不经过 shell 参数，无转义问题）

# 2. 回传更新
oa-skills citadel updateDocumentByMd --contentId <新文档ID> --file /tmp/report-citadelmd.txt --mis <MIS号>
```

> **为什么这样做**：Write 工具直接写文件，完全绕开 shell 转义限制；`:::title:::` + `:::catalog:::` 在文件头部一并写入，无需事后 Python 脚本插入，流程更简单可靠。

### 5.5 完成

返回 KM 文档链接，提示用户刷新页面查看目录和内容。

**来源报告为本地文件且用户未提供 KM 链接时**：在对话中直接输出完整 Markdown，告知可复制到 KM。

**完成标志**：输出 KM 文档链接（已含目录），分析结束。

---

## 工具依赖

| 工具 | 类型 | 用途 | 调用方式 / 认证 |
|------|------|------|----------------|
| `oa-skills citadel getMarkdown` | CLI | 读取 KM 测试报告 | `--contentId <id> --mis <mis>`；通过 `--mis` 传入美团工号完成认证 |
| `mcp__plugin_meituan-local-mcp_mtrace_mcp__get_trace_by_trace_id` | MCP | 查询 MTrace 调用链 | `trace_id`, `is_test_env`, `show_events=true`；MCP 自动携带 SSO，无需额外认证 |
| `mcp__plugin_meituan-local-mcp_logcenter_mcp__search_log_name_by_keywords_or_appkey` | MCP | 按 appkey 或关键词定位 logName，同时获取存储类型 | `appkey`, `is_test_env`；MCP 自动携带 SSO |
| `mcp__plugin_meituan-local-mcp_logcenter_mcp__execute_query` | MCP | 查询日志堆栈（Eagle ES DSL 或 InfluxDB SQL） | `logName`, `esJsonDSL`, `is_test_env`；MCP 自动携带 SSO |
| `oa-skills citadel createDocument` | CLI | 创建空文档拿 contentId（仅传占位摘要） | `--parentId`, `--title`, `--content "（报告生成中）"`, `--mis`；通过 `--mis` 认证 |
| `oa-skills citadel updateDocumentByMd` | CLI | 写入完整报告正文（含目录节点） | `--contentId <id> --file <file> --mis <mis>`；通过 `--mis` 认证 |

---

## 约束

- **只读**：不修改任何测试报告原文或业务数据
- **编排器优先写入规则**：首轮必须以 `tclist_content_id` 作为 `parentId` 新建分析文档；后续轮次必须更新 `bug_analysis_content_id` 指向的同一文档，不得回退为“来源报告 contentId = parentId”
- **手动调用时才允许按来源报告推断写入位置**：仅 fallback 场景可使用来源报告目录作为 parentId
- **负数 TraceId 直接传入**：MTrace 接受负数，无需转换正数
- **不猜测 traceId**：只分析报告中明确记录的 traceId
- **代码块语言标识**：写入 KM 前，`json` → `JSON`，裸 ` ``` ` → ` ```Shell `（KM 严格区分大小写）
- **正文禁止走 `--content`**：`createDocument --content` 只传一行占位摘要；完整报告正文必须用 Write 工具写入 `/tmp/report-citadelmd.txt`（CitadelMD 格式，含 `:::title:::` + `:::catalog:::`），再通过 `updateDocumentByMd --file` 回传，彻底规避 shell 转义截断问题
- **目录与正文一并写入**：CitadelMD 文件头部直接包含 `:::catalog{style="none" nodeId="toc-auto-001"}:::`，无需事后 Python 脚本插入
- **只分析 Fail 用例**：仅提取状态为 Fail 的用例，Skip（跳过）用例不提取、不分析、不写入报告，报告中不输出「跳过用例说明」章节
- **失败原因分层**：区分「测试数据缺口」「服务 Bug」「待确认」三类，避免误导
- **编排器调用场景不重复要 MIS**：收到 `mis` 后直接复用；只有手动调用且无法推断时才询问用户
- **所有外部查询均并行发起**：MTrace 多个 TraceId 同时查；每个用例 MTrace 查完立即触发该用例的 LogCenter 查询，不等其他用例
- **MTrace 无数据时**：标注原因（未上报/已过期），不凭空捏造调用链；同时触发 LogCenter 查询作为补充
- **LogCenter 只用 MCP**：所有日志查询均通过 `mcp__plugin_meituan-local-mcp_logcenter_mcp__*` 工具完成，不使用 LogCenter CLI（CLI 在 Claude Code 环境中 SSO 认证路径不通）
- **LogCenter 存储类型**：`search_log_name_by_keywords_or_appkey` 返回的 `storage` 字段决定 DSL 格式（`1`=Eagle/ES，`2`=InfluxDB）
- **LogCenter 时间格式**：`mt_datetime` range 查询必须用 `"2026-05-08 11:00:00+08:00"` 格式（含 `+08:00` 时区），否则报 `parse_exception`
- **LogCenter 查询加时间范围**：限定报告执行时间 ±12h；降级查询（无 traceId）缩小至 ±1h
- **LogCenter 优先 traceId 查询**：先用 traceId 过滤，查不到结果再降级用接口路径关键词过滤 `message` 字段
- **LogCenter 无数据时**：标注「LogCenter 无日志」，不影响根因分析，仅说明深度受限

---

## 典型失败模式速查

| 现象 | 调用链特征 | LogCenter 日志特征 | 通常根因 |
|------|-----------|-------------------|---------|
| `code:50102` + 耗时 25-35ms | 网关 → SSO，SSO 有 `exceptionName` | SSO 服务 ERROR：`MalformedJwtException` 堆栈 | 无效 ssoid，SSO 层拦截 |
| `code:50102` + 耗时 0ms | 仅网关 1 个 Span，无下游 | 网关日志 WARN：`missing cookie` 或 `no auth` | 无 Cookie，网关短路，未调用 SSO |
| `code:3` + 业务错误消息 | 调用链完整，无异常 | 业务服务 WARN：含具体校验失败原因和业务变量值 | 业务规则校验失败（帖子状态不对、数据不存在等） |
| MTrace 无数据 | — | 业务服务 ERROR：完整堆栈（MTrace 唯一替代来源） | Span 未上报或已超过保留期（通常 3 天） |
| 根 Span 缺失（虚拟 Span） | 下游 Span 存在，根缺失 | 网关日志可能有请求记录 | 网关侧 Span 丢失，不影响下游分析 |
