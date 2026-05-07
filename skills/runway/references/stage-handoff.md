# Stage Handoff Reference

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
- branch / SHA fields if they changed.

Artifact invalidation is computed by `runway-tools artifacts-invalidate --artifact <name>`, which reads the manifest's invalidation map and returns `resume_from_stage`.

---

## Stage 2 → Stage 3: runway-tech-design → runway-task-planning

| Item | Source | Used by |
|------|--------|---------|
| `tech_spec_contentId` | citadel createDocument return value | runway-task-planning input |
| `二、详细设计` | tech spec | module-to-task mapping |
| `三、接口协议变更` | tech spec | contract-first task decomposition |
| `四、基础设施设计` | tech spec | infra tasks, prerequisites, and explicit non-task reasons |
| `五、验证策略` | tech spec | task-level tests and wave integration verification |
| `六、待决策项` | tech spec | resolved items, Wave 0 prerequisites, blockers, or accepted risks |

Handoff check: the user explicitly approved the tech spec.

---

## Resume rule

When the user says "continue" after a pause:
1. Read the workflow state file.
2. Confirm the current stage and latest confirmed artifact.
3. Run `artifacts-invalidate` if an upstream artifact may have changed.
4. Resume from `current_stage` only if downstream artifacts are still valid; otherwise resume from `resume_from_stage`.
