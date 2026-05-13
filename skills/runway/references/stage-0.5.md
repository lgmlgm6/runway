# Stage 0.5 — Interface Design（lite 模式专属）

**输入：** PRD URL + `ones_work_item_id`
**输出：** `mini_spec_path` + `spec_context_path`
**耗时预估：** 60–90s

## Step 0.5-1: 读取 PRD + 探索代码库

```bash
oa-skills citadel getMarkdown --contentId <prd_content_id> --mis <mis>
```

从 PRD 提取：核心功能需求、业务规则、接口相关描述。

同时 grep 现有类似接口，确定：
- 涉及模块（client/server/infra）
- 现有 DTO 字段命名规范
- ThriftField 最大序号
- PATH 前缀（来自 `project.json.papi_base_url`）

**读取 `_thrift_index` 缓存（减少 Shepherd 调用）：**

```bash
THRIFT_INDEX=$(python3 -c "
import json, sys
try:
    d = json.load(open('.runway/papi-sync.json'))
    print(json.dumps(d.get('_thrift_index', {})))
except:
    print('{}')
" 2>/dev/null || echo "{}")
```

生成 mini-spec 时，对每个存量修改接口，先查 `_thrift_index["ServiceName.methodName"]`：
- **命中** → 直接填入 HTTP 方法和 URL 路径
- **未命中** → HTTP 方法和 URL 路径留空，由 Step 2b Shepherd 补全

## Step 0.5-2: 生成 mini-spec

基于用户需求 + 代码库参照，直接输出接口设计，不做任何澄清提问。

**格式必须与 runway-papi 解析格式兼容**（`### I{N}：接口名称` + 标准头部表格 + 字段表格）：

```markdown
## 接口设计：{功能名}

### 涉及模块
operation-client / operation-server / operation-infrastructure

### I1：{接口功能描述}

| 字段 | 值 |
|------|----|
| 接口描述 | {一句话描述接口用途} |
| HTTP 方法 | POST |
| URL 路径 | /api/xxx/yyy |
| 后端服务 | XxxService |
| 后端方法 | methodName |

**Request 字段：**

| 字段名    | 类型   | 变更 | 必填 | 枚举/约束  | 含义        |
|-----------|--------|------|------|------------|-------------|
| fieldName | String | 新增 | 否   | 9-10位数字 | 用户ID精确搜索 |

**Response 字段：**

| 字段名 | 类型 | 变更 | 核心断言 | 含义 |
|--------|------|------|---------|------|
| result | bool | 新增 |         | 操作结果 |

### 业务规则
1. fieldName 为空时不作为过滤条件
2. 格式非法时返回 PARAM_ERROR
```

**注意事项：**
- 接口编号从 `I1` 开始，多接口依次 `I2`、`I3`
- `后端服务` 和 `后端方法` 为 Thrift 项目必填，纯 HTTP 项目可省略
- 若接口 PATH 暂时未知（纯 Thrift），`HTTP 方法` 和 `URL 路径` 可留空，由 Step 2b Shepherd 补全
- `变更` 列填 `新增`/`修改`/`删除`，新接口所有字段填 `新增`
- 若接口无变更（如仅改 UI 文案），写明 `**无接口变更。**` 并跳过字段表格

## Step 0.5-3: 正确性自检（6 条可机械验证）

逐条核对，全部通过才继续；任一失败则修正后重检，最多 2 轮：

| 检查项 | 规则 | 失败处理 |
|--------|------|---------|
| PATH 格式 | 以 `/` 开头，含 papi_base_url 前缀 | 修正 PATH |
| HTTP 方法 | GET/POST/PUT/DELETE/PATCH 之一 | 修正方法 |
| Thrift 接口存在 | grep 确认 Service 类和方法名存在 | 修正接口名 |
| ThriftField 序号 | 新增字段序号不与现有冲突 | 取最大值+1 |
| 字段类型合法 | String/Long/Integer/Boolean/List 等 | 修正类型 |
| 涉及模块正确 | 与代码探索结果一致 | 修正模块列表 |

**自检 2 轮仍失败时：** 停止流水线，输出失败原因 + 当前 mini-spec 草稿，等待用户手动修正后继续。

## Step 0.5-4: 写入 spec_context + 存档 + 进入 Step 2b/2c

```bash
ONES_ID="{ones_work_item_id}"
MINI_SPEC_PATH=".runway/docs/${ONES_ID}/mini-spec.md"
SPEC_CONTEXT_PATH=".runway/docs/${ONES_ID}/spec-context.md"
mkdir -p ".runway/docs/${ONES_ID}"
```

1. 保存 mini-spec 到 `$MINI_SPEC_PATH`
2. 写入 `$SPEC_CONTEXT_PATH`：

```markdown
## 需求描述
{用户原始需求原文}

## 接口设计
{mini-spec 的接口设计全文}

## 业务规则
{mini-spec 的业务规则章节}
```

3. 写入 checkpoint：

```bash
node "$RUNWAY_TOOLS" checkpoint-write \
  --root "$PROJECT_ROOT" --ones-id "$ONES_ID" \
  --pipeline-mode "lite" \
  --mini-spec-path "$MINI_SPEC_PATH" \
  --spec-context-path "$SPEC_CONTEXT_PATH" \
  --current-stage "2b2c" \
  --updated-at "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
```

4. 打印并立即进入 Step 2b/2c 并行执行，不等待用户：

```
✅ Stage 0.5 完成 — 接口设计
- mini-spec：{mini_spec_path}
- spec-context：{spec_context_path}
- 启动 Step 2b（PAPI 同步）+ Step 2c（测试用例生成）并行执行
```
