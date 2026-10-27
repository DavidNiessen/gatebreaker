import type { GateChallenge } from '../domain/provider';
import { captchaFrameMessage, captchaNoncePattern } from '../platform/captcha-protocol';

export function createCaptchaView(
  challenge: GateChallenge,
  callbacks: { solved(nonce: string): void; cancel(): void; fallback?(): void },
) {
  const url = new URL(challenge.url);
  if (
    url.origin !== 'https://hypeddit.com' ||
    url.username ||
    url.password ||
    url.port ||
    url.search ||
    !captchaNoncePattern.test(challenge.nonce) ||
    url.hash !== `#gatebreaker-captcha=${challenge.nonce}`
  )
    throw new Error('Unsupported CAPTCHA frame');
  const root = document.createElement('div');
  root.className = 'captcha-view';
  const text = document.createElement('p');
  text.setAttribute('role', 'status');
  text.textContent = 'Loading Hypeddit’s CAPTCHA…';
  const close = document.createElement('button');
  close.type = 'button';
  close.textContent = 'Cancel CAPTCHA';
  close.dataset['secondary'] = 'true';
  close.addEventListener('click', (e) => {
    if (e.isTrusted) callbacks.cancel();
  });
  const fallback = document.createElement('button');
  fallback.type = 'button';
  fallback.textContent = 'Show CAPTCHA on gate page';
  fallback.dataset['secondary'] = 'true';
  fallback.hidden = true;
  fallback.addEventListener('click', (e) => {
    if (e.isTrusted) callbacks.fallback?.();
  });
  const retry = document.createElement('button');
  retry.type = 'button';
  retry.textContent = 'Retry CAPTCHA';
  retry.dataset['secondary'] = 'true';
  retry.hidden = true;
  const frame = document.createElement('iframe');
  frame.title = 'Hypeddit CAPTCHA';
  frame.referrerPolicy = 'no-referrer';
  frame.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-forms');
  frame.src = url.href;
  frame.style.cssText = 'display:block;width:100%;height:180px;border:0;background:#f5f4ed';
  root.append(text, close, fallback, retry, frame);
  let solved = false;
  let handshake: ReturnType<typeof setInterval> | undefined;
  let timer: ReturnType<typeof setTimeout>;
  const unavailable = () => {
    clearInterval(handshake);
    text.textContent = 'The CAPTCHA could not load here. Retry on the gate page.';
    fallback.hidden = !callbacks.fallback;
    retry.hidden = false;
  };
  const listener = (event: MessageEvent) => {
    if (!event.isTrusted) return;
    if (event.source !== frame.contentWindow || event.origin !== url.origin) return;
    const record: unknown = event.data;
    if (!record || typeof record !== 'object' || Array.isArray(record)) return;
    const data = record as Record<string, unknown>;
    if (
      data['type'] !== captchaFrameMessage ||
      data['nonce'] !== challenge.nonce ||
      data['gate'] !== challenge.gate
    )
      return;
    if (
      data['state'] === 'layout' &&
      Number.isInteger(data['height']) &&
      Number(data['height']) >= 180 &&
      Number(data['height']) <= 620
    ) {
      frame.style.height = String(data['height']) + 'px';
      return;
    }
    if (data['state'] === 'ready') {
      clearTimeout(timer);
      clearInterval(handshake);
      fallback.hidden = true;
      retry.hidden = true;
      text.textContent = 'Solve the CAPTCHA below. Download continues automatically.';
    } else if (data['state'] === 'expired') {
      solved = false;
      text.textContent = 'The CAPTCHA expired. Complete it again.';
    } else if (data['state'] === 'error') {
      clearTimeout(timer);
      unavailable();
    } else if (data['state'] === 'solved' && !solved) {
      clearTimeout(timer);
      solved = true;
      text.textContent = 'CAPTCHA completed. Waiting for Hypeddit’s email verification…';
      callbacks.solved(challenge.nonce);
    }
  };
  window.addEventListener('message', listener);
  const start = () => {
    frame.contentWindow?.postMessage(
      { type: captchaFrameMessage, state: 'start', nonce: challenge.nonce, gate: challenge.gate },
      url.origin,
    );
  };
  frame.addEventListener('load', () => {
    clearInterval(handshake);
    start();
    handshake = setInterval(start, 400);
  });
  retry.addEventListener('click', (event) => {
    if (!event.isTrusted) return;
    solved = false;
    retry.hidden = true;
    fallback.hidden = true;
    text.textContent = 'Loading Hypeddit’s CAPTCHA…';
    clearTimeout(timer);
    timer = setTimeout(unavailable, 15000);
    frame.src = url.href;
  });
  timer = setTimeout(unavailable, 15000);
  return {
    element: root,
    remove() {
      clearTimeout(timer);
      clearInterval(handshake);
      window.removeEventListener('message', listener);
      root.remove();
    },
  };
}
