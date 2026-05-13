# Stage Handoff Reference

## Workflow state anchor

Use the canonical checkpoint as the cross-stage source of truth:

```text
.runway/checkpoint-{ones_work_item_id}.json
```

Use loop-state files only for active ownership / resume mechanics:

```text
.claude/runway-state/triangle-loop.local.md
.claude/runway-state/pipeline.local.md
```

- `triangle-loop.local.md` records Stage 2 design-loop ownership so Runway can resume cleanly after an interruption; it should not block user exit.
- `pipeline.local.md` records the Stage 5-12 auto-running pipeline loop; the Stop hook protects this loop from accidental exit.

At each handoff, update the checkpoint with:
- current stage;
- confirmed artifact IDs / paths;
- branch / SHA fields if they changed.

Artifact invalidation is computed by `runway-tools artifacts-invalidate --artifact <name>`, which reads the manifest's invalidation map and returns `resume_from_stage`.

---

## Checkpoint 字段清单

| 字段 | 类型 | 写入阶段 | 消费阶段 |
|------|------|---------|---------|
| `ones_work_item_id` | string | Step 0 | 全流程 |
| `citadel_parent_id` | string | Stage 1 | Stage 2, 3c |
| `prd_content_id` | string | Stage 1 | — |
| `requirements_spec_content_id` | string | Stage 1 | Stage 2, Step 2c |
| `tech_spec_content_id` | string | Stage 2 | Step 2b/2c |
| `spec_context_path` | string | Stage 2 后编排器生成（standard/fullstack）；Stage 0.5 Step 4（lite） | Stage 3 runway-task-planning |
| `mini_spec_path` | string | Stage 0.5（lite 模式） | Step 2b/2c（lite 模式）, Stage 12 Completion 摘要 |
| `pipeline_mode` | string | Step 0-pre（--lite/--fullstack） | Step 2b/2c 输入分支，Stage 12 Completion 摘要 |
| `pipeline_options` | JSON object | Step 0d | Step 2b/2c/Stage 7/9/10 |
| `plan_path` | string | Stage 3 | Stage 5 |
| `papi_sync_status` | string | Step 2b | Stage 12 摘要 |
| `papi_synced_apis` | string[] | Step 2b | Stage 12 摘要 |
| `tclist_content_id` | string | Step 2c | Stage 6（业务规则注入）, Stage 10, Stage 11, F4 |
| `branch_name` | string | Stage 4 | Stage 5/6/7/9/F3 |
| `base_sha` | string | Stage 4 | Stage 5/6 |
| `head_sha` | string | Stage 5/6 | Stage 7/git push |
| `shepherd_config_status` | string | Stage 7 | Stage 12 摘要 |
| `cargo_stack_uuid` | string | Stage 9 | F3 |
| `cargo_swimlane` | string | Stage 9 | — |
| `cargo_test_url` | string | Stage 9 | Stage 10, F4 |
| `test_report_content_id` | string | Stage 10 / F4 | Stage 11 |
| `test_failed_count` | number | Stage 10 / F4 | FIX LOOP 判断 |
| `test_failed_ids` | string[] | Stage 10 / F4 | F4 |
| `bug_analysis_content_id` | string | Stage 11 | F1, Stage 12 摘要 |
| `fix_round` | number | F4 | FIX LOOP 判断 |
| `fix_loop_status` | string | 每步 | 续命时精确恢复 |
| `current_stage` | number | 每阶段边界 | 续命恢复 |
| `updated_at` | ISO string | 每次 checkpoint-write | — |
| `role` | string | Step 0-pre（--frontend-mode） | Stage 3/5/6/8/9/12 sub-skill 加载 roles 文件 |
| `qa_mode` | string | Step 0-pre（--frontend-mode） | Stage 8 runway-qa-verify 参数选择 |
| `skip_retrospective` | boolean | Step 0-pre（--frontend-mode） | Stage 12 入口判断 |
| `team_mode` | boolean | Step 0-pre（由 leader 注入） | Stage 12 Completion 后是否 SendMessage |
| `leader_name` | string | Step 0-pre（由 leader 注入） | SendMessage 目标名 |
| `talos_flow_id` | string | Stage 9（role=frontend，ee-talos 写入） | F3 前端重新发布（覆盖写） |
| `frontend_url` | string | Stage 9（role=frontend，从 project.json frontend_base_url 读取） | Stage 12 Completion 摘要 |

---

## Stage 2 → Step 2b/2c（并行）+ Stage 3

**standard/fullstack 模式：**

| Item | Source | Used by |
|------|--------|---------|
| `tech_spec_content_id` | citadel createDocument return value | runway-papi（Step 2b）, runway-tclist（Step 2c） |
| `三、接口协议变更`（含完整 PATH） | tech spec（Step 4.5 完整化后） | runway-papi（Step 2b），runway-tclist（Step 2c） |
| `citadel_parent_id` | checkpoint ← Stage 1 | runway-tclist parentId（Step 2c） |
| `spec_context_path` | 编排器在 Stage 2 Hard Gate 后生成，三章节格式 | runway-task-planning（Stage 3） |

**lite 模式（Stage 0.5 替代 Stage 1+2）：**

| Item | Source | Used by |
|------|--------|---------|
| `mini_spec_path` | Stage 0.5 Step 4 | runway-papi（Step 2b），runway-tclist（Step 2c） |
| `spec_context_path` | Stage 0.5 Step 4，需求原文 + mini-spec | runway-task-planning（Stage 3） |

Handoff check (standard/fullstack only): the user explicitly approved the tech spec, and Step 4.5 interface PATH completeness check passed (no「PATH 待补充」). Lite mode has no Hard Gate — Stage 0.5 self-check (6 rules) is the only gate.

---

## Step 2c → Stage 10/11

| Item | Source | Used by |
|------|--------|---------|
| `tclist_content_id` | Step 2c citadel createDocument | Stage 6（业务规则注入）, Stage 10（parentId for report）, Stage 11（parentId for analysis, 首轮） |

---

## Stage 9 → Stage 10/F3/F4

| Item | Source | Used by |
|------|--------|---------|
| `cargo_stack_uuid` | ee-cargo stack create/search | F3 重新部署 |
| `cargo_test_url` | https://{cargo_swimlane}-sl-{test_base_domain} | Stage 10, F4 |

---

## Stage 10/F4 → Stage 11

| Item | Source | Used by |
|------|--------|---------|
| `test_report_content_id` | runway-autotest citadel createDocument | Stage 11（每轮读最新值）|
| `test_failed_ids` | runway-autotest 执行结果 | F4（重新测试范围）|

---

## FIX LOOP 状态传递

`fix_loop_status` 精确记录当前步骤，供会话中断后续命精确恢复：

| 值 | 恢复位置 |
|----|---------|
| `stage11` | 从 Stage 11 开始 |
| `f1` | 从 F1 代码修复开始 |
| `f2` | 从 F2 diff review + regression check 开始 |
| `f3` | 从 F3 重新部署开始 |
| `f4` | 从 F4 重新测试开始 |
| `exhausted` | 展示状态，等待用户 |
| `complete` | 进入 Stage 12 |

---

## Stage 失效传播规则

upstream artifact 变更时，downstream stages 需重跑：

| 变更的 artifact | 需重跑的最早阶段 |
|----------------|----------------|
| requirements_spec_content_id（需求规格变更） | Stage 2 |
| tech_spec_content_id（技术方案变更） | Step 2b/2c + Stage 3 |
| plan_path（任务规划变更） | Stage 5 |
| branch_name / base_sha（分支变更） | Stage 5 |
| tclist_content_id（用例文档变更） | Stage 10 |
| 代码修改（F1 commit）| F3（重新部署）|

---

## Resume rule

When the user says "continue" after a pause:
1. Read the checkpoint file.
2. Check `current_stage` and `fix_loop_status` to determine exact resume position.
3. Run `artifacts-invalidate` if an upstream artifact may have changed.
4. Resume from `current_stage` (and `fix_loop_status` for FIX LOOP) only if downstream artifacts are still valid; otherwise resume from `resume_from_stage`.
