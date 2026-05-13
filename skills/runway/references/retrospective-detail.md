# Retrospective Detail — Stage 12 知识库提取与更新

## Step 12a：提取本次流水线学习

读取三份报告：
- `.runway/docs/{ones_id}/execution-report.md`：BLOCKED 任务、DONE_WITH_CONCERNS
- `.runway/docs/{ones_id}/cr-report.md`：重复问题模式、被拒绝建议
- `.runway/docs/{ones_id}/qa-report.md`：重复失败、环境问题

用 `knowledge-append` 命令追加到 `.runway/knowledge.json`（命令模板见 `references/state-management.md`）。

**质量约束（只记录以下三类）：**
- `constraint`：项目固有限制，违反会出问题（证据：Stage 6 反复修复同类问题）
- `pitfall`：操作触发预期外行为（证据：Stage 5 BLOCKED / FIX LOOP 触发）
- `pattern`：项目标准做法，新任务应复用（证据：Stage 5 中"参考了 XXX 的写法"）

**禁止写入：** 正常完成某件事 / 某次修复了某个 Bug / 通用编程建议。`confidence < 7` 的条目不写入。

---

## Step 12a-extra：评审已捕获条目

```bash
jq --arg id "{ones_id}" '[.[] | select(.source_ones_id == $id)]' .runway/knowledge.json 2>/dev/null
```

评审规则：
- `scope = "feature"` 的条目：判断是否应提升为 `"project"`
- `confidence < 7` 的条目：判断是否删除（噪音风险高）

直接编辑 `.runway/knowledge.json` 做调整。这是人工复盘点，可跳过。

---

## Step 12c：清理临时文件

```bash
rm -f .runway/tmp/qa-round-*.txt
rm -f .runway/tmp/pipeline-*.md .runway/tmp/spec-draft-*.md
```

---

## Step 12b：追加到 project-knowledge.md

```bash
mkdir -p .runway
cat >> .runway/project-knowledge.md << 'EOF'

## 项目约定（runway 自动维护，{date}）

### 构建命令
- Build: {build_cmd}
- Test: {test_cmd}

### 已知陷阱
- [{date}] {trap description}
EOF
```

**仅追加新内容**，追加前检查是否已存在，避免重复。

规则：
- 不自动修改项目根目录的 `CLAUDE.md`（人工维护）
- 如果发现值得长期维护的约定，提示用户手动提升到 `CLAUDE.md`

---

## Step 12d：产物检查清单

完成前核查以下文件存在且已更新：
- `.runway/docs/{ones_id}/execution-report.md`
- `.runway/docs/{ones_id}/cr-report.md`
- `.runway/docs/{ones_id}/qa-report.md`
- `.runway/knowledge.json`（仅在有重要发现时）
- `.runway/project-knowledge.md`（仅在发现新项目级约定时）
