#!/usr/bin/env bash
# runway: Stop hook — keeps the Stage 4-7 pipeline loop running
# Uses the pipeline state file frontmatter schema:
#   .claude/runway-state/pipeline.local.md
# Contract:
#   - active:true means Claude should be re-injected on Stop instead of exiting.
#   - Any Hard Gate, blocker, user stop, auth/login pause, or other human decision point must
#     flip active:false (or remove the state file) BEFORE pausing.
#   - completion_promise, when present, is the only success signal that allows this hook to
#     release an active loop without manual deactivation.
#   - Standalone sub-skills may create their own state only when no orchestrator-owned pipeline
#     state is already active; otherwise they must reuse the current workflow ownership.

set -euo pipefail

HOOK_INPUT=$(cat)
STATE_DIR=".claude/runway-state"
PIPELINE_STATE="$STATE_DIR/pipeline.local.md"

# ── helper: parse frontmatter field ──────────────────────────────────────────
get_field() {
  local file="$1" field="$2"
  sed -n '/^---$/,/^---$/{ /^---$/d; p; }' "$file" \
    | grep "^${field}:" \
    | sed "s/${field}: *//" \
    | sed 's/^"\(.*\)"$/\1/'
}

# ── helper: check if a state file is active ──────────────────────────────────
is_active() {
  local file="$1"
  [[ -f "$file" ]] && [[ "$(get_field "$file" active)" == "true" ]]
}

# Pipeline loop only — if no active pipeline state exists, allow exit
if ! is_active "$PIPELINE_STATE"; then
  exit 0
fi

STATE_FILE="$PIPELINE_STATE"

# ── validate numeric fields ───────────────────────────────────────────────────
ITERATION=$(get_field "$STATE_FILE" iteration)
MAX_ITERATIONS=$(get_field "$STATE_FILE" max_iterations)
COMPLETION_PROMISE=$(get_field "$STATE_FILE" completion_promise)
SAVED_SESSION=$(get_field "$STATE_FILE" session_id)

if [[ ! "$ITERATION" =~ ^[0-9]+$ ]] || [[ ! "$MAX_ITERATIONS" =~ ^[0-9]+$ ]]; then
  echo "runway-stop-hook: state file corrupted (non-numeric fields), clearing and allowing exit" >&2
  rm -f "$STATE_FILE"
  exit 0
fi

# ── session isolation: stale state from a previous session ───────────────────
# If SAVED_SESSION is empty (written by old state files before session_id fallback),
# skip the check — treat as same session for backwards compatibility.
CURRENT_SESSION="${CLAUDE_SESSION_ID:-}"
if [[ -n "$SAVED_SESSION" ]] && [[ -n "$CURRENT_SESSION" ]] && [[ "$SAVED_SESSION" != "$CURRENT_SESSION" ]]; then
  echo "runway-stop-hook: stale state from session $SAVED_SESSION (current: $CURRENT_SESSION), clearing and allowing exit" >&2
  rm -f "$STATE_FILE"
  exit 0
fi

# ── time-based staleness guard ────────────────────────────────────────────────
# Fallback when CLAUDE_SESSION_ID is absent — prevents old state files from
# blocking exit indefinitely. Matches DEFAULT_MAX_STATE_AGE_MS in state.cjs.
STATE_MTIME=$(stat -c %Y "$STATE_FILE" 2>/dev/null || stat -f %m "$STATE_FILE" 2>/dev/null || echo 0)
NOW_EPOCH=$(date +%s)
MAX_AGE_SECONDS=7200
if [[ $((NOW_EPOCH - STATE_MTIME)) -gt $MAX_AGE_SECONDS ]]; then
  echo "runway-stop-hook: state file too old ($(( (NOW_EPOCH - STATE_MTIME) / 60 ))min), clearing and allowing exit" >&2
  rm -f "$STATE_FILE"
  exit 0
fi

# ── iteration cap ─────────────────────────────────────────────────────────────
if [[ $MAX_ITERATIONS -gt 0 ]] && [[ $ITERATION -ge $MAX_ITERATIONS ]]; then
  echo "runway-stop-hook: max iterations ($MAX_ITERATIONS) reached for $(basename "$STATE_FILE"), clearing and allowing exit" >&2
  rm -f "$STATE_FILE"
  exit 0
fi

# ── transcript check (completion promise only) ────────────────────────────────
# Transcript shape is NOT used to decide whether to keep blocking.
# Active state is the authoritative signal — if active:true, keep blocking regardless
# of transcript form (missing, no assistant messages, tool-use-only, empty content).
# Transcript is read only to detect a satisfied completion_promise.
TRANSCRIPT_PATH=$(echo "$HOOK_INPUT" | jq -r '.transcript_path // empty')
LAST_OUTPUT=""
if [[ -n "$TRANSCRIPT_PATH" ]] && [[ -f "$TRANSCRIPT_PATH" ]]; then
  LAST_LINE=$(grep '"role":"assistant"' "$TRANSCRIPT_PATH" 2>/dev/null | tail -1 || true)
  if [[ -n "$LAST_LINE" ]]; then
    LAST_OUTPUT=$(echo "$LAST_LINE" | jq -r '
      .message.content |
      map(select(.type == "text")) |
      map(.text) |
      join("\n")
    ' 2>/dev/null || echo "")
  fi
fi

# ── check completion promise ──────────────────────────────────────────────────
if [[ "$COMPLETION_PROMISE" != "null" ]] && [[ -n "$COMPLETION_PROMISE" ]]; then
  # Extract <promise>...</promise> text — try Perl first (handles multiline), fall back to grep+sed
  if command -v perl >/dev/null 2>&1; then
    PROMISE_TEXT=$(echo "$LAST_OUTPUT" | perl -0777 -pe 's/.*?<promise>(.*?)<\/promise>.*/$1/s; s/^\s+|\s+$//g; s/\s+/ /g' 2>/dev/null || echo "")
  else
    PROMISE_TEXT=$(echo "$LAST_OUTPUT" | grep -o '<promise>[^<]*</promise>' | sed 's|<promise>||;s|</promise>||' | head -1 | sed 's/^[[:space:]]*//;s/[[:space:]]*$//' || echo "")
  fi
  if [[ -n "$PROMISE_TEXT" ]] && [[ "$PROMISE_TEXT" = "$COMPLETION_PROMISE" ]]; then
    echo "runway-stop-hook: promise satisfied ($(basename "$STATE_FILE")), clearing and allowing exit" >&2
    rm -f "$STATE_FILE"
    exit 0
  fi
fi

# ── block exit and re-inject continuation prompt ──────────────────────────────
NEXT_ITERATION=$((ITERATION + 1))
PROMPT_TEXT=$(awk '/^---$/{i++; next} i>=2' "$STATE_FILE")

if [[ -z "$PROMPT_TEXT" ]]; then
  echo "runway-stop-hook: no prompt in state file, clearing and allowing exit" >&2
  rm -f "$STATE_FILE"
  exit 0
fi

# Atomic iteration increment
TEMP_FILE="${STATE_FILE}.tmp.$$"
sed "s/^iteration: .*/iteration: $NEXT_ITERATION/" "$STATE_FILE" > "$TEMP_FILE"
mv "$TEMP_FILE" "$STATE_FILE"

MODE=$(get_field "$STATE_FILE" mode)
if [[ "$COMPLETION_PROMISE" != "null" ]] && [[ -n "$COMPLETION_PROMISE" ]]; then
  SYSTEM_MSG="🔄 Runway [$MODE] iteration $NEXT_ITERATION — still in progress. Output <promise>$COMPLETION_PROMISE</promise> ONLY when this loop is genuinely complete. Do NOT output the promise to escape early."
else
  SYSTEM_MSG="🔄 Runway [$MODE] iteration $NEXT_ITERATION — still in progress. Continue from where you left off."
fi

jq -n \
  --arg prompt "$PROMPT_TEXT" \
  --arg msg "$SYSTEM_MSG" \
  '{"decision": "block", "reason": $prompt, "systemMessage": $msg}'

exit 0
