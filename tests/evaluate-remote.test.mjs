import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const script = fileURLToPath(new URL('../scripts/evaluate-remote.mjs', import.meta.url));

function evaluate(jd) {
  return JSON.parse(execFileSync(process.execPath, [script], {
    input: jd,
    encoding: 'utf8'
  }));
}

test('accepts explicit worldwide remote contractor roles', () => {
  const result = evaluate(`
    Senior Software Engineer. Remote worldwide; work from anywhere.
    This is an independent contractor role with four hours of timezone overlap.
  `);
  assert.equal(result.remoteType, 'global-remote');
  assert.equal(result.chinaEligibility, 'likely-eligible');
  assert.equal(result.engagement, 'contractor');
});

test('explicit region restriction overrides generic remote wording', () => {
  const result = evaluate(`
    This is a remote role. Candidates must reside in the US. US only.
  `);
  assert.equal(result.remoteType, 'region-restricted-remote');
  assert.equal(result.chinaEligibility, 'not-eligible');
});

test('hybrid requirement is not treated as China-eligible remote work', () => {
  const result = evaluate(`
    混合办公，每周需要到岗两天，其余时间可远程工作。
  `);
  assert.equal(result.remoteType, 'hybrid-or-onsite');
  assert.equal(result.chinaEligibility, 'not-eligible');
});

test('unknown location stays unknown instead of becoming eligible', () => {
  const result = evaluate(`
    We are a distributed team seeking a product designer. Working hours are flexible.
  `);
  assert.equal(result.chinaEligibility, 'needs-confirmation');
  assert.equal(result.engagement, 'unknown');
});

test('flags upfront fees and unpaid trials', () => {
  const result = evaluate(`
    远程兼职，入职前需要缴纳培训费，并完成无薪试岗。
  `);
  assert.deepEqual(result.riskSignals.sort(), ['unpaid-trial', 'upfront-fee']);
});
