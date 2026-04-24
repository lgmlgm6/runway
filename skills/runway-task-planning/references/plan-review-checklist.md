# Plan Self-Review Checklist

Run this checklist after writing the plan, before presenting it to the user.

## Coverage

- [ ] Every feature in the tech spec has at least one task
- [ ] Every acceptance criterion from the requirements spec is covered
- [ ] Every task has at least one explicit test step
- [ ] Shared interfaces and data model changes appear in at least one task

## Stage 2 → Stage 3 Handoff Coverage

- [ ] `二、详细设计` 的每个模块均已被任务覆盖或写明原因
- [ ] `三、接口协议变更` 的每个契约变化均已落到任务
- [ ] `四、基础设施设计` 的每个涉及项均已处置
- [ ] `五、验证策略` 的关键风险均映射到测试 / 集成验证
- [ ] `六、待决策项` 的每项均已有处置分类
- [ ] 不允许只在 prose 中“提到会处理”，但没有对应任务 / Wave / blocker

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

## TC Coverage (when AC table exists)

If `.runway/tmp/tc-list.md` was generated in Step 1.5:
- [ ] 每个任务包含 TC 覆盖清单，TC 编号可追溯到 AC 编号
- [ ] TC 清单里的每条 TC 在 Step 1 都有对应的独立测试方法
- [ ] 测试方法名包含 TC 编号（如 `TC01a_whenXxx_thenYyy`）
- [ ] 没有用单个测试方法覆盖多条 TC
- [ ] P0 TC 全部有对应测试，不允许遗漏

## Ready-for-Execution Gate

- [ ] The plan is executable by someone with zero prior project context
- [ ] Same-wave conflict guards are explicit
- [ ] The plan gives runway-parallel-dev enough detail to dispatch isolated subagents without reading the plan file again
