# Role: Backend

当 checkpoint `role` 字段为 `backend`（默认值）时加载此文件。

## CR 审查维度

### Reviewer 1 — Functional & Logic（接口契约 + 业务规则）
重点检查：
- 接口字段与技术方案「三、接口协议变更」完全对齐（字段名、类型、必填性、枚举值）
- 业务规则覆盖：AC 表中每条验收标准是否有对应实现路径
- 边界条件：空值、零值、最大值、并发场景是否处理
- 返回码/错误信息是否符合项目规范

### Reviewer 2 — Security & Reliability（安全 + 可靠性）
重点检查：
- SQL 注入：MyBatis mapper 是否使用 `#{}` 而非 `${}`
- 事务边界：`@Transactional` 是否在正确的层（Service，不在 Controller/Repository）
- 并发安全：共享状态是否有正确的同步机制
- 幂等性：写操作（POST/PUT/DELETE）是否有幂等保障
- 敏感信息：日志中是否有密码/token/手机号明文输出

### Reviewer 3 — Code Quality（代码质量）
重点检查：
- 重复代码：是否有可提取的公共方法
- 硬编码：魔法数字、硬编码字符串是否应提取为常量
- 命名：类/方法/变量命名是否符合项目惯例
- 异常处理：是否有吞异常（catch 空块）或过宽异常捕获
- 日志质量：关键路径是否有足够日志，异常是否有 ERROR 级别记录

## 严重度判定
- **Critical**：接口契约偏差、SQL 注入、事务缺失导致数据不一致
- **Important**：并发问题、幂等性缺失、敏感信息泄露、业务规则遗漏
- **Minor**：命名不规范、重复代码、日志不足
