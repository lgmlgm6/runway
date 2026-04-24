# Deliberate Mode Checklist

Use this checklist for high-risk changes (data migration, auth, core architecture, >100k DAU, multi-system integration) or when the requirements input is incomplete but delivery risk is high.

## Trigger Recording

Before starting deliberate mode, record:

- **Trigger observed:** {what concrete signal was seen in the requirements or system}
- **Trigger source:** `observed` | `inferred` | `user-confirmed`
- **Why standard mode is insufficient:** {specific risk or uncertainty}

Do not enter deliberate mode silently. The tech spec must say why it was used.

## Pre-mortem Analysis

Assume the feature causes a serious incident 2 weeks after launch. Answer:

1. **Most likely failure cause #1:** {describe} → Prevention: {action}
2. **Most likely failure cause #2:** {describe} → Prevention: {action}
3. **Most likely failure cause #3:** {describe} → Prevention: {action}

Common failure patterns to consider:
- Data consistency issues under concurrent writes
- Cache invalidation bugs causing stale reads
- Auth bypass due to missing permission checks
- Performance degradation at 10x expected load
- Dependency failure (downstream service outage)
- Irreversible rollout or migration sequence mistakes

## Full Test Planning

### Unit Tests
- [ ] All business logic branches covered
- [ ] Edge cases: empty input, max values, null handling
- [ ] Error paths: what happens when dependencies fail

### Integration Tests
- [ ] Happy path end-to-end
- [ ] Rollback scenario: can the change be reverted cleanly?
- [ ] Data migration: before/after state verified
- [ ] Multi-system contracts verified with realistic boundaries

### Performance Tests
- [ ] Baseline established (current p50/p99)
- [ ] Load test at 2x expected peak
- [ ] DB query plan verified (no full table scans)
- [ ] Back-pressure or timeout behavior reviewed

### Observability
- [ ] Key metrics defined (what to alert on)
- [ ] Logging added at decision points
- [ ] Distributed trace spans added for new services
- [ ] Dashboard or query path identified for launch monitoring

## Rollout Rehearsal

- [ ] Rollout sequence written step by step
- [ ] Preconditions for each rollout step identified
- [ ] Abort condition defined
- [ ] Manual intervention points identified
- [ ] Ownership defined for launch monitoring

## Rollback Checklist

- [ ] Feature flag or kill switch exists, or lack of one is explicitly accepted
- [ ] DB migration is reversible (or has compensating migration)
- [ ] Rollback procedure documented and tested or rehearsed
- [ ] Rollback time expectation recorded
- [ ] Data repair plan exists if rollback is not lossless

## Open Risk Review

Before leaving deliberate mode, confirm:
- [ ] Top risks are listed in the tech spec risk register
- [ ] Open decisions are explicit rather than hidden in prose
- [ ] The design documents what must be true before rollout can start
- [ ] Observability is sufficient to detect silent failure, not just hard crashes
