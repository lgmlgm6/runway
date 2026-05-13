# Subagent Task Package Guide

## Principle: Complete Isolation

Each subagent starts with zero knowledge of the session. The task package must contain everything needed to complete the task without reading the plan file or the wider conversation.

## Required Elements

### 1. Task identity
- Task name and number
- Wave number
- Exact primary file and touched files
- Task start SHA if review will inspect the git range later

### 2. Complete steps
Copy the exact task text from the plan. Do **not** paraphrase or summarize it.

### 3. Codebase context
Include only what the task needs:
- contents or excerpts of interfaces, types, and base classes it depends on;
- existing tests in the same area for style reference;
- configuration or command details needed to run tests;
- any upstream wave outputs the task relies on.

Do **not** include:
- the entire codebase;
- unrelated files;
- long conversation history.

### 5. Conflict awareness
Tell the subagent when a same-wave conflict would be a blocker.
If the task depends on a shared contract that changed unexpectedly, instruct it to return `BLOCKED` or `NEEDS_CONTEXT` instead of guessing.

### 6. Reply format
Always specify the exact reply format, including the allowed statuses:
`DONE`, `DONE_WITH_CONCERNS`, `NEEDS_CONTEXT`, `BLOCKED`.

## Common mistakes

**Too little context**
```text
Implement the UserService.create() method.
```

**Too much context**
```text
Here is the entire codebase... [50k tokens]
```

**Right amount**
```text
Here is the UserService interface (user-service.ts lines 1-40):
{content}

Here is an existing test for reference (user.test.ts):
{content}
```

## Handling NEEDS_CONTEXT

When a subagent returns `NEEDS_CONTEXT`:
1. Read exactly what it says is missing.
2. Find that information in the codebase.
3. Add only the missing context to the task package.
4. Re-dispatch.
5. After 2 retries, escalate to `BLOCKED`.

## Handoff quality standard

A good task package should let the implementer finish and let the reviewers verify the task without needing extra plan lookups.
If the reviewers cannot tell what changed, why it changed, or whether TDD was followed, the package was incomplete.
