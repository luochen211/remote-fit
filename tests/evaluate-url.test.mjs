import assert from 'node:assert/strict';
import test from 'node:test';

import { assessLiveness, extractJobDescription, isPrivateAddress, parsePublicUrl } from '../scripts/evaluate-url.mjs';

test('extracts a structured JobPosting from JSON-LD', () => {
  const html = `<!doctype html><html><body><script type="application/ld+json">
    {"@context":"https://schema.org","@type":"JobPosting","title":"Senior Engineer","description":"<p>Remote worldwide.</p><p>Independent contractor.</p>","jobLocationType":"TELECOMMUTE","applicantLocationRequirements":{"@type":"Country","name":"Worldwide"},"employmentType":"CONTRACTOR","validThrough":"2099-12-31"}
  </script></body></html>`;
  const result = extractJobDescription(html);
  assert.equal(result.extractionMethod, 'json-ld');
  assert.match(result.text, /Remote worldwide/);
  assert.match(result.text, /Worldwide/);
});

test('falls back to readable main-page HTML', () => {
  const result = extractJobDescription('<html><body><nav>Menu</nav><main><h1>Backend Engineer</h1><p>Remote in APAC.</p><ul><li>Build APIs</li></ul></main></body></html>');
  assert.equal(result.extractionMethod, 'html');
  assert.match(result.text, /Backend Engineer/);
  assert.match(result.text, /- Build APIs/);
  assert.doesNotMatch(result.text, /Menu/);
});

test('blocks local, private, and credential-bearing URLs', () => {
  assert.throws(() => parsePublicUrl('http://localhost:3000/job'), /private URLs/);
  assert.throws(() => parsePublicUrl('http://192.168.1.2/job'), /private URLs/);
  assert.throws(() => parsePublicUrl('https://user:pass@example.com/job'), /credentials/);
  assert.equal(isPrivateAddress('10.0.0.1'), true);
  assert.equal(isPrivateAddress('8.8.8.8'), false);
});

test('treats expired signals as stronger than generic apply language', () => {
  const result = assessLiveness('Apply now. This job is no longer available.');
  assert.equal(result.status, 'expired');
});

test('uses structured validThrough for expiry', () => {
  const result = assessLiveness('Remote worldwide role', { validThrough: '2025-01-01' }, Date.parse('2026-01-01'));
  assert.equal(result.status, 'expired');
  assert.match(result.evidence[0], /validThrough/);
});

