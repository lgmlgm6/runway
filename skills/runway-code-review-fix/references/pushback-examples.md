# Push-back Examples

Use push-back to reject findings that are incorrect, out of scope, or YAGNI after verification. The goal is to protect correctness and scope, not avoid work.

## Pattern 1: Suggestion based on misunderstanding the codebase

**Reviewer says:**
> "The `UserRepository.findById` method should add a cache layer to improve performance."

**Investigation:**
- Search the repository for existing cache wrappers around `UserRepository`.
- Verify whether caching is already handled at a higher layer.
- Check whether a second cache would introduce stale invalidation risk.

**Push-back:**
> "Not implementing: caching is already handled by `CachedUserRepository` at the injection site. Adding a second cache layer here would create double-caching and stale invalidation risk. The current layering is correct for this codebase."

---

## Pattern 2: YAGNI — suggested feature has no current usage

**Reviewer says:**
> "Add a `bulkCreate` method to `UserService` for better performance when creating multiple users."

**Investigation:**
- Search the codebase for `bulkCreate`, `createMany`, and equivalent bulk-call patterns.
- Verify whether any current caller needs this API.

**Push-back:**
> "Not implementing: no current caller needs bulk user creation. Adding unused API surface would increase maintenance and test burden without solving a real requirement. If bulk creation becomes necessary later, it should be added with concrete usage context. YAGNI."

---

## Pattern 3: Suggestion breaks existing behavior

**Reviewer says:**
> "Change `getUserById` to throw an exception when user is not found, instead of returning null."

**Investigation:**
- Find all current callers of `getUserById`.
- Verify whether they depend on the current null-return contract.
- Estimate whether changing the contract would require coordinated updates outside the current scope.

**Push-back:**
> "Not implementing: current callers depend on the null-return contract. Changing this method to throw would require coordinated updates across multiple consumers and is outside the scope of this change. The suggestion may be valid as a separate refactor, but not in this review round."

---

## Pattern 4: Technically incorrect suggestion

**Reviewer says:**
> "Use `==` instead of `===` for the null check on line 45 to also catch undefined values."

**Investigation:**
- Verify the variable's type and whether `undefined` is a real runtime state here.
- Confirm the exact semantics of the existing comparison.

**Push-back:**
> "Not implementing as stated: `=== null` intentionally checks for null only. `== null` would also match undefined, which is a different semantic. The variable is typed as `string | null`, so the current check is more precise and matches the actual contract."

---

## Pattern 5: Out of scope for this change

**Reviewer says:**
> "While you're in this file, refactor the `processOrder` method — it's too long and does too many things."

**Investigation:**
- Verify whether the current branch actually changes `processOrder` behavior.
- Decide whether the refactor is required to safely land the requested fix.

**Push-back:**
> "Not implementing: refactoring `processOrder` is outside the scope of this branch. The current change is limited to payment validation behavior. Mixing in an unrelated refactor would increase review size and regression risk."

---

## Pattern 6: False positive after verification

**Reviewer says:**
> "This branch forgot to validate tenant ownership before updating the record."

**Investigation:**
- Inspect the actual call chain.
- Verify whether tenant validation already happens in shared middleware or a service guard before this code path.
- Confirm tests cover the protected path.

**Push-back:**
> "Not implementing: tenant ownership is already enforced by the shared guard earlier in the request path, and this branch does not bypass that guard. The current behavior is correct because authorization happens before the update handler runs."

---

## Push-back format

Use this structure:

> "Not implementing: {reason}. The current behavior {X} is correct because {explanation}."

Add evidence when possible:
- caller count or affected modules;
- existing wrapper/guard location;
- confirmed lack of current usage;
- contract depended on by other code.

## When NOT to push back

Do implement when:
- the reviewer found a real bug;
- the suggestion is technically correct and in scope;
- the suggestion closes a security issue;
- the only disagreement is style and the reviewer suggestion is reasonable.

Use push-back only after verification. Unsupported opinion is not push-back.
