const BOT_CHALLENGE_PATTERNS = [
  /cloudflare/i,
  /cf-chl-/i,
  /just a moment/i,
  /verify you are human/i,
  /captcha/i,
  /access denied/i
];

const EXPIRED_PATTERNS = [
  /position (?:has been|is) filled/i,
  /job (?:is )?no longer available/i,
  /posting (?:has )?expired/i,
  /applications? (?:are )?closed/i,
  /职位已关闭|岗位已下线|招聘已结束|停止招聘/
];

const APPLY_PATTERNS = [
  /\bapply (?:now|for this job)\b/i,
  /submit (?:your )?application/i,
  /立即申请|投递简历/
];

function jobToken(urlValue) {
  try {
    const url = new URL(urlValue);
    const candidates = url.pathname.split('/').filter(Boolean).reverse();
    return candidates.find((part) => /\d/.test(part) && part.length >= 4) ?? null;
  } catch {
    return null;
  }
}

export function classifyLiveness({
  statusCode = 200,
  requestedUrl,
  finalUrl = requestedUrl,
  text = '',
  structured = null,
  applyControlVisible = false,
  now = Date.now()
}) {
  if ([404, 410].includes(statusCode)) {
    return { status: 'expired', code: `http_${statusCode}`, evidence: [`HTTP ${statusCode}`] };
  }
  if ([403, 429, 503].includes(statusCode)) {
    return { status: 'uncertain', code: 'access_blocked', evidence: [`HTTP ${statusCode}`] };
  }

  const botSignal = BOT_CHALLENGE_PATTERNS.find((pattern) => pattern.test(text));
  if (botSignal) return { status: 'uncertain', code: 'bot_challenge', evidence: [text.match(botSignal)?.[0] ?? 'bot challenge'] };

  const expiredEvidence = EXPIRED_PATTERNS.map((pattern) => text.match(pattern)?.[0]).filter(Boolean);
  const validThrough = structured?.validThrough ? Date.parse(structured.validThrough) : Number.NaN;
  if (Number.isFinite(validThrough) && validThrough < now) expiredEvidence.push(`validThrough: ${structured.validThrough}`);
  if (expiredEvidence.length) return { status: 'expired', code: 'expired_signal', evidence: expiredEvidence };

  const requestedToken = jobToken(requestedUrl);
  if (requestedToken && finalUrl && !decodeURIComponent(finalUrl).includes(decodeURIComponent(requestedToken))) {
    return { status: 'uncertain', code: 'redirected_off_posting', evidence: [`Job identifier ${requestedToken} disappeared after redirect`] };
  }

  const activeEvidence = APPLY_PATTERNS.map((pattern) => text.match(pattern)?.[0]).filter(Boolean);
  if (applyControlVisible) activeEvidence.unshift('visible application control');
  if (activeEvidence.length) return { status: 'active', code: 'apply_available', evidence: activeEvidence };

  return { status: 'uncertain', code: 'no_apply_control', evidence: [] };
}

