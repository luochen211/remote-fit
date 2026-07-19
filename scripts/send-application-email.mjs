#!/usr/bin/env node

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const APPROVAL_TTL_MS = 30 * 60 * 1000;
const FIRST_CONFIRMATION = 'YES-I-REVIEWED-THE-DRAFT';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const approvalDir = path.join(root, 'output', 'email-approvals');

export function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

export function buildApproval({ to, subject, body, attachments = [], now = Date.now(), nonce }) {
  const normalizedAttachments = attachments.map((file) => {
    const absolute = path.resolve(file);
    const content = fs.readFileSync(absolute);
    return { path: absolute, name: path.basename(absolute), sha256: sha256(content) };
  });
  const id = `${new Date(now).toISOString().replace(/[-:.TZ]/g, '').slice(0, 14)}-${nonce ?? crypto.randomBytes(4).toString('hex')}`;
  const digest = sha256(JSON.stringify({ to, subject, body, attachments: normalizedAttachments }));
  const code = `SEND-${digest.slice(0, 8).toUpperCase()}`;
  return {
    version: 1,
    id,
    createdAt: new Date(now).toISOString(),
    expiresAt: new Date(now + APPROVAL_TTL_MS).toISOString(),
    status: 'awaiting-second-confirmation',
    to,
    subject,
    body,
    attachments: normalizedAttachments,
    digest,
    confirmationCode: code
  };
}

export function validateApproval(approval, confirmationCode, now = Date.now()) {
  if (approval.status !== 'awaiting-second-confirmation') throw new Error('Approval is not sendable');
  if (now > Date.parse(approval.expiresAt)) throw new Error('Approval expired; review the draft again');
  if (confirmationCode !== approval.confirmationCode) throw new Error('Second confirmation code does not match');

  const attachments = approval.attachments.map((attachment) => {
    const content = fs.readFileSync(attachment.path);
    if (sha256(content) !== attachment.sha256) throw new Error(`Attachment changed after approval: ${attachment.name}`);
    return attachment;
  });
  const digest = sha256(JSON.stringify({
    to: approval.to,
    subject: approval.subject,
    body: approval.body,
    attachments
  }));
  if (digest !== approval.digest) throw new Error('Email content changed after approval');
  return true;
}

function parseArgs(argv) {
  const [command, ...rest] = argv;
  const values = { command, attachment: [] };
  for (let index = 0; index < rest.length; index += 1) {
    const token = rest[index];
    if (!token.startsWith('--')) throw new Error(`Unexpected argument: ${token}`);
    const key = token.slice(2).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
    const value = rest[index + 1];
    if (!value || value.startsWith('--')) throw new Error(`${token} requires a value`);
    index += 1;
    if (key === 'attachment') values.attachment.push(value);
    else values[key] = value;
  }
  return values;
}

function requireValue(value, name) {
  if (!value) throw new Error(`Missing --${name}`);
  return value;
}

function loadLocalEnv() {
  const envPath = path.join(root, '.env');
  if (!fs.existsSync(envPath)) return;
  for (const rawLine of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const separator = line.indexOf('=');
    if (separator < 1) continue;
    const key = line.slice(0, separator).trim();
    let value = line.slice(separator + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}

function printPreview(approval) {
  console.log('SECOND CONFIRMATION REQUIRED');
  console.log(`To: ${approval.to}`);
  console.log(`Subject: ${approval.subject}`);
  console.log(`Attachments: ${approval.attachments.map((item) => item.name).join(', ') || 'none'}`);
  console.log(`Body SHA-256: ${sha256(approval.body).slice(0, 16)}`);
  console.log(`Expires: ${approval.expiresAt}`);
  console.log(`Approval ID: ${approval.id}`);
  console.log(`Confirmation code: ${approval.confirmationCode}`);
  console.log('Nothing has been sent. Show this complete summary to the user and ask for the code verbatim.');
}

async function prepare(args) {
  requireValue(args.to, 'to');
  requireValue(args.subject, 'subject');
  requireValue(args.bodyFile, 'body-file');
  if (args.confirmDraft !== FIRST_CONFIRMATION) {
    throw new Error(`First confirmation missing. After the user reviews the full draft, rerun with --confirm-draft ${FIRST_CONFIRMATION}`);
  }
  const bodyPath = path.resolve(args.bodyFile);
  const approval = buildApproval({
    to: args.to,
    subject: args.subject,
    body: fs.readFileSync(bodyPath, 'utf8'),
    attachments: args.attachment
  });
  fs.mkdirSync(approvalDir, { recursive: true });
  fs.writeFileSync(path.join(approvalDir, `${approval.id}.json`), `${JSON.stringify(approval, null, 2)}\n`, { mode: 0o600 });
  printPreview(approval);
}

async function send(args) {
  requireValue(args.approval, 'approval');
  requireValue(args.confirm, 'confirm');
  const approvalPath = path.join(approvalDir, `${path.basename(args.approval)}.json`);
  const approval = JSON.parse(fs.readFileSync(approvalPath, 'utf8'));
  validateApproval(approval, args.confirm);
  loadLocalEnv();

  for (const key of ['SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASS', 'MAIL_FROM']) {
    if (!process.env[key]) throw new Error(`Missing ${key}; configure .env from .env.example`);
  }

  const { default: nodemailer } = await import('nodemailer');
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT),
    secure: process.env.SMTP_SECURE === 'true',
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
  });
  const info = await transporter.sendMail({
    from: process.env.MAIL_FROM,
    to: approval.to,
    subject: approval.subject,
    text: approval.body,
    attachments: approval.attachments.map((item) => ({ filename: item.name, path: item.path }))
  });
  approval.status = 'sent';
  approval.sentAt = new Date().toISOString();
  approval.messageId = info.messageId;
  delete approval.confirmationCode;
  fs.writeFileSync(approvalPath, `${JSON.stringify(approval, null, 2)}\n`, { mode: 0o600 });
  console.log(JSON.stringify({ status: 'sent', messageId: info.messageId, to: approval.to }, null, 2));
}

async function main() {
  try {
    const args = parseArgs(process.argv.slice(2));
    if (args.command === 'prepare') await prepare(args);
    else if (args.command === 'send') await send(args);
    else throw new Error('Usage: prepare|send. Run with no automatic sending; both confirmations are mandatory.');
  } catch (error) {
    console.error(error.message);
    process.exitCode = 2;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}

