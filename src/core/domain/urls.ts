/** Cross-provider destination baseline. Fragments may contain file keys (e.g. MEGA). */
export function safeHttpsUrl(input: unknown): string | null {
  if (typeof input !== 'string' || !input.trim()) return null;
  try {
    const url = new URL(input);
    if (url.protocol !== 'https:' || url.username || url.password || url.port) return null;
    const host = url.hostname.toLowerCase();
    if (!host.includes('.') || host === 'localhost' || /\.(?:localhost|local|internal)$/.test(host))
      return null;
    if (host.startsWith('[')) return null;
    const ip = /^(\d+)\.(\d+)\.(\d+)\.(\d+)$/.exec(host);
    if (ip) {
      const first = Number(ip[1]);
      const second = Number(ip[2]);
      if (
        first === 0 ||
        first === 10 ||
        first === 127 ||
        first >= 224 ||
        (first === 169 && second === 254) ||
        (first === 172 && second >= 16 && second <= 31) ||
        (first === 192 && second === 168) ||
        (first === 100 && second >= 64 && second <= 127) ||
        (first === 198 && (second === 18 || second === 19))
      )
        return null;
    }
    return url.href;
  } catch {
    // Malformed URLs are untrusted input.
  }
  return null;
}
