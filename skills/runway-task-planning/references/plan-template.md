# Implementation Plan Template

```markdown
# Implementation Plan: {Feature Name}

**Date:** {YYYY-MM-DD}
**Spec Context:** {.runway/docs/{ones_id}/spec-context.md}
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

- [ ] Step 1: Implement
  ```{lang}
  // complete implementation — no placeholders
  ```

- [ ] Step 2: Commit
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

- [ ] Step 1: Implement
  ```{lang}
  // complete implementation — no placeholders
  ```

- [ ] Step 2: Commit
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

- [ ] Step 1: Implement
  ```{lang}
  // complete implementation — no placeholders
  ```

- [ ] Step 2: Commit
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