import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tokensCss, brandProblems, PALETTE_KEYS, fontsHref } from '../../renderer/tokens.js';
import { ROOT } from '../helpers/paths.js';

const carsons = JSON.parse(readFileSync(join(ROOT, 'sites/carsons-table/brand.json'), 'utf8'));

test("Carson's Table brand.json is spec §6.5 verbatim", () => {
  assert.deepEqual(carsons, {
    preset: 'coastal', scheme: 'dark-dominant',
    palette: { bg: '#F6F1E6', surface: '#FFFFFF', fg: '#17300F', muted: '#5C6B52', line: '#D8CCA8', accent: '#78905F', accent2: '#D8CCA8', dark: '#234719', black: '#080C06' },
    type: { display: 'Fraunces', body: 'Karla' }, radius: '2px',
    logo: '/sites/carsons-table/wordmark.webp', favicon: '/sites/carsons-table/favicon.png', ogImage: '/sites/carsons-table/exterior.webp',
  });
});

test('every palette key round-trips into tokens.css', () => {
  const css = tokensCss(carsons);
  for (const k of PALETTE_KEYS) {
    const name = k === 'accent2' ? 'accent-2' : k;
    assert.match(css, new RegExp(`--t-${name}:${carsons.palette[k].toLowerCase()};`), `--t-${name} missing`);
  }
  assert.match(css, /--t-display:'Fraunces', Georgia/);
  assert.match(css, /--t-field:var\(--t-dark\)/, 'dark-dominant puts the field on --t-dark');
  assert.match(css, /prefers-color-scheme: dark\)\{:root:not\(\[data-theme="light"\]\)/);
  assert.match(css, /:root\[data-theme="dark"\]/);
});

test('a missing palette key is a build-failing error, never a silent default', () => {
  for (const k of PALETTE_KEYS) {
    const b = structuredClone(carsons); delete b.palette[k];
    assert.throws(() => tokensCss(b), new RegExp(`palette\\.${k} is missing`));
  }
});

test('malformed values that could inject CSS are refused', () => {
  const bad = structuredClone(carsons);
  bad.palette.fg = 'red;}body{display:none'; bad.type.body = "Karla'; x"; bad.radius = '2px;x';
  const p = brandProblems(bad).join('\n');
  assert.match(p, /palette\.fg must be #rrggbb/); assert.match(p, /type\.body/); assert.match(p, /radius/);
});

test('fontsHref names both families', () => {
  assert.equal(fontsHref(carsons), 'https://fonts.googleapis.com/css2?family=Fraunces:ital,wght@0,400;0,500;0,600;1,400&family=Karla:wght@400;500;600&display=swap');
});
