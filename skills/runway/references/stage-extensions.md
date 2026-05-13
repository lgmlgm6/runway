# Stage Extensions — 新增阶段输入输出契约

## Step 2 → Stage 2 扩展输入

Stage 2（runway-tech-design）新增以下传入参数，用于 Step 4.5 接口 PATH 完整化：

| 参数 | 来源 | 用途 |
|------|------|------|
| `papi_base_url` | project.json | 新增接口 PATH 前缀（如 `/api/freelance`） |
| `papi_token` | project.json | 存量接口查询，调用 `project.slim` |
| `papi_project_id` | project.json | PAPI 项目 ID |

缺失时：存量接口 PATH 查询跳过，仅执行新增接口 PATH 生成。

---

## Step 2b — PAPI 正式同步（与 Step 2c 并行，Stage 2 Hard Gate 通过后立即执行）

| | 字段 | 来源 |
|--|------|------|
| 输入 | tech_spec_contentId（含完整 PATH） | checkpoint ← Stage 2 |
| 输入 | MIS | checkpoint / project memory |
| 输入 | papi_token | project.json |
| 输入 | papi_project_id | project.json |
| 输入 | papi_base_url | project.json（可为空） |
| 输出 | papi_sync_status | checkpoint |
| 输出 | papi_synced_apis | checkpoint |
| 输出 | api-changelog entry | `.runway-team/api-changelog/{date}-{feature}.md` |

---

## Step 2c — 测试用例生成（与 Step 2b 并行，Stage 2 Hard Gate 通过后立即执行）

| | 字段 | 来源 |
|--|------|------|
| 输入 | requirements_spec_contentId | checkpoint ← Stage 1 |
| 输入 | tech_spec_contentId | checkpoint ← Stage 2 |
| 输入 | citadel_parent_id | checkpoint ← Stage 1（不询问用户） |
| 输入 | test_data_km_url | project.json（生成前先读取，复用已有占位符 key） |
| 输入 | MIS | checkpoint |
| 输出 | tclist_content_id | checkpoint → Stage 10 / F4 |

**citadel_parent_id 传递说明：** Stage 1 写入 checkpoint，Step 2c 从 checkpoint 独立读取，无需主编排器二次传递。

---

## Stage 7 — Shepherd 网关配置

| | 字段 | 来源 |
|--|------|------|
| 输入 | HEAD_SHA | checkpoint ← Stage 6（确保在最新代码上解析） |
| 输入 | shepherd_group_url | project.json |
| 输出 | shepherd_config_status | checkpoint |
| 输出 | api-changelog entry | `.runway-team/api-changelog/{date}-{feature}.md` |

**自动跳过状态值：**
- `auto-skipped-no-new-api` — 本次无新增接口
- `auto-skipped-no-thrift` — 非 Thrift 项目

---

## Stage 9 — 自动部署

| | 字段 | 来源 |
|--|------|------|
| 输入 | branch_name（已 push） | checkpoint |
| 输入 | cargo_appkey | project.json |
| 输入 | cargo_release_name | project.json（编排器在 Stage 9 前确保已有值，首次通过 get-releases 查询后写入） |
| 输入 | test_base_domain | project.json（选填，空则 Stage 10 跳过） |
| 输出 | cargo_stack_uuid | checkpoint → F3 |
| 输出 | cargo_swimlane | checkpoint |
| 输出 | cargo_test_url | checkpoint → Stage 10（格式：https://{cargo_swimlane}-sl-{test_base_domain}） |

**cargo_test_url 生成规则：**
- `test_base_domain` 非空 → `https://{cargo_swimlane}-sl-{test_base_domain}`
- `test_base_domain` 为空 → `cargo_test_url` 写入空字符串，Stage 10 自动跳过

---

## Stage 10 — 接口自动测试

| | 字段 | 来源 |
|--|------|------|
| 输入 | tclist_content_id | checkpoint ← Step 2c |
| 输入 | test_data_km_url | project.json |
| 输入 | cargo_test_url | checkpoint ← Stage 9（替代旧的 cargo_base_url） |
| 输入 | MIS | checkpoint |
| 输出 | test_report_content_id | checkpoint（每轮覆盖写入） |
| 输出 | test_failed_count | checkpoint |
| 输出 | test_failed_ids | checkpoint |

---

## Stage 11 — 测试失败分析

| | 字段 | 来源 |
|--|------|------|
| 输入 | test_report_content_id | checkpoint（每轮读最新值） |
| 输入 | MIS | checkpoint |
| 输入 | fix_round | checkpoint |
| 输入 | bug_analysis_content_id | checkpoint（首轮为空，后续轮追加） |
| 输出 | bug_analysis_content_id | checkpoint（首轮新建，后续追加更新） |
| 输出 | bugs（结构化列表） | → FIX LOOP F1 |

**学城文档写入规则：**
- 首轮（bug_analysis_content_id 不存在）：新建文档，parentId = `tclist_content_id`，标题 = `{功能名} - 失败用例分析`
- 后续轮：追加更新同一文档，末尾增加 `## Round {N}（{时间戳}）` 章节

---

## Stage 9 — 前端部署（role=frontend）

| | 字段 | 来源 |
|--|------|------|
| 输入 | branch_name | checkpoint ← Stage 4 |
| 输入 | frontend_base_url | project.json（页面固定域名，ee-talos 不返回 URL） |
| 内部 | talos_app_id / talos_template_id / talos_platform | ee-talos skill 内部自动查询，无需预配置 |
| 输出 | talos_flow_id | checkpoint（覆盖写，F3 重新发布后更新） |
| 输出 | frontend_url | checkpoint（从 project.json frontend_base_url 读取写入） |

**project.json 前端专属字段：**

| 字段 | 说明 |
|------|------|
| `frontend_base_url` | 页面访问固定域名，如 `https://m.test.meituan.com/freelance`。Talos 发布成功后不返回域名（WebStatic 静态托管），URL 只能从此字段读取。 |

**跳过条件：** `pipeline_options.skip_deploy == true` → 跳过，记录 `talos_flow_id: skipped`，Stage 10/11 自动跳过（前端本就跳过 10/11）。
