// @vitest-environment jsdom

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';
import { axe } from 'jest-axe';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const htmlPath = path.join(__dirname, '..', 'index.html');
const html = fs.readFileSync(htmlPath, 'utf8');

describe('accessibility baseline', () => {
  it('has no serious or critical axe violations in the shell UI', async () => {
    document.body.innerHTML = html;

    const results = await axe(document.body, {
      rules: {
        // JSDOM cannot calculate rendered colour contrast reliably.
        'color-contrast': { enabled: false }
      }
    });

    const highImpact = results.violations.filter(violation =>
      violation.impact === 'serious' || violation.impact === 'critical'
    );

    expect(highImpact).toEqual([]);
  });
});
