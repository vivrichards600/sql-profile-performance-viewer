# Team Quick Start

Use this page when you want to request a feature or change without needing deep knowledge of the codebase.

## 1) Open and ask

1. Open this repository in VS Code.
2. Open Copilot Chat.
3. Paste one of the templates below and edit the bracketed parts.

## 2) Default request format

Use this as the normal way to ask for work:

- I want [change], so that [user outcome].

Optional if needed:

- Do not change [boundary].

Do not include tests or coverage in your request. Those are automatic quality gates in this repository.

## 3) What Copilot should do by default

- Share a short plan.
- Use test-first TDD for behavioural changes where feasible.
- Make the smallest useful change.
- Add or update tests for changed behaviour.
- Run `npm test`, `npm run test:a11y`, `npm run test:security`, and `npm run test:coverage`.
- Apply shift-left testing during implementation (unit, integration, negative, accessibility, and security).
- Keep UI changes aligned to WCAG 2.2 AA expectations.
- Use safe rendering patterns for untrusted input.
- Follow DRY and KISS with strong JavaScript readability.
- Update docs where behaviour changes.
- Summarise what changed and validation results.

## 4) Copy/paste examples

### Example A: Add a feature

I want a write-risk warning badge in the hotspot table and details panel, so that risky write-heavy events stand out immediately.
Do not change chart layout, upload flow, and existing filters.

### Example B: Improve an existing feature

I want search to match both SQL text and table name, so that I can find relevant rows faster.
Do not change the existing scoring model and risk thresholds.

### Example C: Fix a bug safely

I want row selection to stay on the correct event after filtering, so that details always match the row I select.
Do not change current sorting order and chart visuals.

## 5) Templates (minimal set)

Default template for almost everyone:

- [.github/prompts/i-want-so-that.prompt.md](.github/prompts/i-want-so-that.prompt.md)
