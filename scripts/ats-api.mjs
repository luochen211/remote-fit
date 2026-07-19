const SAFE_SEGMENT = /^[a-zA-Z0-9._-]+$/;

function safe(value) {
  return value && SAFE_SEGMENT.test(value) ? value : null;
}

export function resolveAtsApi(input) {
  const url = new URL(input);
  const parts = url.pathname.split('/').filter(Boolean);
  const host = url.hostname.toLowerCase();

  if (host === 'boards.greenhouse.io' || host === 'job-boards.greenhouse.io') {
    const company = safe(parts[0]);
    const jobsIndex = parts.indexOf('jobs');
    const id = safe(parts[jobsIndex + 1]);
    if (company && id) return { provider: 'greenhouse', apiUrl: `https://boards-api.greenhouse.io/v1/boards/${company}/jobs/${id}?content=true` };
  }
  if (host === 'jobs.lever.co') {
    const company = safe(parts[0]);
    const id = safe(parts[1]);
    if (company && id) return { provider: 'lever', apiUrl: `https://api.lever.co/v0/postings/${company}/${id}` };
  }
  if (host === 'jobs.ashbyhq.com') {
    const board = safe(parts[0]);
    const id = safe(parts[1]);
    if (board && id) return { provider: 'ashby', apiUrl: `https://api.ashbyhq.com/posting-api/job-board/${board}`, id };
  }
  if (host.endsWith('.myworkdayjobs.com')) {
    const tenant = safe(host.split('.')[0]);
    const locale = safe(parts[0]);
    const site = safe(parts[1]);
    const jobIndex = parts.indexOf('job');
    const slug = parts[jobIndex + 1] ? parts.slice(jobIndex + 1).map(safe) : [];
    if (tenant && locale && site && slug.length && slug.every(Boolean)) {
      return { provider: 'workday', apiUrl: `https://${host}/wday/cxs/${tenant}/${site}/job/${slug.join('/')}` };
    }
  }
  return null;
}

function flatten(value) {
  if (value == null) return '';
  if (typeof value === 'string' || typeof value === 'number') return String(value);
  if (Array.isArray(value)) return value.map(flatten).filter(Boolean).join('\n');
  if (typeof value === 'object') return Object.values(value).map(flatten).filter(Boolean).join('\n');
  return '';
}

export async function fetchAtsJob(input, fetchImpl = fetch) {
  const resolved = resolveAtsApi(input);
  if (!resolved) return null;
  let response;
  try {
    response = await fetchImpl(resolved.apiUrl, {
      signal: AbortSignal.timeout(15_000),
      headers: { accept: 'application/json', 'user-agent': 'RemoteFit/0.1 (+https://github.com/luochen211/remote-fit)' }
    });
  } catch {
    return null;
  }
  if ([404, 410].includes(response.status)) return { provider: resolved.provider, status: 'expired', statusCode: response.status };
  if (!response.ok) return null;

  let data;
  try { data = await response.json(); } catch { return null; }
  if (resolved.provider === 'ashby') {
    const job = data.jobs?.find((item) => item.id === resolved.id || item.jobUrl?.includes(resolved.id) || item.applyUrl?.includes(resolved.id));
    if (!job) return { provider: 'ashby', status: 'expired', statusCode: 200 };
    data = job;
  }

  const text = flatten(data);
  if (text.length < 120) return null;
  return { provider: resolved.provider, status: 'active', statusCode: response.status, text, data };
}

