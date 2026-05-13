# Self-Review Checklist — Step 5

Run through all items before presenting to the user.

1. 一到六必填章节均已填写；七、架构ADR 仅在 ADR 触发时出现
2. `二、详细设计` 只写实现方案、业务逻辑、关键流程、状态变化、模块边界
3. `三、接口协议变更` 只写对外请求/响应或契约变化、兼容性说明；与详细设计无重复叙述；若只是模块内参数、内部 RPC、内部事件、内部数据结构调整，不写在这里；若存在接口协议变更，每个新增/修改/删除字段已写清字段名、数据类型、字段含义；request/input 与 response/output 已分开列出
4. complex 方案：在 `一、背景与目标` 已提供足够的整体视图，必要时补至少一张 Mermaid 图
5. 每个模块：满足补图条件时已在模块内补图（异步链路 / 复杂状态流转 / 多存储协同）
6. 基础设施各章节：涉及则填写，不涉及明确写原因，无留空
7. 验证策略包含覆盖风险列，并覆盖关键实现风险或兼容性风险
8. Readability check — can a reviewer read this in 10 minutes and decide? 无代码、字段编号、文件路径、Wave / TDD 等执行细节。
9. 每条接口定义无歧义，可直接用于任务拆解
10. 若存在 `七、架构ADR`，其表格已直接写清方案对比、选型依据、决策理由
11. 无 TBD、待定、后续确认等模糊占位符
12. 触发来源已记录（deliberate 模式下必填）
13. Step 4.5 接口完整性已通过：新增接口有具体 URL PATH（非占位符）、HTTP METHOD、接口描述、业务规则章节；存量修改接口「URL 路径」留空并注明由 Step 2b 匹配
14. Request 字段表含必填列和枚举/约束列；Response 字段表含核心断言列（至少一个 ✅）
15. P0 AC 断言字段列已从 Response 核心断言回填，无 `—` 占位符
