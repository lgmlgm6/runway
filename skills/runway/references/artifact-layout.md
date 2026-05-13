# Artifact Layout — 产物四层分类说明

## 设计原则

产物按两个维度分类：**归属**（团队 / 个人）和**生命周期**（永久 / 周期 / 临时）。两者结合形成四层：

```
层级          归属          生命周期         位置
──────────────────────────────────────────────────────
团队知识层    整个团队       永久，随 PR 演进   .runway-team/（commit）
项目配置层    项目所有研发   永久，随项目演进   .runway/（部分 commit）
个人执行层    当前研发       单次 feature 周期  .runway/（gitignored）
临时缓存层    流水线内部     pipeline 结束即删  .runway/tmp/（gitignored）
```

---

## 团队知识层 — `.runway-team/`（commit 到 git）

| 文件 | 内容 | 写入时机 |
|------|------|---------|
| `config.md` | 团队 pipeline_defaults、约定说明 | 手动维护 / Step 0d 更新 |
| `test-data-index.md` | 测试数据文档 KM 链接索引 | project.json 首次配置时同步 |
| `api-changelog/{date}-{feature}.md` | papi/shepherd 每次变更记录 | Step 2b / Stage 7 写入 |

---

## 项目配置层 — `.runway/`（以下文件 commit 到 git）

| 文件 | 内容 | 写入时机 |
|------|------|---------|
| `project.json` | appkey / build_cmd / 测试数据链接 / pipeline_defaults 等 | Stage 4 首次写入，之后累积更新 |
| `knowledge.json` | 结构化踩坑记录（pitfall / pattern / constraint） | Stage 12 每次追加 |
| `project-knowledge.md` | 人类可读版知识库 | Stage 12 每次追加 |

**knowledge.json 写入质量约束（只记录以下三类）：**
- `constraint`：项目固有限制，违反会出问题
- `pitfall`：操作触发预期外行为
- `pattern`：项目标准做法，新任务应复用

禁止写入：正常完成某件事 / 修复了某个 Bug / 通用编程建议。`confidence < 7` 的条目不写入。

---

## 个人执行层 — `.runway/`（gitignored）

| 文件 | 内容 | 生命周期 |
|------|------|---------|
| `checkpoint-{ones_id}.json` | 当前 feature 执行状态 | Stage 12 清理 |
| `plans/{date}-{feature}.md` | 任务规划文档 | feature 完成后可保留 |
| `docs/{ones_id}/execution-report.md` | 开发执行报告（正本在学城） | pipeline 完成后可删 |
| `docs/{ones_id}/cr-report.md` | CR 报告（正本在学城） | 同上 |
| `docs/{ones_id}/qa-report.md` | QA 报告（正本在学城） | 同上 |

---

## 临时缓存层 — `.runway/tmp/`（gitignored，pipeline 结束即删）

| 文件 | 用途 | 消费方 |
|------|------|-------|
| `qa-round-N.txt` | QA 每轮运行日志 | Stage 8 内部 |
| `triangle-loop.local.md` | Stage 2 恢复元数据 | Stage 2 内部 |
| `pipeline.local.md` | Stage 5-12 续命提示 | 续命循环 |
| `spec-draft-stage2.md` | Stage 2 草稿快照 | 知识捕获比对 |

Stage 12 清理命令：
```bash
rm -f .runway/tmp/qa-round-*.txt
rm -f .runway/tmp/spec-draft-*.md
```

---

## .gitignore 配置

```gitignore
# Runway 个人执行层（gitignored）
.runway/checkpoint-*.json
.runway/plans/
.runway/docs/
.runway/tmp/

# Runway 项目配置层（以下三个文件例外，需 commit）
# .runway/project.json        ← 不忽略
# .runway/knowledge.json      ← 不忽略
# .runway/project-knowledge.md ← 不忽略

# .runway-team/ 全部 commit（团队知识层）
# .runway-team/               ← 不忽略
```

---

## 学城文档结构

```
📁 {功能需求文档}（citadel_parent_id，用户提供）
│
├── 📄 {功能名} - 需求规格          ← Stage 1
├── 📄 {功能名} - 技术方案          ← Stage 2
└── 📄 {功能名} - 接口测试用例      ← Step 2c（tclist_content_id）
    ├── 📄 {功能名} - 接口测试报告 - {YYYY-MM-DD}   ← Stage 10
    └── 📄 {功能名} - 失败用例分析              ← Stage 11（全程一份，多轮追加）
```
