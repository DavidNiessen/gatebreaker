import { extension } from '../platform/browser';
import {
  captchaFragment,
  captchaFrameMessage,
  captchaPageRequest,
} from '../platform/captcha-protocol';

// The frame has no email/download authority and exports no CAPTCHA response token.
if (window.parent !== window && location.origin === 'https://hypeddit.com') {
  const nonce = captchaFragment(location.hash);
  const popup = new URL(extension.runtime.getURL('popup.html'));
  const popupOrigin = `${popup.protocol}//${popup.host}`;
  const gate = document.querySelector<HTMLInputElement>('#current_download_file_listner')?.value;
  let parentOrigin: string | undefined;
  if (nonce && gate) {
    window.addEventListener('message', (event: MessageEvent) => {
      if (!event.isTrusted) return;
      if (
        (event.source !== window.parent &&
          !(event.source === null && event.origin === popupOrigin)) ||
        ![popupOrigin, 'https://hypeddit.com'].includes(event.origin)
      )
        return;
      const data: unknown = event.data;
      if (!data || typeof data !== 'object' || Array.isArray(data)) return;
      const record = data as Record<string, unknown>;
      if (
        record['type'] !== captchaFrameMessage ||
        record['state'] !== 'start' ||
        record['nonce'] !== nonce ||
        record['gate'] !== gate
      )
        return;
      if (parentOrigin && parentOrigin !== event.origin) return;
      parentOrigin = event.origin;
      document.dispatchEvent(
        new CustomEvent(captchaPageRequest, {
          detail: JSON.stringify({ nonce, gate, parentOrigin }),
        }),
      );
    });
  }
}
