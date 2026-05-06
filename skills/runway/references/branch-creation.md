# Branch Creation — ones + git 完整流程

## 非交互创建分支（非 ones bc）

> `ones bc` 需要交互选择应用，会阻塞自动化。必须使用以下非交互命令链。

```bash
# Step 1: 生成分支名
ones bg -i {ones_work_item_id}
# → branch_name = "feature/PTAP-{id}/{description}"

# Step 2: 获取当前 repo remote URL 用于匹配 appId
git remote get-url origin
# → 例如 git@git.sankuai.com:mp-video-tech/freelance-platform.git

# Step 3: 通过 remote URL 在 space apps 中匹配 appId
ones space-apps -p {spaceId} --json 2>/dev/null | grep -B2 "{repo-name-from-remote}"
# → 从匹配条目中提取 appId

# Step 4: 非交互关联分支
ones ba -n "{branch_name}" -p {spaceId} -a {appId} -t {ones_work_item_id} --branch-type feature

# Step 5: 创建并切换本地分支
git checkout -b {branch_name}
```

## Fallback 规则

| 情况 | 处理方式 |
|------|---------|
| `ones space-apps` 失败或无法匹配 appId | 使用 `.runway/project.json` 或 `CLAUDE.md` 中记录的 appId |
| 以上均无 appId | 询问用户一次："请提供 ONES 应用 ID（appId），用于关联分支" |
| `ones bg` 失败 | Fallback：`git checkout -b feature/{ones_work_item_id}-dev` |
| `ones ba` 失败 | 记录警告："分支关联失败，可手动在 ONES 中关联。" 不阻塞流程 |

## 记录字段

- `branch_name`：由 `ones bg` 返回
- `BASE_SHA`：`git rev-parse HEAD`
