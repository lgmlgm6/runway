# Severity Classification Guide

## Critical — Fix before proceeding

Issues that cause incorrect behavior, data loss, or security vulnerabilities.

Examples:
- Logic error producing wrong output
- SQL injection / XSS vulnerability
- Missing auth check on sensitive endpoint
- Data written to wrong user's record
- Race condition causing data corruption

Action: Fix immediately. Do not mark review round complete until all Critical issues resolved.

---

## Important — Fix this round

Issues that degrade reliability, maintainability, or correctness in realistic scenarios.

Examples:
- Missing error handling for a failure mode that will occur in production
- Test missing for a non-trivial edge case
- N+1 query that will degrade at scale
- Function doing 3 unrelated things (needs split)
- Hardcoded value that should be configurable

Action: Fix in current round. Re-review after fixing.

---

## Minor — Log, optional fix

Issues that are real but don't affect correctness or reliability in the near term.

Examples:
- Variable name could be clearer
- Comment is outdated
- Minor code style inconsistency
- Small duplication (2 occurrences) that could be extracted
- Unused import

Action: Log in review report. Do not block completion.

---

## Not an Issue — Reject

Suggestions that should be pushed back.

Reject when:
- The suggestion is based on misunderstanding the codebase
- The suggested addition has no current usage (YAGNI)
- Implementing would break existing functionality
- The suggestion is out of scope for this change
- The current behavior is intentional and correct

Always provide a reason when rejecting.
