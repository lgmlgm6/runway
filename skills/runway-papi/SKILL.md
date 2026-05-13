---
name: runway-papi
description: This skill should be used when the user runs "/runway-papi" or asks to "sync APIs to papi", "upload API definitions to papi", "录入接口到papi", "同步接口到papi". Reads API definitions from tech spec xuecheng document and uploads to the papi system.
version: 0.5.0
---

# runway-papi

从技术方案学城文档中读取接口定义，自动同步到 papi 系统。

## 输入参数

由 runway 编排器传入：

- `tech_spec_contentId` — 技术方案学城文档 ID（standard/fullstack 模式）
- `mini_spec_path` — mini-spec 本地文件路径（lite/litefull 模式，与 tech_spec_contentId 二选一）
- `mis` — 用户 MIS
- `papi_token` — papi 认证 token（来自 project.json）
- `papi_project_id` — papi 项目 ID（来自 project.json）
- `papi_base_url` — papi 项目 BaseUrl，如 `/api/freelance`（来自 project.json，可选）

**模式判断：**

```bash
PIPELINE_MODE=$(jq -r '.pipeline_mode // "standard"' .runway/checkpoint-*.json 2>/dev/null | head -1)
MINI_SPEC_PATH=$(jq -r '.mini_spec_path // empty' .runway/checkpoint-*.json 2>/dev/null | head -1)
```

- lite/litefull 模式：`$MINI_SPEC_PATH` 非空 → 使用本地文件
- standard/fullstack 模式：使用 `tech_spec_contentId` 调学城

## 执行步骤

### 第一步：检查配置

从传入参数读取配置：

```bash
PAPI_TOKEN="{papi_token}"
PAPI_PROJECT_ID="{papi_project_id}"
PAPI_BASE_URL="{papi_base_url}"   # 可为空
```

若 `PAPI_TOKEN` 或 `PAPI_PROJECT_ID` 为空，**正常返回** `papi_sync_status: skipped-no-config`，不抛出错误，不阻断流程。

---

### 第二步：读取接口定义文档

**standard/fullstack 模式**（`MINI_SPEC_PATH` 为空）：

```bash
oa-skills citadel getMarkdown --contentId {tech_spec_contentId} --mis {mis}
```

从返回内容中找到「三、接口协议变更」章节，遍历所有 `### I{N}：接口名称` 块。

**lite/litefull 模式**（`MINI_SPEC_PATH` 非空）：

```bash
cat "$MINI_SPEC_PATH"
```

直接读取本地 mini-spec 文件，从「## 接口设计」章节开始，遍历所有 `### I{N}：接口名称` 块。若文件不存在，返回 `papi_sync_status: skipped-api-unavailable`。

---

**两种模式解析规则相同**，从每个 `### I{N}：` 块提取：

| 字段 | 来源 |
|------|------|
| title | `### I{N}：` 后的接口名称 |
| description | 接口头部表格「接口描述」行 |
| method | 接口头部表格「HTTP 方法」行（可为空，由 Step 5 Shepherd 补全） |
| path | 接口头部表格「URL 路径」行（可为空，由 Step 5 Shepherd 补全） |
| remoteServiceName | 接口头部表格「后端服务」行（Thrift 项目，可无） |
| remoteMethodName | 接口头部表格「后端方法」行（Thrift 项目，可无） |
| request_fields | `**Request 字段：**` 后的表格所有行 |
| response_fields | `**Response 字段：**` 后的表格所有行 |

跳过标有 `**无接口变更。**` 的接口块，直接返回 `papi_sync_status: skipped-no-change`。

---

### 第三步：解析接口 + 字段列表转 lier DSL

#### 3.1 字段列表 → lier DSL 转换规则

技术方案字段表格格式（变更字段）：

```
| 字段名 | 类型 | 变更 | 必填 | 枚举/约束 | 含义 |
```

类型映射：

| 来源类型 | lier 类型 |
|---------|----------|
| str / String | str |
| int / Integer | int |
| long / Long | long |
| bool / Boolean | bool |
| float / double / Double | double |
| `T[]` / `List<T>` | [{ T 字段 }] |
| 嵌套对象 | { 字段 } |

字段注释规则：`含义，必填/可选[，枚举：xxx]`。无枚举时不写枚举部分。

示例（字段列表 → lier DSL）：

**⚠️ 严格格式要求：每个字段必须写成 `fieldName: type  # 注释` 单行，禁止把类型放入引号、禁止拆成多行。**

```
字段：activityName, str, 必填, 最多20字符, 活动名称
字段：activityType, str, 必填, TOP_FEED/MIDDLE_BANNER, 活动类型
字段：categoryId, int, 可选, -, 一级类目ID
字段：list, List<ActivityItem>, 必填, -, 活动列表
  子字段：id, long, 必填, -, 活动ID
  子字段：name, str, 必填, -, 活动名称

转换后（正确）：
{
    # 活动名称，必填，最多20字符
    activityName: str
    # 活动类型，必填，枚举：TOP_FEED/MIDDLE_BANNER
    activityType: str
    # 一级类目ID，可选
    categoryId: int
    # 活动列表
    list: {
        # 活动ID
        id: long
        # 活动名称
        name: str
    }[]
}

❌ 错误格式（禁止）：
{
    activityName: 'str # 活动名称，必填，最多20字符',   ← 禁止引号包裹
    activityType:                                      ← 禁止拆多行
      str
}
```

#### 3.2 全量 Schema 构建

技术方案字段表只记录变更字段（新增/修改/删除），不含存量字段。需从代码 DTO 类补全存量字段后合并。

**1. 从方法全路径解析入参/返回类型**

利用接口头部表格的 `methodFullPath`（如 `com.sankuai.freelance.thrift.TFreelanceService.getActivityList`）获取方法签名，提取入参类型和返回类型。

**2. 从代码仓库读取 DTO 类全量字段**

```bash
find src -name "GetActivityListRequest.java" -type f 2>/dev/null
```

从 Java 类文件提取所有字段（`private` 字段声明、Javadoc 注释、`@NotNull` 等注解）。

嵌套类处理：若字段类型是自定义 DTO，递归搜索并读取对应类文件，展开为嵌套结构。

**3. 合并技术方案变更字段**

以代码读取的全量字段为基础，将技术方案变更字段覆盖/追加：

| 变更类型 | 操作 |
|---------|------|
| 新增 | 追加到全量字段列表末尾 |
| 修改 | 覆盖对应字段的类型/枚举/含义 |
| 删除 | 从全量字段列表中移除 |

**4. 生成最终 lier DSL**

用合并后的全量字段，按 3.1 规则生成完整的 `requestSchema` 和 `responseSchema`。

**失败处理：**
- DTO 类文件未找到 → 仅使用技术方案变更字段生成 Schema，标注 `⚠️ 未找到 DTO 类，Schema 仅含变更字段`，**不中断流程**

---

### 第四步：校验所有接口格式

解析完成后，在录入前对所有接口逐一校验。**只要有任何一个接口不符合规范，立即停止，不录入任何接口。**

| 字段 | 必填 | 校验规则 |
|------|------|---------|
| title | 是 | 非空字符串 |
| description | 是 | 非空字符串 |
| method | 条件必填 | 有值时必须为 GET/POST/PUT/DELETE/PATCH 之一 |
| path | 条件必填 | 有值时必须以 `/` 开头 |
| method + path | 是 | 二者必须同时有或同时为空（都由 Shepherd 补全）；一有一无视为格式错误 |
| responseSchema | 是 | 非空 |

**校验失败时**，输出所有问题并展示标准格式示例，然后停止：

```
文档格式校验失败，请修复后重试：

  ### I2: 创建活动
    - 缺少接口描述
    - method 和 path 必须同时存在或同时由 Shepherd 补全

  ### I3: 查询活动列表
    - 缺少 Response 字段表

标准接口格式示例：

### I1：接口名称

| 字段 | 值 |
|------|----|
| 接口描述 | xxx |
| HTTP 方法 | POST |
| URL 路径 | /api/xxx/yyy |

**Request 字段：**
| 字段名 | 类型 | 变更 | 必填 | 枚举/约束 | 含义 |
...

**Response 字段：**
| 字段名 | 类型 | 变更 | 核心断言 | 含义 |
...
```

**校验全部通过时**，输出：
```
✔ 文档校验通过，共 N 个接口，开始录入...
```

---

### 第五步：检测可用工具

```bash
which mtcurl || which node || which python3 || which python
```

按优先级选择，后续所有 HTTP 请求均使用此工具：

1. **mtcurl**（优先）：自动处理 SSO 认证，URL 必须放在最后
   - 示例：`mtcurl -X POST -H "Content-Type: application/json" -d @/tmp/payload.json http://a.sankuai.com/api/nisp`
   - **注意：header 参数必须放在 URL 之前；body 通过 `-d @文件路径` 传入**
2. **node**：多行脚本写入临时文件后执行
3. **python3 / python**：多行脚本写入临时文件后执行
4. 均不可用 → 停止并提示

**⚠️ node/python 多行脚本必须写入临时文件后执行，严禁使用 `node -e` 内联多行脚本。**

```bash
# 正确做法
node /tmp/papi-request.js
python3 /tmp/papi-request.py

# 禁止
node -e "const https = require('https'); ..."
```

---

### 第六步：判断接口 path，必要时查询 Shepherd

**情况 A：接口信息已有 method + path** → 直接进入第七步。

**情况 B：接口只有 remoteServiceName/remoteMethodName，无 path** → 必须 Shepherd 查询。

**package 前缀补全：**

grep 代码库自动探测，探测失败再询问用户一次：
```bash
grep -r "class {ServiceName}\|interface {ServiceName}" src/ --include="*.java" -l 2>/dev/null
```
从匹配文件的 `package` 声明中提取前缀（如 `com.sankuai.freelance.thrift`）。探测失败 → AskUserQuestion 询问一次，**不写入 project.json**。

**Shepherd 查询（使用 project.json 的 `appkey`）：**

```bash
APPKEY=$(jq -r '.appkey // empty' .runway/project.json 2>/dev/null)

mtcurl -H "m-appkey: $APPKEY" \
  "https://shepherd.mws-test.sankuai.com/spapi/v1/search/api?rangeType=1&conditionType=6\
&remoteAppKey=$APPKEY\
&remoteServiceName={package_prefix}.{remoteServiceName}\
&remoteMethodName={remoteMethodName}&cn=1&sn=10&tn=0"
```

- **成功** → 取 `data.items[0].requestMethod` + `data.items[0].requestPath`，补全接口的 method 和 path
- **0 条结果** → 标记 `status: pending-shepherd-lookup`，写入 `.runway/papi-sync.json`，**跳过该接口，不中断主流程**
- **工具不可用** → 按第五步工具优先级回退

---

### 第七步：拉取 papi 线上数据，判断增量

**7.1 拉取线上接口**

```json
["do", ["user.shakeHands", "$PAPI_TOKEN"], ["project.slim", "$PAPI_PROJECT_ID"]]
```

从响应中构建 `"METHOD 短路径" → apiId` 映射（短路径 = 去除 PAPI_BASE_URL 前缀后的路径）。

**7.2 读取本地同步状态**

从 `.runway/papi-sync.json` 读取（不存在则视为 `{}`）。

文件结构：
```json
{
  "GET /manage/activity/createFormOptions": {
    "apiId": "7b9cc76d-bcb1-4040-8635-c196eb0da793",
    "hash": "a3f5c2d1",
    "remoteServiceName": "OperationQueryRpcTService",
    "remoteMethodName": "queryProductListByPage"
  },
  "_thrift_index": {
    "OperationQueryRpcTService.queryProductListByPage": "GET /manage/activity/createFormOptions"
  }
}
```

`_thrift_index` 是 Thrift 服务方法 → `METHOD PATH` 的反向索引，供 Stage 0.5 和 tech-design Step 4.5 查询，避免重复调用 Shepherd。

**7.3 增量判断**

对每个接口计算 hash（title + description + method + path + requestSchema + responseSchema 拼接）：

| 情况 | 判断 | apiId 来源 |
|------|------|-----------|
| papi-sync.json 有记录，hash 一致 | **跳过** | papi-sync.json |
| papi-sync.json 有记录，hash 不一致 | **更新** | papi-sync.json |
| papi-sync.json 无记录，线上有此 path | **更新** | papi 实时映射 |
| 两处均无记录 | **新增** | — |

**同步前输出接口清单：**

```
共 4 个接口，其中 1 个新增，2 个有变更，1 个无变化（跳过）
  [更新] POST /manage/activity/create           创建活动       (apiId 来自 papi 线上)
  [更新] GET  /manage/activity/createFormOptions 获取表单选项  (apiId 来自 papi-sync.json)
  [新增] GET  /manage/activity/newApi           新接口
  [跳过] GET  /manage/activity/list             无变化
```

所有接口均无变化时直接结束：`所有接口均无变化，无需同步。`

---

### 第八步：逐个同步

**新增**（不传 `id`）：
```json
["do", ["user.shakeHands", "$PAPI_TOKEN"],
  ["project.saveApi", {
    "commit": {
      "info": { "title": "<title>", "description": "<description>", "envs": [], "tags": [], "projectId": "$PAPI_PROJECT_ID", "origin": "Hand" },
      "request": { "method": "<method>", "template": "<短路径>", "paths": [], "queries": [], "headers": [], "body": { "type": "Json", "schema": "<requestSchema>", "declares": [] } },
      "responses": [{ "title": "默认返回值", "code": 200, "headers": [], "body": { "type": "Json", "schema": "<responseSchema>", "declares": [] } }],
      "examples": []
    },
    "projectId": "$PAPI_PROJECT_ID",
    "origin": "Hand"
  }]
]
```

**更新**（传 `"id": "<apiId>"`，与 commit 同级）：
```json
["do", ["user.shakeHands", "$PAPI_TOKEN"],
  ["project.saveApi", {
    "id": "<apiId>",
    "commit": { ... },
    "projectId": "$PAPI_PROJECT_ID",
    "origin": "Hand"
  }]
]
```

每次同步成功后立即更新 `.runway/papi-sync.json`：
- 新增接口：写入 `apiId` + `hash` + `remoteServiceName` + `remoteMethodName`（若有），同时更新 `_thrift_index`
- 更新接口：只改 `hash`，保留 `remoteServiceName`/`remoteMethodName`
- 每次写入后同步维护顶层 `_thrift_index`：`"ServiceName.methodName" → "METHOD /path"`

---

### 第九步：输出结果

```
✓ [新增] POST /manage/activity/create           创建活动
✓ [更新] GET  /manage/activity/createFormOptions 获取表单选项
✗ [更新] POST /manage/activity/list             查询列表 (失败: <错误信息>)
- [跳过] GET  /manage/activity/listFormOptions   无变化
? [待确认] POST /manage/activity/detail         候选：apiId-a, apiId-b（pending-manual-match）
? [待查询] GET  /manage/activity/thriftApi      Shepherd 未找到对应路由（pending-shepherd-lookup）
⚠ [Schema 不完整] GET /manage/activity/legacy  未找到 DTO 类，Schema 仅含变更字段

同步完成：1 新增，1 更新，1 跳过，1 失败，2 待确认
待确认接口需手动在 .runway/papi-sync.json 中指定 apiId 后重新同步。
```

整体 `papi_sync_status`：
- 全部成功（含跳过）→ `success`
- 有待确认、待查询、Schema 不完整或失败 → `partial`
- 全部失败 → `failed`

失败时列出原因，提示用户手动检查。

---

### 第十步：回写 PATH 到来源文档

**触发条件：** 本次同步中，通过 Shepherd 补全了 PATH 的接口（即第六步 Shepherd 查询成功的接口）。

对每个补全了 PATH 的接口，将 `HTTP 方法` 和 `URL 路径` 回写到接口来源文档，确保后续 task-planning 和 code review 能读到完整接口信息。

**lite 模式**（`MINI_SPEC_PATH` 非空）：

读取本地 mini-spec 文件，找到对应的 `### I{N}：` 块，将头部表格中 `HTTP 方法` 和 `URL 路径` 两行的值更新：

```python
# 将：
# | HTTP 方法 |  |
# | URL 路径  |  |
# 更新为：
# | HTTP 方法 | GET |
# | URL 路径  | /api/xxx/yyy |
```

写入后覆盖原文件。

**standard 模式**（`tech_spec_contentId` 非空）：

调学城接口更新文档，将对应接口头部表格的「HTTP 方法」和「URL 路径」行更新：

```bash
oa-skills citadel updateDocument --contentId {tech_spec_contentId} --mis {mis} --content "{更新后的完整文档内容}"
```

**无需回写的情况：**
- 接口 PATH 在生成 mini-spec 或 tech spec 时已填写（新增接口自行生成）
- 接口标记为 `pending-shepherd-lookup`（Shepherd 未找到，PATH 仍为空）
- 接口标记为跳过或失败
