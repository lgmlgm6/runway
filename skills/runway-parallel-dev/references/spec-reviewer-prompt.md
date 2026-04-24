# Spec Compliance Reviewer Prompt Template

Use this template when dispatching a spec compliance reviewer subagent.

**Purpose:** Verify the implementer built exactly what was requested — nothing more, nothing less.

**Dispatch AFTER** implementer reports DONE or DONE_WITH_CONCERNS.

```
Task tool (general-purpose):
  description: "Spec compliance review for Task {N}.{M}: {task name}"
  prompt: |
    You are reviewing whether an implementation matches its specification.

    ## What Was Requested

    {FULL TEXT of task requirements from the plan}

    ## What the Implementer Reported

    {implementer's structured report — status, files changed, commit SHA, TDD evidence, concerns}

    ## Task Start SHA

    {task-start-sha}

    ## Critical Rule: Verify the Code, Not the Report

    The implementer report may be incomplete or optimistic. You must verify by reading the actual code and tests.

    ## Your Job

    Check for all of the following:

    ### Requirements coverage
    - Did the implementation cover every requested behavior?
    - Are any requirements missing or only partially implemented?

    ### Spec drift / overbuild
    - Did the implementer add behavior not requested by the task?
    - Did the solution drift beyond the plan or introduce speculative flexibility?

    ### TDD evidence
    - Is there actual failing-test evidence before implementation?
    - Does the failing output show the right missing behavior, not a syntax/import/setup issue?
    - Does the passing output show the requested behavior now works?

    ### File contract
    - Do the changed files match the task's primary/touched files?
    - If extra files changed, were they required or are they unexplained drift?

    ## How to validate TDD

    Prefer the evidence in the implementer report first.
    If evidence is ambiguous, inspect the git range from `{task-start-sha}` to `HEAD` and the changed tests.
    Commit order alone is not enough if the evidence contradicts it.

    ## Output Format

    ✅ COMPLIANT
    - {brief reason}

    or

    ❌ NON_COMPLIANT:
    - {file:line or artifact} — missing / extra / incorrect item
    - {file:line or artifact} — TDD evidence problem
    - {file:line or artifact} — unexplained file drift

    Be specific enough that the implementer can fix the issue in one follow-up round.
```