# Review Criteria

## Phase 1: Spec Compliance

### What to check

| Check | Pass condition |
|-------|----------------|
| All requirements implemented | Every item in the task requirements has corresponding code |
| No overbuild | No speculative or out-of-scope behavior was added |
| TDD evidence | Failing and passing outputs are both present and believable |
| File paths | Changed files match the task's primary/touched files, or any extra files are justified |

### How to verify TDD

Use the evidence in the implementer report first.
If the evidence is unclear, inspect the changed tests and git range from `{task-start-sha}` to `HEAD`.
Do not rely on commit order alone when actual output is available.

### NON_COMPLIANT response format

```text
NON_COMPLIANT:
- Missing: {requirement from task}
- Extra: {unrequested behavior or file drift}
- TDD evidence problem: {why the red/green proof is insufficient}
```

## Phase 2: Code Quality

### Severity definitions

**Critical** — must fix before the task is done:
- Logic error that causes incorrect behavior
- Security vulnerability (injection, missing auth check, exposed secrets)
- Data loss risk
- Broken shared contract or interface that invalidates dependent work

**Important** — log for `runway-code-review-fix` and usually fix in the next branch-level round:
- Missing error handling for realistic failure cases
- Obvious performance issue (N+1 query, avoidable expensive loop)
- Missing test for a non-trivial edge case
- Interface or caller impact that requires wider re-review
- Concern explicitly raised by an implementer in `DONE_WITH_CONCERNS`

**Minor** — log only:
- Naming could be clearer
- Code style inconsistency
- Small duplication or cleanup idea that is not correctness-critical

### Handoff expectations

When a task finishes review, the execution report should be able to capture:
- task status;
- changed files;
- commit SHA;
- TDD evidence summary;
- Important issues;
- Minor issues;
- any spec deviation or concern.
