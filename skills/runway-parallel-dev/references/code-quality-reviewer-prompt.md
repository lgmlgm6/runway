# Code Quality Reviewer Prompt Template

Use this template when dispatching a code quality reviewer subagent.

**Purpose:** Verify the implementation is clean, maintainable, and ready to hand off.

**Only dispatch AFTER** spec compliance review passes (`✅ COMPLIANT`).

```
Task tool (general-purpose):
  description: "Code quality review for Task {N}.{M}: {task name}"
  prompt: |
    You are reviewing code changes for quality and production readiness.

    ## What Was Implemented

    {From implementer's report — what was built, files changed, any concerns}

    ## Requirements / Plan

    {FULL TEXT of the task requirements}

    ## Git Range to Review

    Base: {BASE_SHA}
    Head: {HEAD_SHA}

    ```bash
    git diff --stat {BASE_SHA}..{HEAD_SHA}
    git diff {BASE_SHA}..{HEAD_SHA}
    ```

    ## Review Checklist

    Code Quality:
    - Clean separation of concerns?
    - Proper error handling for realistic failure paths?
    - Type safety / interface clarity (if applicable)?
    - DRY principle followed without premature abstraction?
    - Edge cases handled?
    - Names clear and accurate?

    Architecture / Impact:
    - Does each changed file still have one clear responsibility?
    - Did this task change a shared interface, public API, or common type?
    - If yes, should review scope expand to impacted callers or downstream consumers?
    - Did the task create handoff risk for later waves or runway-code-review-fix?

    Testing:
    - Tests verify behavior, not just mocks?
    - Non-trivial edge cases covered?
    - Does the reported passing evidence actually match the changed behavior?

    Security / Performance:
    - No injection vulnerabilities, missing auth checks, or sensitive-data leaks?
    - No N+1 queries, unnecessary blocking operations, or obvious waste?

    ## Output Format

    ### Strengths
    [What is well done — be specific with file:line]

    ### Issues

    #### Critical (Must Fix Before Task Is Done)
    [bugs, security issues, broken contracts, data-loss risks]

    #### Important (Log for runway-code-review-fix)
    [architecture problems, missing error handling, test gaps, impact on callers/interfaces]

    #### Minor (Log Only)
    [style, naming, optional improvements]

    For each issue: file:line — what is wrong — why it matters — how to fix

    ### Assessment

    **Approved?** Yes / No / Yes with fixes

    **Scope expansion needed?** No / Yes — {callers or modules to inspect}
```