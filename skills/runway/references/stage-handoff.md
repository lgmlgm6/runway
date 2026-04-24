# Stage Handoff Reference

This document defines the minimum artifacts required to move from one stage to the next and what becomes invalid when upstream artifacts change.

## Workflow state anchor

Use the canonical checkpoint as the cross-stage source of truth:

```text
.runway/checkpoint-{ones_work_item_id}.json
```

Use loop-state files only for active ownership / resume mechanics:

```text
.claude/runway-state/triangle-loop.local.md
.claude/runway-state/pipeline.local.md
```

- `triangle-loop.local.md` records Stage 2 design-loop ownership so Runway can resume cleanly after an interruption; it should not block user exit.
- `pipeline.local.md` records the Stage 4-7 auto-running pipeline loop; the Stop hook protects this loop from accidental exit.

At each handoff, update the checkpoint with:
- current stage;
- confirmed artifact IDs / paths;
- branch / SHA fields if they changed;
- invalidated artifacts or generated docs, if any.

---

## Stage 1 → Stage 2: runway-prd-analysis → runway-tech-design

| Item | Source | Used by |
|------|--------|---------|
| `requirements_spec_contentId` | citadel createDocument return value | runway-tech-design input |
| requirements spec markdown | runway-prd-analysis output | runway-tech-design context |
| `Confirmed / Assumed / Open` sections | requirements spec | design constraints and open decisions |
| ambiguity summary | runway-prd-analysis output | runway-tech-design risk interpretation |

Handoff check: the user explicitly confirmed the requirements spec.

If the requirements spec changes later, invalidate:
- tech spec;
- task plan;
- branch execution state;
- execution report;
- code review report;
- QA evidence.

---

## Stage 2 → Stage 3: runway-tech-design → runway-task-planning

| Item | Source | Used by |
|------|--------|---------|
| `tech_spec_contentId` | citadel createDocument return value | runway-task-planning input |
| tech spec markdown | runway-tech-design output | runway-task-planning context |
| `二、详细设计` | tech spec | module-to-task mapping |
| `三、接口协议变更` | tech spec | contract-first task decomposition |
| `四、基础设施设计` | tech spec | infra tasks, prerequisites, and explicit non-task reasons |
| `五、验证策略` | tech spec | task-level tests and wave integration verification |
| `六、待决策项` | tech spec | resolved items, Wave 0 prerequisites, blockers, or accepted risks |
| rollout / observability / rollback / risk sections | tech spec | planning constraints |

Handoff check: the user explicitly approved the tech spec.

If the tech spec changes later, invalidate:
- task plan;
- branch execution state;
- execution report;
- code review report;
- QA evidence.

---

## Stage 3 → Stage 4: runway-task-planning → ee-ones branch

| Item | Source | Used by |
|------|--------|---------|
| `plan_path` | `.runway/plans/{date}-{feature}.md` | runway-parallel-dev input |
| wave summary | runway-task-planning output | execution ordering |
| task dependency graph | plan | wave gating |
| per-wave integration commands | plan | execution validation |

Handoff check: the plan file exists, wave assignments are resolved, and the orchestrator can auto-advance to branch creation.

If the plan changes later, invalidate:
- branch execution state;
- execution report;
- code review report;
- QA evidence.

---

## Stage 4 → Stage 5: ee-ones branch → runway-parallel-dev

| Item | Source | Used by |
|------|--------|---------|
| `branch_name` | ones branch creation output | runway-parallel-dev, runway-code-review-fix |
| `BASE_SHA` | `git rev-parse HEAD` before development starts | runway-parallel-dev baseline, runway-code-review-fix |
| `plan_path` | Stage 3 | runway-parallel-dev input |
| work item status = `开发中` | ones update output | workflow tracking |

Handoff check: branch exists and is checked out locally.

---

## Stage 5 → Stage 6: runway-parallel-dev → runway-code-review-fix

| Item | Source | Used by |
|------|--------|---------|
| `branch_name` | Stage 4 / execution report | runway-code-review-fix |
| `BASE_SHA` | Stage 4 | review baseline |
| `HEAD_SHA` | `git rev-parse HEAD` after runway-parallel-dev | review scope |
| changed files across completed tasks | execution report | reviewer focus and impact analysis |
| `DONE_WITH_CONCERNS` notes | execution report | review priority |
| Important issues list | execution report | severity-driven fixes |
| spec deviations | execution report | review context |
| test evidence summary | execution report | TDD / delivery confidence |
| blocked-task summary | execution report | user escalation context |

Handoff check: all executable waves complete; any BLOCKED tasks are explicitly recorded with dependency impact.

If code changes after the execution report is produced, invalidate the execution report and re-run the Stage 5 → 6 handoff packaging before continuing.

---

## Stage 6 → Stage 7: runway-code-review-fix → runway-qa-verify

| Item | Source | Used by |
|------|--------|---------|
| updated `HEAD_SHA` | `git rev-parse HEAD` after CR fixes | runway-qa-verify target SHA |
| review report | runway-code-review-fix output | runway-qa-verify context |
| fixed issue summary | review report | verification focus |
| rejected suggestions with reasons | review report | audit trail |
| remaining minor issues | review report | known follow-ups |
| base branch / merge-base context | review report | reproducible branch scope |

Handoff check: no Critical or Important issues remain in the review report.

If code changes after the review report is produced, invalidate the stale review report and re-run runway-code-review-fix before QA.

---

## Stage 7 → Complete

| Item | Source | Used by |
|------|--------|---------|
| evidence summary | runway-qa-verify output | completion announcement |
| passing SHA | `git rev-parse HEAD` | final branch state |
| exact commands + logs | runway-qa-verify evidence | audit trail |
| rounds run / stop condition | runway-qa-verify output | confidence summary |

Handoff check: runway-qa-verify evidence summary shows all selected targets passed on the current HEAD.

If code changes after QA evidence is collected, invalidate the stale QA evidence and re-run runway-qa-verify.

---

## Resume rule

When the user says "continue" after a pause:
1. read the workflow state file;
2. confirm the current stage and latest confirmed artifact;
3. check whether any upstream artifact changed;
4. resume from the current stage only if downstream artifacts are still valid;
5. otherwise resume from the earliest invalidated stage.
