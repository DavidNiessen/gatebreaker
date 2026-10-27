import type { GateChallenge } from '../../domain/provider';
import { captchaNoncePattern } from '../../platform/captcha-protocol';

function value(document: Document, id: string): string {
  return document.querySelector<HTMLInputElement>(`[id="${id}"]`)?.value.trim() ?? '';
}
export function emailChallenge(document: Document): 'none' | 'required' | 'unknown' {
  const captcha = document.querySelector<HTMLElement>('#gatePreviewCaptcha');
  if (
    captcha &&
    !captcha.hidden &&
    !captcha.classList.contains('hide') &&
    captcha.style.display !== 'none'
  )
    return 'required';
  const log = document.querySelector<HTMLElement>('#captchalog');
  if (log?.dataset['attempts'] === 'over') return 'required';
  const max = Number(log?.dataset['maxAttempts']);
  if (!Number.isSafeInteger(max) || max < 1) return 'none';
  try {
    const raw = document.cookie
      .split(';')
      .map((s) => s.trim())
      .find((s) => s.startsWith('teb3456767win='))
      ?.slice('teb3456767win='.length);
    if (!raw) return 'none';
    if (raw.length > 16384) return 'unknown';
    const attempts: unknown = JSON.parse(decodeURIComponent(raw));
    if (!attempts || typeof attempts !== 'object' || Array.isArray(attempts)) return 'unknown';
    const count = (attempts as Record<string, unknown>)[value(document, 'fan_gate_id')];
    if (count === undefined) return 'none';
    if (typeof count !== 'number' || !Number.isSafeInteger(count) || count < 0) return 'unknown';
    return count >= max ? 'required' : 'none';
  } catch {
    return 'unknown';
  }
}
export function challengeDescriptor(
  url: URL,
  surface: 'page' | 'popup',
  gate: string,
): GateChallenge {
  const nonce = crypto.randomUUID();
  const frame = new URL('https://hypeddit.com' + url.pathname);
  frame.hash = `gatebreaker-captcha=${nonce}`;
  return { id: 'solve-captcha', gate, nonce, url: frame.href, surface };
}
export function validChallengeNonce(value: unknown): value is string {
  return typeof value === 'string' && captchaNoncePattern.test(value);
}
