# Interface PATH Completion — Step 4.5

在进入 Step 5 自检之前，对「三、接口协议变更」中的每个接口标注变更类型，并为新增接口生成语义 PATH。

**⚠️ PATH 概念说明：**
- 这里的 PATH 是 **PAPI 接口语义路径**，格式如 `/api/freelance/product/list/page`
- 不是 Shepherd 运行时 HTTP URL，也不是 Thrift 方法名

## Step 4.5-1: 识别接口类型

从 project.json 读取 `papi_base_url`（如 `/api/freelance`）。

**判定规则：**
- 判断的是"是否为对外接口契约"，不是"是否原生 HTTP 控制器"
- 对外暴露的 Thrift/RPC 接口，只要需要经 Shepherd 网关暴露并同步到 PAPI，就属于本步骤处理范围
- 严禁输出"本次仅 Thrift RPC 接口变更，无 HTTP 接口，因此跳过 PAPI"之类的结论
- 只有纯内部 RPC / 内部事件 / 模块内参数变化且不会形成对外暴露接口时，才可不写入「三、接口协议变更」
- 一旦写入「三、接口协议变更」，后续必须继续走 Step 2b PAPI 同步

对每个接口明确标注变更类型（新增 / 修改 / 删除），供 Step 2b runway-papi 消费。

**新增接口**（变更类型 = 新增）：
- 按语义规则生成 PATH，格式：`{papi_base_url}/{领域}/{模块或页面（可省略）}/{功能}`
- 示例：`/api/freelance/homepage/feed`、`/api/freelance/trade/product/detail`
- 领域/模块/功能由 AI 根据接口功能语义判断，生成后直接回写技术方案
- Step 2b runway-papi 执行时将此接口作为新增录入 PAPI

**存量修改接口**（变更类型 = 修改）：

先查 `_thrift_index` 缓存（避免重复调 Shepherd）：

```bash
THRIFT_INDEX=$(python3 -c "
import json
try:
    d = json.load(open('.runway/papi-sync.json'))
    print(json.dumps(d.get('_thrift_index', {})))
except:
    print('{}')
" 2>/dev/null || echo "{}")
```

- **命中 `_thrift_index["ServiceName.methodName"]`** → 直接填入 HTTP 方法和 URL 路径，无需留空
- **未命中** → **URL 路径字段留空**，不得自行猜测或生成，在接口头部表格备注：`PATH 由 Step 2b runway-papi 从线上自动匹配`，Step 2b 会通过 Shepherd 查询补全

**对外 Thrift/RPC 的处理原则：**
- 技术方案中的 `HTTP 方法` / `URL 路径` 字段，表示 PAPI / Shepherd 语义接口信息
- "没有原生 HTTP Controller" 不是跳过 PAPI 的理由

## Step 4.5-2: 回写技术方案接口章节

将新增接口的 PATH 填入「URL 路径」字段；存量修改接口「URL 路径」留空并注明原因。

## Step 4.5-3: 断言字段回填 AC 表

将每个接口 Response 字段表中标注为「核心断言 ✅」的字段，回填到需求规格 AC 表对应 AC 行的「断言字段」列（替换 `—` 占位符）。

## 完成条件（进入 Step 5 的前置检查）

- ✅ 每个接口已明确标注变更类型（新增 / 修改 / 删除）
- ✅ 新增接口均有具体 PAPI PATH（非占位符）
- ✅ 存量修改接口「URL 路径」留空并注明由 Step 2b 匹配
- ✅ Request 字段表含必填列和枚举/约束列
- ✅ Response 字段表含核心断言列，至少一个 ✅
- ✅ 每个接口有业务规则章节（无规则时填「无」）
- ✅ P0 AC 的断言字段列已回填，无 `—` 占位符
