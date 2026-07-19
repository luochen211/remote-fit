import assert from 'node:assert/strict';
import test from 'node:test';

import { assessLiveness, extractJobDescription, isPrivateAddress, parsePublicUrl } from '../scripts/evaluate-url.mjs';
import { fetchAtsJob, resolveAtsApi } from '../scripts/ats-api.mjs';
import { classifyLiveness } from '../scripts/liveness.mjs';

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

test('maps supported ATS URLs to fixed official API hosts', () => {
  assert.deepEqual(resolveAtsApi('https://job-boards.greenhouse.io/acme/jobs/1234567'), {
    provider: 'greenhouse',
    apiUrl: 'https://boards-api.greenhouse.io/v1/boards/acme/jobs/1234567?content=true'
  });
  assert.equal(resolveAtsApi('https://jobs.lever.co/acme/../../secret'), null);
});

test('uses ATS API response as verified active job text', async () => {
  const result = await fetchAtsJob('https://jobs.lever.co/acme/abc-123', async () => new Response(JSON.stringify({
    text: 'Remote Backend Engineer',
    descriptionPlain: 'Build reliable APIs for customers worldwide. This description is deliberately long enough for safe extraction and evaluation.',
    workplaceType: 'remote'
  }), { status: 200, headers: { 'content-type': 'application/json' } }));
  assert.equal(result.provider, 'lever');
  assert.equal(result.status, 'active');
  assert.match(result.text, /Backend Engineer/);
});

test('treats ATS 404 as expired', async () => {
  const result = await fetchAtsJob('https://jobs.lever.co/acme/abc-123', async () => new Response('', { status: 404 }));
  assert.equal(result.status, 'expired');
});

test('keeps access blocks and bot challenges uncertain', () => {
  assert.equal(classifyLiveness({ statusCode: 403, requestedUrl: 'https://example.com/jobs/1234' }).code, 'access_blocked');
  assert.equal(classifyLiveness({ text: 'Just a moment... Cloudflare', requestedUrl: 'https://example.com/jobs/1234' }).code, 'bot_challenge');
});

test('detects redirect away from a specific job before generic apply controls', () => {
  const result = classifyLiveness({
    requestedUrl: 'https://example.com/jobs/123456',
    finalUrl: 'https://example.com/careers',
    text: 'Apply now for another role',
    applyControlVisible: true
  });
  assert.equal(result.status, 'uncertain');
  assert.equal(result.code, 'redirected_off_posting');
});
