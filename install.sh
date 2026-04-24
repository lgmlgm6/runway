#!/usr/bin/env bash
# Runway skill suite installer
# Usage: bash install.sh [--uninstall]
#
# What this does:
#   1. Copies skill files to ~/.claude/skills/ (where Claude Code loads them)
#      including the shared runway runtime under runway/bin and runway/lib
#   2. Installs hook scripts to ~/.claude/hooks/runway/
#   3. Registers hooks in ~/.claude/settings.json
#
# Skill loading: Claude Code loads skills from ~/.claude/skills/<name>/SKILL.md
# Hook I/O: hooks read JSON from stdin (tool_name, tool_input, session_id, cwd)
#           hooks write JSON to stdout (hookSpecificOutput.additionalContext)
#
# Runway loop contract:
#   - The main runway orchestrator owns cross-stage transitions.
#   - Sub-skills may create loop state only in standalone mode; when orchestrated, they must
#     reuse the existing workflow ownership instead of creating a competing loop owner.
#   - Any intentional pause point must deactivate state before Claude stops.
#   - The Stop hook timeout is registered at 60s so transcript inspection and continuation
#     reinjection remain reliable under longer sessions.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CLAUDE_DIR="$HOME/.claude"
SETTINGS="$CLAUDE_DIR/settings.json"
SKILLS_DEST="$CLAUDE_DIR/skills"
SKILL_NAME="runway"
HOOKS_DIR="$CLAUDE_DIR/hooks/$SKILL_NAME"
HOOKS_SRC="$SCRIPT_DIR/hooks"

SKILL_NAMES=(
  "runway"
  "runway-prd-analysis"
  "runway-tech-design"
  "runway-task-planning"
  "runway-parallel-dev"
  "runway-code-review-fix"
  "runway-qa-verify"
)

# ── colors ───────────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'; NC='\033[0m'
info()    { echo -e "${BLUE}[runway]${NC} $*"; }
success() { echo -e "${GREEN}[runway]${NC} ✓ $*"; }
warn()    { echo -e "${YELLOW}[runway]${NC} ⚠ $*"; }
error()   { echo -e "${RED}[runway]${NC} ✗ $*" >&2; }

# ── dependency check ──────────────────────────────────────────────────────────
check_deps() {
  local missing=()
  command -v node >/dev/null 2>&1 || missing+=("node (https://nodejs.org)")
  command -v jq   >/dev/null 2>&1 || missing+=("jq (brew install jq / apt install jq)")
  if [[ ${#missing[@]} -gt 0 ]]; then
    error "Missing required tools:"
    for m in "${missing[@]}"; do echo "    $m"; done
    exit 1
  fi
}

# ── safe settings.json writer ─────────────────────────────────────────────────
# Writes to a temp file first, validates JSON, then atomically replaces.
write_settings() {
  local new_content="$1"
  local tmp
  tmp=$(mktemp "${SETTINGS}.tmp.XXXXXX")
  echo "$new_content" > "$tmp"
  if ! jq empty "$tmp" 2>/dev/null; then
    rm -f "$tmp"
    error "Generated invalid JSON — aborting settings update"
    return 1
  fi
  mv "$tmp" "$SETTINGS"
}

ensure_settings() {
  mkdir -p "$CLAUDE_DIR"
  if [[ ! -f "$SETTINGS" ]]; then
    echo '{}' > "$SETTINGS"
    info "Created $SETTINGS"
  fi

  local current
  current=$(cat "$SETTINGS")
  if ! echo "$current" | jq -e '.hooks' >/dev/null 2>&1; then
    write_settings "$(echo "$current" | jq '. + {"hooks":{}}')"
  fi
}

# ── hook registration (idempotent) ────────────────────────────────────────────
# Adds a hook entry to settings.json if not already present.
# $1 = event  $2 = matcher (use "*" for all)  $3 = command path  $4 = timeout (optional, default 10)
add_hook() {
  local event="$1" matcher="$2" command="$3" timeout="${4:-10}"

  local entry
  entry=$(jq -n \
    --arg m "$matcher" \
    --arg cmd "$command" \
    --argjson t "$timeout" \
    '{"matcher":$m,"hooks":[{"type":"command","command":$cmd,"timeout":$t}]}')

  local exists
  exists=$(jq \
    --arg event "$event" \
    --argjson entry "$entry" \
    '.hooks[$event] // [] | map(select(. == $entry)) | length' \
    "$SETTINGS")

  if [[ "$exists" -gt 0 ]]; then
    info "Hook already present: $event [$matcher]"
    return
  fi

  local updated
  updated=$(jq \
    --arg event "$event" \
    --argjson entry "$entry" \
    '.hooks[$event] = ((.hooks[$event] // []) + [$entry])' \
    "$SETTINGS")
  write_settings "$updated"
  success "Added hook: $event [$matcher] → $(basename "$command")"
}

# ── hook removal ──────────────────────────────────────────────────────────────
remove_hooks() {
  local updated
  updated=$(jq \
    --arg name "$SKILL_NAME" \
    'if .hooks then
       .hooks |= with_entries(
         .value |= map(
           select(
             [.hooks[]?.command // ""] |
             any(test("/hooks/" + $name + "/"; "g")) |
             not
           )
         )
       )
     else . end' \
    "$SETTINGS")
  write_settings "$updated"
  success "Removed Runway hooks from settings.json"
}

# ── skill installation ────────────────────────────────────────────────────────
install_skills() {
  mkdir -p "$SKILLS_DEST"

  for skill in "${SKILL_NAMES[@]}"; do
    local src="$SCRIPT_DIR/skills/$skill"
    local dst="$SKILLS_DEST/$skill"
    if [[ ! -d "$src" ]]; then
      warn "Skill directory not found: $src — skipping"
      continue
    fi
    rm -rf "$dst"
    cp -r "$src" "$dst"
    success "Installed skill: $skill → $dst"
  done
}

uninstall_skills() {
  for skill in "${SKILL_NAMES[@]}"; do
    local dst="$SKILLS_DEST/$skill"
    if [[ -d "$dst" ]]; then
      rm -rf "$dst"
      success "Removed skill: $skill"
    fi
  done
}

# ── hook scripts ──────────────────────────────────────────────────────────────
# Hook scripts live in hooks/ and are copied to ~/.claude/hooks/runway/.
# To modify hook behavior, edit the source files in hooks/ and re-run install.sh.
install_hook_scripts() {
  mkdir -p "$HOOKS_DIR"

  for hook in pre-tool-guard.js workflow-advisory.js post-tool-verifier.js runway-stop-hook.sh; do
    local src="$HOOKS_SRC/$hook"
    if [[ ! -f "$src" ]]; then
      error "Hook script not found: $src"
      exit 1
    fi
    cp "$src" "$HOOKS_DIR/$hook"
    chmod +x "$HOOKS_DIR/$hook"
    success "Installed hook: $hook"
  done
}

remove_hook_scripts() {
  if [[ -d "$HOOKS_DIR" ]]; then
    rm -rf "$HOOKS_DIR"
    success "Removed hook scripts from $HOOKS_DIR"
  fi
}

# ── install ───────────────────────────────────────────────────────────────────
install() {
  echo ""
  echo -e "${BLUE}╔══════════════════════════════════════╗${NC}"
  echo -e "${BLUE}║      Runway skill suite installer    ║${NC}"
  echo -e "${BLUE}╚══════════════════════════════════════╝${NC}"
  echo ""

  check_deps
  ensure_settings

  info "Cleaning previous hook registrations..."
  remove_hooks
  remove_hook_scripts

  info "Installing skills to ~/.claude/skills/ ..."
  install_skills

  info "Installing hook scripts..."
  install_hook_scripts

  info "Registering hooks in settings.json..."
  add_hook "PreToolUse"  "Write|Edit"                "$HOOKS_DIR/pre-tool-guard.js"
  add_hook "PreToolUse"  "Write|Edit"                "$HOOKS_DIR/workflow-advisory.js"
  add_hook "PostToolUse" "Bash"                      "$HOOKS_DIR/post-tool-verifier.js"
  add_hook "Stop"        "*"                         "$HOOKS_DIR/runway-stop-hook.sh" 60

  echo ""
  echo -e "${GREEN}╔══════════════════════════════════════╗${NC}"
  echo -e "${GREEN}║        Installation complete! ✓      ║${NC}"
  echo -e "${GREEN}╚══════════════════════════════════════╝${NC}"
  echo ""
  echo "  Skills installed to ~/.claude/skills/:"
  for skill in "${SKILL_NAMES[@]}"; do
    echo "    • $skill"
  done
  echo ""
  echo "  Hooks registered:"
  echo "    • PreToolUse  [Write|Edit] → read-before-edit guard"
  echo "    • PreToolUse  [Write|Edit] → workflow advisory reminder"
  echo "    • PostToolUse [Bash]       → command failure reminder"
  echo "    • Stop        [*]          → runway pipeline continuation (pipeline loop only)"
  echo ""
  echo "  Restart Claude Code to activate."
  echo ""
  echo "  To start using, say:"
  echo -e "    ${YELLOW}\"用 runway 帮我开发这个需求 <PRD链接> ones工作项 <ID>\"${NC}"
  echo ""
  echo "  To uninstall: bash install.sh --uninstall"
  echo ""
}

# ── uninstall ─────────────────────────────────────────────────────────────────
uninstall() {
  echo ""
  info "Uninstalling Runway skill suite..."

  ensure_settings
  remove_hooks
  remove_hook_scripts
  uninstall_skills

  echo ""
  success "Uninstall complete. Restart Claude Code to apply."
  echo ""
}

# ── main ──────────────────────────────────────────────────────────────────────
case "${1:-}" in
  --uninstall|-u) uninstall ;;
  --help|-h)
    echo "Usage: bash install.sh [--uninstall]"
    echo ""
    echo "  (no args)    Install Runway skills and hooks"
    echo "  --uninstall  Remove Runway skills and hooks"
    ;;
  *) install ;;
esac
