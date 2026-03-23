# Working Workflow

This document is the operational playbook for making changes in this repository.
It is written so contributors with or without a coding background can follow the same process.

## 1. What this project is

- Front-end: plain HTML, CSS, and JavaScript modules
- Tests: Vitest with JSDOM
- Coverage: Vitest V8 coverage
- Package manager: npm

No framework migration or language change is allowed unless explicitly approved.

## 2. Core principles

- Keep it simple: prefer small, clear changes over broad rewrites.
- Preserve behaviour: do not change existing behaviour unless the request requires it.
- Test early and often: run tests for every change.
- Default to test-first TDD for behavioural changes.
- Use a shift-left testing mindset: validate unit, integration, negative, accessibility, and security concerns early, not at the end.
- Explain clearly: keep wording plain and use UK English.
- Stay in scope: avoid adding unrelated improvements.
- Follow DRY and KISS.
- Prioritise readability and maintainability.

## 3. Scope guard rails

Allowed by default:

- Edits to existing HTML/CSS/JS modules
- New tests and test fixtures
- Documentation updates
- Small refactors that improve readability and maintainability

Not allowed without explicit approval:

- New frameworks
- New programming languages
- Re-architecting the project structure
- New external services or build systems

## 4. Request intake checklist

Before implementing, confirm:

1. What user outcome is expected?
2. Which files are likely to change?
3. What must not change?
4. How will success be validated?

If any of these are unclear or risky, ask a short clarifying question first.

## 5. Delivery format

For each task:

1. Share a short plan.
2. Implement the smallest useful change.
3. Run tests.
4. Report results and changed files.

## 6. Definition of done

A task is complete only when all are true:

1. Requested behaviour is implemented.
2. `npm test` passes.
3. `npm run test:a11y` passes.
4. `npm run test:security` passes.
5. `npm run test:coverage` passes.
6. Coverage thresholds in [vitest.config.mjs](vitest.config.mjs) are satisfied.
7. Documentation is updated if behaviour or workflow changed.

## 7. Testing standards

### Test categories in this repository

- Core logic tests in [tests/viewer-core.test.js](tests/viewer-core.test.js)
- UI integration tests in [tests/viewer-app.test.js](tests/viewer-app.test.js)

### Testing rules

- Add or update tests for every functional change.
- Prefer writing or updating failing tests before implementing the code change.
- Prefer fast unit/integration tests over heavy end-to-end tests.
- Use real fixture data when useful (for example [tests/fixtures/ADS_Standard_e2e_events.json](../tests/fixtures/ADS_Standard_e2e_events.json)).
- Keep tests deterministic and easy to read.
- Include negative tests for invalid input and boundary conditions where relevant.
- Run `npm run test:security` to detect dependency vulnerabilities.
- Use performance checks when a change affects parsing speed, rendering volume, or similarly heavy paths.

## 8. Accessibility and security guard rails

Accessibility baseline:

- Run `npm run test:a11y` on every change (uses jest-axe to catch obvious accessibility regressions).
- jest-axe detects semantic, labelling, and keyboard navigation issues automatically.
- Beyond jest-axe, follow good practices: ensure keyboard usability, visible focus indicators, semantic HTML, and readable contrast.
- Note: jest-axe is a baseline check, not a full WCAG 2.2 AA audit. Manual review for complex interactions remains part of code review.

Security baseline:

- Treat uploaded or parsed data as untrusted input.
- Escape dynamic text before rendering in the DOM.
- Avoid unsafe HTML injection patterns.
- Keep parsing and error handling defensive and explicit.
- Include security considerations during implementation, not only at review time.

## 8. Coding standards

- Use descriptive names.
- Keep functions focused and short where practical.
- Add comments only when logic is non-obvious.
- Keep comments and documentation in UK English.
- Prefer readability over cleverness.

## 9. Requester-first feature workflow

Use this structure when requesting a new feature in natural language:

1. Goal: what should users be able to do?
2. Change: what should appear or behave differently?
3. Boundaries: what must remain unchanged?
4. Validation: how should we confirm it works?

Example:

- Goal: make it easier to identify heavy write operations.
- Change: add a visible write warning in the table and details panel.
- Boundaries: do not change chart design or file format support.
- Validation: upload fixture, confirm warning appears for high-write rows.

Quality gates are automatic and do not need to be requested explicitly:

- tests are added or updated for changed behaviour
- coverage thresholds are enforced
- documentation is updated when behaviour or workflow changes
- comments are added where logic is non-obvious

## 10. Anti-scope-creep checklist

Before finalising, verify:

- Did we solve the exact request?
- Did we avoid unrelated enhancements?
- Did we keep to current stack and architecture?
- Did we run both tests and coverage?

If any answer is no, resolve it before completion.

## 11. Communication defaults

- Provide concise progress updates.
- Ask clarifying questions only for ambiguity, risk, or conflicting requirements.
- Prefer practical outcomes over long theory.

## 12. Prompts and agents

Use prompts for repeatable task framing, and agents for complex multi-step work that benefits from separation.

Use prompts when:

- You want a consistent request format
- You are starting a standard feature or review task
- You want to reduce back-and-forth on missing context

Use agents when:

- The task needs deeper exploration across many files
- You want a dedicated review run with a focused objective
- The work is complex enough that context isolation helps

For this repository, start with prompts first. Use agents selectively for larger investigations or reviews.

Available templates:

- [.github/prompts/i-want-so-that.prompt.md](.github/prompts/i-want-so-that.prompt.md)

Always-on defaults:

- [.github/copilot-instructions.md](.github/copilot-instructions.md)

## 13. How anyone can request a feature

Any requester can work from this repository workflow, including engineers, product, operations, and business stakeholders.

For a copy/paste onboarding version, see [TEAM_QUICK_START.md](TEAM_QUICK_START.md).

Recommended path:

1. Open this repository in VS Code.
2. Open Copilot Chat.
3. Use the default template in [.github/prompts/i-want-so-that.prompt.md](.github/prompts/i-want-so-that.prompt.md), or write a plain-language request.
4. State two things: change and user outcome. Add boundaries only if needed.
5. Ask for implementation and validation.

You can also attach [docs/WORKFLOW.md](../docs/WORKFLOW.md) in chat, but it is optional because repository instructions and prompts already capture the process.

Simple prompt format for non-coders:

- Feature: add a warning badge for risky write-heavy operations.
- Do not change: chart layout and upload behaviour.
- Done when: warning appears in table and details.

Testing and coverage are automatic quality gates in this repository, so they do not need to be stated in user prompts.

Minimum one-line request format:

- I want [change], so that [user outcome].
