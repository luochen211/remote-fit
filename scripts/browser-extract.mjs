import net from 'node:net';
import dns from 'node:dns/promises';

function isPrivateAddress(address) {
  if (net.isIPv4(address)) {
    const part = address.split('.').map(Number);
    return part[0] === 10 || part[0] === 127 || part[0] === 0
      || (part[0] === 169 && part[1] === 254)
      || (part[0] === 172 && part[1] >= 16 && part[1] <= 31)
      || (part[0] === 192 && part[1] === 168);
  }
  if (!net.isIPv6(address)) return false;
  const value = address.toLowerCase();
  return value === '::1' || value === '::' || value.startsWith('fc') || value.startsWith('fd') || /^fe[89ab]/.test(value);
}

function parsePublicUrl(input) {
  const url = new URL(input);
  const host = url.hostname.toLowerCase();
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password
    || host === 'localhost' || host.endsWith('.local') || (net.isIP(host) && isPrivateAddress(host))) {
    throw new Error('Local, private, and non-HTTP(S) URLs are not allowed');
  }
  return url;
}

async function safeBrowserRequest(input, dnsCache) {
  try {
    const url = new URL(input);
    if (!['http:', 'https:'].includes(url.protocol)) return false;
    const host = url.hostname.toLowerCase();
    if (host === 'localhost' || host.endsWith('.local') || (net.isIP(host) && isPrivateAddress(host))) return false;
    if (!net.isIP(host)) {
      if (!dnsCache.has(host)) dnsCache.set(host, dns.lookup(host, { all: true, verbatim: true }).catch(() => []));
      const addresses = await dnsCache.get(host);
      if (!addresses.length || addresses.some(({ address }) => isPrivateAddress(address))) return false;
    }
    return true;
  } catch {
    return false;
  }
}

export async function extractWithBrowser(input) {
  parsePublicUrl(input);
  let chromium;
  try {
    ({ chromium } = await import('playwright'));
  } catch {
    return { available: false, reason: 'Playwright is not installed' };
  }

  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/124 Safari/537.36' });
    const page = await context.newPage();
    const dnsCache = new Map();
    await page.route('**/*', async (route) => await safeBrowserRequest(route.request().url(), dnsCache) ? route.continue() : route.abort());
    const response = await page.goto(input, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    await page.waitForTimeout(1_500);
    const finalUrl = page.url();
    parsePublicUrl(finalUrl);
    const text = await page.locator('main, article, [role="main"], body').first().innerText({ timeout: 5_000 });
    const applyControlVisible = await page.getByRole('link', { name: /apply|申请|投递/i }).or(page.getByRole('button', { name: /apply|申请|投递/i })).first().isVisible().catch(() => false);
    return { available: true, statusCode: response?.status() ?? 200, finalUrl, text: text.slice(0, 50_000), applyControlVisible };
  } catch (error) {
    return { available: true, error: error.message };
  } finally {
    await browser?.close();
  }
}
