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

## Step 1: Confirm Commands

Before starting, verify the exact commands for this project. Check `package.json`, `Makefile`, `pyproject.toml`, `go.mod`, and CI config as appropriate. Do not assume.

If this is a monorepo or workspace-based project, record whether commands run from the repo root, a package directory, or through the workspace runner.

**Java Maven multi-module projects:** Before running any `mvn test -pl <module>` command, first run `mvn install -DskipTests -q` from the project root. Sub-module tests fail with dependency resolution errors (`${revision}` unresolved) if the root has not been installed first. This is a Maven multi-module requirement, not a code issue.

## Step 2: QA Loop

### Each round

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

### Knowledge Capture on Repeated Failure

当同一 normalized failure signature **第 2 次出现**时（不必等第 3 次），在继续修复循环之前提炼根因：

判断：
1. 这个失败是代码问题还是环境/配置问题？
2. 为什么第一次修复没有彻底解决？根因是什么？
3. 这条知识在未来类似任务中是否有预警价值？

如果 `confidence >= 7`，写入 knowledge.json：

```bash
RUNWAY_TOOLS="${CLAUDE_PLUGIN_ROOT:+${CLAUDE_PLUGIN_ROOT}/skills/runway/bin/runway-tools.cjs}"
RUNWAY_TOOLS="${RUNWAY_TOOLS:-$HOME/.claude/skills/runway/bin/runway-tools.cjs}"
ONES_ID=$(jq -r '.ones_work_item_id' .runway/checkpoint-*.json 2>/dev/null | head -1)
node "$RUNWAY_TOOLS" knowledge-append \
  --root "$PWD" \
  --ones-id "${ONES_ID:-unknown}" \
  --entries '[{
    "type": "pitfall_root_cause",
    "captured_at_stage": 7,
    "trigger": "qa_repeated_failure",
    "inject_into_stages": [3, 5],
    "inject_as": "warning",
    "scope": "project",
    "summary": "{根因一句话}",
    "detail": "{失败特征} — {第一次修复尝试} — {为什么没修好} — {根因}",
    "confidence": 8
  }]' || true
```

`confidence` 根据根因的确定程度填 7–10 的整数。捕获失败不阻塞主流程（`|| true`）。

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

## Step 3: AC Coverage Scan

Run this step after the QA loop passes, before producing the evidence summary.

For each P0 TC in `.runway/tmp/tc-list.md`, perform a two-phase check:

### Phase 1: Find test method

```bash
# Locate the file containing the TC编号
grep -r "TC-{编号}" src/test/ --include="*.java" --include="*.kt" \
  --include="*.ts" --include="*.py" --include="*.go" -l
```

If not found → status = ⚠️ 未覆盖, skip Phase 2.

### Phase 2: Verify the method has a substantive assertion

Read the test method body (from the line containing `TC-{编号}` to the next method boundary). Check whether it contains at least one substantive assertion:

| Language | Assertion patterns to look for |
|----------|-------------------------------|
| Java/Kotlin | `assert`, `assertEquals`, `assertThat`, `verify(`, `ArgumentCaptor` |
| TypeScript/JS | `expect(`, `assert.`, `toBe(`, `toEqual(`, `toContain(` |
| Python | `assert `, `assertEqual`, `assertIn`, `pytest.raises` |
| Go | `t.Error`, `t.Fatal`, `assert.Equal`, `require.Equal` |

If the method body contains **only** setup/mock calls with no assertion → status = ⚠️ 断言缺失 (method exists but does not verify behavior)

### Coverage table

```markdown
## AC Coverage

| AC编号 | TC编号  | 优先级 | 测试方法                          | 状态         |
|--------|---------|--------|----------------------------------|--------------|
| AC-01  | TC-01-a | P0     | TC01a_whenTabIdValid_thenFiltered | ✅ 已覆盖     |
| AC-02  | TC-02-a | P0     | TC02a_whenTabIdNull_noFilter      | ⚠️ 断言缺失  |
| AC-03  | TC-03-a | P0     | —                                | ⚠️ 未覆盖    |
```

### Rules

- ✅ 已覆盖：method found AND has substantive assertion
- ⚠️ 断言缺失：method found BUT no substantive assertion — record as finding, do not block
- ⚠️ 未覆盖：method not found — record as finding, do not block
- Any ⚠️ finding → surface in Evidence Summary under "AC Coverage Gaps" for human review
- Do not fail the QA stage solely due to coverage gaps; the gaps are the signal

## Step 4: Evidence Summary (on pass)

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

### AC Coverage
{paste AC Coverage table from Step 3, or "No TC list found — AC coverage scan skipped"}

---
Evidence collected at {timestamp}. Development complete.
```

## Step 5: Failure Report (on escalation)

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
ONES_ID=$(jq -r '.ones_work_item_id' .runway/checkpoint-*.json 2>/dev/null | head -1)
if [[ -n "$ONES_ID" ]]; then
  mkdir -p .runway/tmp
  cat > .runway/tmp/qa-report.md << 'EOF'
{QA_REPORT_CONTENT}
EOF
  node "$RUNWAY_TOOLS" report-write \
    --root "$PWD" \
    --ones-id "$ONES_ID" \
    --report qa_report \
    --content-file .runway/tmp/qa-report.md
fi
```

## Terminal State

Evidence summary produced, all targets pass. **Stage 7 QA complete.**

**Scope boundary:** This skill's responsibility ends here. The overall development workflow completion (including ONES status update, retrospective, asset checks, and pipeline promise) is owned by the `runway` orchestrator, not by this skill. Do not output any `<promise>` tags from this skill.

**Artifacts for downstream stages:** The saved QA report is an input to the orchestrator's completion and Stage 8 retrospective flow; it is not a standalone completion signal by itself.

## Red Flags — Stop Immediately If:

- Modifying tests to make them pass (instead of fixing implementation)
- Skipping a verification target ("lint doesn't matter here")
- Claiming "environment issue" without evidence of what the environment issue is
- Using cached results from a previous run as evidence
- Re-running only the last failed target after code changes when the requested scope was broader

## Additional Resources

- **`references/command-reference.md`** — Common test/build/lint commands by language/framework
