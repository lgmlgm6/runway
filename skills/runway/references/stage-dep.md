# Stage 0-dep — 依赖检测与安装

Step 0 所有子步骤完成后、进入 Stage 0.5 或 Stage 1 之前立即执行。

**跳过条件（restore 幂等）：** checkpoint 中 `dependency_check_status == "ok"` 且 `dependency_install_status != "failed"` → 打印 `⚡ 依赖检测已通过（来自 checkpoint），跳过`，直接进入下一 Stage。

---

## Phase A：美团内部 CLI 工具检测与安装

串行执行，任一安装失败立即进入失败暂停流程。

### A-1：mtskills CLI 本身

```bash
mkdir -p .runway/tmp
if ! command -v mtskills &>/dev/null; then
  echo "📦 安装 mtskills CLI..."
  npm i -g @mtfe/mtskills --registry=http://r.npm.sankuai.com 2>&1 | tee .runway/tmp/dep-install-mtskills.txt; echo "EXIT:$?"
  # 非零 → 失败暂停
else
  echo "✅ mtskills 就绪"
fi
```

### A-2：全量安装所有 skills + tmux

所有工具一律检测并安装，不区分 pipeline_options / role / mode：

```bash
# mtskills 管理的 skills
# 注：mtskills list 通过 pager 输出，grep -q 会导致 pager 提前退出丢失数据
# 用变量缓存输出后再匹配
MTSKILLS_LIST=$(mtskills list 2>/dev/null)
for skill in citadel ee-ones ee-cargo ee-talos; do
  if [ -z "$(echo "$MTSKILLS_LIST" | grep "${skill}")" ]; then
    echo "📦 安装 ${skill}..."
    mtskills i ${skill} 2>&1 | tee .runway/tmp/dep-install-${skill}.txt; echo "EXIT:$?"
    # 非零 → 失败暂停
  else
    echo "✅ ${skill} 已安装"
  fi
done

# tmux（系统包管理器安装）
if ! command -v tmux &>/dev/null; then
  echo "📦 安装 tmux..."
  if command -v brew &>/dev/null; then
    brew install tmux 2>&1 | tee .runway/tmp/dep-install-tmux.txt; echo "EXIT:$?"
  elif command -v apt-get &>/dev/null; then
    sudo apt-get install -y tmux 2>&1 | tee .runway/tmp/dep-install-tmux.txt; echo "EXIT:$?"
  else
    echo "EXIT:1"  # 无法识别包管理器 → 失败暂停
  fi
else
  echo "✅ tmux 已安装"
fi
```

tmux 无法识别包管理器时，失败暂停信息额外提示：`请手动安装 tmux（brew install tmux 或 apt-get install tmux）`。

---

## Phase B：项目构建依赖检测与安装

### B-1：识别项目类型

```bash
PROJECT_ROOT=$(git rev-parse --show-toplevel 2>/dev/null || echo "$PWD")
BUILD_CMD=$(jq -r '.build_cmd // "mvn compile -am -q"' "$PROJECT_ROOT/.runway/project.json" 2>/dev/null)

IS_MAVEN=false
IS_NPM=false
[[ -f "$PROJECT_ROOT/pom.xml" ]] && IS_MAVEN=true
[[ "$BUILD_CMD" == *mvn* ]] && IS_MAVEN=true
[[ -f "$PROJECT_ROOT/package.json" ]] && IS_NPM=true
```

`IS_MAVEN=false` 且 `IS_NPM=false` → 打印 `⚡ 构建依赖检测跳过（未识别到 pom.xml / package.json）`，继续流程。

### B-2：Maven 依赖检测与安装（IS_MAVEN=true 时）

```bash
mkdir -p "$PROJECT_ROOT/.runway/tmp"
mvn dependency:resolve -DskipTests -q 2>&1 | tee "$PROJECT_ROOT/.runway/tmp/dep-check-maven.txt"; echo "EXIT:$?"
```

- EXIT:0 → 打印 `✅ Maven 依赖就绪`
- 非零 → 执行安装：

```bash
mvn install -DskipTests -q 2>&1 | tee "$PROJECT_ROOT/.runway/tmp/dep-install-maven.txt"; echo "EXIT:$?"
```

  - EXIT:0 → 打印 `✅ Maven 依赖安装完成`
  - 非零 → 失败暂停

### B-3：npm 依赖检测与安装（IS_NPM=true 时，Maven 之后串行）

```bash
npm ls --depth=0 2>&1 | tee "$PROJECT_ROOT/.runway/tmp/dep-check-npm.txt"; echo "EXIT:$?"
```

EXIT 非零或输出含 `missing` → 执行安装：

```bash
npm install 2>&1 | tee "$PROJECT_ROOT/.runway/tmp/dep-install-npm.txt"; echo "EXIT:$?"
```

- EXIT:0 → 打印 `✅ npm 依赖安装完成`
- 非零 → 失败暂停

---

## 失败暂停规则

任何安装命令 EXIT 非零时，停止并上报用户：

```
⛔ Stage 0-dep 依赖安装失败，流水线暂停。

失败项：{mtskills / citadel / ee-ones / ee-cargo / ee-talos / tmux / Maven / npm}
安装命令：{exact command used}
错误输出（最后 30 行）：
{tail -30 of dep-install-*.txt}

请检查：
- npm registry 可达性（http://r.npm.sankuai.com）
- mtskills 是否有权限安装该 skill
- Maven 仓库 / pom.xml 语法
- tmux：请手动安装（brew install tmux 或 apt-get install tmux）
修复后请回复「继续」以恢复流水线。
```

恢复时：仅重新执行失败的安装命令，成功后继续，不重新执行 Step 0。

---

## Checkpoint 写入

```bash
RUNWAY_TOOLS="${CLAUDE_PLUGIN_ROOT:+${CLAUDE_PLUGIN_ROOT}/skills/runway/bin/runway-tools.cjs}"
RUNWAY_TOOLS="${RUNWAY_TOOLS:-$HOME/.claude/skills/runway/bin/runway-tools.cjs}"
PROJECT_ROOT=$(git rev-parse --show-toplevel 2>/dev/null || echo "$PWD")
ONES_ID=$(jq -r '.ones_work_item_id' "$PROJECT_ROOT"/.runway/checkpoint-*.json 2>/dev/null | head -1)

node "$RUNWAY_TOOLS" checkpoint-write \
  --root "$PROJECT_ROOT" \
  --ones-id "$ONES_ID" \
  --dependency-check-status "{ok|skipped}" \
  --dependency-install-status "{ok|failed|skipped}" \
  --updated-at "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
```

---

## 成功摘要

```
✅ Stage 0-dep 完成 — 依赖就绪
- mtskills：{就绪 / 已安装}
- citadel：{就绪 / 已安装}
- ee-ones：{就绪 / 已安装}
- ee-cargo：{就绪 / 已安装}
- ee-talos：{就绪 / 已安装}
- tmux：{就绪 / 已安装}
- Maven：{就绪（预检通过）/ 已安装 / 跳过}
- npm：{就绪（预检通过）/ 已安装 / 跳过}
- 进入 Stage {0.5 / 1}
```
