# Code Review Subagent Prompt Templates

Three specialized reviewers are dispatched in parallel. Each receives the same branch diff plus a different review focus.

Common inputs to fill before dispatch:
- `{feature name}`
- `{requirements spec summary}`
- `{base branch}`
- `{BASE_SHA}`
- `{HEAD_SHA}`
- `{review scope note}`

## Shared reviewer instructions

Give every reviewer these ground rules:
- Review `git diff {BASE_SHA}..{HEAD_SHA}`, not just the latest commit.
- Use `{base branch}` in the report so the branch context is explicit.
- If two findings are the same underlying problem, reuse the same `Issue Key` so aggregation can dedupe them.
- Tag every issue `Critical`, `Important`, or `Minor`.
- If the correct review scope expands beyond touched files, say why.

Suggested issue key format:

```text
LOGIC-001
SEC-001
QUAL-001
```

---

## Reviewer 1: Functional & Logic

```text
Task tool (general-purpose):
  description: "Functional & logic review: {feature name}"
  prompt: |
    You are reviewing code changes for functional correctness and logic quality.

    ## Feature / Requirements Context

    Feature: {feature name}

    Acceptance Criteria (from requirements spec):
    {AC table: AC编号 | Given | When | Then | 覆盖需求 | 优先级}

    Test Cases (from execution plan tc-list.md):
    {TC list: TC编号 | AC编号 | Given | When | Then | 优先级 | 归属任务}

    Interface contracts (from tech spec 三、接口协议变更):
    {paste 三、接口协议变更 section — new/modified/deleted fields, request/response structure, compatibility notes}

    Verification strategy (from tech spec 五、验证策略):
    {paste 五、验证策略 section — key risks, required test scenarios, fallback/degradation requirements}

    ## Git Range

    Base branch: {base branch}
    Base SHA: {BASE_SHA}
    Head SHA: {HEAD_SHA}

    ```bash
    git diff --stat {BASE_SHA}..{HEAD_SHA}
    git diff {BASE_SHA}..{HEAD_SHA}
    ```

    ## Review focus

    Requirements coverage:
    - For each P0 AC: is there a corresponding test method (method name contains TC编号)?
    - Does each test's assertion actually verify the AC's Then condition — not just "no exception thrown"?
    - Any AC with zero corresponding tests? → Critical
    - Any test that mocks all dependencies but has no meaningful assertion? → Important
    - Does the implementation cover all functional requirements beyond the AC table?

    Logic correctness:
    - Are branches and state transitions correct?
    - Are off-by-one or boundary errors possible?
    - Is behavior safe under concurrency or partial failure?

    Edge cases:
    - Empty input / null / undefined
    - Maximum values / overflow
    - Partial failure in multi-step flows
    - Concurrent modification or repeated submission

    Test adequacy:
    - Is the happy path tested?
    - Are failure paths tested?
    - Are edge cases covered?
    - Do tests assert behavior, not implementation details?

    ## Output format

    For each finding provide:
    - Issue Key: {e.g. LOGIC-001}
    - Severity: Critical | Important | Minor
    - file:line
    - What is wrong
    - Why it matters
    - How to fix
    - Duplicate of: {issue key or `none`}

    ### Scope expansion
    - No / Yes — {which callers, flows, or modules also need review}

    ### Assessment
    - {1-2 sentences on overall functional correctness}
```

---

## Reviewer 2: Security

```text
Task tool (general-purpose):
  description: "Security review: {feature name}"
  prompt: |
    You are reviewing code changes for security vulnerabilities.

    ## Feature Context

    Feature: {feature name}
    Requirements summary:
    {requirements spec summary}

    ## Git Range

    Base branch: {base branch}
    Base SHA: {BASE_SHA}
    Head SHA: {HEAD_SHA}

    ```bash
    git diff --stat {BASE_SHA}..{HEAD_SHA}
    git diff {BASE_SHA}..{HEAD_SHA}
    ```

    ## Review focus

    Injection:
    - Any SQL injection, command injection, path traversal, or XSS vectors?
    - Are external inputs validated or encoded at system boundaries?

    Authentication & authorization:
    - Are all protected flows gated correctly?
    - Can a user access another user's data or actions?

    Sensitive data:
    - Are passwords, tokens, secrets, or PII exposed in logs, errors, or storage?

    Security misconfiguration / dependencies:
    - Any unsafe defaults, debug behavior, or missing permission checks?
    - Do new dependencies introduce known risk or weak pinning?

    ## Output format

    For each finding provide:
    - Issue Key: {e.g. SEC-001}
    - Severity: Critical | Important | Minor
    - file:line
    - Vulnerability or weakness
    - Impact
    - How to fix
    - Duplicate of: {issue key or `none`}

    ### Scope expansion
    - No / Yes — {which auth paths, endpoints, or shared security helpers need review}

    ### Assessment
    - {1-2 sentences on overall security posture}
```

---

## Reviewer 3: Code Quality

```text
Task tool (general-purpose):
  description: "Code quality review: {feature name}"
  prompt: |
    You are reviewing code changes for quality, maintainability, and production readiness.

    ## Feature / Plan Context

    Feature: {feature name}
    Requirements summary:
    {requirements spec summary}
    Review scope note:
    {review scope note}

    ## Git Range

    Base branch: {base branch}
    Base SHA: {BASE_SHA}
    Head SHA: {HEAD_SHA}

    ```bash
    git diff --stat {BASE_SHA}..{HEAD_SHA}
    git diff {BASE_SHA}..{HEAD_SHA}
    ```

    ## Review focus

    Code quality:
    - Clean separation of concerns?
    - Error handling consistent with the codebase?
    - Names clear and accurate?
    - DRY without over-abstraction?

    Architecture / scope:
    - Did this change modify a shared interface, public API, or common type?
    - If yes, does the review need to expand to impacted callers or downstream modules?
    - Did the implementation add functionality with no current usage in the codebase (YAGNI)?

    Testing / operability:
    - Are tests meaningful and aligned to behavior?
    - Are observability, rollout, or rollback concerns introduced by the code changes?

    Performance:
    - Any N+1 patterns, avoidable repeated work, or blocking calls in hot paths?

    ## Output format

    ### Strengths
    - {file:line — concrete strength}

    ### Findings

    For each finding provide:
    - Issue Key: {e.g. QUAL-001}
    - Severity: Critical | Important | Minor
    - file:line
    - What is wrong
    - Why it matters
    - How to fix
    - Duplicate of: {issue key or `none`}

    ### Scope expansion
    - No / Yes — {which callers, shared types, or contracts need wider review}

    ### Assessment
    - Ready to merge? Yes / No / With fixes
    - Reasoning: {1-2 sentences}
```
