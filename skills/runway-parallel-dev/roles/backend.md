# Role: Backend

当 checkpoint `role` 字段为 `backend`（默认值）时加载此文件。

## 开发约束

### 接口契约验证
- 实现完成后验证：请求/响应字段与技术方案「三、接口协议变更」章节完全对齐
- 字段类型、必填/可选、枚举值不得与契约偏差
- 如发现契约问题，立即 BLOCKED 并说明，不自行修改契约

### 代码质量底线
- 不引入新的未处理异常路径
- 事务边界：@Transactional 仅在 Service 层，不在 Controller/Repository
- 日志：关键业务路径必须有 INFO 级别日志，异常必须有 ERROR 日志

### Phase 2 Review 重点
- Spec compliance：AC 表中每条验收标准是否有对应测试
- Code quality：是否有硬编码、魔法数字、重复代码
