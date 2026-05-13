# Plan Self-Review Checklist

Run this checklist after writing the plan, before presenting it to the user.

## Coverage

- [ ] Every feature in the tech spec has at least one task
- [ ] Every acceptance criterion from the requirements spec is covered
- [ ] Every task has at least one explicit test step
- [ ] Shared interfaces and data model changes appear in at least one task

## Zero Placeholder Scan

Search for these strings — if found, replace with real content before proceeding:

- `TBD`, `TODO`, `FIXME`
- `implement`, `implement here`, `implementation goes here`
- `placeholder`, `your code here`
- `待实现`, `后续`, `暂时`
- `...` (as code content, not as prose)

## File Path Validity

- [ ] Every file path listed as existing was verified to exist in the codebase
- [ ] Every file listed as new is clearly marked as new
- [ ] No guessed directory names or assumed paths remain
- [ ] Primary files and touched files are both listed for every task

## Dependency Validity

- [ ] Every task has an explicit `Depends on` value (`none` is explicit)
- [ ] Dependencies are acyclic
- [ ] Cross-wave dependencies are stated wherever later work needs earlier outputs
- [ ] No task depends on work that is only implied in prose

## Wave Validity

### Automated Conflict Check (run before manual review)

For each wave, collect all primary files and verify uniqueness:

```
Wave N tasks:
  Task N.1 primary file: {path}
  Task N.2 primary file: {path}
  Task N.3 primary file: {path}
  Duplicates found: {none | list conflicting paths}
```

If duplicates found → split conflicting tasks into separate sequential waves before proceeding.
See `dependency-verification.md` (Wave Conflict Detection section) for the full fix procedure.

### Manual Wave Checks

For each wave, verify that no two tasks in the same wave:
- [ ] Modify the same primary file (auto-checked above — must show "none")
- [ ] Modify the same shared contract/interface file unless explicitly proven conflict-free
- [ ] Have a logical dependency (task B needs task A's output)
- [ ] Depend on a blocked task from an earlier wave

## Integration Verification

- [ ] Every wave has an integration verification block
- [ ] Each integration verification uses an exact command
- [ ] Each integration verification states what success looks like
- [ ] Integration checks validate how tasks in the wave work together, not just isolated unit behavior

## Step Completeness

For each task step, verify:
- [ ] Code blocks contain complete, runnable code (no `// ...` gaps)
- [ ] Run commands are exact (no `<your command here>`)
- [ ] Expected outputs are specific (not just `should pass`)
- [ ] Commit messages follow the project's convention

## TDD Compliance

For each feature task:
- [ ] Step 1 writes a test (not implementation)
- [ ] Step 2 explicitly runs and verifies failure
- [ ] Failure message is the right failure, not a syntax/import/setup error
- [ ] Implementation comes only after confirmed failure

## Ready-for-Execution Gate

- [ ] The plan is executable by someone with zero prior project context
- [ ] Same-wave conflict guards are explicit
- [ ] The plan gives runway-parallel-dev enough detail to dispatch isolated subagents without reading the plan file again
