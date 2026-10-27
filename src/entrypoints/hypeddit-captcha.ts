import {
  captchaFragment,
  captchaPageRequest,
  captchaFrameMessage,
} from '../platform/captcha-protocol';

interface Recaptcha {
  render(element: HTMLElement, options: Record<string, unknown>): number;
  getResponse(widget: number): string;
  reset(widget: number): void;
}
// Packaged MAIN-world code, confined to the explicit Hypeddit CAPTCHA subframe.
// No extension APIs, form submission, remote script injection or token forwarding.
if (window.parent !== window && location.origin === 'https://hypeddit.com') {
  const nonce = captchaFragment(location.hash);
  const gate = document.querySelector<HTMLInputElement>('#current_download_file_listner')?.value;
  const sitekey = document.querySelector<HTMLElement>('#captchalog')?.dataset['sitekey'];
  let started = false;
  if (nonce && gate)
    document.addEventListener(captchaPageRequest, (event) => {
      if (started || typeof (event as CustomEvent).detail !== 'string') return;
      let parentOrigin: string;
      try {
        const request = JSON.parse((event as CustomEvent).detail) as Record<string, unknown>;
        if (
          request['nonce'] !== nonce ||
          request['gate'] !== gate ||
          typeof request['parentOrigin'] !== 'string' ||
          !/^(?:https:\/\/(?:www\.)?hypeddit\.com|chrome-extension:\/\/[a-p]{32}|moz-extension:\/\/[a-f0-9-]{36})$/.test(
            request['parentOrigin'],
          )
        )
          return;
        parentOrigin = request['parentOrigin'];
      } catch {
        return;
      }
      started = true;
      const report = (state: string, height?: number) =>
        window.parent.postMessage(
          { type: captchaFrameMessage, nonce, gate, state, height },
          parentOrigin,
        );
      const root = document.createElement('main');
      const hint = document.createElement('p');
      hint.textContent = 'Complete Google reCAPTCHA to continue with Hypeddit.';
      const widget = document.createElement('div');
      const retry = document.createElement('button');
      retry.type = 'button';
      retry.textContent = 'Retry CAPTCHA';
      retry.hidden = true;
      root.append(hint, widget, retry);
      const style = document.createElement('style');
      style.textContent =
        'html,body{margin:0;min-height:100%;background:#f5f4ed;color:#242820;font:14px/1.5 system-ui}main{padding:12px;display:flex;align-items:center;flex-direction:column;gap:12px}p{margin:0;max-width:36ch;text-align:center}button{min-height:44px;padding:10px 16px;border:1px solid #a6b79e;border-radius:7px;background:transparent;color:#365339;font:600 14px system-ui}button:focus-visible{outline:3px solid #a65313;outline-offset:3px}[hidden]{display:none!important}';
      document.head.append(style);
      const body = document.createElement('body');
      body.append(root);
      document.body.replaceWith(body);
      const compact = window.innerWidth < 340;
      const collapsedHeight = compact ? 260 : 180;
      let lastHeight = 0;
      const measure = () => {
        const image = [...document.querySelectorAll<HTMLIFrameElement>('iframe')].find((frame) => {
          try {
            return (
              ['www.google.com', 'www.recaptcha.net', 'recaptcha.google.com'].includes(
                new URL(frame.src).hostname,
              ) &&
              new URL(frame.src).pathname.includes('/bframe') &&
              getComputedStyle(frame).visibility !== 'hidden' &&
              frame.getBoundingClientRect().height > 100
            );
          } catch {
            return false;
          }
        });
        const height = image
          ? Math.min(
              620,
              Math.max(collapsedHeight, Math.ceil(image.getBoundingClientRect().height + 30)),
            )
          : collapsedHeight;
        if (height !== lastHeight) {
          lastHeight = height;
          report('layout', height);
        }
      };
      const observer = new MutationObserver(measure);
      observer.observe(body, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['style', 'class', 'hidden'],
      });
      window.addEventListener('resize', measure);
      measure();
      let id: number | undefined;
      const api = () => (window as Window & { grecaptcha?: Recaptcha }).grecaptcha;
      const error = () => {
        hint.textContent =
          'The CAPTCHA could not load. Retry, or open the challenge on the gate page.';
        retry.hidden = false;
        report('error');
      };
      const deadline = Date.now() + 12000;
      const render = () => {
        const recaptcha = api();
        if (!sitekey || !/^[\w-]{20,128}$/.test(sitekey)) {
          error();
          return;
        }
        if (!recaptcha?.render) {
          if (Date.now() < deadline) setTimeout(render, 200);
          else error();
          return;
        }
        try {
          id = recaptcha.render(widget, {
            sitekey,
            size: compact ? 'compact' : 'normal',
            callback: () => {
              // Google owns the opaque response; only a nonsecret state is exported.
              if (id === undefined || !recaptcha.getResponse(id)) return;
              hint.textContent = 'CAPTCHA completed. Checking the email with Hypeddit…';
              retry.hidden = true;
              report('solved');
            },
            'expired-callback': () => {
              hint.textContent = 'The CAPTCHA expired. Complete it again.';
              report('expired');
            },
            'error-callback': error,
          });
          hint.textContent = 'Complete the CAPTCHA below. Gatebreaker continues automatically.';
          report('ready');
        } catch {
          error();
        }
      };
      retry.addEventListener('click', (event) => {
        if (!event.isTrusted) return;
        if (id !== undefined) {
          try {
            api()?.reset(id);
            retry.hidden = true;
            hint.textContent = 'Complete the CAPTCHA below.';
            report('ready');
          } catch {
            error();
          }
        } else {
          started = false;
          location.reload();
        }
      });
      render();
    });
}
