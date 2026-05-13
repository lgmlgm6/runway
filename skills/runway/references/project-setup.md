# Project Setup — project.json 加载、知识库、初始化

## Step 0b：加载项目知识库

```bash
RUNWAY_TOOLS="${CLAUDE_PLUGIN_ROOT:+${CLAUDE_PLUGIN_ROOT}/skills/runway/bin/runway-tools.cjs}"
RUNWAY_TOOLS="${RUNWAY_TOOLS:-$HOME/.claude/skills/runway/bin/runway-tools.cjs}"

if [[ -f .runway/knowledge.json ]]; then
  KNOWLEDGE_COUNT=$(jq 'length' .runway/knowledge.json 2>/dev/null || echo 0)
  echo "📚 项目知识库：${KNOWLEDGE_COUNT} 条"
  echo "   最近沉淀（pitfall / pattern）："
  jq -r '.[] | select(.type == "pitfall" or .type == "pattern") | "  [\(.type)] \(.summary)"' \
    .runway/knowledge.json 2>/dev/null | tail -5
fi
```

`knowledge.json` 中的 `pitfall` 类条目会在各 Stage 自动注入，尤其关注对当前 feature 有影响的 `pitfall` 警告。

---

## Stage 4：project-memory-init（首次运行时）

如果 `.runway/project.json` 不存在，在 Stage 4 末尾自动生成并提示用户确认写入：

```bash
RUNWAY_TOOLS="${CLAUDE_PLUGIN_ROOT:+${CLAUDE_PLUGIN_ROOT}/skills/runway/bin/runway-tools.cjs}"
RUNWAY_TOOLS="${RUNWAY_TOOLS:-$HOME/.claude/skills/runway/bin/runway-tools.cjs}"
PROJECT_MEMORY_RESULT=$(node "$RUNWAY_TOOLS" project-memory-init \
  --root "$PROJECT_ROOT" \
  --mis "{mis}" \
  --app-id "{app_id}" \
  --ones-space-id "{ones_space_id}")
if echo "$PROJECT_MEMORY_RESULT" | jq -e '.created == true' > /dev/null; then
  echo "✅ 项目记忆已保存到 .runway/project.json — 下次运行将自动跳过固定参数询问。"
  echo "   如需修改（build_cmd / test_cmd / lint_cmd / notes），请直接编辑该文件。"
fi
```

---

## Stage 4：保护 .runway/ 不被 git 提交

```bash
if git rev-parse --git-dir > /dev/null 2>&1; then
  GITIGNORE="$(git rev-parse --show-toplevel)/.gitignore"
  for entry in ".runway/" ".claude/runway-state/"; do
    if ! grep -qF "$entry" "$GITIGNORE" 2>/dev/null; then
      printf '\n# Runway local state — sensitive project config (auto-added by runway)\n%s\n' "$entry" >> "$GITIGNORE"
      echo "✅ .gitignore: 已添加 $entry"
    fi
  done
fi
```
