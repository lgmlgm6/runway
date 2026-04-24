# TDD Enforcement Guide

## The Iron Rule

No production code without a prior failing test. This is mandatory.

The test must:
1. Be written **before** the implementation
2. Be **run** and confirmed to fail with actual output captured
3. Fail for the **right reason** (missing behavior), not because of syntax, import, or environment problems
4. Be re-run after implementation and shown to pass

Only then is the task eligible for review.

## Evidence-Backed Validation

Strong evidence of TDD includes:
- the exact failing test command;
- the actual failing output snippet;
- the exact passing test command;
- the actual passing output snippet.

Commit order can support the conclusion, but it does not replace evidence.

## Minimal TDD flow

```text
write failing test
→ run test and capture failure
→ verify failure reason is correct
→ implement minimum code
→ run test and capture pass
```

## What counts as confirmed failure

Good evidence:

```text
FAILED tests/test_user.py::test_create_user - AssertionError: Expected 201, got 404
```

Bad evidence:
- "I ran the test and it failed as expected"
- "The test should fail here"
- output showing import error, syntax error, or missing environment setup unrelated to the requested behavior

## If the first test unexpectedly passes

Stop and investigate. One of these is probably true:
- the feature already exists;
- the test is checking the wrong thing;
- the environment is not exercising the changed path.

Do not continue until the red phase proves the intended behavior is currently missing.

## Common rationalizations — all invalid

**"This code is too simple to need a test first."**
Reality: simple code is where TDD is cheapest and fastest.

**"I need the implementation shape before I can write the test."**
Reality: the test defines the interface and expected behavior.

**"This is hard to test."**
Reality: hard-to-test code is a design signal, not a TDD exemption.

**"I'll write the tests after to save time."**
Reality: that is test-after-development, not TDD.

**"There is already coverage from another task."**
Reality: new behavior needs new proof.

## Handling TDD violations

If review finds TDD was skipped or the evidence is weak:

1. Send the task back with a specific explanation of what evidence is missing.
2. Require a fresh red phase and green phase for the task.
3. If the implementer resists twice, escalate to the main agent with the exact rationalization used.

Do not accept a vague promise to "add the test now" as a substitute for real evidence.
