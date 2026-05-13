# Role: Frontend

当 checkpoint `role` 字段为 `frontend` 时加载此文件。

## CR 审查维度

### Reviewer 1 — Functional & Logic（功能正确性 + AC 覆盖）
重点检查：
- 页面/组件是否覆盖 AC 表中的前端验收标准（loading/error/empty/正常四种状态）
- 接口调用路径是否与技术方案中的 PATH 对齐
- 路由跳转逻辑是否正确（权限控制、404 处理）
- 表单校验是否覆盖前端必填/格式/长度规则

### Reviewer 2 — Accessibility & UX（可访问性 + 用户体验）
重点检查：
- 异步操作是否有 loading 状态，避免空白闪烁
- 错误场景是否有用户可见的 UI 反馈（toast/error message）
- 关键操作是否有确认机制（删除/提交等不可逆操作）
- 移动端适配：是否有响应式问题（如果项目有 M 端要求）

### Reviewer 3 — Code Quality（代码质量）
重点检查：
- Props 类型：TypeScript 项目不得新增 `any` 类型（除非项目已有此模式）
- 组件职责：单个组件是否承担过多职责（超过 200 行建议拆分）
- 样式隔离：是否有全局样式污染风险
- Bundle size：是否有不必要的大依赖引入（lodash 全量 import 等）
- 重复代码：是否有可提取的公共 hook/util

## 严重度判定
- **Critical**：接口 PATH 错误导致功能不可用、TypeScript 编译报错
- **Important**：缺少 loading/error 状态、Props 类型不完整、可访问性问题影响主流程
- **Minor**：命名不规范、样式可优化、冗余代码
