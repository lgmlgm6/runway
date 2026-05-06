# Context Injection — PROJECT_NOTES 加载与注入

## Stage 5 前：加载项目约束注入

```bash
PROJECT_NOTES=$(jq -r '(.notes // "") + "\n" + ((.known_issues // []) | join("\n"))' .runway/project.json 2>/dev/null)
```

如果 `PROJECT_NOTES` 非空，在调用 `runway-parallel-dev` 时，将其作为前置上下文注入：

```
项目已知约束:
{PROJECT_NOTES}
```

## 用途

- `notes`：项目级代码约定、已知陷阱、特殊限制
- `known_issues`：已知的环境问题、临时 workaround

这些内容来自 `.runway/project.json`，由 `project-memory-init` 初始化，后续可人工编辑追加。
