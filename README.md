# SQL Profile Performance Viewer

A lightweight browser-based viewer for SQL Server Profiler JSON exports.

Demo: [Try the deployed version in your browser](https://sql-profile-performance-viewer.netlify.app/).

## Prerequisites

- Node.js 18+
- npm

## Install

```bash
npm install
```

## Run tests

Run all tests once:

```bash
npm test
```

Run tests in watch mode while developing:

```bash
npm run test:watch
```

Run tests with coverage:

```bash
npm run test:coverage
```

Run accessibility checks:

```bash
npm run test:a11y
```

Run security checks:

```bash
npm run test:security
```

Run the full quality gate in one command:

```bash
npm run test:quality
```

Generate optional machine-readable reports:

```bash
npm run test:report
npm run test:a11y:report
```

Report files are written to `reports/`:

- `reports/vitest-results.json`
- `reports/coverage-summary.json`
- `reports/a11y-results.json`

## Coverage thresholds

Coverage thresholds are enforced in [vitest.config.mjs](vitest.config.mjs):

- Lines: 90%
- Statements: 90%
- Functions: 90%
- Branches: 90%

If coverage drops below these values, the coverage command exits non-zero.

## What is tested

### Core logic tests

File: [tests/viewer-core.test.js](tests/viewer-core.test.js)

Coverage includes:

- Trace parsing and event normalisation
- Risk scoring and severity tagging
- Filtering and visible metric calculations
- SQL operation/table extraction
- Formatting and safety helpers
- Real exported trace smoke tests using [tests/fixtures/ADS_Standard_e2e_events.json](tests/fixtures/ADS_Standard_e2e_events.json)

### UI/app integration tests

File: [tests/viewer-app.test.js](tests/viewer-app.test.js)

Coverage includes:

- Initial render and metric updates after processing data
- Search filtering and empty-state rendering
- Row selection and details panel updates
- Upload handling via FileReader
- Drag-and-drop upload flow
- Toggle behaviour (noise/problems only)
- Scatter chart hover/click interactions
- Guard paths (invalid JSON, missing canvas context, no nearby scatter point)

## Typical workflow

1. Make code changes.
2. Run `npm test`.
3. Run `npm run test:a11y`.
4. Run `npm run test:security`.
5. Run `npm run test:coverage`.
6. Commit only when all checks pass.

For repository-specific working rules, see [docs/WORKFLOW.md](docs/WORKFLOW.md).

## Repeatable prompts

This repository includes reusable Copilot prompts in [.github/prompts](.github/prompts):

- I want so that (default): [.github/prompts/i-want-so-that.prompt.md](.github/prompts/i-want-so-that.prompt.md)

Workspace-wide defaults for Copilot are in [.github/copilot-instructions.md](.github/copilot-instructions.md).

Team onboarding quick guide:

- [docs/TEAM_QUICK_START.md](docs/TEAM_QUICK_START.md)

For any requester, use the quick format:

- I want: what should change
- So that: user outcome
- Optional boundary: what must not change

Quality defaults are automatic in this repository: tests, coverage, and relevant documentation updates are part of delivery.

## Notes

- The viewer is intentionally plain JavaScript modules and HTML/CSS to keep maintenance simple.
- Core analysis logic lives in [src/viewer-core.js](src/viewer-core.js).
- UI orchestration lives in [src/viewer-app.js](src/viewer-app.js).
- HTML remains mostly structural in [index.html](index.html).
- The current structure is intentionally compact: keep it as-is unless complexity grows enough to justify splitting `viewer-app.js` into smaller UI modules.
