# Role: Frontend

当 checkpoint `role` 字段为 `frontend` 时加载此文件。

## 任务拆分关注点

### 模块边界
- 按页面/路由/组件三层拆分任务
- 公共组件（Button/Form/Layout 等）优先在 Wave 1 建立，页面组件在后续 wave 复用
- API 调用层（service/api 目录）独立于 UI 组件，单独一个 wave

### TDD 要求
- **不强制**：前端单测可选，build 通过是最低验收标准
- 若项目有组件快照测试，更新快照作为可选步骤，不阻塞 wave 推进
- Props 类型定义需在组件实现前确认（TypeScript 项目）

### 组件设计原则
- 原子设计粒度：Atom → Molecule → Organism → Page，拆分粒度遵循项目现有惯例
- 单个组件任务只修改一个组件文件 + 对应样式文件（不跨组件）
- 状态管理变更（store/context）独立 wave，不与 UI 渲染混合

### 交互状态覆盖
- 每个交互组件需覆盖：loading / error / empty / 正常四种状态
- 路由跳转逻辑作为独立任务，不与页面渲染混合

### 波次依赖分析
- 同 wave 任务不得修改同一组件文件
- 集成验证命令：`npm run build`（TypeScript 编译通过即可）
- 不要求单测全覆盖，但 lint 必须通过

### 已知模式
- 接口 Mock：Stage 9 部署前使用 mock 数据开发，部署后切换真实接口
- 样式隔离：优先使用 CSS Modules 或 scoped styles，避免全局样式污染
- 国际化：i18n key 新增作为独立任务，不与组件实现混合
