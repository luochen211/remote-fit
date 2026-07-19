#!/usr/bin/env node

import fs from 'node:fs';

const args = process.argv.slice(2);
const fileIndex = args.indexOf('--file');
const wantsSummary = args.includes('--summary');

function usage(message) {
  if (message) console.error(message);
  console.error('Usage: node scripts/evaluate-remote.mjs [--file jd.txt] [--summary]');
  process.exit(2);
}

if (fileIndex >= 0 && !args[fileIndex + 1]) usage('--file requires a path');

const input = fileIndex >= 0
  ? fs.readFileSync(args[fileIndex + 1], 'utf8')
  : fs.readFileSync(0, 'utf8');

if (!input.trim()) usage('Job description is empty');

const normalized = input.toLowerCase().replace(/\s+/g, ' ');

const rules = {
  globalRemote: [
    /work from anywhere/,
    /worldwide remote/,
    /remote worldwide/,
    /globally remote/,
    /anywhere in the world/,
    /全球远程/,
    /不限地区/
  ],
  remote: [
    /\bremote\b/,
    /distributed team/,
    /远程工作/,
    /全远程/,
    /居家办公/
  ],
  hybrid: [
    /\bhybrid\b/,
    /days? (?:per|a) week in (?:the )?office/,
    /混合办公/,
    /每周.{0,8}到岗/,
    /部分远程/
  ],
  chinaIncluded: [
    /(?:open to|hiring in|based in|located in).{0,30}\bchina\b/,
    /\bapac\b/,
    /asia[- ]?pacific/,
    /中国境内/,
    /亚太地区/
  ],
  chinaExcluded: [
    /excluding china/,
    /except china/,
    /not available in china/,
    /cannot hire in china/,
    /不包含中国/,
    /不接受中国/,
    /中国地区除外/
  ],
  regionRestricted: [
    /\b(?:us|u\.s\.|usa) only\b/,
    /\b(?:eu|emea|europe|uk|canada) only\b/,
    /must (?:be|reside|live) (?:in|within) (?:the )?(?:us|u\.s\.|usa|eu|emea|europe|uk|canada)/,
    /remote (?:within|in) (?:the )?(?:us|u\.s\.|usa|eu|emea|europe|uk|canada)/,
    /仅限.{0,12}(?:美国|欧盟|欧洲|英国|加拿大)/
  ],
  relocation: [
    /relocation required/,
    /must relocate/,
    /必须搬迁/,
    /需要搬迁/,
    /需到岗/
  ],
  workAuthorization: [
    /must be authorized to work in/,
    /no visa sponsorship/,
    /right to work in/,
    /security clearance/,
    /工作许可/,
    /不提供签证/,
    /安全许可/
  ],
  contractor: [/independent contractor/, /\bcontractor\b/, /freelance/, /合同工/, /自由职业/],
  eor: [/employer of record/, /\beor\b/, /deel/, /remote\.com/],
  employee: [/full[- ]time employee/, /permanent employee/, /正式员工/, /劳动合同/],
  timezone: [
    /(?:utc|gmt)\s*[+-]\s*\d{1,2}(?::\d{2})?/g,
    /(?:pst|pdt|est|edt|cet|cest|aest|ist)\b/g,
    /overlap.{0,30}(?:hours?|timezone|time zone)/g,
    /时区.{0,20}(?:重叠|交叉|要求)/g
  ],
  risk: [
    { pattern: /(?:pay|fee|deposit).{0,30}(?:apply|application|training|equipment)/, code: 'upfront-fee' },
    { pattern: /押金|培训费|入职费|保证金/, code: 'upfront-fee' },
    { pattern: /unpaid (?:trial|project|assignment)/, code: 'unpaid-trial' },
    { pattern: /无薪试岗|免费试做/, code: 'unpaid-trial' },
    { pattern: /contact (?:only )?(?:via|on) (?:telegram|whatsapp)/, code: 'off-platform-contact' },
    { pattern: /guaranteed (?:income|earnings)|easy money/, code: 'income-promise' },
    { pattern: /保证收入|轻松赚钱|日结高薪/, code: 'income-promise' }
  ]
};

function matches(patterns) {
  return patterns.some((pattern) => pattern.test(normalized));
}

function excerpts(patterns) {
  const found = [];
  for (const pattern of patterns) {
    pattern.lastIndex = 0;
    const match = pattern.exec(normalized);
    if (!match) continue;
    const start = Math.max(0, match.index - 45);
    const end = Math.min(normalized.length, match.index + match[0].length + 45);
    found.push(normalized.slice(start, end).trim());
  }
  return [...new Set(found)];
}

const signals = {
  globalRemote: matches(rules.globalRemote),
  remote: matches(rules.remote),
  hybrid: matches(rules.hybrid),
  chinaIncluded: matches(rules.chinaIncluded),
  chinaExcluded: matches(rules.chinaExcluded),
  regionRestricted: matches(rules.regionRestricted),
  relocationRequired: matches(rules.relocation),
  workAuthorizationConstraint: matches(rules.workAuthorization)
};

let remoteType = 'unknown';
if (signals.hybrid || signals.relocationRequired) remoteType = 'hybrid-or-onsite';
else if (signals.globalRemote) remoteType = 'global-remote';
else if (signals.remote && signals.regionRestricted) remoteType = 'region-restricted-remote';
else if (signals.remote) remoteType = 'remote-unspecified';

let engagement = 'unknown';
if (matches(rules.eor)) engagement = 'eor';
else if (matches(rules.contractor)) engagement = 'contractor';
else if (matches(rules.employee)) engagement = 'employee';

let chinaEligibility = 'needs-confirmation';
const hardExclusion = signals.chinaExcluded || signals.regionRestricted || signals.relocationRequired || signals.hybrid;
if (hardExclusion) chinaEligibility = 'not-eligible';
else if (signals.chinaIncluded || signals.globalRemote) chinaEligibility = 'likely-eligible';

const riskSignals = rules.risk
  .filter(({ pattern }) => pattern.test(normalized))
  .map(({ code }) => code);

const timezones = excerpts(rules.timezone);
const evidence = {
  positive: excerpts([...rules.globalRemote, ...rules.chinaIncluded]),
  exclusions: excerpts([...rules.chinaExcluded, ...rules.regionRestricted, ...rules.relocation, ...rules.hybrid]),
  authorization: excerpts(rules.workAuthorization),
  timezone: timezones
};

let confidencePoints = 0;
if (signals.remote || signals.hybrid) confidencePoints += 1;
if (evidence.positive.length || evidence.exclusions.length) confidencePoints += 1;
if (engagement !== 'unknown') confidencePoints += 1;
if (timezones.length) confidencePoints += 1;

const result = {
  remoteType,
  chinaEligibility,
  engagement,
  timezone: timezones.length ? { status: 'stated', evidence: timezones } : { status: 'unknown', evidence: [] },
  workAuthorization: signals.workAuthorizationConstraint ? 'constraint-stated' : 'unknown',
  riskSignals: [...new Set(riskSignals)],
  confidence: confidencePoints >= 3 ? 'high' : confidencePoints === 2 ? 'medium' : 'low',
  signals,
  evidence,
  nextQuestions: [
    engagement === 'unknown' ? 'Will the company hire in China through a local entity, EOR, or contractor agreement?' : null,
    !timezones.length ? 'What timezone overlap or fixed working hours are required?' : null,
    chinaEligibility === 'needs-confirmation' ? 'Does the company explicitly accept candidates who reside in mainland China?' : null,
    signals.workAuthorizationConstraint ? 'Which country work authorization is required for this role?' : null
  ].filter(Boolean)
};

if (wantsSummary) {
  const labels = {
    'likely-eligible': '大概率可申请',
    'needs-confirmation': '需确认',
    'not-eligible': '不建议申请'
  };
  console.log(`中国可申请性：${labels[chinaEligibility]}`);
  console.log(`远程类型：${remoteType}`);
  console.log(`用工形式：${engagement}`);
  console.log(`时区要求：${timezones.length ? '已识别' : '未说明'}`);
  console.log(`风险信号：${result.riskSignals.length ? result.riskSignals.join(', ') : '未发现明确信号'}`);
  console.log(`置信度：${result.confidence}`);
} else {
  console.log(JSON.stringify(result, null, 2));
}

