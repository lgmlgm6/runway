# Role: Frontend

当 checkpoint `role` 字段为 `frontend` 时加载此文件。

## 验证目标

**只执行 build + lint**，跳过 test 和 typecheck：

| 步骤 | 命令 | 说明 |
|------|------|------|
| build | `npm run build` 或项目 build_cmd | 构建通过（TypeScript 编译无错误） |
| lint | `npm run lint` 或项目 lint_cmd | 无 error 级别 lint 问题 |
| ~~test~~ | 跳过 | Talos 发布流水线会完整跑一遍 |
| ~~typecheck~~ | 跳过 | build 已包含 TypeScript 类型检查 |

## 为什么跳过 test

前端项目的完整测试（包括 lint + test）在 Stage 9 的 Talos 发布流水线中会再次执行。
Stage 8 的 QA 验证是早期拦截：确保代码可以构建、无明显 lint 问题，不重复跑完整测试套件。

## 验收标准

- build 通过：0 编译/构建错误
- lint 通过：0 error 级别问题（warning 可接受）
