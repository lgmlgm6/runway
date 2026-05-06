# Cleanup — 完成后清理命令

## 触发时机

Stage 7 通过、Development Complete 摘要已打印、ONES 状态已更新后执行。

## 清理命令

```bash
rm -f .claude/runway-state/pipeline.local.md
rm -f .claude/runway-state/triangle-loop.local.md
rm -f .runway/checkpoint-{ones_work_item_id}.json
rm -rf .runway/tmp/
rm -f "{plan_path}"
```

## 完成信号

清理完成后输出 Stop hook 检测信号：

```
<promise>RUNWAY STAGES 5-7 COMPLETE</promise>
```

**仅在以下条件全部满足后才输出此行：**
1. `runway-qa-verify` 产出通过证据
2. ONES 状态已更新为"测试中"
3. Development Complete 摘要已打印

不得提前输出，不得用于逃脱循环。
