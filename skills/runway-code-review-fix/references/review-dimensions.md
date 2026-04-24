# Review Dimensions

Use this reference to decide what each reviewer must inspect and when review scope must expand beyond the files directly touched in the diff.

## Default scope

Start with the changed files in `git diff {BASE_SHA}..{HEAD_SHA}`.

## Expand review scope when any of these are true

- a shared interface, public API, or common type changed;
- auth or permission behavior changed;
- a module has multiple callers or downstream consumers;
- a migration, data contract, or serialization format changed;
- the fix changed error semantics that callers may rely on.

If scope expands, reviewers should name the additional callers/modules to inspect.

---

## Reviewer 1: Functional & Logic

### Requirements Coverage
- Does the implementation cover all functional requirements from the spec?
- Are acceptance criteria testable from the current code?
- Did any fix accidentally remove or weaken existing required behavior?

### Logic Correctness
- Are conditional branches correct?
- Are boundary conditions handled?
- Is state mutation safe under concurrent access or retries?
- Does partial failure leave the system in a bad intermediate state?

### Edge Cases
- Empty input / null / undefined
- Maximum values / overflow
- Concurrent modification / duplicate submission
- Partial failure across multi-step flows

### Test Adequacy
- Is the happy path tested?
- Are failure paths tested?
- Are the edge cases above covered?
- Do tests assert behavior rather than implementation details?

---

## Reviewer 2: Security

### OWASP-aligned checks
- **Injection:** external input in queries, commands, HTML, or paths
- **Broken auth / access control:** missing permission checks, cross-tenant leakage
- **Sensitive data exposure:** secrets, tokens, PII in logs, responses, or storage
- **Security misconfiguration:** unsafe defaults, debug behavior, weak environment assumptions

### Dependency / configuration checks
- Any new dependency with known risk?
- Are versions pinned or otherwise controlled by the project?
- Did the change expand the attack surface through new endpoints, jobs, or integration paths?

### Scope expansion examples
- shared auth middleware changed;
- common request parsing / sanitization helper changed;
- a secret-handling or logging utility changed.

---

## Reviewer 3: Code Quality

### Naming
- Do names express intent without extra explanation?
- Are names aligned with actual behavior, not aspirational behavior?

### Single Responsibility
- Does each function/class/module do one thing?
- Did this change create oversized files or mix unrelated concerns?

### DRY / simplicity
- Is there duplication worth removing now?
- Did the implementation add abstraction with no present need?

### Error Handling Consistency
- Are errors handled at the correct boundary?
- Do error messages include enough debugging context without leaking secrets?
- Did the change alter failure semantics that other modules depend on?

### Performance / production readiness
- Any N+1 query patterns?
- Any avoidable repeated work or unnecessary loops?
- Any blocking or heavyweight work on hot paths?
- Any observability or rollout gap introduced by the change?

### Scope expansion examples
- shared types or DTOs changed;
- public helper contracts changed;
- config behavior changed across multiple packages/modules.
