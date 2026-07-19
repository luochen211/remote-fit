#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import dns from 'node:dns/promises';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { fetchAtsJob } from './ats-api.mjs';
import { extractWithBrowser } from './browser-extract.mjs';
import { classifyLiveness } from './liveness.mjs';

const MAX_REDIRECTS = 5;
const MAX_HTML_BYTES = 2_000_000;
const FETCH_TIMEOUT_MS = 20_000;
const evaluatorPath = fileURLToPath(new URL('./evaluate-remote.mjs', import.meta.url));

function decodeEntities(value) {
  const named = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
  return value.replace(/&(#x[\da-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi, (_, entity) => {
    if (entity[0] !== '#') return named[entity.toLowerCase()] ?? _;
    const hex = entity[1].toLowerCase() === 'x';
    const codePoint = Number.parseInt(entity.slice(hex ? 2 : 1), hex ? 16 : 10);
    return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : _;
  });
}

function textFromHtml(fragment) {
  return decodeEntities(fragment
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(script|style|svg|noscript|template)[^>]*>[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<(br|\/p|\/li|\/div|\/section|\/article|\/h[1-6])\s*>/gi, '\n')
    .replace(/<li[^>]*>/gi, '\n- ')
    .replace(/<[^>]+>/g, ' '))
    .replace(/\r/g, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function collectJobPostings(value, found = []) {
  if (Array.isArray(value)) {
    value.forEach((item) => collectJobPostings(item, found));
    return found;
  }
  if (!value || typeof value !== 'object') return found;
  const type = value['@type'];
  if (type === 'JobPosting' || (Array.isArray(type) && type.includes('JobPosting'))) found.push(value);
  Object.values(value).forEach((item) => collectJobPostings(item, found));
  return found;
}

function readable(value) {
  if (value == null) return '';
  if (typeof value === 'string' || typeof value === 'number') return String(value);
  if (Array.isArray(value)) return value.map(readable).filter(Boolean).join(', ');
  if (typeof value === 'object') {
    return readable(value.name ?? value.address ?? value.addressCountry ?? value.addressRegion ?? value.value ?? Object.values(value));
  }
  return '';
}

export function extractJobDescription(html) {
  const postings = [];
  const scriptPattern = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  for (const match of html.matchAll(scriptPattern)) {
    try {
      collectJobPostings(JSON.parse(decodeEntities(match[1].trim())), postings);
    } catch {
      // Invalid publisher JSON-LD is ignored; HTML extraction remains available.
    }
  }

  if (postings.length) {
    const posting = postings[0];
    const fields = [
      ['Role', posting.title],
      ['Company', posting.hiringOrganization],
      ['Description', textFromHtml(readable(posting.description))],
      ['Location type', posting.jobLocationType],
      ['Job location', posting.jobLocation],
      ['Applicant location requirements', posting.applicantLocationRequirements],
      ['Employment type', posting.employmentType],
      ['Valid through', posting.validThrough]
    ];
    return {
      extractionMethod: 'json-ld',
      text: fields.map(([label, value]) => `${label}: ${readable(value)}`).filter((line) => !line.endsWith(': ')).join('\n'),
      structured: posting
    };
  }

  const main = html.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i)?.[1]
    ?? html.match(/<article\b[^>]*>([\s\S]*?)<\/article>/i)?.[1]
    ?? html.match(/<body\b[^>]*>([\s\S]*?)<\/body>/i)?.[1]
    ?? html;
  return { extractionMethod: 'html', text: textFromHtml(main), structured: null };
}

function isPrivateIpv4(address) {
  const octets = address.split('.').map(Number);
  return octets[0] === 10
    || octets[0] === 127
    || (octets[0] === 169 && octets[1] === 254)
    || (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31)
    || (octets[0] === 192 && octets[1] === 168)
    || (octets[0] === 0);
}

export function isPrivateAddress(address) {
  if (net.isIPv4(address)) return isPrivateIpv4(address);
  if (!net.isIPv6(address)) return false;
  const normalized = address.toLowerCase();
  return normalized === '::1'
    || normalized === '::'
    || normalized.startsWith('fc')
    || normalized.startsWith('fd')
    || normalized.startsWith('fe8')
    || normalized.startsWith('fe9')
    || normalized.startsWith('fea')
    || normalized.startsWith('feb')
    || normalized.startsWith('::ffff:127.')
    || normalized.startsWith('::ffff:10.')
    || normalized.startsWith('::ffff:192.168.');
}

export function parsePublicUrl(input) {
  let url;
  try {
    url = new URL(input);
  } catch {
    throw new Error('Invalid job URL');
  }
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Only HTTP(S) job URLs are supported');
  if (url.username || url.password) throw new Error('URLs with embedded credentials are not allowed');
  const hostname = url.hostname.toLowerCase();
  if (hostname === 'localhost' || hostname.endsWith('.localhost') || hostname.endsWith('.local')) {
    throw new Error('Local and private URLs are not allowed');
  }
  if (net.isIP(hostname) && isPrivateAddress(hostname)) throw new Error('Local and private URLs are not allowed');
  return url;
}

async function assertPublicDns(url) {
  if (net.isIP(url.hostname)) return;
  const addresses = await dns.lookup(url.hostname, { all: true, verbatim: true });
  if (!addresses.length || addresses.some(({ address }) => isPrivateAddress(address))) {
    throw new Error('Job URL resolves to a private or unavailable address');
  }
}

export async function fetchJobPage(input, fetchImpl = fetch) {
  let current = parsePublicUrl(input);
  for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects += 1) {
    await assertPublicDns(current);
    const response = await fetchImpl(current, {
      redirect: 'manual',
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: {
        accept: 'text/html,application/xhtml+xml',
        'user-agent': 'RemoteFit/0.1 (+https://github.com/luochen211/remote-fit)'
      }
    });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get('location');
      if (!location) throw new Error(`Redirect ${response.status} did not include a location`);
      current = parsePublicUrl(new URL(location, current).href);
      continue;
    }
    if (!response.ok) return { requestedUrl: input, finalUrl: current.href, statusCode: response.status, html: '' };
    const contentType = response.headers.get('content-type') ?? '';
    if (!contentType.includes('text/html') && !contentType.includes('application/xhtml+xml')) {
      throw new Error(`Unsupported job page content type: ${contentType || 'unknown'}`);
    }
    const html = await response.text();
    if (Buffer.byteLength(html) > MAX_HTML_BYTES) throw new Error('Job page is too large to analyze safely');
    return { requestedUrl: input, finalUrl: current.href, statusCode: response.status, html };
  }
  throw new Error(`Too many redirects (maximum ${MAX_REDIRECTS})`);
}

export function assessLiveness(text, structured = null, now = Date.now()) {
  return classifyLiveness({ text, structured, now });
}

async function obtainJob(input) {
  const ats = await fetchAtsJob(input);
  if (ats?.status === 'active') {
    return {
      page: { requestedUrl: input, finalUrl: input, statusCode: ats.statusCode },
      extracted: { extractionMethod: `${ats.provider}-api`, text: ats.text, structured: ats.data },
      applyControlVisible: true
    };
  }
  if (ats?.status === 'expired') {
    return {
      page: { requestedUrl: input, finalUrl: input, statusCode: ats.statusCode },
      extracted: { extractionMethod: `${ats.provider}-api`, text: '', structured: null },
      liveness: { status: 'expired', code: 'ats_not_found', evidence: [`${ats.provider} API no longer lists this job`] }
    };
  }

  const page = await fetchJobPage(input);
  let extracted = page.html ? extractJobDescription(page.html) : { extractionMethod: 'http', text: '', structured: null };
  let applyControlVisible = false;
  if ([403, 429, 503].includes(page.statusCode) || extracted.text.length < 120) {
    const browser = await extractWithBrowser(input);
    if (browser.available && !browser.error && browser.text?.length >= 120) {
      page.finalUrl = browser.finalUrl;
      page.statusCode = browser.statusCode;
      extracted = { extractionMethod: 'browser', text: browser.text, structured: null };
      applyControlVisible = browser.applyControlVisible;
    }
  }
  return { page, extracted, applyControlVisible };
}

function runEvaluator(text, { policyPath, summary }) {
  const evaluatorArgs = [evaluatorPath];
  if (policyPath) evaluatorArgs.push('--policy', policyPath);
  if (summary) evaluatorArgs.push('--summary');
  const result = spawnSync(process.execPath, evaluatorArgs, { input: text, encoding: 'utf8' });
  if (result.status !== 0) throw new Error(result.stderr.trim() || 'Remote eligibility evaluator failed');
  return summary ? result.stdout.trim() : JSON.parse(result.stdout);
}

function parseArgs(argv) {
  const values = { url: null, policyPath: null, summary: false, savePath: null };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith('--') && !values.url) values.url = token;
    else if (token === '--summary') values.summary = true;
    else if (token === '--policy') values.policyPath = argv[++index];
    else if (token === '--save') values.savePath = argv[++index];
    else throw new Error(`Unknown argument: ${token}`);
  }
  if (!values.url) throw new Error('Usage: node scripts/evaluate-url.mjs <job-url> [--policy file.json] [--summary] [--save jd.txt]');
  if (argv.includes('--policy') && !values.policyPath) throw new Error('--policy requires a path');
  if (argv.includes('--save') && !values.savePath) throw new Error('--save requires a path');
  return values;
}

async function main() {
  try {
    const args = parseArgs(process.argv.slice(2));
    const obtained = await obtainJob(args.url);
    const { page, extracted } = obtained;
    const liveness = obtained.liveness ?? classifyLiveness({
      statusCode: page.statusCode,
      requestedUrl: page.requestedUrl,
      finalUrl: page.finalUrl,
      text: extracted.text,
      structured: extracted.structured,
      applyControlVisible: obtained.applyControlVisible
    });
    const source = {
      requestedUrl: page.requestedUrl,
      finalUrl: page.finalUrl,
      statusCode: page.statusCode,
      extractionMethod: extracted.extractionMethod,
      extractedCharacters: extracted.text.length
    };
    if (liveness.status === 'expired' || extracted.text.length < 120) {
      if (args.summary) {
        console.log(`来源：${page.finalUrl}`);
        console.log(`提取：${extracted.extractionMethod}`);
        console.log(`存活状态：${liveness.status} (${liveness.code})`);
        console.log(liveness.status === 'expired' ? '结论：岗位已失效，不进入适配分析。' : '结论：无法可靠提取 JD，请粘贴职位正文。');
      } else {
        console.log(JSON.stringify({ source, liveness, evaluation: null }, null, 2));
      }
      return;
    }
    if (args.savePath) fs.writeFileSync(path.resolve(args.savePath), `${extracted.text}\n`);
    const evaluation = runEvaluator(extracted.text, args);

    if (args.summary) {
      console.log(`来源：${page.finalUrl}`);
      console.log(`提取：${extracted.extractionMethod}`);
      console.log(`存活状态：${liveness.status}`);
      console.log(evaluation);
    } else {
      console.log(JSON.stringify({
        source,
        liveness,
        evaluation
      }, null, 2));
    }
  } catch (error) {
    console.error(error.message);
    process.exitCode = 2;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
