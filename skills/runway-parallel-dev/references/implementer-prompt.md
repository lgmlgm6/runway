# Implementer Subagent Prompt Template

Use this template when dispatching an implementer subagent for a task.

## Dispatch Rule — subagent_type is MANDATORY

**Always** specify `subagent_type: "general-purpose"` explicitly. Never omit it.
If omitted, the runtime may select an inappropriate agent type (e.g., gsd-executor)
based on semantic similarity, causing incorrect behavior.

Correct dispatch pattern:
```
Agent({
  description: "Implement Task {N}.{M}: {task name}",
  subagent_type: "general-purpose",   // ← ALWAYS explicit, NEVER omit
  name: "task-{wave}-{num}",
  prompt: "..."
})
```

## Write Tool Fallback

If the Write tool fails with `InputValidationError` (context pressure symptom):
1. Do NOT retry Write tool more than once
2. Immediately fall back to:
   ```bash
   python3 -c "
   content = '''...file content...'''
   with open('{path}', 'w') as f:
       f.write(content)
   "
   ```
3. If content is too large for python3 -c, use chunked append:
   ```bash
   mkdir -p .runway/tmp
   printf '%s\n' 'chunk1' > .runway/tmp/file.tmp
   printf '%s\n' 'chunk2' >> .runway/tmp/file.tmp
   mv .runway/tmp/file.tmp {path}
   ```

---

```
Task tool (general-purpose):
  description: "Implement Task {N}.{M}: {task name}"
  subagent_type: "general-purpose"
  prompt: |
    You are implementing Task {N}.{M}: {task name}

    ## Task Description

    {FULL TEXT of task from plan — paste completely, do not make the subagent read the plan file}

    ## Context

    - Wave: {wave number}
    - Previous completed work: {what earlier waves established}
    - Architectural context: {relevant design constraints}
    - Task start SHA: {task-start-sha}

    ## Known Project Pitfalls

    {KNOWLEDGE_S5 — paste output of `knowledge-read --inject-into-stage 5 --format prompt` here; omit this section entirely if empty}

    ## Relevant Files

    {List files this task touches or depends on, with current content or key excerpts}

    ## Working Directory

    {directory}

    ## Your Job

    1. Implement exactly what the task specifies
    2. Self-review
    3. Commit:
       ```bash
       git add {files}
       git commit -m "{type}: {description}"
       ```
    4. Report back using the required status format

    ## Status Rules

    Use exactly one of these statuses:

    - **DONE** — task is complete; include changed files and commit SHA
    - **DONE_WITH_CONCERNS** — task is complete, but you have explicit concerns; include DONE fields plus the concerns and impacted files
    - **NEEDS_CONTEXT** — required context was missing; include exact missing context, why it is required, and what you already tried
    - **BLOCKED** — you cannot proceed; include blocker, attempted probes, dependency impact, and recommended next step

    Do not invent a new status.

    ## Escalation Rules

    STOP and return NEEDS_CONTEXT or BLOCKED when:
    - the task requires architectural decisions with multiple valid approaches;
    - the provided files are insufficient to understand a dependency;
    - the plan appears internally inconsistent;
    - you discover overlap with another same-wave task's primary file or a shared contract changed unexpectedly.

    ## Self-Review

    Before reporting back, verify:
    - completeness against the task text;
    - no overbuild or speculative functionality;
    - changed files match the task;
    - tests verify behavior, not just implementation details;
    - existing code patterns were followed.

    ## Required Report Format

    - **Status:** DONE | DONE_WITH_CONCERNS | NEEDS_CONTEXT | BLOCKED
    - **What you implemented:** {1-5 bullets}
    - **Files changed:** {paths}
    - **Commit SHA:** {sha or `none` if not committed}
    - **Concerns / blocker / missing context:** {only what matches the chosen status}
```