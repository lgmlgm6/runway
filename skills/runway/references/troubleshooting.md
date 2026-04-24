# Troubleshooting Guide

Use this guide when the workflow stalls, a stage output becomes stale, or the environment/tooling prevents clean progress.

## Cross-stage issues

### Workflow state file is stale or inconsistent
- Rebuild state from the latest confirmed artifacts, not from guesswork.
- Repair `.runway/checkpoint-{ones_work_item_id}.json` first; treat `.claude/runway-state/*.md` as loop-control state, not artifact truth.
- Only the Stage 4-7 pipeline loop should trigger Stop-hook exit protection; Stage 2 triangle state is resume metadata only.
- Resume from the earliest stage whose output is no longer trustworthy.

### Upstream artifact changed after a hard gate
- Record exactly which artifact changed.
- Mark all downstream derived artifacts invalid.
- Tell the user which stages must be rerun.
- Resume from the earliest invalidated stage, not from Stage 1 by default.

### Tooling / hook misrouting
- If a tool or hook keeps forcing the wrong mode (for example review-only work routed into planning), stop and restate the intended stage.
- Prefer fixing the stage routing or state file rather than pushing through the wrong workflow.
- If local hooks block normal progress and you cannot adapt safely, ask the user to check the hook configuration.

---

## Stage 1: runway-prd-analysis

**citadel getMarkdown fails / auth error**
```bash
oa-skills citadel --clear-cache --mis <mis>
# Then retry the command
```

**PRD content is empty or garbled**
- Check if the document is a xuecheng 2.0 collabpage (`km.sankuai.com/collabpage/...`).
- If the document requires special permissions, ask the user to share a readable link.

**Ambiguity remains above threshold after max rounds**
- Do not silently force the workflow forward.
- Present the current `Confirmed / Assumed / Open` split to the user.
- Pause for a human decision on whether to proceed with recorded open questions.

---

## Stage 2: runway-tech-design

**Wrong admission level selected**
- If the work is routine and localized, downgrade to Level 0 instead of forcing Architect/Critic review.
- If contract changes, architectural uncertainty, or meaningful rollout risk appear during drafting, escalate to Level 1 or Level 2 and record why.
- Keep the lightest review level that still matches the real design risk.

**Level 2 review not converging within 2 cycles**
- Stop after the second cycle; do not manufacture more review rounds.
- Summarize the real disagreements and unresolved risks.
- Record unresolved items in `Open Decisions` and `Risk Register`.
- Ask the user to make the decision if the disagreement still blocks architecture.

**Deliberate mode trigger is fuzzy**
- Record whether the trigger was observed, inferred, or user-confirmed.
- If you cannot explain why deliberate mode is active, do not claim it is required.

**Deliberate mode / review path mismatch**
- Deliberate mode and Level 2 are related but not identical.
- Use deliberate mode for high-risk rollout/test rigor; use Level 2 only when the design itself needs Architect → Critic scrutiny.
- If the user explicitly overrides the level selection, record that override and keep any non-negotiable rollout / rollback / observability notes already discovered.

---

## Stage 3: runway-task-planning

**File paths do not exist in the codebase**
- Stop and correct the file map before writing tasks.
- Never guess paths; wrong paths make subagent packages fail downstream.

**Wave conflicts discovered during planning**
- Move the conflicting tasks into different waves or refactor the task boundaries.
- No same-wave tasks may share a primary file.
- Shared interface changes should default to serial waves unless proven safe.

**Plan grows too large or vague**
- Split into clearer waves or narrower tasks.
- Do not hide complexity inside a single oversized task block.

---

## Stage 4: ee-ones branch

**ones auth fails**
```bash
ones sso login --ciba
# Confirm on Daxiang app, then retry
```

**ones work item not found**
```bash
ones workitem-detail -i <id>
# Verify the ID is correct and user has access
```

**Branch already exists**
```bash
git checkout <existing-branch>
# Then decide whether to reuse it or create a new linked branch
```

---

## Stage 5: runway-parallel-dev

**Subagent returns `BLOCKED`**
- Surface the blocker immediately.
- Continue other same-wave tasks that are independent.
- Do not start dependent waves until the blocker is resolved or explicitly bypassed.

**Stage 5 appears to stop at a non-blocking progress point**
- If Stage 5 appears to stop right after startup, tracker creation, a wave banner, or execution-report packaging, treat it as a contract bug — those moments are progress updates, not pause points.
- Re-check whether an allowed pause condition actually occurred: blocked dependency for the next wave, integration verification failure, or the configured critical-fix escalation limit.
- If none occurred, fix the stage contract instead of asking the user to type "继续".

**Subagent returns `NEEDS_CONTEXT` repeatedly**
- Supply only the missing context requested.
- After 2 retries, convert the task to `BLOCKED` and explain why the package is still insufficient.

**TDD violation detected**
- Require a fresh red phase and green phase with actual output.
- Do not accept a vague statement that the test was run.

**Wave conflict discovered during execution**
- Stop the conflicting tasks.
- Repair the plan or wave assignment before continuing.
- Do not let same-wave tasks keep editing the same primary file.

---

## Stage 6: runway-code-review-fix

**Base branch is unclear**
- Resolve the repo default branch or ask the user.
- Do not hard-code `main`.

**Same issue cluster appears 3 rounds in a row**
- Stop the loop.
- Present the canonical issue cluster, evidence, and attempted fixes.
- Ask the user how to proceed.

**Reviewer suggests adding features not in requirements**
- Apply YAGNI verification.
- If there is no current usage or requirement, reject with a clear reason.

**Duplicate findings flood the report**
- Cluster them under one issue key before deciding whether to fix or reject.
- Preserve the highest severity in the cluster.

---

## Stage 7: runway-qa-verify

**Verification command not found**
- Re-check project scripts, build files, and CI.
- If multiple plausible commands exist, choose the one actually used by the project rather than the shortest one.

**A target fails but the shell reports success**
- Check whether `set -o pipefail` was missing.
- Re-run with shell-safe exit handling before diagnosing the code.

**Same failure repeats three times**
- Stop and report the normalized failure signature.
- Include the diagnosis and attempted fixes.
- Do not keep looping on unchanged evidence.

**Build fails due to environment issue**
- Separate code problems from environment problems with evidence.
- Missing env vars, offline services, or unavailable credentials are environment issues.
- If the environment blocks verification, stop and tell the user exactly what is missing.
