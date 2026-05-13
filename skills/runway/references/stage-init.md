# Stage Init — Step 0 详细执行规范

## Step 0-mode: 模式选择（前置，无 flag 时触发）

当用户没有传入任何模式 flag（`--lite`、`--litefull`、`--fullstack`、`--frontend-mode`、`--requirements-spec-id`、`--tech-spec-id`）时，在 Step 0-pre 之前展示模式选择表单。

**AskUserQuestion 上限为 4 个选项，因此使用两步选择：**

**第一问 — 仓库范围（3 选 1）：**
- 后端：单仓后端开发
- 前端：单仓前端开发（build+lint only）
- 全栈：派发 AgentTeam 前后端并行

**第二问 — 质量档位（2 选 1）：**
- 标准：含 PRD Spec + Tech Spec，有 2 个 Hard Gate
- 轻量：跳过 Spec 阶段，零 Hard Gate

6 个选项的内部映射：

| 仓库范围 | 质量档位 | pipeline_mode | 附加设置 |
|--------|---------|--------------|---------|
| 后端 | 标准 | standard | — |
| 后端 | 轻量 | lite | — |
| 前端 | 标准 | standard | role=frontend，apply frontend-mode settings |
| 前端 | 轻量 | lite | role=frontend，apply frontend-mode settings |
| 全栈 | 标准 | fullstack | fullstack_handoff_status=pending |
| 全栈 | 轻量 | litefull | fullstack_handoff_status=pending |

选择后立即写入 checkpoint，后续 Step 0-pre 按已设定的 pipeline_mode 处理，不再展示选择。

## Step 0-pre: Parse CLI Arguments

```
--frontend-mode   → Frontend pipeline mode (skip PAPI/TCList/Shepherd/autotest/Retro, QA=build+lint only)
--fullstack       → Fullstack Team leader mode (run shared phases, then dispatch backend-dev + frontend-dev)
--lite            → Lite mode (skip Stage 1+2, run Stage 0.5 instead, then Step 2b/2c → Stage 3)
--skip-stages     → Comma-separated list of stages to skip (e.g. "1,2")
--requirements-spec-id <id>  → Pre-existing requirements spec contentId (skip Stage 1)
--tech-spec-id <id>          → Pre-existing tech spec contentId (skip Stage 2)
--tclist-content-id <id>     → Pre-existing test case list contentId (reuse Step 2c output)
```

**If `--frontend-mode` is present:**
Set in checkpoint and pipeline_options:
- `role = "frontend"`, `pipeline_options.skip_papi = true`, `skip_tclist = true`, `skip_shepherd = true`, `skip_autotest = true`
- `qa_mode = "build_lint_only"`, `skip_retrospective = true`
- `team_mode = true` (if called by a team leader); set `leader_name` from `--leader-name` if present
- Skip Step 0d — all options already determined.

**If `--lite` AND `--frontend-mode` are both present:**
- `pipeline_mode = "lite"`, `role = "frontend"`
- `pipeline_options.skip_papi = true`, `skip_tclist = true`, `skip_shepherd = true`, `skip_autotest = true`
- `qa_mode = "build_lint_only"`, `skip_retrospective = true`
- Skip Step 0d — all options already determined.
- Skip Stage 1+2, proceed to Stage 0.5.
- Input: PRD URL + `ones_work_item_id`.

**If `--lite` is present (without `--frontend-mode`):**
- `pipeline_mode = "lite"` — skip Step 0d, skip Stage 1+2, proceed to Stage 0.5.
- Input: PRD URL + `ones_work_item_id` (same as standard mode, no natural language argument).
- Extract PRD contentId from URL using the same rules as standard mode.

**If `--litefull` is present:**
- `pipeline_mode = "litefull"`, `fullstack_handoff_status = "pending"` — skip Step 0d, skip Stage 1+2.
- Input: PRD URL + `ones_work_item_id`.
- Extract PRD contentId from URL. Proceed to Stage 0.5.
- After Stage 0.5 + Step 2b/2c complete: invoke `runway-fullstack` with `prd_url`, `ones_work_item_id`, `mis`, `mini_spec_path`, `spec_context_path`, `tclist_content_id`.
- Stop — do not enter local Stage 3.

**If `--fullstack` is present:**
- `pipeline_mode = "fullstack"`, `fullstack_handoff_status = "pending"`
- Run Stage 1 (HARD GATE) → Stage 2 (HARD GATE) → Step 2b/2c normally.
- After 2b/2c: if `fullstack_handoff_status = pending` → invoke `runway-fullstack` with `prd_url`, `ones_work_item_id`, `mis`, `requirements_spec_content_id`, `tech_spec_content_id`, `tclist_content_id`. Stop — do not enter local Stage 3.
- If `fullstack_handoff_status = dispatched` → do not redispatch.

**If `--skip-stages` is present:** parse list, mark skipped in pipeline_options.

**If `--requirements-spec-id` and `--tech-spec-id` are present:** write to checkpoint, skip Stages 1+2.

**If `--tclist-content-id` is present:** write to checkpoint as `tclist_content_id`.

---

## Step 0a: Load Project Memory（基础字段）

```bash
cat .runway/project.json 2>/dev/null
```

If exists, load fixed fields (do NOT ask user):
- `mis`, `app_id`, `ones_space_id`, `build_cmd`, `test_cmd`, `lint_cmd`, `notes`

If not exists, collect **only the base fields** now (module-specific fields collected after Step 0d):

```
必填：
  mis          — 用户 MIS
  appkey       — 服务 appkey（先尝试从 app.properties 自动探测，失败再询问）
  ones_space_id — ONES space ID

构建命令（有默认值）：
  build_cmd — 默认: mvn compile -am -q
  test_cmd  — 默认: mvn test -am
  lint_cmd  — 默认: 空
```

Always ask per-feature (regardless of project memory):
- `ones_work_item_id` + `ones_space_id` — 让用户提供完整的 ONES 工作项链接，直接从 URL 提取
- `citadel_parent_id` — parent doc for spec/tech-spec upload

**ONES 链接解析规则（无需任何工具，纯字符串解析）：**
```
URL 示例：https://ones.sankuai.com/ones/product/32980/workItem/requirement/detail/94647835?activeTabName=BRANCH
解析结果：
  ones_space_id      = 32980       （product/ 后的数字）
  ones_work_item_id  = 94647835    （detail/ 后的数字）
```
- 直接从用户粘贴的链接中提取这两个数字，**禁止调用任何外部工具（ee-ones、ones CLI 等）**
- 如果用户只提供了 ID 数字而非完整链接，直接使用该数字
- 解析失败时直接再问用户，不尝试任何工具调用

> **⚠️ 强制要求**：`ones_work_item_id`、`ones_space_id` 和 `citadel_parent_id` 必须在 Step 0a 结尾收集完毕，**无论 project.json 是否已存在**，不得推迟到后续 Stage。
> - 收集完后立即通过 `checkpoint-write` 写入 checkpoint。
> - **任何字段未获取到都不得跳过，必须重新询问用户直到获取有效值。**

Extract contentId from PRD URL:
- `/collabpage/2748397739` or `/page/2748397739` → contentId = `2748397739`
- Strip query strings. If no numeric segment found, ask user.

---

## Step 0c: Check for Unfinished Work (Checkpoint Restore)

```bash
ls .runway/checkpoint-*.json 2>/dev/null
```

If checkpoint files exist:
```
🔔 检测到未完成的工作项：
- .runway/checkpoint-{ones_work_item_id}.json（最后阶段：Stage {N}，更新时间：{updated_at}）
是否恢复？(y/n)
```

If yes:
1. Read checkpoint, validate `current_stage` is 1–12 and all required fields present.
   - Stage 3 requires `spec_context_path`; Stage 4 also requires `plan_path`; Stage 5+ also requires `branch_name` + `base_sha`
   - Stage 10+ requires deploy/test artifacts unless skipped; Stage 11/FIX LOOP requires `test_report_content_id`
2. If malformed or missing fields:
   ```
   ⚠️ Checkpoint 文件损坏或字段缺失，无法自动恢复。
   - 问题：{描述缺失字段或解析错误}
   - 建议：从 Stage 1 重新开始，或手动修复后重试。
   是否从 Stage 1 重新开始？(y/n)
   ```
3. Print compact restored status, resume from `current_stage`.
   **Skip Step 0d and Step 0a-post** — pipeline_options already in checkpoint.

If no: start fresh, continue to Step 0d.

---

## Step 0d: Pipeline Options Configuration

**⚠️ 即使跳过此步骤（因为 flag 已设定或 checkpoint 已有 pipeline_options），Step 0a-post 仍然必须执行——检查模块专属字段是否已收集。**

Skip the AskUserQuestion 表单 if `--frontend-mode`, `--lite`, `--litefull`, or checkpoint already has `pipeline_options`.

从 `project.json` 的 `pipeline_defaults` 预填（默认全启用）。

**⚠️ AskUserQuestion 每次最多 4 个选项，必须拆成两次独立调用，不得合并。**

**第一次 AskUserQuestion 调用 — 接口文档与网关：**
```
question: "选择要启用的接口文档/网关模块："
header: "文档网关"
multiSelect: true
options:
  - label: "PAPI 接口同步"
    description: "Step 2b 在技术方案通过后立即同步接口到 PAPI 平台。跳过影响：接口文档不同步。"
  - label: "Shepherd 网关配置"
    description: "CR 后自动配置牧羊人网关（仅 Thrift 项目新增接口）。跳过影响：新接口无法通过网关访问。"
```

等用户回答第一问后，再发起第二次 AskUserQuestion 调用：

**第二次 AskUserQuestion 调用 — 测试自动化：**
```
question: "选择要启用的测试自动化模块："
header: "测试模块"
multiSelect: true
options:
  - label: "测试用例生成"
    description: "Step 2c 生成接口测试用例文档写入学城。跳过影响：自动测试将无法执行。"
  - label: "自动部署测试泳道"
    description: "ee-cargo 将分支部署到测试环境。跳过影响：接口自动测试将无法执行。"
  - label: "接口自动测试"
    description: "执行测试用例，自动分析失败，自动修复循环。"
```

跳过规则：skip[测试用例生成] → skip[接口自动测试]；skip[自动部署] → skip[接口自动测试]。
写入 checkpoint `pipeline_options`，更新 `project.json` `pipeline_defaults`。详见 `references/pipeline-options.md`。

**Step 0d 结束后，立即进入 Step 0a-post 补收模块字段，不得跳过、不得推迟。**

---

## Step 0a-post: 补充模块配置字段（强制，不可跳过）

**⚠️ 无论 Step 0d 是否被跳过，此步骤必须执行。** pipeline_options 确定后（无论来自用户选择、CLI flag 还是 checkpoint 恢复），立即检查 `project.json` 中对应字段是否已有值，**缺失则一次性询问，不得等到对应 Stage 才临时索要**。

**唯一例外：** 从 checkpoint 恢复（Step 0c restore 路径）时，若 project.json 已有所有字段，可跳过询问直接继续。

> **条件收集规则：**

**选了「PAPI 接口同步」（skip_papi=false）→ 必填，均缺则合并为一次询问：**
```
papi_token      — PAPI 用户 Token（示例：bf01a2...）
papi_project_id — PAPI 项目 UUID（示例：dd8f22...）
papi_base_url   — 接口路径前缀，可选（如 /api/freelance；不填则 PAPI 接口无 BaseUrl 前缀）
```

**选了「自动部署测试泳道」（skip_deploy=false）→ 无需收集：**
```
cargo_appkey 固定等于 project.json 中的 appkey，自动复用，不询问用户。
```

**选了「接口自动测试」（skip_autotest=false）→ 两项均为必填，不允许为空：**
```
test_base_domain — 测试环境基础域名（示例：freelance.dzu.test.sankuai.com）
                   用于拼接 Stage 9 的测试 URL：https://{swimlane}-sl-{test_base_domain}
test_data_km_url — 测试数据学城文档 URL（runway-autotest 执行测试时读取占位符，必须存在）
                   若文档尚未创建，引导用户先在学城新建文档后再填入 URL。
```

**选了「Shepherd 网关配置」（skip_shepherd=false）→ 必填：**
```
shepherd_group_url — Shepherd 网关组 URL
```

收集完毕后写入 `.runway/project.json`。

---

## Step 0b: Load Project Knowledge

```bash
node "$RUNWAY_TOOLS" knowledge-read --root "$PROJECT_ROOT" --inject-into-stage 0 --format prompt 2>/dev/null
```

If `.runway/knowledge.json` exists, print count and last 5 `pitfall`/`pattern` entries. Pay attention to pitfalls that may affect the current feature. （命令详见 `references/project-setup.md`）
