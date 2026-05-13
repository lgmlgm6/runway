# Role: Backend

当 checkpoint `role` 字段为 `backend`（默认值）时加载此文件。

## 任务拆分关注点

### 模块边界
- 按 API/Service/Repository 三层拆分任务，每层独立 wave
- Controller/Handler 层和 Service 层不在同一 wave
- 数据库 schema 变更（migration）必须作为独立 Wave 0 前置任务

### 接口契约
- 接口定义变更（DTO/VO/Request/Response）作为 Wave 1 首批任务
- 下游 Service 调用方须在接口定义任务完成后才能开始（波次依赖）
- Thrift IDL 变更必须在编译验证通过后才能进入下一 wave

### 波次依赖分析
- 明确声明每个任务的 `depends_on` 和 `blocks`
- 同 wave 任务不得修改同一 primary file
- 集成验证命令：`mvn test -pl {module} -Dtest={IntegrationTest}`（Java）或语言对应命令

### 已知模式
- DB 查询新增字段：mapper.xml + 实体类 + DTO 三处同步，单独一个 wave
- 外部服务调用：先写 Mock，再写真实调用，不在同一 wave
- 配置变更（Lion/配置文件）：作为独立任务，不与业务逻辑混合
