---
mode: 'agent'
description: 'Use when requesting a feature in plain language using I want... so that... format'
---
# I Want So That Prompt

Use this as the default way to request work.

## Request format

I want [change], so that [user outcome].

Optional boundary:

Do not change [boundary].

## What happens by default

- Keep changes small and in scope.
- Use test-first TDD for behavioural changes where feasible.
- Add or update tests (unit, integration, and negative as relevant).
- Run npm test, npm run test:a11y, npm run test:security, and npm run test:coverage.
- Apply shift-left testing for accessibility (WCAG 2.2 AA) and security.
- Follow DRY, KISS, and readability-first JavaScript.
- Update documentation and comments where needed.
- Summarise changed files and validation results.
