# Clarification Question Templates

Use this guide to choose the **next single clarification question** when ambiguity is too high to write a reliable requirements spec.

## Step 1: Score the three ambiguity dimensions

Use the same rubric for each dimension.

| Score | Meaning |
|------:|---------|
| 20 | Mostly unclear. Multiple plausible interpretations remain. |
| 50 | Partially clear. Core intent is visible, but important gaps still block confident delivery. |
| 80 | Clear enough to draft the spec with only minor follow-up questions. |
| 100 | Unambiguous. Independent reviewers would derive the same scope and acceptance tests. |

Dimensions:
- **Goal clarity (40%)** — do we understand the user problem and desired outcome?
- **Constraint clarity (30%)** — do we understand technical/business boundaries?
- **Success criteria (30%)** — can we write concrete acceptance criteria?

Formula:

```text
ambiguity = 1 - (goal×0.40 + constraints×0.30 + criteria×0.30) / 100
```

## Step 2: Pick the weakest dimension

Ask about the **lowest-scoring dimension first**.

Tie-breakers:
1. Prefer the dimension that blocks writing acceptance criteria.
2. Then prefer the dimension that changes scope boundaries.
3. If still tied, ask the question with the smallest answer surface.

## Step 3: Ask exactly one question

Rules:
- Ask **one question at a time**.
- Do not bundle multiple asks into one message.
- Prefer closed-form choices when the PRD suggests likely options.
- Do not ask implementation questions here; that belongs to runway-tech-design.
- Do not ask for information already stated in the PRD.

## Goal Clarity (weight 40%)

Use when: the feature purpose, target user, or desired business outcome is vague.

Templates:
- "This feature mainly solves which user pain point? A) ... B) ... C) ..."
- "Who is the primary user for this feature? A) internal ops B) external consumers C) both"
- "What is the main outcome we want after launch? A) reduce manual work B) increase conversion C) reduce errors"
- "If we could only deliver one behavior in v1, which behavior must be correct?"

## Constraint Clarity (weight 30%)

Use when: technical, business, policy, or integration boundaries are unspecified.

Templates:
- "Which existing systems must this integrate with?"
- "Are there hard performance or scale requirements?"
- "Are there rollout constraints? A) full launch B) gradual rollout C) A/B test"
- "Are there compliance, security, or audit requirements we must honor?"

## Success Criteria (weight 30%)

Use when: acceptance criteria cannot yet be written as observable Given/When/Then behavior.

Templates:
- "How will we know this feature succeeded? Describe one concrete scenario."
- "What is the minimum behavior that must work on launch day?"
- "When {edge case} happens, what should the system do? A) ... B) ... C) ..."
- "Which result would count as incorrect behavior and block release?"

## Choosing the best question from a weak dimension

Prefer a question that:
1. Collapses the largest amount of ambiguity.
2. Produces language reusable in the spec.
3. Avoids inviting implementation debate.
4. Can be answered in one reply.

## Anti-patterns

- Never ask multiple questions in one message.
- Never ask about implementation details (that's runway-tech-design's job).
- Never ask questions whose answers are already in the PRD.
- Never ask broad prompts like "Anything else?" when a concrete question is possible.
- Never continue past the max clarification rounds without either reducing ambiguity or pausing for human decision.
