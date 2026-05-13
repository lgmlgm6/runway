# Stage Init — Step 0 详细执行规范

## Step 0-mode: 模式选择（前置，无 flag 时触发）

当用户没有传入任何模式 flag（`--lite`、`--litefull`、`--fullstack`、`--frontend-mode`、`--requirements-spec-id`、`--tech-spec-id`）时，在 Step 0-pre 之前展示模式选择表单。已从 checkpoint restore 时跳过。

**AskUserQuestion 上限为 4 个选项，因此使用两步选择，两次调用必须顺序独立，不得合并：**

**第一问 — 仓库范围（3 选 1）：**
- 后端：单仓后端开发，主 Agent 完成流水线
- 前端：单仓前端开发，主 Agent 完成流水线
- 全栈：派发 AgentTeam 前后端并行跑流水线

**第二问 — 质量档位（2 选 1）：**
- 标准：含 PRD Spec + Tech Spec，有 2 个 Hard Gate
- 轻量：跳过 Spec 阶段，零 Hard Gate

6 个选项的内部映射（不展示给用户）：

| 仓库范围 | 质量档位 | pipeline_mode | 附加设置 |
|--------|---------|--------------|---------|
| 后端 | 标准 | standard | — |
| 后端 | 轻量 | lite | — |
| 前端 | 标准 | standard | role=frontend，apply frontend-mode settings |
| 前端 | 轻量 | lite | role=frontend，apply frontend-mode settings |
| 全栈 | 标准 | fullstack | fullstack_handoff_status=pending |
| 全栈 | 轻量 | litefull | fullstack_handoff_status=pending |

选择后立即写入 checkpoint，后续 Step 0-pre 按已设定的 pipeline_mode 处理，不再展示选择。

---

## Step 0-pre: Parse CLI Arguments

```
--frontend-mode   → 前端流水线模式。自动设置：role=frontend，skip_papi=true，skip_tclist=true，skip_shepherd=true，skip_autotest=true，qa_mode=build_lint_only，skip_retrospective=true。跳过 Step 0d。
--fullstack       → 全栈 Leader 模式。pipeline_mode=fullstack，fullstack_handoff_status=pending。走 Stage 1→2→2b/2c 后派发 runway-fullstack，不进本地 Stage 3。
--lite            → 轻量模式。pipeline_mode=lite，跳过 Stage 1+2，走 Stage 0.5。不跳过 Step 0d。
--litefull        → 轻量全栈模式。pipeline_mode=litefull，fullstack_handoff_status=pending，跳过 Stage 1+2，走 Stage 0.5。不跳过 Step 0d。
--skip-stages     → 逗号分隔的阶段编号列表，标记为跳过并写入 pipeline_options。
--requirements-spec-id <id>  → 已有需求规格学城 contentId，写入 checkpoint，跳过 Stage 1。
--tech-spec-id <id>          → 已有技术方案学城 contentId，写入 checkpoint，跳过 Stage 2。两者同时提供时 Stage 1+2 均跳过。
--tclist-content-id <id>     → 已有测试用例学城 contentId，写入 checkpoint，跳过 Step 2c。
```

**If `--frontend-mode` is present:**
Set in checkpoint and pipeline_options:
- `role = "frontend"`, `pipeline_options.skip_papi = true`, `skip_tclist = true`, `skip_shepherd = true`, `skip_autotest = true`
- `qa_mode = "build_lint_only"`, `skip_retrospective = true`
- `team_mode = true` (if called by a team leader); set `leader_name` from `--leader-name` if present
- Skip Step 0d — all options already determined.

**If `--lite` AND `--frontend-mode` are both present:**
- `pipeline_mode = "lite"`, `role = "frontend"`
- All frontend-mode settings above apply.
- Skip Step 0d — all options already determined.
- Skip Stage 1+2, proceed to Stage 0.5.

**If `--lite` is present (without `--frontend-mode`):**
- `pipeline_mode = "lite"` — skip Stage 1+2, proceed to Stage 0.5.
- Do NOT skip Step 0d.

**If `--litefull` is present:**
- `pipeline_mode = "litefull"`, `fullstack_handoff_status = "pending"` — skip Stage 1+2.
- Do NOT skip Step 0d.
- After Stage 0.5 + Step 2b/2c complete: invoke `runway-fullstack`.

**If `--fullstack` is present:**
- `pipeline_mode = "fullstack"`, `fullstack_handoff_status = "pending"`
- Do NOT skip Step 0d.
- Run Stage 1 (HARD GATE) → Stage 2 (HARD GATE) → Step 2b/2c normally.

**If `--skip-stages` is present:** parse list, mark skipped in pipeline_options.

**If `--requirements-spec-id` and `--tech-spec-id` are present:** write to checkpoint, skip Stages 1+2.

**If `--tclist-content-id` is present:** write to checkpoint as `tclist_content_id`.

### pipeline_mode 冲突检测（0-pre 末尾，立即执行）

Flag 解析完成后，立即扫描 `.runway/checkpoint-*.json`：

1. 若存在 checkpoint，读取其中的 `pipeline_mode`
2. 将 checkpoint 的 `pipeline_mode` 与当前 flag 推导出的 mode 对比
3. **发现冲突**（如 checkpoint=lite，当前传入 `--fullstack`）→ 立即提示用户，询问：以 checkpoint 模式继续恢复，还是放弃 checkpoint 重新开始？
4. **无冲突** → 不打扰用户，继续向下
5. **无 checkpoint** → 不打扰用户，继续向下

---

## Step 0a: Load Project Memory（project 级基础字段）

```bash
cat .runway/project.json 2>/dev/null
```

### project.json 已存在 — 展示当前值并询问

打印所有已有字段的当前值（`mis`、`appkey`、`ones_space_id`、`build_cmd`、`test_cmd`、`lint_cmd`），然后询问：

```
以上项目配置是否需要变更？(y/n)
```

- 用户选 **n** → 直接使用，不重新收集任何字段，继续向下
- 用户选 **y** → 逐项确认，仅修改用户指定的字段，其余保持不变，写回 project.json

### project.json 不存在 — 首次收集

收集以下字段：

```
必填：
  mis           — 用户 MIS 账号
  appkey        — 服务 appkey（先尝试从 app.properties 自动探测，失败再询问）
  ones_space_id — ONES 产品空间 ID（同一项目所有需求共用，首次从 ONES 工作项链接提取
                  product/ 后的数字，后续自动复用，写入 project.json）

构建命令（有默认值）：
  build_cmd — 默认: mvn compile -am -q
  test_cmd  — 默认: mvn test -am
  lint_cmd  — 默认: 空（前端项目填写，后端通常留空）
```

收集完毕后写入 `.runway/project.json`。

---

## Step 0c: Check for Unfinished Work (Checkpoint Restore)

> **注意：pipeline_mode 冲突检测已在 Step 0-pre 末尾完成，此步不再重复。**

```bash
ls .runway/checkpoint-*.json 2>/dev/null
```

### 发现 Checkpoint → 询问用户

展示：checkpoint 文件名、最后阶段 Stage N、更新时间。

```
🔔 检测到未完成的工作项：
- .runway/checkpoint-{ones_work_item_id}.json（最后阶段：Stage {N}，更新时间：{updated_at}）
是否恢复？(y/n)
```

**用户选 y（恢复）：**

1. 读取 checkpoint，验证 `current_stage` 为 1–12
2. 验证阶段必要字段：
   - Stage 3 requires `spec_context_path`
   - Stage 4+ also requires `plan_path`
   - Stage 5+ also requires `branch_name` + `base_sha`
   - Stage 10+ requires deploy/test artifacts unless skipped
   - Stage 11/FIX LOOP requires `test_report_content_id`
3. **checkpoint 损坏或字段缺失** → 提示用户，询问是否从 Stage 1 重新开始
4. **执行 0c-verify**：读取 checkpoint 的 `pipeline_options`，逐项检查 `project.json` 中对应模块字段是否存在且非空：
   - `skip_papi=false` → 检查 `papi_token`、`papi_project_id`、`papi_base_url`
   - `skip_autotest=false` → 检查 `test_base_domain`、`test_data_km_url`
   - `skip_shepherd=false` → 检查 `shepherd_group_url`
   - 任何字段缺失 → 立即补收，写入 project.json
5. 所有字段确认后 → **跳过 Step 0a-feature、Step 0-mode、Step 0d、Step 0a-post**，直接 resume from `current_stage`

**用户选 n（不恢复）：**

继续向下走新建流程。

### 无 Checkpoint → 直接新建

无需操作，继续向下。

---

## Step 0a（feature 级）: 收集本次工作项信息

**仅新建流程走到此处。restore 路径已从 checkpoint 读取所有 feature 字段，跳过此步。**

每次运行必收，无论 project.json 是否已存在。

### 必须收集

**ONES 工作项链接**（让用户粘贴完整链接）：

```
URL 示例：https://ones.sankuai.com/ones/product/32980/workItem/requirement/detail/94647835
解析结果：
  ones_space_id      = 32980       （product/ 后的数字，同时写入 project.json）
  ones_work_item_id  = 94647835    （detail/ 后的数字，写入 checkpoint）
```

- **禁止调用任何外部工具（ee-ones、ones CLI 等），纯字符串解析**
- 解析失败时直接再问用户，不尝试任何工具调用
- 如果用户只提供了 ID 数字而非完整链接，直接使用该数字

**citadel_parent_id**：学城父文档 ID（用于上传需求规格 / 技术方案 / 测试用例）

**PRD 链接**：
- contentId 提取规则：`/collabpage/{id}` 或 `/page/{id}` → 取数字部分，去掉 query string
- 解析失败时重新询问用户，不尝试工具调用

> **⚠️ 强制要求**：`ones_work_item_id`、`citadel_parent_id`、`prd_content_id` 必须在此步结尾全部获取完毕，不得推迟到后续 Stage。任何字段未获取到都必须重新询问，不得跳过。
>
> - `ones_work_item_id`、`citadel_parent_id`、`prd_content_id` → 立即通过 `checkpoint-write` 写入 checkpoint
> - `ones_space_id` → 从 ONES 链接提取后写入 `project.json`（project 级，不写入 checkpoint）

---

## Step 0d: Pipeline Options Configuration

**跳过整个步骤的唯一条件：** 已传入 `--frontend-mode`（所有选项已由 flag 确定）。

`--lite`、`--litefull`、`--fullstack` 均不跳过此步骤。

已从 checkpoint restore 时：读取已保存的 `pipeline_options`，展示当前值后询问是否变更，不重新展示选项表单（见下方「已有 pipeline_defaults」路径）。

**⚠️ 无论此步骤是否展示表单，Step 0a-post 在新建流程中仍然必须执行。**

### pipeline_defaults 已存在 — 展示当前值 + 适用性提示，询问是否变更

打印当前 `pipeline_defaults` 各项值（PAPI/Shepherd/TCList/Deploy/Autotest 是否启用）。

对比当前 `pipeline_mode`，若某项跳过会影响本模式关键路径，在该项旁边高亮提示，例如：
- `skip_tclist=true` 在 standard 模式下将导致 Stage 10 自动跳过
- `skip_deploy=true` 将导致接口自动测试无法执行

询问：`以上流水线配置是否需要变更？(y/n)`

- 用户选 **n** → 直接将 `pipeline_defaults` 复用为本次 `pipeline_options`，写入 checkpoint，跳过下方表单
- 用户选 **y** → 展示下方两问表单，重新配置

### pipeline_defaults 不存在 — 展示表单配置

**⚠️ AskUserQuestion 每次最多 4 个选项，必须拆成两次独立调用，等用户回答第一问后再发起第二问，不得合并。**

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

等用户回答后，再发起第二次：

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

### 跳过依赖规则

```
skip[测试用例生成]   → skip[接口自动测试]   （无用例文档无法执行测试）
skip[自动部署测试泳道] → skip[接口自动测试]  （无部署环境无法执行测试）
PAPI 与 Shepherd 相互独立，互不影响
```

### 写入目标

写入 checkpoint `pipeline_options`：
```json
{
  "skip_papi": false,
  "skip_shepherd": false,
  "skip_tclist": false,
  "skip_deploy": false,
  "skip_autotest": false
}
```

同步写入 `project.json` 的 `pipeline_defaults`，下次运行时自动预填。

---

## Step 0a-post: 补充模块配置字段（新建流程专用，强制，不可跳过）

**⚠️ 仅新建流程执行。restore 路径在 Step 0c 的 0c-verify 中已完成字段补收，不走此步。**

pipeline_options 确定后立即执行。检查 `project.json` 中对应模块字段是否已有值，**缺失则一次性询问，不得等到对应 Stage 才临时索要**。已有值则静默跳过，不重复询问。

**选了「PAPI 接口同步」（skip_papi=false）→ 以下三项均必填，均缺时合并为一次询问：**
```
papi_token      — PAPI 用户 Token
papi_project_id — PAPI 项目 UUID
papi_base_url   — 接口路径前缀（必填，不允许为空）
```

**选了「自动部署测试泳道」（skip_deploy=false）→ 无需收集：**
```
cargo_appkey 固定等于 project.json 中的 appkey，自动复用，不询问用户。
```

**选了「接口自动测试」（skip_autotest=false）→ 两项均必填，不允许为空：**
```
test_base_domain — 测试环境基础域名
                   用于拼接 Stage 9 的测试 URL：https://{swimlane}-sl-{test_base_domain}
test_data_km_url — 测试数据学城文档 URL（runway-autotest 执行测试时读取占位符，必须存在）
                   若文档尚未创建，引导用户先在学城新建文档后再填入 URL。
```

**选了「Shepherd 网关配置」（skip_shepherd=false）→ 必填：**
```
shepherd_group_url — Shepherd 网关组 URL
```

收集完毕后写入 `.runway/project.json`。初始化完成，进入 Stage 1（standard/fullstack）或 Stage 0.5（lite/litefull）。
