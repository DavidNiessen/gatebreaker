import { afterEach, describe, expect, it, vi } from 'vitest';
import { hypeddit } from '../src/providers/hypeddit';
import { hypedditState } from '../src/providers/hypeddit/session';
import { checkHypedditNativeAuth } from '../src/providers/hypeddit/native-auth';
import { GateActions } from '../src/application/gate-actions';
const url = new URL('https://hypeddit.com/authored/return');
const id = 'sign-in-spotify';
let serial = 0;
const json = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json' } });
const refused = () => json({ download_status: false, URL: '' });
const ready = () =>
  json({ download_status: true, URL: 'https://hypeddit.com/download/authoredReturn' });
async function fixture() {
  serial++;
  document.head.innerHTML = '<meta name="csrf-token" content="authored-csrf-000000000000">';
  document.body.innerHTML = `<a id="downloadProcess"></a><input id="fan_gate_id" value="${40000 + serial}"><input id="current_download_file_listner" value="return${serial}"><input id="wrndk" value="authored-session"><input id="is_unlimited" value="1"><input id="nwSteps" value="sp"><section class="fangate-slider-content"><a id="login_to_sp" onclick="PopupCenterDual('https://accounts.spotify.com/authorize?client_id=authored&redirect_uri=https%3A%2F%2Fhypeddit.com%2Fspotify_callback&response_type=code&scope=authored&state=authored','sp_popup',500,500)">Sign in</a></section>`;
  await hypeddit.resolve(hypeddit.inspect(document, url)!, {
    pageUrl: url,
    fetch: vi.fn().mockResolvedValue(refused()),
    probePublicFile: async () => null,
  });
  const popup = {
    closed: false,
    get location(): Location {
      throw new DOMException('Cross origin', 'SecurityError');
    },
  };
  vi.spyOn(window, 'open').mockReturnValue(popup as unknown as Window);
  expect(hypeddit.performAction!(id, document, url, 'activate').ok).toBe(true);
  const state = hypedditState(document),
    pending = state.nativeAuth.get(id)!;
  let now = pending.started;
  vi.spyOn(Date, 'now').mockImplementation(() => now);
  return {
    popup,
    state,
    pending,
    advance: (ms: number) => {
      now += ms;
    },
    progress: () => hypeddit.actionProgress!(id, document, url),
  };
}
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
describe('Hypeddit late sign-in returns', () => {
  it('rechecks a refused download without opening another Spotify sign-in window', async () => {
    const f = await fixture();
    const fetch = vi.fn().mockImplementation(() => Promise.resolve(refused()));
    vi.stubGlobal('fetch', fetch);
    f.popup.closed = true;
    f.progress();
    await vi.waitFor(() => expect(f.pending.checking).toBe(false));
    for (const delay of [1000, 4000, 16000]) {
      f.advance(delay);
      f.progress();
      await vi.waitFor(() => expect(f.pending.checking).toBe(false));
    }
    expect(f.progress()).toMatchObject({ state: 'error', retryLabel: 'Check download again' });
    fetch.mockImplementationOnce(() => Promise.resolve(ready()));
    f.advance(1000);
    expect(hypeddit.performAction!(id, document, url, 'activate').ok).toBe(true);
    await vi.waitFor(() => expect(f.progress()?.state).toBe('complete'));
    expect(window.open).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledTimes(5);
  });
  it('can verify an opaque handle that never exposes a return or close', async () => {
    const f = await fixture();
    const fetch = vi.fn().mockResolvedValueOnce(refused()).mockResolvedValueOnce(ready());
    vi.stubGlobal('fetch', fetch);
    f.advance(1000);
    f.progress();
    await vi.waitFor(() => expect(f.pending.checking).toBe(false));
    expect(f.popup.closed).toBe(false);
    expect(f.pending.callbackSeen).toBeUndefined();
    f.advance(1000);
    f.progress();
    await vi.waitFor(() => expect(f.progress()?.state).toBe('complete'));
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(f.state.ready?.result.ok).toBe(true);
  });
  it('recovers a server-authorized download without a native callback or focus signal', async () => {
    const f = await fixture();
    const fetch = vi.fn().mockResolvedValueOnce(refused()).mockResolvedValueOnce(ready());
    vi.stubGlobal('fetch', fetch);
    f.popup.closed = true;
    f.progress();
    await vi.waitFor(() => expect(f.pending.checking).toBe(false));
    f.advance(999);
    f.progress();
    expect(fetch).toHaveBeenCalledTimes(1);
    f.advance(1);
    f.progress();
    await vi.waitFor(() => expect(f.progress()?.state).toBe('complete'));
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(f.pending.callbackSeen).toBeUndefined();
    expect(f.state.ready?.result.ok).toBe(true);
  });
  it('backs off refused checks and reserves capacity for a later native callback', async () => {
    const f = await fixture();
    const fetch = vi.fn().mockImplementation(() => Promise.resolve(refused()));
    vi.stubGlobal('fetch', fetch);
    f.popup.closed = true;
    f.progress();
    await vi.waitFor(() => expect(f.pending.checking).toBe(false));
    for (const delay of [1000, 4000, 16000]) {
      f.advance(delay - 1);
      const before = fetch.mock.calls.length;
      f.progress();
      expect(fetch).toHaveBeenCalledTimes(before);
      f.advance(1);
      f.progress();
      await vi.waitFor(() => expect(f.pending.checking).toBe(false));
      expect(fetch).toHaveBeenCalledTimes(before + 1);
    }
    expect(fetch).toHaveBeenCalledTimes(4);
    f.advance(30000);
    for (let i = 0; i < 20; i++) f.progress();
    expect(fetch).toHaveBeenCalledTimes(4);
    expect(f.progress()).toMatchObject({ state: 'error', retryLabel: 'Check download again' });
    expect(f.state.nativeAuth.get(id)).toBe(f.pending);
    fetch.mockImplementationOnce(() => Promise.resolve(ready()));
    f.pending.callbackSeen = true;
    checkHypedditNativeAuth(document, url, f.state, f.pending);
    await vi.waitFor(() => expect(f.progress()?.state).toBe('complete'));
    expect(fetch).toHaveBeenCalledTimes(5);
  });

  it('retains an early closed-handle refusal and accepts the later native callback check', async () => {
    const f = await fixture();
    const fetch = vi.fn().mockResolvedValueOnce(refused()).mockResolvedValueOnce(ready());
    vi.stubGlobal('fetch', fetch);
    f.popup.closed = true;
    f.progress();
    await vi.waitFor(() => expect(f.pending.checking).toBe(false));
    expect(f.progress()?.state).toBe('waiting');
    expect(f.state.nativeAuth.get(id)).toBe(f.pending);
    for (let i = 0; i < 20; i++) f.progress();
    expect(fetch).toHaveBeenCalledTimes(1);
    f.advance(1200);
    f.pending.callbackSeen = true;
    checkHypedditNativeAuth(document, url, f.state, f.pending);
    await vi.waitFor(() => expect(f.progress()?.state).toBe('complete'));
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(f.state.ready?.result.ok).toBe(true);
  });
  it('queues a return signal arriving while an earlier check is in flight', async () => {
    const f = await fixture();
    let resolve!: (value: Response) => void;
    const fetch = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise<Response>((r) => {
            resolve = r;
          }),
      )
      .mockResolvedValueOnce(ready());
    vi.stubGlobal('fetch', fetch);
    f.popup.closed = true;
    f.progress();
    f.advance(1200);
    f.pending.callbackSeen = true;
    checkHypedditNativeAuth(document, url, f.state, f.pending);
    expect(fetch).toHaveBeenCalledTimes(1);
    resolve(refused());
    await vi.waitFor(() => expect(f.pending.checking).toBe(false));
    f.progress();
    await vi.waitFor(() => expect(f.progress()?.state).toBe('complete'));
    expect(fetch).toHaveBeenCalledTimes(2);
  });
  it('does not accept synthetic focus or storage events as native returns', async () => {
    const f = await fixture();
    const fetch = vi.fn().mockResolvedValue(ready());
    vi.stubGlobal('fetch', fetch);
    window.dispatchEvent(new Event('focus'));
    window.dispatchEvent(
      new StorageEvent('storage', {
        key: 'hypeChildWindow',
        newValue: 'login_to_sp',
        url: 'https://hypeddit.com/spotify_callback',
      }),
    );
    expect(f.progress()?.state).toBe('waiting');
    expect(fetch).not.toHaveBeenCalled();
  });
  it('aborts and ignores a late verification result after cancellation', async () => {
    const f = await fixture();
    let resolve!: (value: Response) => void;
    const fetch = vi.fn().mockImplementation(
      () =>
        new Promise<Response>((r) => {
          resolve = r;
        }),
    );
    vi.stubGlobal('fetch', fetch);
    f.popup.closed = true;
    f.progress();
    const signal = fetch.mock.calls[0]![1]!.signal as AbortSignal;
    new GateActions([hypeddit]).cancel(document, url);
    expect(signal.aborted).toBe(true);
    expect(f.state.nativeAuth.size).toBe(0);
    resolve(ready());
    await new Promise((r) => setTimeout(r, 0));
    expect(f.state.ready).toBeUndefined();
    expect(f.progress()?.state).toBe('error');
    f.advance(1200);
    f.pending.callbackSeen = true;
    checkHypedditNativeAuth(document, url, f.state, f.pending);
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it('does not let an old rejected response discard a replacement sign-in', async () => {
    const f = await fixture();
    let cancelled!: () => void;
    const body = {
      cancel: vi.fn(
        () =>
          new Promise<void>((resolve) => {
            cancelled = resolve;
          }),
      ),
    };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 403, body }));
    f.popup.closed = true;
    f.progress();
    await vi.waitFor(() => expect(body.cancel).toHaveBeenCalledTimes(1));
    new GateActions([hypeddit]).cancel(document, url);
    expect(hypeddit.performAction!(id, document, url, 'activate').ok).toBe(true);
    const replacement = f.state.nativeAuth.get(id)!;
    expect(replacement).not.toBe(f.pending);
    cancelled();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(f.state.nativeAuth.get(id)).toBe(replacement);
    expect(f.state.progress.get(id)?.state).toBe('waiting');
  });
  it('aborts outstanding checks when the native gate/session changes', async () => {
    const f = await fixture();
    const fetch = vi.fn().mockReturnValue(new Promise(() => {}));
    vi.stubGlobal('fetch', fetch);
    f.popup.closed = true;
    f.progress();
    document.querySelector<HTMLInputElement>('#wrndk')!.value = 'another-authored-session';
    expect(hypedditState(document)).not.toBe(f.state);
    expect(f.pending.controller.signal.aborted).toBe(true);
  });
  it.each([401, 403, 419, 429, 500])(
    'reports HTTP %s without telling the user to repeat a successful sign-in',
    async (status) => {
      const f = await fixture();
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json({}, status)));
      f.popup.closed = true;
      f.progress();
      await vi.waitFor(() => expect(f.progress()?.state).toBe('error'));
      expect(f.progress()?.message).toMatch(/session|limiting|HTTP/);
      expect(f.progress()?.message).not.toContain('Try signing in again');
    },
  );
  it('expires a refused check with a download-specific error instead of asserting login failure', async () => {
    const f = await fixture();
    const fetch = vi.fn().mockResolvedValue(refused());
    vi.stubGlobal('fetch', fetch);
    f.popup.closed = true;
    f.progress();
    await vi.waitFor(() => expect(f.pending.checking).toBe(false));
    f.advance(120001);
    expect(f.progress()).toMatchObject({
      state: 'error',
      message: expect.stringContaining('still refused the download'),
    });
    expect(f.state.nativeAuth.size).toBe(0);
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it('limits checks even if multiple return signals arrive', async () => {
    const f = await fixture();
    const fetch = vi.fn().mockResolvedValue(refused());
    vi.stubGlobal('fetch', fetch);
    for (let i = 0; i < 6; i++) {
      f.advance(1200);
      checkHypedditNativeAuth(document, url, f.state, f.pending);
      await vi.waitFor(() => expect(f.pending.checking).toBe(false));
    }
    f.advance(1200);
    checkHypedditNativeAuth(document, url, f.state, f.pending);
    expect(fetch).toHaveBeenCalledTimes(6);
    expect(f.progress()?.state).toBe('error');
  });
});
