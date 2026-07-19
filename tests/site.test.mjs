import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('../site.css', import.meta.url), 'utf8');

test('landing page links to GitHub and the author project site', () => {
  assert.match(html, /https:\/\/github\.com\/luochen211\/remote-fit/);
  assert.match(html, /https:\/\/luo-chen\.com/);
});

test('landing page includes core product and safety sections', () => {
  assert.match(html, /id="verify"/);
  assert.match(html, /id="safety"/);
  assert.match(html, /第二次确认/);
});

test('landing page declares responsive and reduced-motion behavior', () => {
  assert.match(html, /name="viewport"/);
  assert.match(css, /@media \(max-width: 600px\)/);
  assert.match(css, /prefers-reduced-motion/);
});

