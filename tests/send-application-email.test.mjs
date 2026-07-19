import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { buildApproval, validateApproval } from '../scripts/send-application-email.mjs';

function fixture() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'remote-career-email-'));
  const attachment = path.join(directory, 'cv.pdf');
  fs.writeFileSync(attachment, 'verified cv');
  return { directory, attachment };
}

test('validates an unchanged email after second confirmation', (context) => {
  const { directory, attachment } = fixture();
  context.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const now = Date.parse('2026-07-19T00:00:00Z');
  const approval = buildApproval({
    to: 'jobs@example.com',
    subject: 'Application',
    body: 'Hello',
    attachments: [attachment],
    now,
    nonce: 'test'
  });
  assert.equal(validateApproval(approval, approval.confirmationCode, now + 1000), true);
});

test('rejects an incorrect second confirmation code', () => {
  const now = Date.parse('2026-07-19T00:00:00Z');
  const approval = buildApproval({ to: 'jobs@example.com', subject: 'Application', body: 'Hello', now, nonce: 'test' });
  assert.throws(() => validateApproval(approval, 'SEND-WRONG', now + 1000), /does not match/);
});

test('rejects expired approval', () => {
  const now = Date.parse('2026-07-19T00:00:00Z');
  const approval = buildApproval({ to: 'jobs@example.com', subject: 'Application', body: 'Hello', now, nonce: 'test' });
  assert.throws(() => validateApproval(approval, approval.confirmationCode, now + 31 * 60 * 1000), /expired/);
});

test('rejects an attachment changed after approval', (context) => {
  const { directory, attachment } = fixture();
  context.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const now = Date.parse('2026-07-19T00:00:00Z');
  const approval = buildApproval({ to: 'jobs@example.com', subject: 'Application', body: 'Hello', attachments: [attachment], now, nonce: 'test' });
  fs.writeFileSync(attachment, 'changed cv');
  assert.throws(() => validateApproval(approval, approval.confirmationCode, now + 1000), /Attachment changed/);
});

