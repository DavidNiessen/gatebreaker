export const HYPEDDIT_HOSTS = new Set(['hypeddit.com', 'www.hypeddit.com']);
export const PUBLIC_FILE_ORIGIN = 'https://hypeddit-gates-prod.s3.amazonaws.com';
export const GATE_ID_PATTERN = /^[a-zA-Z0-9_-]{1,64}$/;

export function isHypedditPage(url: URL): boolean {
  return (
    url.protocol === 'https:' &&
    HYPEDDIT_HOSTS.has(url.hostname) &&
    !url.port &&
    !url.username &&
    !url.password
  );
}

export function publicFileUrl(gateId: string): string | null {
  return GATE_ID_PATTERN.test(gateId) ? `${PUBLIC_FILE_ORIGIN}/${gateId}_main` : null;
}

/** Only destinations supported by observed provider behavior can become links. */
export function safeDestination(input: unknown, pageUrl: URL): string | null {
  if (typeof input !== 'string' || !input.trim()) return null;
  try {
    const url = new URL(input, pageUrl);
    if (url.protocol !== 'https:' || url.username || url.password || url.port || url.hash)
      return null;
    if (url.origin === PUBLIC_FILE_ORIGIN && /^\/[a-zA-Z0-9_-]{1,64}_main$/.test(url.pathname))
      return url.href;
    if (isHypedditPage(url) && /^\/download\/[a-zA-Z0-9_-]{1,256}\/?$/.test(url.pathname))
      return url.href;
  } catch {
    /* Malformed URLs are untrusted input. */
  }
  return null;
}
