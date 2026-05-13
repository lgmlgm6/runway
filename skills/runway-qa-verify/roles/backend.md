# Role: Backend

当 checkpoint `role` 字段为 `backend`（默认值）时加载此文件。

## 验证目标

使用 `--all` 执行全量验证：

| 步骤 | 命令 | 说明 |
|------|------|------|
| build | `mvn compile -am -q` 或项目 build_cmd | 编译通过 |
| lint | 项目 lint_cmd（若配置） | 静态检查 |
| test | `mvn test -am` 或项目 test_cmd | 单测全部通过 |
| typecheck | N/A（Java 编译已包含类型检查） | 随 build 完成 |

## Java Maven 多模块项目特殊处理

在每轮测试命令前，先从项目根目录执行：
```bash
mvn install -DskipTests -q
```
否则子模块测试因 `${revision}` 未解析而失败。这是 Maven 多模块的要求，不是代码问题。

## 验收标准

- build 通过：0 编译错误
- test 通过：0 失败用例
- lint 通过：0 error 级别问题（warning 可接受）
