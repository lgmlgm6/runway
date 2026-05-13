---
name: runway-agentteam
description: 创建团队并用 mc --code 在 tmux 中启动团队成员。当用户提到"创建团队"、"启动团队"、"开团队"、"team spawn"、"开 teams"时激活。
version: 0.1.0
---

# Team Spawn — 创建并启动团队成员

使用 `mc --code` 在 tmux 中启动团队成员，禁止使用内置 Agent 工具。

## 前置要求

无需手动进入 tmux。skill 会自动检测环境并选择最佳方式展示团队窗口：
- **已在 tmux 中**：成员以 split pane 出现在同一屏幕
- **未在 tmux 中**：自动创建 detached tmux session，并用 AppleScript 在 iTerm2 新 tab 里打开，用户有感知

## 核心规则

1. **必须用 `mc --code`**，不得调用内置 Agent 工具 spawn 成员
2. **不指定 `--model`**
3. **不指定 `ANTHROPIC_BASE_URL`**
4. 启动命令前缀：`env CLAUDECODE=1 CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1 mc --code`

## Step 1: 收集团队信息

如果用户已在调用时提供了成员信息，跳过询问。否则用 AskUserQuestion 收集：
- 团队名称（默认 `project-team`）
- 成员列表：名称、颜色（blue/green/yellow/red/magenta/cyan）、职责

### 解析项目目录

当用户说"一个负责XXX项目的YYY角色"时，XXX 是项目名称，需要解析为项目目录路径：
1. 在当前工作目录下查找名为 XXX 的目录
2. 如果找到，该成员的启动命令需要先 `cd` 到该目录再启动 `mc --code`
3. 如果找不到，询问用户确认项目目录路径

## Step 2: 检测 tmux 环境

```bash
echo $TMUX
```

## Step 3: 获取 parent session ID

`$CLAUDE_SESSION_ID` 环境变量不可用，**不要**用 `echo $CLAUDE_SESSION_ID`。

从 session 文件中提取。优先通过所有进程 PID 映射查找，找不到时回退到最新文件：
```bash
# 方法一：遍历所有进程找到有对应 session 文件的 PID
CLAUDE_PID=$(ps -eo pid | while read p; do [ -f "$HOME/.claude/sessions/$p.json" ] && echo $p; done | head -1)

if [ -n "$CLAUDE_PID" ]; then
  SESSION_ID=$(python3 -c "import json; print(json.load(open('$HOME/.claude/sessions/$CLAUDE_PID.json'))['sessionId'])")
else
  # 方法二：回退到最新 session 文件（单窗口场景可靠）
  SESSION_FILE=$(ls -t ~/.claude/sessions/*.json 2>/dev/null | head -1)
  SESSION_ID=$(python3 -c "import json; print(json.load(open('$SESSION_FILE'))['sessionId'])")
fi

echo $SESSION_ID
```

session 文件路径：`~/.claude/sessions/<PID>.json`，内含 `sessionId` 字段。

## Step 4: 创建团队

调用 TeamCreate 工具。

## Step 5: 启动成员

### 情况 A：已在 tmux 中（$TMUX 非空）

在当前窗口创建 split pane：

第一个成员（水平分割）：
```bash
# 无项目目录时：
tmux split-window -h -d "env CLAUDECODE=1 CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1 mc --code --agent-id <name>@<team> --agent-name <name> --team-name <team> --agent-color <color> --parent-session-id <session-id> --permission-mode acceptEdits"

# 有项目目录时（先 cd 再启动）：
tmux split-window -h -d "cd <project-dir> && env CLAUDECODE=1 CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1 mc --code --agent-id <name>@<team> --agent-name <name> --team-name <team> --agent-color <color> --parent-session-id <session-id> --permission-mode acceptEdits"
```

后续成员（在右侧垂直分割）：
```bash
# 无项目目录时：
tmux split-window -v -d -t '{right}' "env CLAUDECODE=1 CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1 mc --code --agent-id <name>@<team> --agent-name <name> --team-name <team> --agent-color <color> --parent-session-id <session-id> --permission-mode acceptEdits"

# 有项目目录时（先 cd 再启动）：
tmux split-window -v -d -t '{right}' "cd <project-dir> && env CLAUDECODE=1 CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1 mc --code --agent-id <name>@<team> --agent-name <name> --team-name <team> --agent-color <color> --parent-session-id <session-id> --permission-mode acceptEdits"
```

### 情况 B：不在 tmux 中（$TMUX 为空）

先创建 detached tmux session，再在其中启动成员：

```bash
tmux new-session -d -s <team-name> -x 200 -y 50
```

第一个成员（send-keys 到初始窗口）：
```bash
# 无项目目录时：
tmux send-keys -t <team-name> "env CLAUDECODE=1 CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1 mc --code --agent-id <name>@<team> --agent-name <name> --team-name <team> --agent-color <color> --parent-session-id <session-id> --permission-mode acceptEdits" Enter

# 有项目目录时：
tmux send-keys -t <team-name> "cd <project-dir> && env CLAUDECODE=1 CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1 mc --code --agent-id <name>@<team> --agent-name <name> --team-name <team> --agent-color <color> --parent-session-id <session-id> --permission-mode acceptEdits" Enter
```

后续成员（split pane，用 `<team-name>:0` 精确定位避免多 window 时分割错位置）：
```bash
# 无项目目录时：
tmux split-window -t <team-name>:0 -h -d "env CLAUDECODE=1 CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1 mc --code --agent-id <name>@<team> --agent-name <name> --team-name <team> --agent-color <color> --parent-session-id <session-id> --permission-mode acceptEdits"

# 有项目目录时：
tmux split-window -t <team-name>:0 -h -d "cd <project-dir> && env CLAUDECODE=1 CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1 mc --code --agent-id <name>@<team> --agent-name <name> --team-name <team> --agent-color <color> --parent-session-id <session-id> --permission-mode acceptEdits"
```

启动后**根据当前终端自动选择最佳方式打开成员窗口**：

```bash
CURRENT_TERM="${TERM_PROGRAM:-}"

if [ "$CURRENT_TERM" = "iTerm.app" ]; then
  # iTerm2：用 Cmd+D 在当前窗口水平分割新 pane，再输入 attach 命令
  osascript <<'EOF'
tell application "iTerm2"
  activate
  tell current window
    set newSession to (split horizontally with default profile of current session)
    delay 0.5
    tell newSession
      write text "tmux attach -t <team-name>"
    end tell
  end tell
end tell
EOF
else
  # 其他终端（Warp、系统 Terminal、VS Code 等）：打印提示
  echo ""
  echo "✅ 团队 <team-name> 已在后台启动。"
  echo "👀 运行以下命令查看所有成员实时状态："
  echo "   tmux attach -t <team-name>"
  echo "（按 Ctrl+B D 可退出 tmux 回到当前窗口）"
fi
```

AppleScript 失败时自动降级到打印提示，不影响团队运行。

## Step 6: 验证并发送初始指令

1. 等待 15-20 秒让成员初始化

2. **自动确认 "trust this folder" 弹窗**（有项目目录时必须执行）：

   mc 首次在新目录启动时会弹出信任确认交互框，teammate 会卡住无法收取消息。必须在等待结束后对每个有 `<project-dir>` 的 pane 发一次 Enter：
   ```bash
   # 对每个 pane 发 Enter 确认（多余的 Enter 无副作用）
   sleep 3 && tmux send-keys -t <pane-id> "" Enter
   ```

3. 验证 pane 存活：
   ```bash
   tmux list-panes -F "#{pane_id} #{pane_current_command} #{pane_dead}"
   ```

4. 通过 SendMessage 向每个成员发送角色说明和初始任务

## Step 7: 汇报

列出所有成员（名称、颜色、职责），确认通信正常，提示用户可分配任务。

## 注意事项

- **不要用 `-p` 参数**传 prompt，`-p` 是 print 模式会导致立即退出
- 启动后通过 **SendMessage** 发送初始指令最可靠
- `mc --code` 的隐藏团队参数（`--help` 不显示）：`--agent-id`、`--agent-name`、`--team-name`、`--agent-color`、`--parent-session-id`
