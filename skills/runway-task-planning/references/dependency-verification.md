# Pre-Plan Dependency Verification Guide

## Field / Method / Class Existence Check

Before writing any task, verify all symbols referenced in the tech spec actually exist in the codebase.

### Verification Script (Java projects)

```bash
# Run for each symbol referenced in the tech spec
for symbol in {field1} {field2} {methodName} {ClassName}; do
  result=$(grep -rn "$symbol" src/ --include="*.java" 2>/dev/null | head -3)
  if [ -z "$result" ]; then
    echo "MISSING: $symbol"
  else
    echo "CONFIRMED: $symbol"
    echo "$result"
  fi
done
```

### Result Classification

| Status | Meaning | Action |
|--------|---------|--------|
| CONFIRMED | Symbol found in codebase | Proceed — use exact file:line in task |
| MISSING | Symbol not found | Create Wave 0 prerequisite task OR accept as explicit risk |
| ASSUMED | Cannot verify without running code | Mark explicitly in plan as assumption |

### Wave 0 Pattern

If a symbol is MISSING and required by multiple tasks, add a prerequisite task:

```
#### Task 0.1: Add {missing field} to {ClassName}
Wave: 0 — must complete before Wave 1
Primary File: {exact path to ClassName.java}
Steps: add field, compile verify, commit
```

---

## Reused Method Dependency Analysis

When a task reuses an existing method, list ALL fields that method reads from its input objects. The new code path must populate every required field.

### Analysis Template

```
Reusing: {methodName}({InputType} input, ...)
Location: {File.java:line}

Required fields from {InputType}:
  - {field1} (line {N}) — used for {purpose}
  - {field2} (line {N}) — used for {purpose}
  - {field3} (line {N}) — used for {purpose}

New conversion in Task {X.Y} populates:
  ✓ {field1} — set via {source}
  ✓ {field2} — set via {source}
  ✗ {field3} — MISSING → add to task steps
```

### How to Find Required Fields

```bash
# Find all field accesses inside the method
grep -n "\.get\|\.is\|\.has" src/path/to/File.java | grep -A2 -B2 "methodName"
```

---

## Wave Conflict Detection

### Pre-Dispatch Check

Before finalizing wave assignments, collect primary files per wave and verify uniqueness:

```
Wave 1:
  Task 1.1 primary: src/main/FileA.java
  Task 1.2 primary: src/main/FileB.java
  Task 1.3 primary: src/main/FileC.java
  → Duplicates: none ✓

Wave 2:
  Task 2.1 primary: src/main/FileD.java
  Task 2.2 primary: src/main/FileE.java
  Task 2.3 primary: src/main/FileD.java   ← CONFLICT
  → Duplicates: FileD.java

Auto-fix: move Task 2.3 to Wave 2b (serial after Wave 2)
Update: Task 2.3 Depends on → Task 2.1, Task 2.2
Log: "Auto-resolved Wave 2 conflict on FileD: Task 2.3 moved to Wave 2b"
```

### Fix Pattern

When a conflict is detected:
1. Keep the task with earlier logical dependency in the original wave
2. Move the conflicting task to a new wave (Wave N → Wave Nb)
3. Update all downstream wave numbers and dependency declarations
4. Log the correction in the plan's Dependency Notes section
