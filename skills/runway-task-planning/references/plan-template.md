# Implementation Plan Template

```markdown
# Implementation Plan: {Feature Name}

**Date:** {YYYY-MM-DD}
**Tech Spec:** {xuecheng link}
**Estimated Waves:** {N}
**Estimated Tasks:** {M}

---

## Pre-Plan Verification Results

### Field / Method / Class Existence Check

| Symbol | Type | Status | Location |
|--------|------|--------|----------|
| `{fieldName}` | field | CONFIRMED | `{File.java:line}` |
| `{methodName}` | method | CONFIRMED | `{File.java:line}` |
| `{ClassName}` | class | MISSING → Wave 0 task added | — |

All CONFIRMED items verified via `grep -rn` before writing tasks.
All MISSING items resolved as Wave 0 prerequisite tasks or accepted risks.

### Reused Method Dependency Analysis

> Fill for every "reuse existing method X" decision.

| Reused Method | Required Input Fields | New Code Populates? |
|---------------|----------------------|---------------------|
| `renderGoods(List<GoodsIndexBO>, ...)` | `goodsId` (line 412), `userId` (405), `categoryId` (418) | ✓ all populated in Task 3.2 |

### Wave Conflict Check

| Wave | Primary Files | Conflicts |
|------|--------------|-----------|
| Wave 1 | FileA, FileB, FileC | none ✓ |
| Wave 2 | FileD, FileE | none ✓ |

## 设计项 → 计划项映射

| 来源章节 | 设计项 | 对应任务 / Wave / blocker | 处理状态 |
|----------|--------|---------------------------|----------|
| `二、详细设计` | `{模块 / 服务 / 页面}` | `Task 1.1 / Wave 1` | 已映射 |
| `三、接口协议变更` | `{接口 / API / 事件 / 数据契约变化}` | `Task 1.2 / Wave 1` | 已映射 |
| `四、基础设施设计` | `{配置 / 存储 / 消息 / 定时任务 / 外部依赖项}` | `Task 2.1 / Wave 2` 或 `不需要任务 — 原因` | 已处置 |
| `五、验证策略` | `{关键风险 / 验证场景}` | `Task 2.1` 或 `Wave 2 Integration Verification` | 已映射 |
| `六、待决策项` | `{待决策项}` | `已解决` / `Wave 0 前置` / `blocker` / `风险接受` | 已分类 |

---

## File Map

### New Files
- `{exact/path}` — {responsibility}

### Modified Files
- `{exact/path}` — {what changes}

### Shared Contracts / Interfaces
- `{exact/path}` — {why multiple tasks depend on it}

---

## Wave Overview

| Wave | Tasks | Dependency | Conflict Notes | Integration Verification |
|------|-------|------------|----------------|--------------------------|
| Wave 1 | Task 1.1, 1.2 | none | no same-wave primary-file overlap | `{exact command}` |
| Wave 2 | Task 2.1 | depends on Wave 1 | relies on `{shared contract}` remaining stable | `{exact command}` |

---

## Wave 1 — {description} (parallel)

Goal: {what this wave establishes}

#### Task 1.1: {Name}
**Primary File:** `{exact/path/to/file.ext}`
**Touches Files:** `{path1}`, `{path2}`
**Depends on:** `none`
**Wave:** 1 — parallel with Task 1.2
**Conflict Guard:** `No same-wave overlap with {files/interfaces}`

**TC 覆盖清单（来自 AC）：**
- [ ] TC-01-a (AC-01, P0): Given {具体前置条件}, When {具体调用}, Then {可断言的结果}
- [ ] TC-01-b (AC-01, P0): Given {边界/异常条件}, When {具体调用}, Then {降级/异常结果}

> 如无 AC 表，删除此 TC 覆盖清单块。每条 TC 对应独立测试方法，方法名包含 TC 编号（如 `TC01a_whenXxx_thenYyy`）。不允许用一个测试方法覆盖多条 TC。

- [ ] Step 1: Write failing test — 为每条 TC 写一个 failing test
  ```{lang}
  // TC-01-a: {TC描述}
  @Test
  void TC01a_when{Condition}_then{Result}() {
      // complete test code — no placeholders
  }

  // TC-01-b: {TC描述}
  @Test
  void TC01b_when{Condition}_then{Result}() {
      // complete test code — no placeholders
  }
  ```
  Run: `{exact command}`
  Expected: FAIL — `{exact failure message}`

- [ ] Step 2: Verify failure
  Run: `{exact command}`
  Confirm: `{failure keyword}`

- [ ] Step 3: Implement
  ```{lang}
  // complete implementation
  ```

- [ ] Step 4: Verify pass
  Run: `{exact command}`
  Expected: PASS

- [ ] Step 5: Commit
  ```bash
  git add {file list}
  git commit -m "{type}: {description}"
  ```

#### Task 1.2: {Name}
**Primary File:** `{exact/path/to/file.ext}`
**Touches Files:** `{path1}`, `{path2}`
**Depends on:** `none`
**Wave:** 1 — parallel with Task 1.1
**Conflict Guard:** `No same-wave overlap with {files/interfaces}`

- [ ] Step 1: Write failing test
  ```{lang}
  // complete test code
  ```
  Run: `{exact command}`
  Expected: FAIL — `{exact failure message}`

- [ ] Step 2: Verify failure
  Run: `{exact command}`
  Confirm: `{failure keyword}`

- [ ] Step 3: Implement
  ```{lang}
  // complete implementation
  ```

- [ ] Step 4: Verify pass
  Run: `{exact command}`
  Expected: PASS

- [ ] Step 5: Commit
  ```bash
  git add {file list}
  git commit -m "{type}: {description}"
  ```

### Wave 1 Integration Verification

Run after all Wave 1 tasks finish:

```bash
{exact command}
```

Expected result:
- {observable signal that the wave works end-to-end}
- {signal that shared contracts still hold}

---

## Wave 2 — {description} (serial, depends on Wave 1)

Goal: {what this wave builds on top of Wave 1}

#### Task 2.1: {Name}
**Primary File:** `{exact/path/to/file.ext}`
**Touches Files:** `{path1}`, `{path2}`
**Depends on:** `Task 1.1`, `Task 1.2`
**Wave:** 2 — serial after Wave 1
**Conflict Guard:** `No same-wave overlap; start only after {dependency or contract} is complete`

- [ ] Step 1: Write failing test
  ```{lang}
  // complete test code
  ```
  Run: `{exact command}`
  Expected: FAIL — `{exact failure message}`

- [ ] Step 2: Verify failure
  Run: `{exact command}`
  Confirm: `{failure keyword}`

- [ ] Step 3: Implement
  ```{lang}
  // complete implementation
  ```

- [ ] Step 4: Verify pass
  Run: `{exact command}`
  Expected: PASS

- [ ] Step 5: Commit
  ```bash
  git add {file list}
  git commit -m "{type}: {description}"
  ```

### Wave 2 Integration Verification

Run after all Wave 2 tasks finish:

```bash
{exact command}
```

Expected result:
- {observable signal that Wave 2 integrates with Wave 1}
- {observable signal that regression checks still pass}

---

## Dependency Notes

- `Task 2.1` depends on `Task 1.1` because {reason}
- `Task 2.1` depends on `Task 1.2` because {reason}
- If a shared interface changes, later waves must be revalidated before execution starts

## Execution Notes for runway-parallel-dev

- No two same-wave tasks may modify the same primary file
- If two tasks touch the same shared interface, place them in different waves unless the plan proves they are conflict-free
- Every wave must define an integration verification command before the plan is ready for user review
```