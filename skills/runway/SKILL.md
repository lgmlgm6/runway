---
name: runway
description: End-to-end development pipeline — PRD analysis → tech design → task planning → parallel dev → code review → QA verification. Invoke this skill whenever the user provides a km.sankuai.com PRD link with a ones work item ID, or says anything like "开发这个需求", "帮我开发", "实现这个功能", "help me develop", "implement this PRD", or "start development". Do NOT wait for the user to explicitly say "runway" — any request to go from a requirement to working code should trigger this skill immediately, even if phrased casually or in Chinese.
version: 0.1.0
---

# Runway Orchestrator

End-to-end development pipeline. Takes a xuecheng PRD link and a ones work item ID, drives all stages to completion, pauses at the Stage 1 and Stage 2 Hard Gates for user confirmation, and auto-advances from Stage 3 onward unless blocked.

## 模式路由表

**触发条件：** 用户给 PRD 链接 + ONES ID，意图是"从需求走到可工作代码"。
**不触发：** 仅讨论方案、仅 review 代码、仅修小 bug → 保持当前模式。
**出错原则：** 本地 fallback（`.runway/docs/`）> 重试一次 > 向用户询问。

| pipeline_mode | 路径 | Hard Gate |
|--------------|------|-----------|
| standard（后端） | Stage 0 → 1 → 2 → 2b/2c → **loop-init(3)** → 3→12 | 2 个 |
| lite（后端） | Stage 0 → 0.5 → 2b/2c → **loop-init(3)** → 3→12 | 无 |
| standard（前端） | 同 standard，role=frontend，跳过 PAPI/Shepherd/autotest，QA=build+lint only | 2 个 |
| lite（前端） | 同 lite，role=frontend，跳过 PAPI/Shepherd/autotest，QA=build+lint only | 无 |
| fullstack | Stage 0 → 1 → 2 → 2b/2c → runway-fullstack 派发 → leader 停止 | 2 个 |
| litefull | Stage 0 → 0.5 → 2b/2c → runway-fullstack 派发 → leader 停止 | 无 |

**各 Stage 产出：** 3→plan_path，4→branch_name，5→HEAD_SHA，6→CR passed，7→shepherd（可跳），8→QA passed，9→cargo_test_url（可跳），10→test_report（可跳），11→bug_analysis，12→完成摘要

**跳过规则：** skip[2c] → skip[10]；skip[9] → skip[10]；2b/2c 相互独立；详见 `references/pipeline-options.md`。

## How to Start

### Step 0: Load Project Memory and Check Checkpoint

Execute the full initialization sequence. See `references/stage-init.md` for complete rules on each sub-step.

**Step 0-mode — 模式选择（仅当无任何模式 flag 时触发）：**

If none of `--lite`, `--litefull`, `--fullstack`, `--frontend-mode`, `--requirements-spec-id`, `--tech-spec-id` are present, use **two sequential `AskUserQuestion` calls** to select the pipeline mode. **⚠️ 每次只调用一个 AskUserQuestion，等用户回答后再发起下一次，不得合并成一次调用。**

**第一次 AskUserQuestion — 仓库范围：**
```
question: "请选择开发范围："
header: "仓库范围"
multiSelect: false
options:
  - label: "后端"
    description: "单仓后端开发，含 PAPI 同步、Shepherd 配置、自动测试。"
  - label: "前端"
    description: "单仓前端开发，QA 阶段只做 build + lint 验证。"
  - label: "全栈"
    description: "自动派发 AgentTeam，前后端仓库并行开发，最终汇总结果。"
```

等用户回答后，再发起第二次 AskUserQuestion：

**第二次 AskUserQuestion — 质量档位：**
```
question: "请选择质量档位："
header: "质量档位"
multiSelect: false
options:
  - label: "标准"
    description: "质量优先。含 PRD Spec + Tech Spec 全套评审，有 2 个人工确认门。耗时较长。"
  - label: "轻量"
    description: "速度优先。跳过 PRD/Tech Spec，直接读 PRD 生成接口设计，零 Hard Gate。"
```

Map the two answers to internal flags (do not show this mapping to the user):
- 后端 + 标准 → `pipeline_mode = "standard"`
- 后端 + 轻量 → `pipeline_mode = "lite"`
- 前端 + 标准 → `pipeline_mode = "standard"`, `role = "frontend"`, apply frontend-mode settings
- 前端 + 轻量 → `pipeline_mode = "lite"`, `role = "frontend"`, apply frontend-mode settings
- 全栈 + 标准 → `pipeline_mode = "fullstack"`, `fullstack_handoff_status = "pending"`
- 全栈 + 轻量 → `pipeline_mode = "litefull"`, `fullstack_handoff_status = "pending"`

**Step 0-pre:** Parse CLI flags (`--frontend-mode`, `--fullstack`, `--lite`, `--litefull`, `--skip-stages`, `--requirements-spec-id`, `--tech-spec-id`, `--tclist-content-id`) and set checkpoint fields accordingly. Mode-specific behavior is fully specified in `references/stage-init.md`.

**Step 0a:** Load `.runway/project.json` base fields (mis, appkey, ones_space_id, build commands). If missing, collect base fields only. Always ask for `ones_work_item_id` and PRD contentId per feature.

**Step 0c:** Scan for checkpoint files. If found, offer restore — if restored, skip Step 0d AskUserQuestion form only; still run Step 0a-post to verify all module fields are present in project.json.

**Step 0d:** Show pipeline options form (skip the AskUserQuestion form if `--frontend-mode`, `--lite`, `--litefull`, or checkpoint already has pipeline_options). Write choices to `pipeline_options`. See `references/pipeline-options.md`. **⚠️ Step 0a-post must always run after Step 0d regardless of whether the form was shown.**

**Step 0a-post:** Collect module-specific fields based on pipeline_options (papi_token if PAPI selected, test_base_domain if autotest selected, shepherd_group_url if Shepherd selected). **必须执行，不可跳过。** Write to `project.json`.

**Step 0b:** Load project knowledge from `.runway/knowledge.json` — print last 5 pitfall/pattern entries.

## State Tracking

Use the canonical checkpoint `.runway/checkpoint-{ones_work_item_id}.json` as the cross-stage source of truth. Use `.claude/runway-state/*.md` only for active loop ownership and resume mechanics.

Query workflow snapshot:

```bash
RUNWAY_TOOLS="${CLAUDE_PLUGIN_ROOT:+${CLAUDE_PLUGIN_ROOT}/skills/runway/bin/runway-tools.cjs}"
RUNWAY_TOOLS="${RUNWAY_TOOLS:-$HOME/.claude/skills/runway/bin/runway-tools.cjs}"
PROJECT_ROOT=$(git rev-parse --show-toplevel 2>/dev/null || echo "$PWD")
node "$RUNWAY_TOOLS" status --root "$PROJECT_ROOT" --ones-id "{ones_work_item_id}"
```

Stages 1 and 2 are explicit Hard Gates (standard/fullstack only). After Stage 2 approval (or Stage 0.5 for lite/litefull), the orchestrator auto-advances through Step 2b/2c, then branches by checkpoint state:
- `pipeline_mode=standard` or `lite` → Stage 3 → 4 → 5 → 6 → 7 → 8 → 9 → 10 → Stage 11 (bug analysis) → FIX LOOP → 12 unless blocked
- `pipeline_mode=fullstack` or `litefull` with `fullstack_handoff_status=pending` → invoke `runway-fullstack` and stop
- `pipeline_mode=fullstack` or `litefull` with `fullstack_handoff_status=dispatched` → must not enter local Stage 3 again

At each stage boundary, keep the checkpoint current with `checkpoint-write` and print only the compact status fields the user needs to see next: current stage, artifact IDs/paths, branch/SHA, and whether the workflow is waiting, blocked, or auto-advancing.

If an upstream artifact changes after a hard gate, run `artifacts-invalidate` to find the earliest invalidated stage, tell the user which downstream stages must rerun, and resume from there. See `references/stage-handoff.md` for the exact propagation map.

## Review-Only Guardrail

Do not invoke this orchestrator for review-only or audit-only work. If the user asks to assess the workflow, review skill content, or compare approaches without implementing a requirement, stay in review mode and do not enter Stage 1.

## Stage 0.5: Interface Design（lite / litefull 模式专属，代替 Stage 1+2）

**触发条件：** `pipeline_mode = "lite"` 或 `pipeline_mode = "litefull"`
**输入：** PRD URL + `ones_work_item_id`
**输出：** `mini_spec_path` + `spec_context_path`

执行 4 个步骤：读 PRD + 探索代码库找参照 → 生成 mini-spec → 6 条自检（最多 2 轮）→ 写入 spec_context + checkpoint，进入 Step 2b/2c。

See `references/stage-0.5.md` for full execution details, mini-spec format, and self-check rules.

## Stage 1: PRD Analysis

Invoke the **runway-prd-analysis** skill with:
- contentId extracted from PRD URL
- xuecheng parent document ID (for uploading the requirements spec)
- MIS

The skill handles: reading full PRD → ambiguity scoring → clarification → spec writing → self-review → upload to xuecheng.

**Hard Gate:** runway-prd-analysis will pause, present the complete requirements spec, and ask the user to confirm. Wait for explicit confirmation before continuing.

After confirmation, print:
```
✅ Stage 1 完成 — 需求规格
- 学城ID：{requirements_spec_contentId}
- 学城链接：https://km.sankuai.com/collabpage/{requirements_spec_contentId}
- 进入 Stage 2：技术方案设计
```

Record the returned xuecheng contentId as `requirements_spec_contentId`.

Save checkpoint after Stage 1 Hard Gate with `checkpoint-write --current-stage 2`. （命令详见 `references/state-management.md`）

## Stage 2: Tech Design

Invoke the **runway-tech-design** skill with:
- requirements spec contentId from Stage 1
- MIS

The skill handles: reading spec → admission scan → admission-based review path → Step 4.5（接口 PATH 完整化）→ deliberate mode if needed → self-review → present full tech spec → upload to xuecheng after approval.

传入额外参数（供 Step 4.5 使用，从 project.json 读取）：
- `papi_base_url` — 新接口 PATH 前缀
- `papi_token` — PAPI 用户 Token（project.json）
- `papi_project_id` — PAPI 项目 ID

**Hard Gate:** runway-tech-design will present the complete tech spec and ask the user to review and approve. After approval, it uploads the tech spec to xuecheng and returns the contentId. Wait for explicit approval before continuing.

After approval, print:
```
✅ Stage 2 完成 — 技术方案（含接口 PATH 完整化）
- 学城ID：{tech_spec_contentId}
- 学城链接：https://km.sankuai.com/collabpage/{tech_spec_contentId}
- 启动 Step 2b（PAPI 同步）+ Step 2c（测试用例生成）并行执行
```

Record the returned xuecheng contentId as `tech_spec_contentId`.

Update checkpoint after Stage 2 Hard Gate with `checkpoint-write --current-stage 3`. If `--fullstack` is active, also persist `pipeline_mode=fullstack` and `fullstack_handoff_status=pending`. （命令详见 `references/state-management.md`）

**Stage 2 完成后，编排器生成 spec_context（standard/fullstack 模式）：**

从学城读取 requirements_spec 和 tech_spec，提取三章节写入本地文件：

```bash
ONES_ID="{ones_work_item_id}"
SPEC_CONTEXT_PATH=".runway/docs/${ONES_ID}/spec-context.md"
mkdir -p ".runway/docs/${ONES_ID}"

# 读取两份学城文档
REQ_SPEC=$(oa-skills citadel getMarkdown --contentId "{requirements_spec_content_id}" --mis "{mis}" 2>/dev/null)
TECH_SPEC=$(oa-skills citadel getMarkdown --contentId "{tech_spec_content_id}" --mis "{mis}" 2>/dev/null)

# 提取三章节写入 spec_context
cat > "$SPEC_CONTEXT_PATH" << 'EOF'
## 需求描述
{从 requirements_spec 的「一、背景与目标」提取}

## 接口设计
{从 tech_spec 的「三、接口协议变更」提取，含 HTTP/Thrift 方法、Request/Response 字段}

## 业务规则
{从 tech_spec 的「五、验证策略」及各接口业务规则章节提取}
EOF
```

写入 checkpoint：`checkpoint-write --spec-context-path "$SPEC_CONTEXT_PATH"`

## Step 2b: PAPI 同步（可跳过）→ 完成后再执行 Step 2c（串行）

**⚠️ 必须使用 `Skill("runway-papi", ...)` 工具调用，严禁用 Agent 替代。**
Step 2b 和 Step 2c 串行执行：先等 Step 2b 完成并收到结果，再执行 Step 2c。

**跳过条件（满足任一则跳过）：**
- `pipeline_options.skip_papi == true` → 记录 `papi_sync_status: skipped-by-user`
- `project.json` 中 `papi_token` 或 `papi_project_id` 为空 → 记录 `papi_sync_status: skipped-no-config`，打印提示：`⚠️ PAPI 配置缺失（papi_token / papi_project_id），已跳过 PAPI 同步。如需同步请在 project.json 中补充配置。`

注意：不因项目类型（Thrift/HTTP）跳过。Thrift 项目同样有 HTTP 接口（通过 Shepherd 网关），同样需要同步到 PAPI。`papi_base_url` 为可选项，缺失时不跳过。

Invoke the **runway-papi** skill with:
- standard/fullstack 模式：`tech_spec_content_id`（含完整 PATH，来自 Stage 2 Step 4.5）
- lite/litefull 模式：`mini_spec_path`（来自 Stage 0.5）
- mis（checkpoint / project memory）
- papi_token（project.json）
- papi_project_id（project.json）
- papi_base_url（project.json，可为空）

The skill handles: 读取技术方案「三、接口协议变更」→ 必要时用 Shepherd 补全 Thrift 接口 method/path → 从代码 DTO 补全全量 Request/Response Schema → 校验格式 → diff 线上状态 → 自动上传（存量更新/新接口新建）。失败记录 checkpoint，不阻断流程。若有待确认、待查询、Schema 不完整或失败，返回 `papi_sync_status=partial`。同时写入 `.runway-team/api-changelog/` 变更记录。

After completion, print:
```
✅ Step 2b 完成 — PAPI 同步
- 同步状态：{papi_sync_status}
```

Update checkpoint: `checkpoint-write --papi-sync-status "{status}" --papi-synced-apis '{json}'`.

## Step 2c: 测试用例生成（可跳过，在 Step 2b 完成后执行）

**⚠️ 必须使用 `Skill("runway-tclist", ...)` 工具调用，严禁用 Agent 替代。**
Step 2b 完成后再执行 Step 2c，两者串行。

**跳过条件：** `pipeline_options.skip_tclist == true` → 跳过，记录 `tclist_content_id: skipped`。skip_tclist=true 时 Stage 10 自动跳过。

Invoke the **runway-tclist** skill. The skill reads `pipeline_mode` from checkpoint and selects inputs automatically:

**standard/fullstack 模式**（skill 内部从 checkpoint 读取）：
- `requirements_spec_content_id` + `tech_spec_content_id`（来自 checkpoint Stage 1/2 产出）

**lite/litefull 模式**（skill 内部从 checkpoint 读取）：
- `spec_context_path`（需求描述）+ `mini_spec_path`（接口设计 + 业务规则）

**两种模式均需：**
- `citadel_parent_id`（来自 checkpoint，无需询问用户）
- `test_data_km_url`（project.json，生成前先读取复用已有占位符 key）
- `mis`

The skill handles: 生成覆盖正常流 / 参数校验 / 业务规则 / E2E 的接口测试用例，写入学城（parentId = citadel_parent_id）。

After completion, print:
```
✅ Step 2c 完成 — 测试用例生成
- 学城ID：{tclist_content_id}
```

Update checkpoint: `checkpoint-write --tclist-content-id "{tclist_content_id}"`.

**Step 2b + 2c 均完成后**，按 checkpoint 状态执行硬分支，**必须在同一 turn 内立即执行，不得停止等待用户输入**：
- `pipeline_mode = standard` → **立即调用 runway-task-planning**（Stage 3）
- `pipeline_mode = lite` → **立即调用 runway-task-planning**（Stage 3，以 spec_context_path 作为输入）
- `pipeline_mode = fullstack` 且 `fullstack_handoff_status = pending` → **立即调用 runway-fullstack**
- `pipeline_mode = fullstack` 且 `fullstack_handoff_status = dispatched` → 不重派发，leader 停止
- `pipeline_mode = litefull` 且 `fullstack_handoff_status = pending` → **立即调用 runway-fullstack**（传入 `mini_spec_path` + `spec_context_path` 替代 spec contentId）
- `pipeline_mode = litefull` 且 `fullstack_handoff_status = dispatched` → 不重派发，leader 停止

**⚠️ 禁止只输出”进入 Stage 3”文字后停止 —— 必须直接 invoke 对应 skill，不等用户点”继续”。**

禁止在 `pipeline_mode = fullstack` 或 `litefull` 时沿用默认”进入 Stage 3”的普通分支。

### 激活流水线续命循环（Stage 3-12）

在进入 Stage 3 之前（`pipeline_mode = standard` 或 `lite` 时），激活 Stage 3-12 pipeline 续命循环：

```bash
RUNWAY_TOOLS=”${CLAUDE_PLUGIN_ROOT:+${CLAUDE_PLUGIN_ROOT}/skills/runway/bin/runway-tools.cjs}”
RUNWAY_TOOLS=”${RUNWAY_TOOLS:-$HOME/.claude/skills/runway/bin/runway-tools.cjs}”
PROJECT_ROOT=$(git rev-parse --show-toplevel 2>/dev/null || echo “$PWD”)
node “$RUNWAY_TOOLS” loop-init \
  --root “$PROJECT_ROOT” \
  --stage 3 \
  --session-id “${CLAUDE_SESSION_ID:-$(date +%s%N)}” \
  --started-at “$(date -u +%Y-%m-%dT%H:%M:%SZ)” \
  --prompt-text “你是 Runway 编排器，Stage 3-12 流水线正在运行中。读取 checkpoint 检查 current_stage 和 fix_loop_status，从当前位置继续：Stage 3 未完成 → 调用 runway-task-planning；Stage 4 未完成 → 创建分支（ones bg/ba + git checkout -b）；Stage 5 未完成 → 调用 runway-parallel-dev；Stage 6 未完成 → 调用 runway-code-review-fix（含业务规则注入）；Stage 7 未完成且 skip_shepherd=false → 调用 runway-shepherd；Stage 7 完成后执行 git push；Stage 8 未完成 → 调用 runway-qa-verify；Stage 9 未完成且 skip_deploy=false → 调用 ee-cargo；Stage 10 未完成且 skip_autotest=false → 调用 runway-autotest；fix_loop_status=stage11 → 调用 runway-bug-analysis；fix_loop_status=f1 → 执行代码修复；fix_loop_status=f2 → 执行 diff review + regression check；fix_loop_status=f3 → 执行 git push + cargo deploy；fix_loop_status=f4 → 调用 runway-autotest（仅失败用例）；fix_loop_status=complete 或 exhausted 或 test_failed_count=0 → 执行 Stage 12 Retrospective → 打印 Development Complete → 更新 ONES → 输出 <promise>RUNWAY STAGES 3-12 COMPLETE</promise>”
```

Then **immediately proceed to Stage 3 without waiting for user input**.

## Stage 3: Task Planning

Invoke the **runway-task-planning** skill with:
- `spec_context_path` from checkpoint（all modes — lite writes this in Stage 0.5 Step 4, standard/fullstack writes this after Stage 2 Hard Gate）
- MIS

The skill handles: reading spec_context → codebase exploration → writing zero-placeholder plan with wave grouping → self-review → saving the plan → returning a handoff summary. 计划末尾包含「接口清单提纲」（HTTP 方法 + 完整 PATH 供参考）。

After the skill returns, automatically print:
```
✅ Stage 3 完成 — 任务规划
- 计划文件：{plan_path}
- 进入 Stage 4：创建分支
```

Record the plan path as `plan_path`.

Update checkpoint: `checkpoint-write --plan-path "{plan_path}" --current-stage 4`.

**⚠️ Stage 3 完成后必须在同一 turn 内立即执行 Stage 4，不得停止等待用户输入。**

## Stage 4: Create Branch

Use non-interactive commands only. Never use `ones bc` (it requires interactive app selection and blocks automation). Flow: `ones bg` → match appId via `ones space-apps` → `ones ba` → `git checkout -b`. （完整命令详见 `references/branch-creation.md`）

Record:
- `branch_name`
- `BASE_SHA` = `git rev-parse HEAD`

Update ones work item status:
```bash
ones wu -i {ones_work_item_id} -F '{"variable":"state","name":"状态","type":"component_state","multiple":false,"fieldValue":"排期完成"}'
```

Print:
```
✅ Stage 4 完成 — 分支创建
- 分支名：{branch_name}
- ONES 工作项：{ones_work_item_id} → 状态已更新为"排期完成"
- BASE_SHA：{sha}
- 进入 Stage 5：并行开发
```

Update checkpoint with branch and sha using `checkpoint-write --current-stage 5`. （命令详见 `references/state-management.md`）

### 保存项目记忆

如果 `.runway/project.json` 不存在，在此时运行 `project-memory-init` 自动生成并提示用户确认写入；同时确保 `.runway/` 已加入 `.gitignore`。（命令详见 `references/project-setup.md`）

<!-- 续命循环已在 Step 2b/2c 完成后（Stage 3 入口）统一激活，覆盖 Stage 3-12，此处无需重复 -->

## Stage 5: Parallel Dev

Before invoking, load `PROJECT_NOTES` from `.runway/project.json` (`.notes` + `.known_issues`). If non-empty, prepend as `"项目已知约束:\n{PROJECT_NOTES}"` to the skill context. （详见 `references/context-injection.md`）

Invoke the **runway-parallel-dev** skill with:
- plan path from Stage 3
- branch name
- BASE_SHA from Stage 4
- project notes (if any)

The skill handles: wave-based parallel execution → two-phase review per task → execution report.

BLOCKED tasks are surfaced to the user but do not stop the pipeline for other tasks unless they block later waves.
Do not stop after Stage 5 skill startup, plan load, tracker creation, wave banners, or execution-report packaging. Those are internal progress events, not user approval points.
After Stage 5 returns a completed execution report, continue directly into Stage 6 in the same turn unless Stage 5 explicitly paused under its allowed blocker conditions.

**Escalation rule:** If a task is truly blocked and requires human input, deactivate the pipeline state before pausing; reactivate after user resolves. （命令详见 `references/state-management.md`）

After completion, print:
```
✅ Stage 5 完成 — 并行开发
- 已完成任务：{N} 个
- HEAD_SHA：{sha}
- 进入 Stage 6：代码 Review
```

Record `HEAD_SHA` = `git rev-parse HEAD`.

## Stage 6: Code Review Fix

**Stage 6 业务规则增强**：在调用 runway-code-review-fix 之前，若 `tclist_content_id` 存在于 checkpoint，读取学城用例文档，提取「业务规则」章节内容，注入给 Reviewer 1（Functional & Logic）的 prompt，作为业务规则参照。skip_tclist=true 时跳过此增强，退化为标准 CR 行为。

```bash
# 读取业务规则上下文（tclist_content_id 存在时）
TCLIST_ID=$(jq -r '.tclist_content_id // empty' .runway/checkpoint-*.json 2>/dev/null | head -1)
if [[ -n "$TCLIST_ID" && "$TCLIST_ID" != "skipped" ]]; then
  BUSINESS_RULES=$(oa-skills citadel getMarkdown --contentId "$TCLIST_ID" --mis "{mis}" 2>/dev/null \
    | awk '/#### 业务规则/{found=1} found{print} /^####/{if(found && !/业务规则/)found=0}')
fi
```

将 `BUSINESS_RULES` 作为额外上下文传给 runway-code-review-fix 的 Reviewer 1 prompt：`"以下是本次接口的业务规则，请检查代码实现是否覆盖了这些场景：\n{BUSINESS_RULES}"`。

Invoke the **runway-code-review-fix** skill with:
- branch name
- BASE_SHA from Stage 4
- HEAD_SHA from Stage 5
- business_rules_context（如有）

The skill handles: parallel multi-dimension review → finding dedupe → fix by severity → convergence loop. Escalates to user only if a Critical issue cannot be resolved after 3 attempts.

After completion, print:
```
✅ Stage 6 完成 — 代码 Review
- Critical/Important 问题：已全部修复
- HEAD_SHA：{sha}
- 进入 Stage 7：Shepherd 网关配置
```

Update `HEAD_SHA` = `git rev-parse HEAD`.

## Stage 7: Shepherd 网关配置（可跳过）

**跳过条件（满足任一则跳过）：**
- `pipeline_options.skip_shepherd == true`
- 技术方案中无「变更类型 = 新增」的接口 → 记录 `auto-skipped-no-new-api`
- 仓库中无 Thrift Service 文件 → 记录 `auto-skipped-no-thrift`

Invoke the **runway-shepherd** skill with:
- HEAD_SHA from Stage 6（确保在最新代码上解析 Thrift）
- shepherd_group_url（project.json）

The skill handles: 定位 Thrift Service 文件 → 解析方法签名 → 批量创建网关配置（已存在自动跳过）。同时写入 `.runway-team/api-changelog/` 变更记录。

After completion:
```bash
# Stage 7 完成后立即 git push
git push origin {branch_name}
```

Update checkpoint: `checkpoint-write --shepherd-config-status "{status}"`.

Print:
```
✅ Stage 7 完成 — Shepherd 网关配置
- 状态：{shepherd_config_status}
- 已执行 git push origin {branch_name}
- 进入 Stage 8：QA 验证
```

## Stage 8: QA Verify

**qa_mode 判断：**

```bash
QA_MODE=$(jq -r '.qa_mode // "full"' .runway/checkpoint-*.json 2>/dev/null | head -1)
```

- `qa_mode == "build_lint_only"`（前端模式）：传入 `--build --lint`，跳过 test 和 typecheck
- 其他（默认后端模式）：传入 `--all`

Invoke the **runway-qa-verify** skill with:
- target: `--build --lint`（qa_mode=build_lint_only 时）或 `--all`（默认）

The skill handles: build/lint/test/typecheck loop → architect diagnosis → executor fix → evidence summary. Escalates to user only if same failure repeats 3 times or 5 rounds are exhausted.

After completion, print:
```
✅ Stage 8 完成 — QA 验证
- 构建/lint/单测：全部通过
- 进入 Stage 9：自动部署
```

## Stage 9: 自动部署（可跳过）

**跳过条件：** `pipeline_options.skip_deploy == true` → 记录 `cargo_stack_uuid: skipped`，Stage 10 自动跳过。

Read `role` from checkpoint:
- `role=frontend` → invoke **ee-talos**，完成后跳到 Stage 12
- `role=backend`（默认）→ invoke **ee-cargo**，完成后进 Stage 10

See `references/stage-9-deploy.md` for full deploy logic, cargo_release_name resolution, URL construction, and checkpoint writes.


## Stage 10: 接口自动测试（可跳过）

**跳过条件（满足任一则跳过）：**
- `pipeline_options.skip_autotest == true`
- `tclist_content_id` 为 `skipped`（Step 2c 已跳过）
- `cargo_stack_uuid` 为 `skipped`（Stage 9 已跳过）
- `cargo_test_url` 为空（`test_base_domain` 未配置）

Invoke the **runway-autotest** skill with:
- tclist_content_id（checkpoint）
- test_data_km_url（project.json）
- cargo_test_url（checkpoint）
- MIS

首轮执行全量用例。测试报告写入学城（parentId = tclist_content_id，标题含日期）。

After completion, update checkpoint:
```bash
node "$RUNWAY_TOOLS" checkpoint-write \
  --root "$PROJECT_ROOT" --ones-id "{ones_work_item_id}" \
  --test-report-content-id "{id}" \
  --test-failed-count "{count}" \
  --test-failed-ids '{json}' \
  --updated-at "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
```

**若 test_failed_count == 0：** 直接进入 Stage 12。
**若 test_failed_count > 0：** 进入 Stage 11（runway-bug-analysis）做失败分类分析。
- 分析结果含「服务 Bug」→ 进入 FIX LOOP（最多 3 轮）
- 分析结果全为「测试数据缺口」或「待确认」→ 暂停，提示用户，不消耗修复轮次

## FIX LOOP（主编排器直接编排，最多 3 轮）

在主编排器中直接执行，不新建独立 skill。每步完成后更新 `fix_loop_status` 到 checkpoint。

See `references/fix-loop.md` for trigger conditions, Stage 11 → F1 → F2 → F3 → F4 full spec, and all exit conditions.

## Stage 12: Retrospective

Auto-run after FIX LOOP exits normally or Stage 10 returns test_failed_count == 0.

Update checkpoint: `fix_loop_status = complete`

- If `skip_retrospective == true`: skip Steps 12a–12d, proceed to Completion.
- If `team_mode == true` and `leader_name` is set: send SendMessage to leader (see `references/fullstack-handoff.md`), then proceed to Completion.
- Otherwise: run Steps 12a–12d (extract learnings → update project-knowledge.md → clean tmp files → asset checklist).

See `references/retrospective-detail.md` for full Step 12a–12d execution details.

## Completion

Update ONES status, print Development Complete summary, clean up, output pipeline completion signal.

See `references/completion.md` for ONES command, summary format (lite vs standard artifact links), cleanup steps, and the `<promise>RUNWAY STAGES 3-12 COMPLETE</promise>` output rule.

## Resuming a Paused Workflow

If the user returns after a Hard Gate pause at Stage 1 or Stage 2 and says "continue", "approved", "confirmed", "ok go ahead", or similar — resume from the current stage only if upstream artifacts are still valid.

If an upstream artifact changed while paused, resume from the earliest invalidated stage instead.

If the user wants to modify the requirements spec or tech spec after a Hard Gate, re-invoke the relevant skill to make changes, mark downstream artifacts invalid, then continue forward. If the user wants to revise the plan, re-run Stage 3, overwrite `plan_path`, invalidate downstream artifacts, and continue from Stage 4.

## Error Handling

See `references/troubleshooting.md` for the full error handling table (citadel/ones failures, BLOCKED stages, stale state) and per-stage troubleshooting guides.

## Additional Resources

- **`references/stage-init.md`** — Step 0 完整初始化规范（CLI flags、project.json、checkpoint restore、pipeline options）
- **`references/stage-0.5.md`** — Stage 0.5 接口设计执行规范（lite 模式）
- **`references/stage-9-deploy.md`** — Stage 9 前后端部署分支完整规范
- **`references/completion.md`** — Completion 摘要格式与收尾步骤
- **`references/fix-loop.md`** — FIX LOOP 完整规范（三分类约束、退出条件、F1-F4）
- **`references/retrospective-detail.md`** — Stage 12 Step 12a-12d 完整规范
- **`references/troubleshooting.md`** — Error handling table + per-stage troubleshooting
- **`references/stage-handoff.md`** — Workflow state anchor and resume rules
- **`references/state-management.md`** — checkpoint-write 参数、pipeline state、knowledge-append 命令
- **`references/branch-creation.md`** — ones bg/ba/space-apps 完整流程
- **`references/project-setup.md`** — project-memory-init、.gitignore、knowledge.json 加载
- **`references/context-injection.md`** — PROJECT_NOTES 加载与注入
- **`references/cleanup.md`** — 完成后清理命令序列
- **`references/pipeline-options.md`** — 流水线选项配置规则 + 跳过依赖关系
- **`references/fullstack-handoff.md`** — Fullstack teammate 汇合消息格式
- **`references/artifact-layout.md`** — 产物四层分类说明 + .gitignore 配置
