import { afterEach, describe, it, expect, vi } from 'vitest';
import { hypeddit } from '../src/providers/hypeddit';
import { hypedditState } from '../src/providers/hypeddit/session';
import {
  checkHypedditNativeAuth,
  cancelHypedditNativeAuth,
} from '../src/providers/hypeddit/native-auth';
import type { AuthorizationOpener } from '../src/domain/provider';
const url = new URL('https://hypeddit.com/authored/proof');
let sequence = 0;
const json = (approved: boolean) =>
  new Response(
    JSON.stringify({
      download_status: approved,
      URL: approved ? 'https://hypeddit.com/download/authoredProof' : '',
    }),
    { headers: { 'content-type': 'application/json' } },
  );
function fixture() {
  sequence++;
  const doc = document.implementation.createHTMLDocument('Proof');
  doc.head.innerHTML = '<meta name="csrf-token" content="authored-csrf-000000000000">';
  doc.body.innerHTML = `<a id="downloadProcess"></a><input id="current_download_file_listner" value="proof${sequence}"><input id="fan_gate_id" value="12345"><input id="wrndk" value="authored"><input id="is_unlimited" value="1"><input id="nwSteps" value="sp,mc"><section class="fangate-slider-content"><a id="login_to_sp" onclick="PopupCenterDual('https://accounts.spotify.com/authorize?client_id=authored&redirect_uri=https%3A%2F%2Fhypeddit.com%2Fspotify_callback&response_type=code&scope=authored&state=authored','sp_popup',500,500)"></a></section>`;
  hypedditState(doc).authRequired = true;
  let signals!: Parameters<AuthorizationOpener>[2];
  const opener: AuthorizationOpener = async (_address, _signal, hints) => {
    signals = hints;
    return true;
  };
  expect(hypeddit.performAction!('sign-in-spotify', doc, url, 'reuse', opener).ok).toBe(true);
  return { doc, current: hypedditState(doc), signals };
}
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
describe('correlated Spotify return proof', () => {
  it('ignores unrelated DOM slide movement before its own popup returns', () => {
    const f = fixture();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json(true)));
    f.doc.querySelector('section')!.classList.add('move-left');
    hypeddit.actionProgress!('sign-in-spotify', f.doc, url);
    expect(fetch).not.toHaveBeenCalled();
  });
  it('gives real popup closure a callback grace without an early final request', async () => {
    vi.useFakeTimers();
    const f = fixture();
    vi.stubGlobal('fetch', vi.fn());
    f.signals.closed();
    await vi.advanceTimersByTimeAsync(1500);
    expect(hypeddit.actionProgress!('sign-in-spotify', f.doc, url)?.state).toBe('error');
    expect(fetch).not.toHaveBeenCalled();
    vi.useRealTimers();
  });
  it('does not let fast callback-plus-close turn success into a close error', async () => {
    vi.useFakeTimers();
    const f = fixture();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json(true)));
    f.signals.closed();
    f.signals.returned();
    await vi.waitFor(() => expect(f.current.ready?.result.ok).toBe(true));
    await vi.advanceTimersByTimeAsync(1500);
    expect(hypeddit.actionProgress!('sign-in-spotify', f.doc, url)).toMatchObject({
      state: 'complete',
      reusable: true,
    });
    vi.useRealTimers();
  });
  it('retains transient SP return until a later account grants the file', async () => {
    const f = fixture();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValueOnce(json(false)).mockResolvedValueOnce(json(true)),
    );
    f.signals.returned();
    await vi.waitFor(() => expect(f.current.nativeAuth.size).toBe(0));
    expect(f.current.progress.get('sign-in-spotify')?.reusable).toBeUndefined();
    const pending = {
      id: 'sign-in-mixcloud',
      elementId: 'login_to_mc',
      callback: '/gate/mixcloudlogin',
      started: Date.now(),
      controller: new AbortController(),
      callbackSeen: true,
    };
    f.current.nativeAuth.set(pending.id, pending);
    checkHypedditNativeAuth(f.doc, url, f.current, pending);
    await vi.waitFor(() => expect(f.current.progress.get('sign-in-spotify')?.reusable).toBe(true));
  });
  it('also confirms SP on a later ordinary final resolution', async () => {
    const f = fixture();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json(false)));
    f.signals.returned();
    await vi.waitFor(() => expect(f.current.nativeAuth.size).toBe(0));
    const result = await hypeddit.resolve(hypeddit.inspect(f.doc, url)!, {
      pageUrl: url,
      fetch: vi.fn().mockResolvedValue(json(true)),
      probePublicFile: async () => null,
      intent: 'website-session',
    });
    expect(result.ok).toBe(true);
    expect(f.current.progress.get('sign-in-spotify')?.reusable).toBe(true);
  });
  it('clears transient proof on cancellation before later approval', async () => {
    const f = fixture();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json(false)));
    f.signals.returned();
    await vi.waitFor(() => expect(f.current.nativeAuth.size).toBe(0));
    cancelHypedditNativeAuth(f.doc);
    await hypeddit.resolve(hypeddit.inspect(f.doc, url)!, {
      pageUrl: url,
      fetch: vi.fn().mockResolvedValue(json(true)),
      probePublicFile: async () => null,
      intent: 'website-session',
    });
    expect(f.current.progress.get('sign-in-spotify')?.reusable).toBeUndefined();
  });
});
