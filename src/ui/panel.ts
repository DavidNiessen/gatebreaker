import type { PageStatus } from '../platform/messages';

export interface GatePanel {
  update(status: PageStatus): void;
  remove(): void;
}

export function createPanel(anchor: Element, resolve: () => void): GatePanel {
  const host = document.createElement('div');
  host.id = 'gatebreaker-panel';
  const root = host.attachShadow({ mode: 'open' });
  const style = document.createElement('style');
  style.textContent = `
    :host{all:initial;display:block;margin:16px 0;color-scheme:light;font:14px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif;color:#242820}
    *{box-sizing:border-box}section{padding:18px;background:#f5f4ed;border:1px solid #d2d5c8;border-radius:12px}
    h2{font-size:16px;line-height:1.3;margin:0 0 6px;font-weight:700;color:#242820}p{margin:0 0 14px;font-size:13px;color:#50564a;overflow-wrap:anywhere}
    button,a{display:inline-flex;justify-content:center;align-items:center;min-height:44px;padding:10px 16px;border-radius:7px;font:600 14px/1.3 system-ui,sans-serif;cursor:pointer}
    button{color:#fff;background:#365339;border:1px solid #365339;width:100%}button:hover{background:#29412c}button:disabled{opacity:.65;cursor:wait}
    a{margin-top:10px;color:#23432b;background:#e3ebdc;border:1px solid #a6b79e;text-decoration:underline;text-underline-offset:3px;width:100%}a:hover{background:#d6e2cd}
    :focus-visible{outline:3px solid #a65313;outline-offset:3px}[hidden]{display:none!important}
    ::selection{background:#dbe6c8;color:#1d2819}@media(prefers-reduced-motion:no-preference){button{transition:background .15s ease-out}}
  `;
  const section = document.createElement('section');
  section.setAttribute('aria-label', 'Gatebreaker download assistant');
  const heading = document.createElement('h2');
  heading.textContent = 'Gatebreaker';
  const statusText = document.createElement('p');
  statusText.setAttribute('role', 'status');
  statusText.setAttribute('aria-live', 'polite');
  const button = document.createElement('button');
  button.type = 'button';
  button.addEventListener('click', resolve);
  const link = document.createElement('a');
  link.textContent = 'Open download';
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  link.hidden = true;
  section.append(heading, statusText, button, link);
  root.append(style, section);
  anchor.insertAdjacentElement('afterend', host);
  return {
    update(status) {
      section.setAttribute('aria-busy', String(status.busy));
      button.disabled = status.busy || !status.enabled;
      button.textContent = status.busy
        ? 'Checking download…'
        : status.result
          ? 'Try again'
          : 'Try skipping gates';
      const result = status.result;
      statusText.textContent = status.busy
        ? 'Checking for a download link. This can take up to 20 seconds.'
        : result
          ? result.ok
            ? 'A download link is ready. Open it to continue.'
            : result.message
          : 'Try a direct download without sharing an email or connecting social accounts. Server-enforced gates may still block access.';
      link.hidden = !result?.ok;
      if (result?.ok) link.href = result.url;
      else link.removeAttribute('href');
    },
    remove() {
      host.remove();
    },
  };
}
