# Role: Frontend

当 checkpoint `role` 字段为 `frontend` 时加载此文件。

## 开发约束

### TDD 要求
- **不强制**：前端项目不要求先写失败测试
- build 通过（`npm run build` 或等效命令）是每个任务的最低验收标准
- 若项目有组件快照测试（jest snapshot），更新快照不阻塞任务完成

### 实现验证
- 每个任务完成后验证：`npm run build` 通过（TypeScript 编译无错误）
- lint 通过：`npm run lint`（无 error 级别问题）
- Props 类型：TypeScript 项目不得有 `any` 类型新增（除非项目已有 any 存在）

### 接口调用
- Stage 9 部署完成前：使用 mock 数据（hardcode 或 msw）开发 UI
- 接口路径必须与技术方案「三、接口协议变更」中的 PATH 完全对齐
- 接口调用错误必须有 UI 反馈（toast/error state），不得静默失败

### 组件实现底线
- 单个任务只修改其 primary file 和对应样式文件
- 不在组件内直接操作 DOM（除非项目已有此模式）
- 异步操作必须处理 loading 状态，避免空白闪烁

### Phase 2 Review 重点
- Spec compliance：页面/组件是否覆盖 AC 表中的前端验收标准
- Code quality：Props 类型完整性、组件职责是否单一
