import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { hypeddit } from '../src/providers/hypeddit';
import { hypedditState } from '../src/providers/hypeddit/session';
import { emailChallenge } from '../src/providers/hypeddit/captcha';
import { GateActions, pendingRequiredInteractions } from '../src/application/gate-actions';
import { createCaptchaView } from '../src/ui/captcha-view';
const url = new URL('https://hypeddit.com/authored/captcha?tracking=discarded');
let serial = 0;
function json(status: string) {
  return new Response(JSON.stringify({ status }), {
    headers: { 'content-type': 'application/json' },
  });
}
beforeEach(() => {
  serial++;
  document.cookie = 'teb3456767win=; Max-Age=0; path=/';
  document.head.innerHTML = '<meta name="csrf-token" content="authored-captcha-csrf-000000000">';
  document.body.innerHTML = `<button id="downloadProcess">Original download</button><input id="current_download_file_listner" value="captcha${serial}"><input id="fan_gate_id" value="${70000 + serial}"><input id="wrndk" value="authored"><input id="is_unlimited" value="1"><input id="email_address"><button id="email_to_downloads_next">Original email</button><div id="captchalog" data-max-attempts="10" data-sitekey="authored-sitekey-0000000000"></div><div id="gatePreviewCaptcha" class="hide"></div>`;
});
afterEach(() => {
  hypeddiCancel();
  document.cookie = 'teb3456767win=; Max-Age=0; path=/';
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
function hypeddiCancel() {
  hypeddit.cancelActions?.(document, url);
}
function requireCaptcha() {
  document.querySelector<HTMLElement>('#captchalog')!.dataset['attempts'] = 'over';
}
function prepare() {
  return hypeddit.performAction!('prepare-email', document, url, 'activate');
}
describe('source-confirmed Hypeddit CAPTCHA requirement', () => {
  it.each([0, 8, 9])('does not block before the native threshold: %s', (count) => {
    document.cookie = `teb3456767win=${encodeURIComponent(JSON.stringify({ [70000 + serial]: count }))}; path=/`;
    expect(emailChallenge(document)).toBe('none');
  });
  it.each([10, 11])('requires the challenge at and after the actual threshold: %s', (count) => {
    document.cookie = `teb3456767win=${encodeURIComponent(JSON.stringify({ [70000 + serial]: count }))}; path=/`;
    expect(emailChallenge(document)).toBe('required');
  });
  it.each(['[]', 'not-json', 'null', '{"other":1}', JSON.stringify({ unrelated: 99 })])(
    'treats malformed or unrelated counter data accurately: %s',
    (raw) => {
      document.cookie = `teb3456767win=${encodeURIComponent(raw)}; path=/`;
      expect(emailChallenge(document)).toBe(
        raw.includes('other') || raw.includes('unrelated') ? 'none' : 'unknown',
      );
    },
  );
  it('does not call an unreadable counter a CAPTCHA requirement', () => {
    vi.stubGlobal('fetch', vi.fn());
    document.cookie = 'teb3456767win=broken; path=/';
    expect(prepare()).toMatchObject({
      ok: false,
      message: expect.stringContaining('could not be read'),
    });
    expect(hypeddit.challenge!(document, url)).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });
  it('allows the last ordinary native attempt without rendering a challenge', async () => {
    const fetch = vi.fn().mockResolvedValue(json('T'));
    vi.stubGlobal('fetch', fetch);
    document.cookie = `teb3456767win=${JSON.stringify({ [70000 + serial]: 9 })}; path=/`;
    expect(prepare().ok).toBe(true);
    await vi.waitFor(() =>
      expect(hypeddit.actionProgress!('prepare-email', document, url)?.state).toBe('complete'),
    );
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(hypeddit.challenge!(document, url)).toBeNull();
  });
});
describe('manual CAPTCHA continuation', () => {
  it('uses the canonical frame origin for the supported www gate alias', () => {
    requireCaptcha();
    const alias = new URL('https://www.hypeddit.com/authored/captcha');
    hypeddit.performAction!('prepare-email', document, alias, 'activate');
    expect(new URL(hypeddit.challenge!(document, alias)!.url).origin).toBe('https://hypeddit.com');
  });
  it('waits for the explicit challenge completion and actual email acceptance', async () => {
    requireCaptcha();
    const fetch = vi.fn().mockResolvedValue(json('T'));
    vi.stubGlobal('fetch', fetch);
    expect(prepare().ok).toBe(true);
    const view = hypeddit.challenge!(document, url)!;
    expect(new URL(view.url).search).toBe('');
    expect(new URL(view.url).origin).toBe(url.origin);
    expect(view.gate).toBe(`captcha${serial}`);
    expect(view.nonce).toMatch(/^[a-f0-9-]{36}$/);
    expect(
      pendingRequiredInteractions(hypeddit.actions!(document, url)).map((a) => a.id),
    ).toContain('solve-captcha');
    expect(fetch).not.toHaveBeenCalled();
    new GateActions([hypeddit]).completeChallenge('wrong-nonce', document, url);
    expect(fetch).not.toHaveBeenCalled();
    new GateActions([hypeddit]).completeChallenge(view.nonce, document, url);
    new GateActions([hypeddit]).completeChallenge(view.nonce, document, url);
    await vi.waitFor(() =>
      expect(hypeddit.actionProgress!('solve-captcha', document, url)?.state).toBe('complete'),
    );
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(hypeddit.challenge!(document, url)).toBeNull();
    const body = fetch.mock.calls[0]![1]!.body as URLSearchParams;
    expect(body.get('validateEmailAddress')).toBe('gatebreakeros@proton.me');
    expect([...body.keys()].sort()).toEqual([
      'adcode',
      'email_name',
      'fan_gate_id',
      'hypesource',
      'validateEmailAddress',
    ]);
  });
  it('does not consider a solved challenge accepted when email is refused', async () => {
    requireCaptcha();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json('F')));
    prepare();
    const nonce = hypeddit.challenge!(document, url)!.nonce;
    hypeddit.completeChallenge!(nonce, document, url);
    await vi.waitFor(() =>
      expect(hypeddit.actionProgress!('solve-captcha', document, url)?.state).toBe('error'),
    );
    expect(hypedditState(document).acceptedEmail).toBeUndefined();
    expect(hypedditState(document).ready).toBeUndefined();
  });
  it('cancels the challenge and discards its late completion', () => {
    requireCaptcha();
    vi.stubGlobal('fetch', vi.fn());
    prepare();
    const nonce = hypeddit.challenge!(document, url)!.nonce;
    hypeddiCancel();
    hypeddit.completeChallenge!(nonce, document, url);
    expect(fetch).not.toHaveBeenCalled();
    expect(hypeddit.challenge!(document, url)).toBeNull();
  });
  it('aborts email verification after challenge cancellation and ignores a late success', async () => {
    requireCaptcha();
    let finish!: (value: Response) => void;
    const fetch = vi.fn().mockImplementation(
      () =>
        new Promise<Response>((resolve) => {
          finish = resolve;
        }),
    );
    vi.stubGlobal('fetch', fetch);
    prepare();
    hypeddit.completeChallenge!(hypeddit.challenge!(document, url)!.nonce, document, url);
    const signal = fetch.mock.calls[0]![1]!.signal as AbortSignal;
    hypeddiCancel();
    expect(signal.aborted).toBe(true);
    finish(json('T'));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(hypedditState(document).acceptedEmail).toBeUndefined();
  });
  it('expires an old frame receipt without submitting an email', () => {
    requireCaptcha();
    vi.stubGlobal('fetch', vi.fn());
    prepare();
    const current = hypedditState(document),
      nonce = current.captcha!.view.nonce;
    vi.spyOn(Date, 'now').mockReturnValue(current.captcha!.started + 300001);
    hypeddit.completeChallenge!(nonce, document, url);
    expect(fetch).not.toHaveBeenCalled();
    expect(hypeddit.challenge!(document, url)).toBeNull();
  });
});
describe('challenge frame trust boundary', () => {
  it('rejects synthetic messages even with a matching origin, nonce and source', () => {
    requireCaptcha();
    prepare();
    const challenge = hypeddit.challenge!(document, url)!;
    const solved = vi.fn();
    const view = createCaptchaView(challenge, { solved, cancel: vi.fn() });
    const frame = view.element.querySelector('iframe')!;
    window.dispatchEvent(
      new MessageEvent('message', {
        origin: 'https://hypeddit.com',
        source: frame.contentWindow,
        data: {
          type: 'gatebreaker:captcha-frame',
          state: 'solved',
          nonce: challenge.nonce,
          gate: challenge.gate,
        },
      }),
    );
    expect(solved).not.toHaveBeenCalled();
    view.remove();
  });
  it('rejects unsafe or mismatched frame URLs', () => {
    requireCaptcha();
    prepare();
    const challenge = hypeddit.challenge!(document, url)!;
    expect(() =>
      createCaptchaView(
        { ...challenge, url: 'https://hypeddit.com.evil.invalid/' },
        { solved: vi.fn(), cancel: vi.fn() },
      ),
    ).toThrow();
  });
});
