/** Cross-provider baseline; each provider additionally validates its own hosts. */
export function safeHttpsUrl(input: unknown): string | null {
  if (typeof input !== 'string' || !input.trim()) return null;
  try {
    const url = new URL(input);
    if (url.protocol !== 'https:' || url.username || url.password || url.port || url.hash)
      return null;
    return url.href;
  } catch {
    // Malformed URLs are untrusted input.
  }
  return null;
}
