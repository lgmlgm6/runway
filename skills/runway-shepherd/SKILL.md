---
name: runway-shepherd
description: "根据 Java Thrift 接口定义代码自动在美团 Shepherd（牧羊人）网关创建 API 配置。读取 Thrift Service 接口文件，解析方法签名、参数类型、返回值，自动生成符合 Shepherd 规范的 API 配置并调用接口完成创建。当用户提到"创建shepherd接口"、"配置牧羊人"、"thrift接口发布到shepherd"、"创建网关接口"、"shepherd API"、"牧羊人网关"、"批量创建API"、"网关配置"，或给出 Java Thrift 接口文件并希望发布为 HTTP API 时使用此 Skill。"
version: 0.1.0
---

 
# runway-shepherd

根据 Java Thrift 接口定义，自动在 Shepherd 网关创建 API 配置。

## 整体流程

```
目标环境判断 → 读取 Thrift 接口文件 → 解析方法和参数 → 获取分组已有配置 → 生成 API 配置 → 批量创建 → 验证结果 → 自动发布（仅编排器明确要求时）
```

**runway 编排器调用场景优先规则：**
- Stage 7 的默认目标是自动完成 Shepherd 创建，并把状态交回主编排器
- 不要把“是否继续”“是否发布”当作新的人工确认点
- 只有真实 blocker（鉴权失败、分组不存在、生产环境发布被明确要求二次确认等）才允许停下
- 若主编排器未显式要求自动发布，则本 skill 的成功标准是“创建完成并返回状态”，不是“等待用户确认后再发布”

**手动调用场景** 才保留更强的交互式确认。


## 调用方式：mtcurl

本 Skill 通过 `mtcurl` 调用 Shepherd API。mtcurl 内置美团 SSO 鉴权，无需浏览器或额外登录。

**在执行任何 mtcurl 命令前，先检测是否已安装：**

```bash
if ! command -v mtcurl &> /dev/null; then
  echo "mtcurl 未安装，正在安装..."
  UV_INDEX_URL=https://pypi.sankuai.com/simple/ uv tool install mt-curl-cli
fi
```

安装要求：Python 3.10+，需已登录任意美团内部服务（SSO cookie 自动从浏览器提取）。

**⚠️ mtcurl 参数顺序与标准 curl 不同：URL 必须放在最后！**

```bash
# ✅ 正确写法：URL 在最后
mtcurl -X POST -H 'Content-Type: application/json' -d '{"key":"value"}' 'https://shepherd.mws-test.sankuai.com/spapi/v1/apis/add'

# ❌ 错误写法：URL 在中间（会报错）
mtcurl -X POST 'https://shepherd.mws-test.sankuai.com/spapi/v1/apis/add' -H '...' -d '...'
```

mtcurl 使用要点：

- URL 必须用完整绝对路径（`https://shepherd.mws-test.sankuai.com/spapi/v1/...`），不是相对路径
- `-d` 的 JSON 内容需要正确 shell 转义，建议复杂 JSON 先写入临时文件再用 `-d @/tmp/payload.json`
- GET 请求可以省略 `-X GET`

## Step 0：目标环境判断

根据用户的描述确定目标环境：

| 用户说的                     | 环境     | 管理平台地址                            |
| ---------------------------- | -------- | --------------------------------------- |
| 线下、测试、test             | 测试环境 | `https://shepherd.mws-test.sankuai.com` |
| 线上、生产、prod、production | 生产环境 | `https://shepherd.mws.sankuai.com`      |

如果用户没有明确说环境，默认为测试环境

```
SHEPHERD_HOST=https://shepherd.mws-test.sankuai.com  # 或 https://shepherd.mws.sankuai.com
```

## Step 1：读取并解析 Thrift 接口文件

用户会提供 Java Thrift Service 接口文件的路径（或直接贴代码）。读取文件后，提取：

对每个 `@ThriftMethod` 标注的方法（或接口中定义的方法），记录：

| 字段        | 来源                                                  |
| ----------- |-----------------------------------------------------|
| methodName  | Java 方法名                                            |
| displayName | `@MethodDoc(displayName=...)` 注解中或注释中的中文名（如有） |
| parameters  | 方法参数列表（类型 + 参数名）                                    |
| returnType  | 返回值类型                                               |

接口类名从 `public interface TXxxService` 提取，完整 serviceName 需要拼包路径，如 `com.sankuai.xxx.service.TXxxService`。


## Step 2：获取分组已有配置

用户会提供 Shepherd 分组链接（如 `https://shepherd.mws-test.sankuai.com/api-group-detail?api_group_name=xxx&api_group_id=123&group_tab=api-manage`），从中提取 `apiGroupName` 和 `apiGroupId`。

### 2.1 获取已有接口列表

```bash
mtcurl -X GET '{SHEPHERD_HOST}/spapi/v1/apis/{apiGroupId}'
```

从返回结果的 `data` 数组中提取以下信息，**必须保存为变量供后续使用**：

```
EXISTING_APPKEY       = data[0].invokerViews[0].appkey
EXISTING_PATH_PREFIX  = data[0].pathPrefix            // 注意：可能是空字符串 ""，直接使用，不要替换为其他值
EXISTING_FILTER_VIEWS = data[0].filterViews          // 完整 JSON 对象，含限流/熔断等策略
EXISTING_RESP_HEADERS = data[0].responseHeaders       // 完整 JSON 数组，含 CORS 等响应头
EXISTING_RESP_COOKIES = data[0].responseCookies       // 完整 JSON 数组，含响应 Cookie
EXISTING_API_NAMES    = data.map(a => a.name)         // 已有接口名列表（跳过重复）
EXISTING_API_PATHS    = data.map(a => a.path)         // 已有路径列表（分析路径模式）
```

**⚠️ 关键：`EXISTING_FILTER_VIEWS`、`EXISTING_RESP_HEADERS`、`EXISTING_RESP_COOKIES` 必须提取完整 JSON 值（可能是很长的对象/数组），不能省略或简化。这些值将直接写入每个新接口的 payload 中。如果 data[0] 中这三个字段为空，再尝试从其他 data[n] 中获取。**

**⚠️ filterViews 的 `opened: false` 陷阱：GET 接口返回的已有接口中，filterViews 里各策略的 `opened` 字段可能都是 `false`，这是因为 GET 返回的是接口级别覆盖值，而不是创建时使用的分组默认模板。必须调用单接口详情接口获取真实配置（见 2.2）。**

### 2.2 获取真实 filterViews、responseHeaders、responseCookies

GET 接口列表返回的 filterViews 中各策略 `opened` 可能全为 `false`，responseHeaders/responseCookies 可能为空——这不是真实的创建模板，而是接口级别的覆盖值。

**必须调用单接口详情接口获取完整配置：**

```bash
mtcurl -X GET '{SHEPHERD_HOST}/spapi/v1/apis/getApi?group={apiGroupName}&api={data[0].name}'
```

从返回的 `data` 中提取：

- `data.filterViews` → 覆盖 `EXISTING_FILTER_VIEWS`（此处 `opened: true` 的策略才是真实启用的）
- `data.responseHeaders` → 覆盖 `EXISTING_RESP_HEADERS`（此处包含真实的 CORS 响应头配置）
- `data.responseCookies` → 覆盖 `EXISTING_RESP_COOKIES`

如果详情接口的这些字段仍为空，再尝试其他接口的详情（`data[1].name`、`data[2].name`），最多遍历前 5 个接口，找到非空值即止。

**⚠️ 如果遍历所有已有接口详情后 `filterViews` 仍为空（或分组中没有任何已有接口），使用以下默认值：**

```json
{
  "limitation": {
    "opened": true,
    "config": "{\"nickName\":\"shepherd-strategy\",\"active\":true,\"type\":\"CLUSTER_QPS_VM\",\"duration\":1,\"timeUnit\":\"SECONDS\",\"threshold\":2500,\"timeoutInMilliSeconds\":0,\"maxBurstInSeconds\":1,\"step\":0,\"code\":429,\"msg\":\"the current limit has been reached\",\"params\":[],\"allocatePolicy\":\"default\",\"timeUnitSH\":\"SECONDS\",\"timeUnitBJ\":\"SECONDS\"}"
  },
  "circuit_breaker": {
    "opened": true,
    "config": "{\"__isset_bit_vector\":{\"empty\":true,\"words\":[0]},\"active\":false,\"circuitBreakerTriggerRangeDataListSize\":0,\"debug\":false,\"degradeOnException\":false,\"degradeStrategy\":0,\"errorThresholdCount\":0,\"errorThresholdPercentage\":0,\"forceOpen\":false,\"forceOpenDegradePercent\":0,\"ignoredExceptionsSize\":0,\"optionals\":[\"FORCE_OPEN_DEGRADE_PERCENT\",\"TEST_FORCE_OPEN_DEGRADE_PERCENT\",\"DEBUG\",\"TEST_DEBUG\"],\"recoverDelayInSeconds\":0,\"recoverStrategy\":0,\"recoverTimeInSeconds\":0,\"requestVolumeThreshold\":0,\"rollingStatsTime\":0,\"semaphorePermits\":0,\"setActive\":false,\"setCircuitBreakerTriggerRangeDataList\":false,\"setDebug\":false,\"setDegradeOnException\":false,\"setDegradeStrategy\":false,\"setDegradeStrategyValue\":false,\"setErrorThresholdCount\":false,\"setErrorThresholdPercentage\":false,\"setForceOpen\":false,\"setForceOpenDegradePercent\":false,\"setIgnoredExceptions\":false,\"setRecoverDelayInSeconds\":false,\"setRecoverStrategy\":false,\"setRecoverTimeInSeconds\":false,\"setRequestVolumeThreshold\":false,\"setRollingStatsTime\":false,\"setSemaphorePermits\":false,\"setSleepWindowInMilliseconds\":false,\"setTestActive\":false,\"setTestCircuitBreakerTriggerRangeDataList\":false,\"setTestConfiged\":false,\"setTestDebug\":false,\"setTestDegradeOnException\":false,\"setTestDegradeStrategy\":false,\"setTestDegradeStrategyValue\":false,\"setTestErrorThresholdCount\":false,\"setTestErrorThresholdPercentage\":false,\"setTestForceOpen\":false,\"setTestForceOpenDegradePercent\":false,\"setTestIgnoredExceptions\":false,\"setTestRecoverDelayInSeconds\":false,\"setTestRecoverStrategy\":false,\"setTestRecoverTimeInSeconds\":false,\"setTestRequestVolumeThreshold\":false,\"setTestRollingStatsTime\":false,\"setTestSemaphorePermits\":false,\"setTestSleepWindowInMilliseconds\":false,\"setTestTimeoutInMilliseconds\":false,\"setTestTriggerStrategy\":false,\"setTimeoutInMilliseconds\":false,\"setTriggerStrategy\":false,\"setUseMode\":false,\"sleepWindowInMilliseconds\":0,\"testActive\":false,\"testCircuitBreakerTriggerRangeDataListSize\":0,\"testConfiged\":false,\"testDebug\":false,\"testDegradeOnException\":false,\"testDegradeStrategy\":0,\"testErrorThresholdCount\":0,\"testErrorThresholdPercentage\":0,\"testForceOpen\":false,\"testForceOpenDegradePercent\":0,\"testIgnoredExceptionsSize\":0,\"testRecoverDelayInSeconds\":0,\"testRecoverStrategy\":0,\"testRecoverTimeInSeconds\":0,\"testRequestVolumeThreshold\":0,\"testRollingStatsTime\":0,\"testSemaphorePermits\":0,\"testSleepWindowInMilliseconds\":0,\"testTimeoutInMilliseconds\":0,\"testTriggerStrategy\":0,\"useMode\":0,\"circuitBreakerTriggerRangeDataList\":[],\"ignoredExceptions\":[]}"
  }
}
```

### 2.3 配置提取要点

**⚠️ 重要：GET 接口返回的已有接口中，`invokerViews[0].serviceName` 和 `invokerViews[0].methodName` 可能为 null（即使顶层有值）。这些字段在创建时必须正确填充到 invokerViews 中。**

处理方式：

- `appkey` → **优先使用用户明确指定的 appkey**；用户未指定时，从 Step 2.2 已有接口中提取
- `pathPrefix`、`filterViews`、`responseHeaders`、`responseCookies` → 使用 Step 2.2 提取的值（注意 `pathPrefix` 可能是空字符串，直接使用）
- `serviceName` → **不从已有接口复用**。始终从 Thrift 接口文件的包路径 + 接口类名拼接（如 `com.sankuai.xxx.service.TXxxService`）
- `methodName` → **不从已有接口复用**。始终从 Thrift 接口文件的方法名获取
- `inputs` → **始终从 Thrift 方法签名生成**（详见 Step 3 的入参映射规则）

## Step 3：生成 API 配置

### 路径规则

路径按以下优先级确定，**高优先级规则满足时直接使用，不再往下查找**：

**优先级 1：用户明确指定路径**

如果用户在请求中直接给出了路径（如 `/myapp/api/xxx`、`前缀/方法名` 等），则**直接使用用户指定的路径**，不做任何推断或覆盖。对批量创建场景，用户可以指定路径模式（如 `/myapp/api/{methodName}`），按模式逐个替换生成。

**优先级 2：从分组已有接口中分析路径模式**

用户未指定路径时，在 Step 2 获取已有接口列表，分析已有接口的 `path` 字段，提取路径模式，按相同规则生成新接口的路径。例如：

- 已有接口路径为 `/myapp/api/TUserService_queryUserList` → 模式为 `{pathPrefix}/{ServiceName}_{methodName}`
- 已有接口路径为 `/myapp/api/queryUserList` → 模式为 `{pathPrefix}/{methodName}`

**优先级 3：默认规则**

分组中没有任何已有接口时，使用默认模式：`{pathPrefix}/{ServiceName}_{methodName}`

### API 命名规则

API name 采用语义化短名（snake_case），参考已有接口的命名风格，不要机械拼接类名+方法名。

例如：

- 已有接口 `trade_order_detail`、`trade_order_page_query` → 新接口 `trade_order_latest_detail`
- 不要生成 `orderquerytservice_latestorderdetail` 这种全类名拼接风格

**命名原则**：业务域前缀 + 动作/资源，全小写 snake_case，简洁可读。如果用户没有提供命名，先生成候选名展示给用户确认。

### 入参映射规则（inputs）

**始终根据 Thrift 方法的参数列表生成 inputs，不依赖已有接口的 inputs 字段。**

对每个方法的参数列表，逐一处理：

1. 参数类型为 `LoginDTO` → **忽略该参数**，不生成 input
2. 参数类型为 `EpBizAccount` → 表达式为 `"$.context.c-epassport-account"`
3. 参数类型为 `SSOUser` → 表达式为 `"$.context.c-sso-user"`
4. 其他 DTO/对象类型（Request、DTO、Param 等）→ 表达式统一为 `"$.body"`（即使有多个对象参数，每个都是 `"$.body"`）

**⚠️ 不要因为分组已有接口的 inputs 为空就将新接口的 inputs 也留空。已有接口的 inputs 仅供参考路径模式等，入参必须始终从 Thrift 方法签名生成。**

每个 input 格式：

```json
{"type": "完整Java类型", "mode": 0, "expressType": 0, "defaultValue": "", "value": "DSL表达式", "paramKey": ""}
```

示例：方法 `updateUser(UpdateUserRequest req, LoginDTO login, EpBizAccount account)` 的 inputs 为：

```json
[
  {"type": "com.sankuai.xxx.dto.UpdateUserRequest", "mode": 0, "expressType": 0, "defaultValue": "", "value": "$.body", "paramKey": ""},
  {"type": "com.sankuai.xxx.dto.EpBizAccount", "mode": 0, "expressType": 0, "defaultValue": "", "value": "$.context.c-epassport-account", "paramKey": ""}
]
```

### Payload 模板

```json
{
  "status": 0,
  "apiGroupName": "{apiGroupName}",
  "name": "{apiName_小写}",
  "description": "{displayName 或方法名}",
  "tagId": "",
  "importFromPapi": false,
  "selectedPapi": [],
  "selectedPapiApi": {"name": "-", "description": "-"},
  "httpType": 0,
  "path": "{根据已有接口分析出的路径模式}",
  "methodTypes": "post",
  "timeout": "5000",
  "serviceName": " ",
  "methodName": " ",
  "port": -1,
  "allowMultiHttpParamValues": false,
  "preParameters": [],
  "pathPrefix": "",
  "regexPaths": [],
  "mapiBodyDecodeEnabled": true,
  "filterViews": EXISTING_FILTER_VIEWS,
  "invokerScheduleType": 1,
  "invokerViews": [{
    "type": "rpc",
    "alias": "{EXISTING_ALIAS}",
    "appkey": "{appkey}",
    "timeout": "5000",
    "serviceName": "{包路径.ServiceName}",
    "methodName": "{methodName}",
    "nestAppkey": "",
    "function": "",
    "switchExpression": "",
    "switchExpressionType": "",
    "forExpression": "",
    "pirateExtendParam": null,
    "ignoreException": false,
    "url": "",
    "loadBalance": "default",
    "transparentMethod": false,
    "transparent": false,
    "inputs": [按入参映射规则生成的数组],
    "framework": "mtthrift",
    "useConditionalRoute": false
  }],
  "transparent": false,
  "contentType": 0,
  "expressType": 0,
  "response": "$.rpc.{EXISTING_ALIAS}",
  "responseCase": "",
  "statusCode": "",
  "headerMap": "",
  "redirect": "",
  "redirectWhiteList": "",
  "failure": "",
  "degradation": "",
  "customErrors": [],
  "errorMatchType": "shepherd_matcher",
  "responseHeaders": EXISTING_RESP_HEADERS,
  "responseCookies": EXISTING_RESP_COOKIES
}
```

**关键：**

- `contentType` 必须是整数 `0`（不能是字符串，否则报反序列化错误）
- 顶层 `serviceName` 和 `methodName` 填空格即可，实际配置在 `invokerViews` 中
- **`invokerViews[0].serviceName` 和 `invokerViews[0].methodName` 不能为空/null**，必须正确填充（从 Thrift 文件解析），否则报错 "ShepherdApiInvoker的属性serviceName不能为null"
- `alias` 和 `response` 需保持一致：从 Step 2.2 详情接口的 `invokerViews[0].alias` 提取（保存为 `EXISTING_ALIAS`），`alias` 填该值，`response` 填 `"$.rpc.{EXISTING_ALIAS}"`；如果详情接口未返回 alias 或为空，则 `alias` 填 `"alias"`，`response` 填 `"$.rpc.alias"`
- `pathPrefix` 固定填空字符串 `""`，不要填路径前缀
- `errorMatchType` 必须是字符串 `"shepherd_matcher"`（不是整数 0）
- `filterViews`、`responseHeaders`、`responseCookies` 必须使用 Step 2.2 从单接口详情提取的完整 JSON 值，不能用空对象/空数组代替
- `responseCase`、`statusCode`、`failure`、`degradation` 留空字符串 `""`（不是空对象或空数组）
- API 路径必须以分组的 pathPrefix 开头
- **`invokerViews[0].inputs` 必须按入参映射规则从 Thrift 方法参数生成**，不能留空数组

## Step 4：批量创建

将每个 API 的 payload 写入临时 JSON 文件，然后用 mtcurl 逐个调用创建接口。

**⚠️ 创建前，先用 Step 2.1 获取的 `EXISTING_API_NAMES` 做存在性检查，跳过已存在的接口。**

对每个待创建的 API：

```bash
# 1. 将完整 payload 写入临时文件（避免 shell 转义问题）
cat > /tmp/shepherd_api_{n}.json << 'PAYLOAD_EOF'
{
  "status": 0,
  "apiGroupName": "实际分组名",
  "name": "tuserservice_queryuserlist",
  "description": "查询用户列表",
  ... 完整 payload（所有字段都必须填充，特别是 filterViews、inputs、responseHeaders、responseCookies）...
}
PAYLOAD_EOF

# 2. 调用创建接口（URL 在最后！）
mtcurl -X POST -H 'Content-Type: application/json' -d @/tmp/shepherd_api_{n}.json '{SHEPHERD_HOST}/spapi/v1/apis/add'

# 3. 清理临时文件
rm -f /tmp/shepherd_api_{n}.json
```

每次创建后等待 0.5~1 秒，避免触发限流。如果接口数量较多（>5 个），分批执行。

**⚠️ 写入临时文件时，确保 `filterViews`、`responseHeaders`、`responseCookies` 是从 Step 2.1 提取的完整 JSON，`inputs` 是按入参映射规则从 Thrift 参数生成的完整数组。不能用空值或占位符。**

### 错误码处理

| 返回 code | 含义           | 处理方式          |
| --------- | -------------- | ----------------- |
| 0         | 成功           | 记录成功          |
| 211       | API 已存在     | 跳过，提示用户    |
| 201       | 路径前缀不匹配 | 检查 pathPrefix   |
| 209       | 分组不存在     | 检查 apiGroupName |
| 210       | apiId 不存在   | 检查参数          |

## Step 5：验证与展示结果

### 验证创建结果

```bash
mtcurl -X GET '{SHEPHERD_HOST}/spapi/v1/apis/{apiGroupId}'
```

### 结果展示

给用户展示清晰的结果摘要：

```
创建完成！共处理 8 个接口：
✅ 成功创建 6 个：
   - tuserservice_queryuserlist
   - tuserservice_createuser
   - ...
⏭️ 跳过 2 个（已存在）：
   - tuserservice_getuser
   - tuserservice_deleteuser

管理页面：{SHEPHERD_HOST}/api-group-detail?api_group_name={groupName}&api_group_id={groupId}&group_tab=api-manage

新创建的接口状态为"待发布"。
```

**runway 编排器调用场景：**
- 展示摘要后直接按主编排器约定继续，不在这里停下来等待“是否发布”的回复
- 若主编排器明确要求自动发布，直接执行 Step 6
- 若主编排器未要求自动发布，则在此结束并返回创建结果 / 状态，由主编排器继续后续 Stage 8

**手动调用场景：**
- 可以询问用户是否立即发布所有新建接口
- 用户确认发布 → 执行 Step 6
- 用户不需要或未明确回答 → 提示用户在管理页面手动发布后生效，流程结束

**⚠️ 生产环境发布风险提示：若目标环境为生产环境，且需要执行 Step 6，需再次向用户明确确认后再发布。**

**⚠️ 默认情况下，Step 6 只发布本次新建成功的接口，不触碰已存在接口。**

## Step 6：发布接口

### 6.1 获取待发布接口的 apiId

通过 Step 5 验证时的 GET 接口列表，找到本次新建接口的 `id` 字段：

```bash
mtcurl -X GET '{SHEPHERD_HOST}/spapi/v1/apis/{apiGroupId}'
```

从返回的 `data` 数组中，匹配本次成功创建的接口（按 `name` 字段），提取每个接口的 `id`（即 `apiId`）。保存为列表：

```
CREATED_API_IDS = [id1, id2, id3, ...]
```

**⚠️ 只发布本次新建成功的接口，跳过已有接口（已有接口可能是线上稳定版本，不应意外触发重新发布）。**

### 6.2 逐个发布接口

对每个 `apiId`，调用发布接口：

**⚠️ 正确路径是 `/spapi/v1/apis/release`，参数 `id` 通过 query string 传递，不是 request body，不是 `/spapi/v1/apis/publish`。**

```bash
mtcurl -X POST '{SHEPHERD_HOST}/spapi/v1/apis/release?id={apiId}'
```

检查返回结果：

| 返回 code | 含义                   | 处理方式                        |
| --------- | ---------------------- | ------------------------------- |
| 0         | 发布请求提交成功       | 记录成功，验证接口 status       |
| 其他非 0  | 发布失败               | 展示错误码和消息                |

**⚠️ code=0 只表示请求提交成功，接口可能进入审批流。通过查询接口 status 判断最终状态：**

| status 值 | 含义                         |
| --------- | ---------------------------- |
| 0         | 待发布                       |
| 1         | 已发布（生效）               |
| 4         | 发布审批中（正常，等待审批） |

status=4 是正常结果，表示分组开启了发布审批流程，需人工在管理页面审批后生效。**不要误判为失败。**

每次发布后等待 0.5~1 秒，避免触发限流。

### 6.3 发布结果展示

```
发布完成！共处理 6 个新建接口：
✅ 发布请求成功 5 个：
   - tuserservice_queryuserlist（status=1，已生效）
   - tuserservice_createuser（status=4，审批中）
   - ...
❌ 发布失败 1 个：
   - tuserservice_batchupdate（code=500: 内部错误，请检查接口配置）

管理页面：{SHEPHERD_HOST}/api-group-detail?api_group_name={groupName}&api_group_id={groupId}&group_tab=api-manage
```

- status=1：已生效
- status=4：进入审批流，提示用户在管理页面完成审批
- 发布失败的接口不影响其他接口，建议用户在管理页面排查后手动发布

## 错误处理

| 错误场景              | 处理方式                                                     |
| --------------------- | ------------------------------------------------------------ |
| mtcurl 未安装         | 自动执行 `UV_INDEX_URL=https://pypi.sankuai.com/simple/ uv tool install mt-curl-cli` 安装；安装失败则提示用户检查 Python 3.10+ 环境 |
| 401/403 鉴权失败      | mtcurl 自动处理 SSO，如仍失败提示用户检查 SSO 登录状态       |
| 接口文件路径不存在    | 提示用户检查文件路径                                         |
| 解析不到 Thrift 方法  | 提示文件格式可能不是标准 Thrift Service 接口                 |
| 创建失败 code != 0    | 展示错误码和消息，给出排查建议                               |
| 分组接口数超 200 上限 | 提示用户考虑拆分分组                                         |
| JSON 转义错误         | 建议用 `-d @file` 方式，避免 shell 转义问题                  |
| 发布接口失败 code!=0  | 展示错误码和消息，提示用户在管理页面手动发布该接口            |
| 发布后 status=4       | 正常，表示进入审批流程，提示用户在管理页面审批后生效          |
| 发布用了错误路径      | 正确路径是 `POST /spapi/v1/apis/release?id={apiId}`，不是 `/apis/publish` |

## 注意事项

- **mtcurl URL 必须放在最后**，这是与标准 curl 最大的区别
- 复杂 JSON payload 建议写入临时文件（`-d @/tmp/xxx.json`），避免 shell 转义问题
- `invokerViews[0].serviceName` 和 `invokerViews[0].methodName` 在创建时**必须填充**，不能为 null 或空
- 从已有接口的 GET 响应中这两个字段可能是 null，**不要信任这些值**，始终从 Thrift 文件解析获取
- **inputs 必须始终从 Thrift 方法参数生成**，不能因为已有接口 inputs 为空就留空
- **filterViews、responseHeaders、responseCookies 必须从已有接口提取完整 JSON**，不能用空对象/空数组
- `alias` 和 `response` 必须一致：优先使用详情接口返回的 `invokerViews[0].alias`，缺失时回退为 `"alias"`
- `contentType` 必须是整数 `0`（不能是字符串）
- 每次创建前做存在性检查，防止重复创建
- 批量创建时串行执行并加 500ms~1s 间隔，Shepherd 有限流保护
- 创建完成后展示结果摘要，**在此时**询问用户是否发布；用户确认后执行 Step 6，否则提醒手动发布
- **自动发布只针对本次新建接口**，已有接口（跳过的）不触发发布，避免意外影响线上稳定版本
- **生产环境自动发布前需再次向用户确认**，防止误操作
- 发布接口 payload 中 `apiGroupName` 和 `apiId` 必须准确，`apiId` 从创建后的接口列表中获取而非猜测