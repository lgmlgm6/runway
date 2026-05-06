# Pipeline Activation — Stop Hook 续命机制

## 概述

Stage 4 完成后，激活 `pipeline.local.md` 让 Stop hook 接管 Stage 5-7 的循环，防止会话中断丢失进度。

## 创建 pipeline state 文件

```bash
RUNWAY_TOOLS="${CLAUDE_PLUGIN_ROOT:+${CLAUDE_PLUGIN_ROOT}/skills/runway/bin/runway-tools.cjs}"
RUNWAY_TOOLS="${RUNWAY_TOOLS:-$HOME/.claude/skills/runway/bin/runway-tools.cjs}"
mkdir -p .runway/tmp
cat > .runway/tmp/pipeline-stage4-prompt.md << 'EOF'
你是 Runway 编排器，Stage 4-7 流水线正在运行中。立即从当前阶段继续，不要等待用户确认。

检查当前状态并继续：
- Stage 5（runway-parallel-dev）未完成 → 立即调用
- Stage 5 完成但 Stage 6（runway-code-review-fix）未完成 → 立即调用
- Stage 6 完成但 Stage 7（runway-qa-verify）未完成 → 立即调用
- Stage 7 完成且全部通过 → 执行 Stage 8 Retrospective → 打印 Development Complete 摘要，更新 ONES 状态，然后输出：<promise>RUNWAY STAGES 5-7 COMPLETE</promise>

**暂停规则（遇到以下情况必须先停用 pipeline state 再暂停）：**
- Stage 5/6/7 出现真正 blocker（无法自动解决）
- 需要用户提供 appId / 登录 / 人工决策
- 用户明确说 stop / cancel

停用命令：`node "$RUNWAY_TOOLS" state-update --root "$PWD" --name pipeline.local.md --active false`

不要等待用户输入。不要总结后询问"是否继续"。直接进入下一个待执行阶段。
EOF
node "$RUNWAY_TOOLS" state-init \
  --root "$PWD" \
  --name pipeline.local.md \
  --mode pipeline \
  --max-iterations 200 \
  --completion-promise "RUNWAY STAGES 5-7 COMPLETE" \
  --session-id "${CLAUDE_SESSION_ID:-$(date +%s%N)}" \
  --started-at "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  --prompt-file .runway/tmp/pipeline-stage4-prompt.md
```

## 激活后立即进入 Stage 5

执行 `state-init` 后，**不等待用户输入，直接进入 Stage 5**。

## 暂停规则

Stop hook 必须先停用 pipeline state，再暂停等待用户：
```bash
node "$RUNWAY_TOOLS" state-update --root "$PWD" --name pipeline.local.md --active false
```

用户解决 blocker 后，重新激活：
```bash
node "$RUNWAY_TOOLS" state-update --root "$PWD" --name pipeline.local.md --active true
```
