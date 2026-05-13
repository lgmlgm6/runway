---
name: runway-qa-verify
description: Runs build/lint/test/typecheck in a loop (max 5 rounds), scans AC coverage against the TC list, and produces a timestamped evidence summary. Invoke this skill whenever the user wants to "run QA", "verify the build", "跑测试", "final verification", "check if done", or after runway-code-review-fix completes. Also trigger when the user asks "is it ready?" or "does everything pass?" after development. Do NOT declare completion without running this skill — evidence is required, not assumed.
version: 0.1.0
---

# QA Verify

Run full integration quality verification before declaring development complete. No completion claim without fresh evidence.

## Iron Rule

> **No completion claim without fresh verification evidence.**

"Should pass", "looks fine", "worked before" are not evidence. Evidence = actual command output from this run.

## When to Use

Activate after runway-code-review-fix completes. Input: branch name, verification targets. This is Stage 7 (final) of the Runway workflow.

## Verification Targets

Specify one or more (default: `--all`):

| Flag | What it runs |
|------|-------------|
| `--tests` | Test suite (`npm test` / `pytest` / `go test ./...`) |
| `--build` | Build (`npm run build` / `go build ./...`) |
| `--lint` | Linter (`npm run lint` / `flake8` / `golangci-lint`) |
| `--typecheck` | Type checker (`tsc --noEmit` / `mypy`) |
| `--all` | All of the above in sequence |
| `--custom <cmd>` | User-specified command |

## Process

```
Confirm commands
    ↓
LOOP (max 5 rounds):
  Run verification with real exit codes captured
  All pass → exit loop
  Failures → architect diagnoses → executor fixes → repeat
  Same failure 3× → stop, escalate
    ↓
[Pass] Evidence summary → DONE
[Fail] Failure report → escalate
```

## Step 0: Load Role Context

Read the `role` field from the checkpoint (default: `"backend"`):

```bash
ROLE=$(jq -r '.role // "backend"' .runway/checkpoint-*.json 2>/dev/null | head -1)
SKILL_ROOT="${CLAUDE_PLUGIN_ROOT:+${CLAUDE_PLUGIN_ROOT}/skills/runway-qa-verify}"
SKILL_ROOT="${SKILL_ROOT:-$HOME/.claude/skills/runway-qa-verify}"
ROLE_FILE="${SKILL_ROOT}/roles/${ROLE}.md"
```

If `ROLE_FILE` exists, read it and apply its verification targets and acceptance criteria. The role file defines which verification steps to run and which to skip:
- `role=backend`：run `--all` (build + lint + test + typecheck)
- `role=frontend`：run `--build --lint` only, skip test and typecheck

If `ROLE_FILE` does not exist, default to `--all`.

## Step 1: Confirm Commands

Before starting, verify the exact commands for this project. Check `package.json`, `Makefile`, `pyproject.toml`, `go.mod`, and CI config as appropriate. Do not assume.

If this is a monorepo or workspace-based project, record whether commands run from the repo root, a package directory, or through the workspace runner.

**Java Maven multi-module projects:** Before running any `mvn test -pl <module>` command, first run `mvn install -DskipTests -q` from the project root. Sub-module tests fail with dependency resolution errors (`${revision}` unresolved) if the root has not been installed first. This is a Maven multi-module requirement, not a code issue.

## Step 2: QA Loop

### Each round

**Java Maven multi-module projects:** If the project uses Maven multi-module layout, run `mvn install -DskipTests -q` from the project root **before each round's test command** (including fix rounds 2–5). Sub-module tests fail with `${revision}` unresolved errors if the root install is skipped after a code change.

Run verification and capture exit code explicitly. Avoid `set -o pipefail` — it is incompatible with zsh and some CI environments:

```bash
mkdir -p .runway/tmp
{command} 2>&1 | tee ".runway/tmp/qa-round-{N}.txt"; echo "EXIT_CODE:$?"
```

Check the last line for `EXIT_CODE:0` (pass) or `EXIT_CODE:1` (fail). Do not rely on `tee`'s exit code.

Alternatively, for bash-only environments:
```bash
mkdir -p .runway/tmp
bash -c '{command}; echo "EXIT_CODE:$?"' 2>&1 | tee ".runway/tmp/qa-round-{N}.txt"
```

### Check result
- Exit code 0, all targets pass → exit loop → Step 3
- Any failure → continue

### Failure signature extraction

Save one normalized signature per target so repeated failures can be compared without noise:

- **Tests:** failing test names + error type
- **Build:** compiler/build tool error type + first failing module/file
- **Lint:** rule ID + file path
- **Typecheck:** diagnostic code/type error + file path

Avoid comparing line numbers or timestamps. They change between runs and do not indicate progress.

### Detect repeated failure

If the normalized failure signature is identical for the 3rd consecutive round → stop → Step 4 (escalate).

**What counts as "same failure":** same failing tests or same normalized error cluster for build/lint/typecheck.

### Architect diagnosis

Dispatch architect subagent with: failure output + relevant source files.
Output: root cause + recommended fix.

### Executor fix

Dispatch executor subagent with: architect's diagnosis + files to change.

After any fix, re-run **all selected targets**, not just the one that failed. Fresh evidence must cover the full chosen verification scope.

### Loop exit conditions

| Condition | Action |
|-----------|--------|
| All targets pass | → Step 3 (evidence summary) |
| Round 5 reached, failures remain | → Step 4 (failure report) |
| Same failure 3 rounds in a row | → Step 4 (failure report) |
| Environment error (not code) | → Step 4 (failure report, note env issue) |

## Step 3: Evidence Summary (on pass)

```markdown
# Verification Evidence: {feature}

**Timestamp:** {YYYY-MM-DD HH:MM:SS}
**Rounds:** {N}
**Result:** ✅ ALL PASSED

## Evidence

### Tests
Command: `{exact command}`
Log: `.runway/tmp/qa-round-{N}.txt`
Result: {X}/{total} passed
Output: `{key output line}`

### Build
Command: `{exact command}`
Log: `.runway/tmp/qa-round-{N}.txt`
Result: ✅ success
Artifacts: {list}

### Lint
Command: `{exact command}`
Log: `.runway/tmp/qa-round-{N}.txt`
Result: ✅ no issues

### Type Check
Command: `{exact command}`
Log: `.runway/tmp/qa-round-{N}.txt`
Result: ✅ no errors

## Commits (this session)
{git log --oneline {base}..HEAD}

---
Evidence collected at {timestamp}. Development complete.
```

## Step 4: Failure Report (on escalation)

```markdown
# QA Failure Report: {feature}

**Timestamp:** {YYYY-MM-DD HH:MM:SS}
**Rounds run:** {N}
**Stop reason:** {round limit / repeated failure / environment error}

## Persisting Failures
{exact failure output}

## Normalized Failure Signatures
{per target: signature used for repeated-failure detection}

## Diagnosis
{architect's root cause analysis}

## Attempted Fixes
{per-round summary}

## Recommended Next Steps
{specific actions needed}
```

Stop. Do not claim completion. Wait for human input.

### Save report to `.runway/docs/`

After producing the evidence summary, save it through the shared runtime helper so the canonical checkpoint is updated in one place:

```bash
RUNWAY_TOOLS="${CLAUDE_PLUGIN_ROOT:+${CLAUDE_PLUGIN_ROOT}/skills/runway/bin/runway-tools.cjs}"
RUNWAY_TOOLS="${RUNWAY_TOOLS:-$HOME/.claude/skills/runway/bin/runway-tools.cjs}"
PROJECT_ROOT=$(git rev-parse --show-toplevel 2>/dev/null || echo "$PWD")
ONES_ID=$(jq -r '.ones_work_item_id' .runway/checkpoint-*.json 2>/dev/null | head -1)
if [[ -n "$ONES_ID" ]]; then
  mkdir -p .runway/tmp
  cat > .runway/tmp/qa-report.md << 'EOF'
{QA_REPORT_CONTENT}
EOF
  node "$RUNWAY_TOOLS" report-write \
    --root "$PROJECT_ROOT" \
    --ones-id "$ONES_ID" \
    --report qa_report \
    --content-file .runway/tmp/qa-report.md
fi
```

## Terminal State

Evidence summary produced, all targets pass. **Stage 7 QA complete.**

**Scope boundary:** This skill's responsibility ends here. The overall development workflow completion (including ONES status update, retrospective, asset checks, and pipeline promise) is owned by the `runway` orchestrator, not by this skill. Do not output any `<promise>` tags from this skill.

**Artifacts for downstream stages:** The saved QA report is an input to the orchestrator's Stage 12 retrospective and completion flow; it is not a standalone completion signal by itself.

## Red Flags — Stop Immediately If:

- Modifying tests to make them pass (instead of fixing implementation)
- Skipping a verification target ("lint doesn't matter here")
- Claiming "environment issue" without evidence of what the environment issue is
- Using cached results from a previous run as evidence
- Re-running only the last failed target after code changes when the requested scope was broader

## Additional Resources

- **`references/command-reference.md`** — Common test/build/lint commands by language/framework
