# FIX LOOP — 自动修复循环完整规范

FIX LOOP 在主编排器（runway/SKILL.md）中直接编排执行，不新建独立 skill。每步完成后立即更新 `fix_loop_status` 到 checkpoint，供会话中断后续命时精确恢复。

## 循环触发条件

```
存在 Bug 性质 = 「服务 Bug」的未修复用例
AND fix_round < 3
AND（fix_round == 0 OR 上一轮 test_failed_ids 集合有缩小）
```

注意：`test_failed_count > 0` **不是**循环触发条件。失败用例全为「测试数据缺口」或「待确认」时立即停止，不消耗修复轮次。

---

## Stage 11 — 测试失败分析（约束版）

### 三分类约束（强制）

报告面向 F1 代码修复机器消费，只输出以下三类，其余一律不写：

| Bug 性质 | 定义 | 进入路径 |
|---------|------|---------|
| 服务 Bug | 有 TraceId 调用链证据，明确定位到出错的类/方法/逻辑 | → F1 代码修复 |
| 测试数据缺口 | 占位符无对应值，或测试前置数据不存在/已过期 | → 立即暂停，提示用户更新 test_data_km_url |
| 待确认 | MTrace 无数据或调用链不完整，无法判断根因 | → 记录跳过，不进入修复 |

### 禁止输出（强制）

- 没有 TraceId 证据支撑的推断
- 代码质量建议（命名 / 日志 / 注释 / 代码风格）
- 与本次失败无直接因果关系的发现
- 含「建议」「可以考虑」「最好」等措辞的软性建议

### 轮次 diff 防编造

`fix_round > 0` 时，Stage 11 输出前**必须先与上一轮分析做 diff**：
- 本轮「服务 Bug」列表与上一轮完全相同（同一 TC 编号 + 同一根因）→ 输出「无新发现，已知问题未收敛」，直接进入循环退出判断
- AI 换角度重述同一个 bug → 视为重复，不算新发现
- 只有新增的 TC 编号或新增的根因定位才算「新发现」

### 分支判断（Stage 11 完成后立即执行）

```
若所有失败用例的 Bug 性质均为「测试数据缺口」或「待确认」：
  → 数据退出，立即暂停，展示清单，提示用户处理后手动重跑

若发现接口设计有根本性错误，或业务逻辑在需求阶段理解错误：
  → 需求退出，标记「需求级别问题」，退出 FIX LOOP，暂停流水线等待用户判断

若存在至少一个「服务 Bug」：
  → 进入 F1 代码修复
```

---

## F1 — 代码修复

仅处理 Bug 性质为「服务 Bug」的条目：

```bash
# 按修复建议定位类/方法，修复代码后
git add {files}
git commit -m "fix(round-{fix_round}): {summary}"
```

---

## F2 — 轻量 diff review + Regression check

**两步顺序执行，缺一不可。**

### Step 1：diff review（LLM 判断）

仅 review 本次修复的 diff，防止引入新问题：
- Critical → 立即修复
- Minor → 记录不阻断

### Step 2：regression check（deterministic，不依赖 LLM）

对上一轮所有已通过的用例重跑：
```
已通过用例 = 全量用例 - 上一轮 test_failed_ids
```

若有原来通过的用例开始失败 → **立即中断本轮，回滚本次 commit，输出 Regression 退出，等待人工介入**：
```bash
git revert HEAD --no-edit
```

---

## F3 — 重新部署

检查 role 字段，选择对应部署方式：

```bash
ROLE=$(jq -r '.role // "backend"' .runway/checkpoint-*.json 2>/dev/null | head -1)
```

### role=backend（默认）— 复用已有泳道（cargo_stack_uuid），不新建

```bash
git push origin {branch_name}
cargo-cli stack deploy \
  --uuid {cargo_stack_uuid} \
  --services '[{"appkey":"{cargo_appkey}","release":"{cargo_release_name}","branch":"{branch_name}"}]'
# 等待泳道重新 running（轮询 30s 间隔，最多 10 分钟）
```

### role=frontend — 重新触发 Talos 发布（无需重建任何资源）

```bash
git push origin {branch_name}
```

然后调用 **ee-talos** skill：重新执行 `talos flow publish`（skill 内部自动查询 app/template）。

发布成功后覆盖写入 checkpoint 的 `talos_flow_id`（新的 flow_id）。

**注意：** 前端 FIX LOOP 通常不触发（skip_autotest=true，Stage 10 跳过），但若用户手动触发修复流程，F3 按此分支执行。

---

## F4 — 重新测试（仅失败用例）

Invoke **runway-autotest** with `test_failed_ids`（仅执行上一轮失败的 TC，不跑全量）。

F4 完成后**立即覆盖写入** checkpoint（Stage 11 下轮始终读最新值）：
```bash
node "$RUNWAY_TOOLS" checkpoint-write \
  --root "$PROJECT_ROOT" --ones-id "{ones_work_item_id}" \
  --test-report-content-id "{new_id}" \
  --test-failed-count "{new_count}" \
  --test-failed-ids '{new_json}' \
  --fix-round "{fix_round + 1}" \
  --fix-loop-status "stage11" \
  --updated-at "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
```

---

## 循环退出条件（全部 deterministic，不依赖 LLM）

| 退出类型 | 判断条件 | 动作 |
|---------|---------|------|
| 正常退出 | `test_failed_count == 0` | 进入 Stage 12 |
| 停滞退出 | `test_failed_ids` 与上一轮完全相同 | 暂停，展示清单，等待用户 |
| 耗尽退出 | `fix_round ≥ 3` 且仍有服务 Bug | 暂停，展示清单，等待用户 |
| 数据退出 | 所有失败均为「测试数据缺口」或「待确认」 | 立即暂停，提示补充测试数据 |
| Regression | F2 Step 2 检测到已通过用例失败 | 回滚 commit，等待人工介入 |
| 需求退出 | Stage 11 发现设计/需求层根本性错误 | 标记「需求级别问题」，暂停流水线 |

退出时展示分类清单（服务 Bug 剩余 N 条 / 数据缺口 M 条 / 待确认 K 条）+ 学城分析报告链接。

---

## fix_loop_status 合法值

| 值 | 含义 | 续命时恢复位置 |
|----|------|-------------|
| `idle` | 未触发 | — |
| `stage11` | 正在执行/即将执行 Stage 11 | 从 Stage 11 开始 |
| `f1` | 正在执行/即将执行 F1 代码修复 | 从 F1 开始 |
| `f2` | 正在执行/即将执行 F2 review+check | 从 F2 开始 |
| `f3` | 正在执行/即将执行 F3 重新部署 | 从 F3 开始 |
| `f4` | 正在执行/即将执行 F4 重新测试 | 从 F4 开始 |
| `exhausted` | 循环耗尽，等待用户 | 展示状态，等待用户 |
| `complete` | 正常完成（test_failed_count=0） | 进入 Stage 12 |
