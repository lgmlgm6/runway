# Pipeline Options — 流水线选项配置规则

## 可跳过模块说明

| 编号 | 模块 | 执行时机 | 跳过影响 |
|------|------|---------|---------|
| 1 | PAPI 接口同步 | Stage 2 内部（PATH 完整化）+ Step 2b（正式同步，Hard Gate 后立即执行） | 接口文档不同步；PATH 仍会生成，但不上传 PAPI 平台 |
| 2 | Shepherd 网关配置 | Stage 7（CR 后，仅 Thrift 项目新增接口） | 新接口无法通过网关访问，需手动配置 |
| 3 | 测试用例生成 | Step 2c（Hard Gate 后立即执行，与 Step 2b 并行） | 自动测试无法执行（[5] 也将自动跳过） |
| 4 | 自动部署测试泳道 | Stage 9 | 接口自动测试无法执行（[5] 也将自动跳过） |
| 5 | 接口自动测试 | Stage 10 + FIX LOOP | 无自动化接口测试覆盖，需手动测试 |

## 跳过依赖规则

```
skip[3] → skip[5]   （无用例文档无法执行测试）
skip[4] → skip[5]   （无部署环境无法执行测试）
[1] 与 [2] 相互独立  （papi 和 shepherd 分别处理不同平台）
```

注意：跳过 [1] **不影响** Stage 2 Step 4.5 的 PATH 生成。PATH 生成始终执行（技术方案完整性需要），仅跳过 Step 2b 的 PAPI 平台上传。

## pipeline_options 字段格式

```json
{
  "skip_papi": false,
  "skip_shepherd": false,
  "skip_tclist": false,
  "skip_deploy": false,
  "skip_autotest": false
}
```

写入 checkpoint 的 `pipeline_options` 字段（JSON 对象；命令行传参时使用 JSON 字符串）：
```bash
node "$RUNWAY_TOOLS" checkpoint-write \
  --root "$PROJECT_ROOT" \
  --ones-id "{ones_work_item_id}" \
  --pipeline-options '{"skip_papi":false,"skip_shepherd":false,"skip_tclist":false,"skip_deploy":false,"skip_autotest":false}' \
  --updated-at "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
```

## project.json pipeline_defaults 持久化

选择结果同步写入 `project.json` 的 `pipeline_defaults` 字段，下次运行时自动预填：

```json
{
  "pipeline_defaults": {
    "skip_papi": false,
    "skip_shepherd": false,
    "skip_tclist": false,
    "skip_deploy": false,
    "skip_autotest": false
  }
}
```

Step 0d 展示配置界面时，从 `pipeline_defaults` 读取预填值；用户回车确认或修改后，将新选择写入 `pipeline_options`（checkpoint）并更新 `pipeline_defaults`（project.json）。

## checkpoint 恢复时的处理

从 checkpoint 恢复时，直接读取已保存的 `pipeline_options`，**不重新展示配置界面**，直接从 `current_stage` 继续。
