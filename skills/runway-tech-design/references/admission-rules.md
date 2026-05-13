# Admission Rules — Stage 2 Tech Design

## Review Level Selection

Classify work into one of three levels:

- **Level 0 (default)** — routine / localized / familiar changes with clear requirements, bounded module impact, and no material architectural uncertainty → **Planner only**
- **Level 1** — non-trivial design review is needed (interface/API contract changes, several modules touched, meaningful rollout/observability questions, or a real design tradeoff) → **Planner → Architect**
- **Level 2** — genuinely high-risk or high-uncertainty work (auth/security changes, schema/data migration, core architecture shifts, feature affecting >100k DAU, multi-system integration across 3+ external systems, or unresolved design contention) → **Planner → Architect → Critic**

Escalate only when the design risk justifies it. Do not send routine work through the heaviest path by default.

### Boundary Examples

| Scenario | Level |
|----------|-------|
| Add 1 optional response field, no downstream consumers affected | L0 |
| Add 1 required request field, or change field type/semantics | L1 |
| Add a new internal service method, no external interface change | L0 |
| Add a new external API endpoint used by 2+ other teams | L1 |
| Change a DB column type on a table with >1M rows | L2 |
| Add a Lion config flag to gate an existing feature | L0 |
| Introduce a new cross-module async event (Mafka topic) | L1 |

## Deliberate Mode Trigger Rule

Trigger **deliberate mode** if any of the following apply:
- Data migration or schema changes
- Auth / permissions / security mechanisms
- Core architecture changes
- Feature affecting >100k DAU
- Multi-system integration (3+ external systems)

Otherwise use **standard mode**.

Level 2 and deliberate mode often overlap, but they are not identical: Level 2 controls review depth; deliberate mode adds pre-mortem, rollout-readiness, and full test-planning rigor.

### Trigger Recording Rule

For every deliberate-mode trigger, record the source as one of:
- **Observed** — directly stated in the requirements spec
- **Inferred** — not stated directly, but strongly implied
- **User-confirmed** — confirmed explicitly during review

If trigger evidence is weak, call it out instead of silently guessing.

## ADR Trigger Rule

ADR is optional. Generate a separate ADR only when:
- 3+ serious alternatives were evaluated and the final rationale is likely to be revisited later
- The decision changes module boundaries, shared contracts, or cross-team interfaces
- The decision introduces a hard-to-reverse platform, storage, or dependency choice
- The user explicitly asks to preserve a decision record

If none apply, keep rationale in the tech spec only. Do not emit `七、架构ADR` or the table headers `方案对比 | 选型依据 | 决策理由` when ADR is not triggered.
