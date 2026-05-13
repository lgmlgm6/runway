# 测试用例生成规范

## 用例编号规则

```
单接口用例：TC-{接口序号}-{用例序号}
E2E 步骤：  E2E-{序号}-Step{步骤序号}
```

示例：`TC-1-1`、`TC-2-3`、`E2E-1-Step2`

---

## 用例文档表格格式

**⚠️ 强制要求：必须使用横向多列表格，严禁竖向两列（项目/内容）表格格式。**

每个接口单独一个表格，表格前注明接口名称，格式与 `references/test-case-template.md` 完全一致：

```markdown
## 接口{序号}：{接口名称}

POST /api/xxx/yyy

| 编号 | 场景类型 | 场景描述 | 请求体 | 预期结果 |
|------|---------|---------|--------|---------|
| TC-1-1 | 正常流程 | userId 不填，正常分页查询 | pageNum=1, pageSize=10 | code=0，data.list 为数组，data.total 存在 |
| TC-1-2 | 入参校验 | 缺少必填字段 pageNum | pageSize=10 | code≠0，msg 非空 |
| TC-1-3 | 业务规则 | userId 格式非法（非纯数字） | pageNum=1, pageSize=10, userId=abc | code≠0，msg 非空 |
```

E2E 用例在所有单接口表格之后：

```markdown
## E2E 端到端用例

### E2E-1 {场景名称}

| 编号 | 接口 | 请求体 | 预期结果 |
|------|------|--------|---------|
| E2E-1-Step1 | POST /api/xxx/search | postIds={published_post_id} | code=0，list[0].recommended=false |
| E2E-1-Step2 | POST /api/xxx/add | postId={published_post_id} | code=0，data.createTime 非空，存入 {Step2.createTime} |
| E2E-1-Step3 | GET /api/xxx/list | categoryId={category_id}, pageNum=1, pageSize=20 | code=0，list[0].postId={published_post_id}，list[0].createTime={Step2.createTime} |
```

**请求体格式规则：**
- 禁止使用反引号包裹，直接写 `key=value, key2=value2` 格式
- 动态值用占位符：`key={占位符名}`
- 固定值直接写：`pageNum=1, pageSize=10`

---

## 占位符规范

### 测试数据占位符

用于引用测试数据文档中的动态值，格式：`{语义名}`

| 占位符示例 | 含义 |
|-----------|------|
| `{published_post_id}` | 状态为已发布的帖子 ID |
| `{verifying_post_id}` | 状态为审核中的帖子 ID |
| `{category_id}` | 有效的一级类目 ID |

占位符名称必须与测试数据文档中的 key 保持一致，执行时由二阶段自动替换。

### E2E 步骤间变量占位符

用于将上一步骤的响应值传递给后续步骤，格式：`{StepN.字段名}`

- 在预期结果列中写 `存入 {Step2.createTime}`，表示该步骤执行后提取 `data.createTime` 保存为变量
- 在后续步骤的请求体或预期结果中用 `{Step2.createTime}` 引用该变量

---

## 三类场景详细规范

### A. 正常流程（Happy Path）

**目标**：验证接口在合法输入下返回正确结构。

**请求体构造规则**：
- 必填字段：选取第一个合法枚举值，或使用测试数据占位符
- 选填字段：默认不传
- 嵌套对象：只填必填的叶子字段

**预期结果写法**：
- `code=0，data 存在`
- `code=0，data.list 为数组，data.total 存在`
- `code=0，data.operator 非空，data.createTime 格式为 yyyy-MM-dd HH:mm`

### B. 入参校验

**目标**：验证接口对非法输入的拒绝行为。

**用例生成策略**：

| 字段特征 | 生成的用例 |
|---------|---------|
| 必填字段 | 缺失该字段（每次只缺一个，其余保持合法值） |
| 枚举类型字段 | 传入枚举范围外的值（如 `INVALID_VALUE`） |
| 数值类型有范围限制 | 传超出范围的值（如 0、负数） |
| 列表类型必填 | 传空数组 `[]` |
| 列表有数量上限 | 传超出上限数量的元素 |

**预期结果写法**：`code≠0，msg 非空`

### C. 业务规则

**目标**：逐条验证 API 文档中 `**业务规则**:` 章节的每条规则。

**解析规则条目**：
- 以 `-` 开头的每一行视为一条独立规则
- 跳过纯说明性规则（无法构造测试的描述）
- 重点处理：条件限制、状态校验、数量上限、幂等性

**用例生成策略**：

| 规则类型 | 用例策略 | 预期结果写法 |
|---------|---------|------------|
| 状态限制（如"非已发布不可加入"） | 使用对应状态的占位符（如 `{verifying_post_id}`） | `code≠0，msg 非空` |
| 数量上限（如"最多 200 条"） | 说明需预置数据，预期返回错误 | `code≠0，msg 包含上限提示` |
| 结果顺序（如"按入参顺序返回"） | 传多个 ID，断言返回顺序一致 | `code=0，list 顺序与入参 postIds 一致` |
| 忽略无效值（如"不存在的 ID 忽略"） | 混入不存在的 ID | `code=0，结果中不含不存在的 ID` |

---

## E2E 联合用例设计原则

**识别原则**：
- **写后读**：有写操作（加入/取消/创建/删除）的接口，必须设计「写 → 读」联合验证
- **写后写**：涉及状态流转（加入 → 取消 → 再加入），验证幂等性和状态机
- **字段同步**：写操作返回的字段（operator、createTime）必须与读接口返回值一致

**E2E 命名规则**：`E2E-{序号}` 对应一个完整场景，其下每个步骤编号为 `E2E-{序号}-Step{步骤序号}`。

**常见 E2E 模式**：

| 模式 | 步骤设计 |
|------|---------|
| 搜索→加入→列表验证 | Step1 搜索确认未精选 → Step2 加入精选 → Step3 列表第一条为该帖子且 createTime 一致 |
| 加入→搜索验证字段同步 | Step1 加入精选 → Step2 搜索该帖子，recommended=true，operator/createTime 与 Step1 一致 |
| 完整生命周期 | Step1 加入精选 → Step2 取消精选 → Step3 搜索 recommended=false → Step4 列表已移除 |
