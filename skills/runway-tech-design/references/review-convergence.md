# Review Convergence Rules — Stage 2 Tech Design

## Level 0

Planner completes → proceed directly to Step 5 self-review. No Architect or Critic pass required.

## Level 1

Planner → Architect.

- If Architect has no blocking `[MUST]` items → proceed to Step 5 self-review.
- If Architect returns blocking `[MUST]` items → run one targeted Planner revision addressing all `[MUST]` items, then run Architect once more.
- After the second Architect pass, do not run another revision cycle regardless of remaining `[MUST]` items.
- If the second Architect pass still has unresolved `[MUST]` items, list them in the Step 6 Hard Gate presentation with the label "⚠️ Architect 仍有未解决 [MUST] 项，请 review 后决定是否继续", then let the user decide.

## Level 2

Planner → Architect → Critic.

- If Critic verdict is **APPROVE** → proceed to Step 4.
- If Critic verdict is **ITERATE** or **REJECT** → collect all Architect `[MUST]` items plus Critic Critical/Major findings, run one targeted Planner revision, then rerun Architect → Critic once more.
- Level 2 is capped at **at most one revision cycle** and **2 total cycles**. Do not keep looping after the second cycle; present the best version plus unresolved issues to the user.

## Targeted Planner Revision Prompt

When a targeted Planner revision is required, read the full prompt from `references/review-agent-prompts.md` → **Planner Revision Prompt** section. Substitute `{PREVIOUS_PLANNER_OUTPUT}`, `{ARCHITECT_MUST_ITEMS}`, and `{CRITIC_CRITICAL_AND_MAJOR_FINDINGS}` before dispatching.

Treat the revision as an internal repair step; continue immediately to the required next pass in the same turn.

If unresolved issues remain after the allowed review cycles, include them in the Step 6 Hard Gate presentation instead of creating a separate pre-Hard-Gate stop.

## Progress Display Rules

After each Planner pass, output:

```
## 📝 Planner 草稿完成（第 N 轮）

- 主线设计：{一句话概括当前实现方案}
- 主要影响模块：{模块列表}
- 接口协议变更：{有 / 无，若有列出关键接口}
- ADR：{未触发 / 已触发}
- 当前准入级别：{Level 0 / Level 1 / Level 2}
```

After each Architect pass, display full output:

```
## 🔍 架构师审查结果（第 N 轮）

{ARCHITECT_OUTPUT — 完整展示，不要截断}
```

After each Critic pass, display full output:

```
## ⚖️ 挑战者审查结果（第 N 轮）

{CRITIC_OUTPUT — 完整展示，不要截断}
```

These displays are progress sync only, not confirmation points. Continue in the same turn after displaying.
