# Completion — Development Complete 格式规范

## 触发时机

Stage 12 Retrospective 完成后执行。

## 步骤

1. Update ONES work item status to "测试中":

```bash
ones wu -i {ones_work_item_id} -F '{"variable":"state","name":"状态","type":"component_state","multiple":false,"fieldValue":"测试中"}'
```

2. Read `pipeline_mode` and `mini_spec_path` from checkpoint:

```bash
PIPELINE_MODE=$(jq -r '.pipeline_mode // "standard"' .runway/checkpoint-*.json 2>/dev/null | head -1)
MINI_SPEC_PATH=$(jq -r '.mini_spec_path // empty' .runway/checkpoint-*.json 2>/dev/null | head -1)
```

3. Print Development Complete summary:

```
## ✅ Development Complete

**Feature:** {feature name}
**Branch:** {branch name}
**Ones work item:** {id} → status updated to "测试中"

**Artifacts:**
{if pipeline_mode == "lite"}
- Interface spec: {mini_spec_path}
{else}
- Requirements spec: https://km.sankuai.com/collabpage/{requirements_spec_contentId}
- Tech spec: https://km.sankuai.com/collabpage/{tech_spec_contentId}
{endif}
- Implementation plan: {path}
- Test cases: https://km.sankuai.com/collabpage/{tclist_content_id}
- Test report: https://km.sankuai.com/collabpage/{test_report_content_id}

**Next steps:**
- Create PR / submit for review
```

4. 清理 pipeline 状态、临时文件和 checkpoint 文件。（命令详见 `references/cleanup.md`）

5. 输出流水线完成信号：

```
<promise>RUNWAY STAGES 3-12 COMPLETE</promise>
```

**仅在 Stage 12 Retrospective 完成、ONES 状态已更新、Development Complete 摘要已打印后才输出此行。不得提前输出或用于逃脱循环。**
