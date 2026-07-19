import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const script = fileURLToPath(new URL('../scripts/evaluate-remote.mjs', import.meta.url));

function evaluate(jd, extraArgs = []) {
  return JSON.parse(execFileSync(process.execPath, [script, ...extraArgs], {
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

test('recognizes country-specific remote labels', () => {
  const result = evaluate('Account Executive - Italy. Remote, Italy. Apply for this job.');
  assert.equal(result.remoteType, 'region-restricted-remote');
  assert.equal(result.chinaEligibility, 'not-eligible');
});

test('does not treat legal contractor boilerplate or words ending in ist as job terms', () => {
  const result = evaluate('Remote role. We are a federal contractor. Fortune 500 list published in June.');
  assert.equal(result.engagement, 'unknown');
  assert.equal(result.timezone.status, 'unknown');
});

test('handles optional hybrid offices and contractor privacy boilerplate', () => {
  const result = evaluate(`
    We are a remote-friendly company, and this position is open to candidates anywhere in the U.S.
    100% remote opportunity. We have office locations for hybrid/onsite work preference.
    We may evaluate your application for employment or an independent contractor role, as applicable.
  `);
  assert.equal(result.remoteType, 'region-restricted-remote');
  assert.equal(result.chinaEligibility, 'not-eligible');
  assert.equal(result.engagement, 'unknown');
  assert.equal(result.signals.hybrid, false);
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

test('blocks adult and gambling industries with evidence', () => {
  const result = evaluate(`
    Remote worldwide engineering role for an online casino and adult entertainment platform.
  `);
  assert.equal(result.policyDecision, 'block');
  assert.deepEqual(result.industrySignals.map(({ category }) => category).sort(), ['adult', 'gambling']);
  assert.ok(result.industrySignals.every(({ evidence }) => evidence.length > 0));
});

test('routes web3 roles to review instead of calling them fraudulent', () => {
  const result = evaluate(`
    Remote worldwide backend engineer for a Web3 company building a blockchain protocol.
  `);
  assert.equal(result.policyDecision, 'review');
  assert.equal(result.industrySignals[0].category, 'web3-crypto');
  assert.equal(result.industrySignals[0].action, 'review');
});

test('does not flag ordinary wallet or token wording without industry context', () => {
  const result = evaluate(`
    Remote worldwide frontend role. You will work on design tokens and a customer loyalty wallet.
  `);
  assert.equal(result.policyDecision, 'allow');
  assert.deepEqual(result.industrySignals, []);
});

test('allows users to override category actions with a local policy', (context) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'remote-fit-policy-'));
  context.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const policy = path.join(directory, 'policy.json');
  fs.writeFileSync(policy, JSON.stringify({ 'web3-crypto': 'block' }));
  const result = evaluate('Remote worldwide Web3 company building a blockchain protocol.', ['--policy', policy]);
  assert.equal(result.policyDecision, 'block');
  assert.equal(result.industrySignals[0].action, 'block');
});
