# Copilot Workspace Instructions

Use these defaults for all work in this repository.

## Delivery

- Start with a short plan, then implement.
- Keep changes small and directly tied to the request.
- Avoid scope creep and unrelated refactors.
- Default to a test-first TDD approach for behaviour changes.
- Use a shift-left testing mindset: design and run unit, integration, negative, accessibility, and security checks early.
- For DOM-heavy features (modals, panels, overlays): write both isolation tests and integration tests that verify behaviour after DOM mutations.

## Stack boundaries

- Keep the current stack: plain HTML, CSS, JavaScript modules, Vitest, JSDOM.
- Do not introduce new frameworks, languages, or build systems unless explicitly requested.

## Testing and quality gates

- After every code change, run:
  - `npm test`
  - `npm run test:a11y`
  - `npm run test:security`
  - `npm run test:coverage`
- Do not mark work complete if either command fails.
- Maintain configured coverage thresholds in `vitest.config.mjs`.
- When feasible, write or update tests before implementing production changes.
- Prefer tests that verify behaviour, edge cases, and regressions over implementation details.
- Use performance checks when a change impacts parsing, rendering volume, or other potentially heavy paths.

### DOM cloning and special elements

When TDD-ing features that clone or move DOM elements (modals, dynamic panels, etc.):
- Test the **cloned element's behaviour**, not just structure. Canvas and media elements lose runtime state when cloned.
- For canvas elements: test that they have non-zero dimensions post-clone and can render. Canvas pixel data doesn't transfer; post-mutation redraw is often required.
- Write integration tests for multi-step DOM operations. JSDOM unit tests can pass while real browser behavior differs.
- When cloning elements with event listeners or reactive state, verify listeners are re-attached or state is restored in the new context.

## Accessibility and security defaults

- Use keyboard accessibility, visible focus states, semantic structure, and clear names/labels for UI changes.
- Ensure colour choices keep readable contrast for text and interactive elements.
- Run `npm run test:a11y` to validate against jest-axe automated rules (catches obvious accessibility regressions).
- Use safe DOM patterns: escape or sanitise user-controlled text before rendering.
- Avoid risky patterns such as unsafe HTML injection, unchecked parsing assumptions, or broad permissions.
- For security-sensitive changes, include basic threat-aware checks as part of implementation and review.

## Writing style

- Use UK English in comments, tests, and documentation.
- Ask clarifying questions only when requirements are ambiguous, risky, or conflicting.
- Prefer clear, practical explanations over long theory.
- Follow DRY and KISS.
- Optimise for readability and maintainability over cleverness.
- Use a strong JavaScript engineering approach with explicit, testable behaviour.

## References

- Workflow playbook: `docs/WORKFLOW.md`
- Test and coverage usage: `README.md`
