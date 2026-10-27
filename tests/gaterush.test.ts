import { beforeEach, describe, expect, it, vi } from 'vitest';
import { gaterush } from '../src/providers/gaterush';
import type { ProviderContext } from '../src/domain/provider';

const url = new URL('https://gaterush.me/Ab_1-2');
const authUrl = 'https://gaterush.me/auth/soundcloud?slug=Ab_1-2';
function step(id: string, allowSkip = false, extra = {}) {
  return {
    id,
    name: id,
    allowSkip,
    data: {
      slug: 'Ab_1-2',
      ...(id === 'soundcloud' ? { authUrl } : {}),
      ...extra,
    },
  };
}
function fixture(steps = [step('instagram')], options: Record<string, unknown> = {}) {
  const data = {
    slug: 'Ab_1-2',
    authUrl,
    artistName: 'Fixture Artist',
    trackTitle: 'Original File',
    hasDownloadFile: true,
    rewardIsLink: false,
    rewardLabel: 'Download',
    steps,
    ...options,
  };
  document.head.innerHTML = '<meta name="csrf-token" content="fixture-native-csrf-1234567890">';
  document.body.innerHTML = `<h1 class="track">Original File</h1><div id="progress" aria-valuenow="0">${steps.map(() => '<span class="dot"></span>').join('')}</div><div id="stepStage"><input id="emailInput" type="email"><input id="nameInput"><input id="commentInput"><button data-go>Native action</button><button data-skip>Skip</button></div><button id="download" class="download" disabled>Download</button><script src="/js/gate-liquid.js?v=fixture"></script><script>window.__GATE__ = {${Object.entries(
    data,
  )
    .map(([key, value]) => `${key}: ${JSON.stringify(value)}`)
    .join(',')}};</script>`;
}
function done(count: number) {
  document.querySelector('#progress')!.setAttribute('aria-valuenow', String(count));
  for (const [index, dot] of [...document.querySelectorAll('#progress .dot')].entries())
    dot.classList.toggle('done', index < count);
}
function ctx(responses: Response[] = [], automate = true): ProviderContext {
  const fetch = vi.fn();
  for (const response of responses) fetch.mockResolvedValueOnce(response);
  return { pageUrl: url, fetch, probePublicFile: vi.fn(), automate };
}
const acknowledgement = (value: unknown = { success: true }, status = 200) =>
  new Response(JSON.stringify(value), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
const attachment = (type = 'audio/wav', disposition = 'attachment; filename="Original.wav"') =>
  new Response(null, {
    status: 200,
    headers: { 'Content-Type': type, 'Content-Disposition': disposition },
  });

beforeEach(() => fixture());

describe('GateRush native identity and inert parser', () => {
  it('accepts the native current-page object without making requests or leaking state into metadata', () => {
    const fetch = vi.spyOn(globalThis, 'fetch');
    expect(gaterush.inspect(document, url)).toMatchObject({
      id: 'Ab_1-2',
      title: 'Original File',
      steps: ['instagram'],
      metadata: {},
    });
    expect(fetch).not.toHaveBeenCalled();
  });
  it.each([
    'http://gaterush.me/Ab_1-2',
    'https://www.gaterush.me/Ab_1-2',
    'https://evil.gaterush.me/Ab_1-2',
    'https://gaterush.me/download/Ab_1-2',
    'https://gaterush.me/login',
    'https://gaterush.me/charts',
    'https://gaterush.me/Ab%5f1-2',
    'https://user@gaterush.me/Ab_1-2',
    'https://gaterush.me:8443/Ab_1-2',
  ])('rejects non-gate route %s', (value) => expect(gaterush.matches(new URL(value))).toBe(false));
  it('rejects route mismatches, duplicate declarations and incomplete native markup', () => {
    expect(gaterush.inspect(document, new URL('https://gaterush.me/Zz_9-8'))).toBeNull();
    document.body.append(document.querySelector('script:not([src])')!.cloneNode(true));
    expect(gaterush.inspect(document, url)).toBeNull();
    fixture();
    document.querySelector('#stepStage')!.remove();
    expect(gaterush.inspect(document, url)).toBeNull();
  });
  it('never evaluates executable values or trailing statements', () => {
    const source = document.querySelector('script:not([src])')!;
    source.textContent = source.textContent!.replace(
      '"Original File"',
      '(()=>{throw new Error("executed")})()',
    );
    expect(gaterush.inspect(document, url)).toBeNull();
    fixture();
    document.querySelector('script:not([src])')!.textContent += 'window.exfiltrate = true;';
    expect(gaterush.inspect(document, url)).toBeNull();
  });
  it('rejects oversized state, unknown/duplicate steps, mismatched auth, and contradictory rewards', () => {
    for (const steps of [
      [step('unknown')],
      [step('instagram'), step('instagram')],
      [step('soundcloud', false, { authUrl: 'https://evil.example/' })],
    ]) {
      fixture(steps);
      expect(gaterush.inspect(document, url)).toBeNull();
    }
    fixture([], { hasDownloadFile: true, rewardIsLink: true });
    expect(gaterush.inspect(document, url)).toBeNull();
    fixture();
    document.querySelector('script:not([src])')!.textContent += ' '.repeat(65536);
    expect(gaterush.inspect(document, url)).toBeNull();
  });
});

const denied = (status = 403) => new Response(null, { status });

describe('GateRush explicit server-first Download', () => {
  it('does no page-open processing and leaves unknown sessions unlocked regardless of configured OAuth', () => {
    fixture([step('email'), step('soundcloud'), step('instagram')]);
    const fetch = vi.spyOn(globalThis, 'fetch');
    expect(gaterush.inspect(document, url)).not.toBeNull();
    expect(gaterush.actions!(document, url)).toEqual([]);
    expect(gaterush.actionProgress!('gaterush-soundcloud', document, url)).toBeNull();
    expect(gaterush.presentation!(document, url)).not.toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });
  it('reuses an already completed native-cookie file session without email, ACK or OAuth', async () => {
    fixture([step('email'), step('soundcloud'), step('instagram'), step('spotify')]);
    const open = vi.spyOn(window, 'open');
    const context = ctx([attachment()]);
    expect(await gaterush.resolve(gaterush.inspect(document, url)!, context)).toEqual({
      ok: true,
      url: 'https://gaterush.me/download/Ab_1-2',
      kind: 'file',
      method: 'website-session',
    });
    expect(context.fetch).toHaveBeenCalledTimes(1);
    expect(vi.mocked(context.fetch).mock.calls[0]![1]).toMatchObject({
      method: 'HEAD',
      credentials: 'same-origin',
      redirect: 'manual',
    });
    expect(gaterush.actions!(document, url)).toEqual([]);
    expect(open).not.toHaveBeenCalled();
  });
  it('accepts server-completed comment gates via HEAD without comment, email or account actions', async () => {
    fixture([
      step('email'),
      step('soundcloud', false, { enableScComment: true }),
      step('instagram'),
    ]);
    const context = ctx([attachment()]);
    expect(gaterush.presentation!(document, url)).not.toBeNull();
    expect(await gaterush.resolve(gaterush.inspect(document, url)!, context)).toMatchObject({
      ok: true,
      kind: 'file',
    });
    expect(context.fetch).toHaveBeenCalledTimes(1);
    expect(gaterush.actions!(document, url)).toEqual([]);
    expect((document.querySelector('#commentInput') as HTMLInputElement).value).toBe('');
  });
  it('acknowledges ordinary steps only after denied initial HEAD and verifies final attachment with HEAD', async () => {
    fixture([step('instagram'), step('spotify')]);
    const context = ctx([denied(), acknowledgement(), acknowledgement(), attachment()]);
    expect(await gaterush.resolve(gaterush.inspect(document, url)!, context)).toMatchObject({
      ok: true,
      kind: 'file',
    });
    const calls = vi.mocked(context.fetch).mock.calls;
    expect(calls.map(([target, init]) => [target, init?.method])).toEqual([
      ['https://gaterush.me/download/Ab_1-2', 'HEAD'],
      ['https://gaterush.me/gate-step/Ab_1-2', 'POST'],
      ['https://gaterush.me/gate-step/Ab_1-2', 'POST'],
      ['https://gaterush.me/download/Ab_1-2', 'HEAD'],
    ]);
    expect(calls[1]![1]).toMatchObject({ credentials: 'same-origin', redirect: 'error' });
    expect((calls[1]![1]?.body as URLSearchParams).get('stepId')).toBe('instagram');
    expect((calls[1]![1]?.body as URLSearchParams).get('_csrf')).toBe(
      'fixture-native-csrf-1234567890',
    );
  });
  it('does not acknowledge steps without explicit automation but still checks existing access read-only', async () => {
    const context = ctx([denied()], false);
    expect(await gaterush.resolve(gaterush.inspect(document, url)!, context)).toMatchObject({
      ok: false,
      code: 'server-required',
    });
    expect(context.fetch).toHaveBeenCalledTimes(1);
    expect(vi.mocked(context.fetch).mock.calls[0]![1]?.method).toBe('HEAD');
  });
  it('discovers actual required login only after client acknowledgements and denied final HEAD', async () => {
    fixture([step('soundcloud'), step('instagram')]);
    expect(gaterush.actions!(document, url)).toEqual([]);
    const context = ctx([denied(), acknowledgement(), denied()]);
    expect(await gaterush.resolve(gaterush.inspect(document, url)!, context)).toMatchObject({
      ok: false,
      code: 'server-required',
    });
    expect(vi.mocked(context.fetch).mock.calls.map(([, init]) => init?.method)).toEqual([
      'HEAD',
      'POST',
      'HEAD',
    ]);
    expect(gaterush.actions!(document, url).map((action) => action.id)).toEqual([
      'gaterush-soundcloud',
    ]);
    expect(gaterush.actionProgress!('gaterush-soundcloud', document, url)?.state).toBe('waiting');
  });
  it('does not duplicate HEAD when no ordinary steps remain before real required OAuth', async () => {
    fixture([step('soundcloud')]);
    const context = ctx([denied()]);
    expect(await gaterush.resolve(gaterush.inspect(document, url)!, context)).toMatchObject({
      ok: false,
      code: 'server-required',
    });
    expect(context.fetch).toHaveBeenCalledTimes(1);
    expect(gaterush.actions!(document, url)).toHaveLength(1);
  });
  it('skips artist-permitted optional steps without recording completions', async () => {
    fixture([step('soundcloud', true), step('instagram', true), step('spotify', true)]);
    const context = ctx([denied()]);
    expect((await gaterush.resolve(gaterush.inspect(document, url)!, context)).ok).toBe(false);
    expect(context.fetch).toHaveBeenCalledTimes(1);
    expect(gaterush.actions!(document, url)).toEqual([]);
  });
  it('retains acknowledgement flags in memory and does not repeat successful steps on retries', async () => {
    const context = ctx([denied(), acknowledgement(), denied(), denied()]);
    const gate = gaterush.inspect(document, url)!;
    expect((await gaterush.resolve(gate, context)).ok).toBe(false);
    expect((await gaterush.resolve(gaterush.inspect(document, url)!, context)).ok).toBe(false);
    expect(vi.mocked(context.fetch).mock.calls.map(([, init]) => init?.method)).toEqual([
      'HEAD',
      'POST',
      'HEAD',
      'HEAD',
    ]);
  });
  it.each([401, 403, 419, 429, 404, 500])(
    'maps denied/error HTTP %i without exposing response data',
    async (status) => {
      fixture([]);
      const context = ctx([acknowledgement({ secret: 'never-display' }, status)]);
      const result = await gaterush.resolve(gaterush.inspect(document, url)!, context);
      expect(result.ok).toBe(false);
      expect(JSON.stringify(result)).not.toContain('never-display');
      expect(context.fetch).toHaveBeenCalledTimes(1);
    },
  );
  it('does not write after malformed or HTML challenge HEAD success', async () => {
    const context = ctx([attachment('text/html')]);
    expect(await gaterush.resolve(gaterush.inspect(document, url)!, context)).toMatchObject({
      ok: false,
      code: 'invalid-response',
    });
    expect(context.fetch).toHaveBeenCalledTimes(1);
  });
  it('rejects malformed acknowledgements, oversized JSON and challenge bodies after initial denial', async () => {
    for (const response of [
      acknowledgement({ success: false }),
      acknowledgement({ success: true, redirect: 'https://evil.example' }),
      acknowledgement({ padding: 'x'.repeat(17000) }),
      new Response('<h1>Challenge</h1>', { headers: { 'Content-Type': 'text/html' } }),
    ]) {
      fixture();
      const context = ctx([denied(), response]);
      expect(await gaterush.resolve(gaterush.inspect(document, url)!, context)).toMatchObject({
        ok: false,
        code: 'invalid-response',
      });
      expect(context.fetch).toHaveBeenCalledTimes(2);
    }
  });
  it('rejects preview audio, redirected responses and unsupported attachment types', async () => {
    for (const response of [
      attachment('audio/mpeg', 'inline'),
      attachment('application/json'),
      new Response(null, { status: 302, headers: { Location: 'https://example.org/preview.mp3' } }),
    ]) {
      fixture([]);
      const context = ctx([response]);
      expect((await gaterush.resolve(gaterush.inspect(document, url)!, context)).ok).toBe(false);
    }
  });
  it('keeps link rewards unsupported without making requests or exposing a processing panel', async () => {
    fixture([], { hasDownloadFile: false, rewardIsLink: true });
    const context = ctx();
    expect(await gaterush.resolve(gaterush.inspect(document, url)!, context)).toMatchObject({
      ok: false,
      code: 'not-supported',
    });
    expect(context.fetch).not.toHaveBeenCalled();
    expect(gaterush.presentation!(document, url)).toBeNull();
  });
  it('stops on cancellation and rejects copied gates without a current-page binding', async () => {
    const gate = gaterush.inspect(document, url)!;
    const controller = new AbortController();
    controller.abort();
    const context = { ...ctx(), signal: controller.signal };
    await expect(gaterush.resolve(gate, context)).rejects.toThrow();
    expect(context.fetch).not.toHaveBeenCalled();
    expect(await gaterush.resolve({ ...gate }, ctx())).toMatchObject({
      ok: false,
      code: 'not-supported',
    });
  });
});

describe('GateRush HTTP-discovered explicit SoundCloud consent', () => {
  async function discover() {
    const gate = gaterush.inspect(document, url)!;
    const clients = gate.steps.filter((id) => id !== 'soundcloud');
    const context = ctx([
      denied(),
      ...clients.map(() => acknowledgement()),
      ...(clients.length ? [denied()] : []),
    ]);
    await gaterush.resolve(gate, context);
    expect(gaterush.actions!(document, url)).toHaveLength(1);
    return context;
  }
  function authorize(
    options: { origin?: string; slug?: string; wrongSource?: boolean; type?: string } = {},
  ) {
    const frame = document.createElement('iframe');
    document.body.append(frame);
    const popup = frame.contentWindow!;
    vi.spyOn(window, 'open').mockReturnValue(popup);
    const before = document.querySelector('#stepStage')!.innerHTML;
    expect(gaterush.performAction!('gaterush-soundcloud', document, url, 'activate').ok).toBe(true);
    window.dispatchEvent(
      new MessageEvent('message', {
        data: {
          type: options.type ?? 'sc-auth',
          ...(options.slug === undefined ? {} : { slug: options.slug }),
        },
        origin: options.origin ?? 'https://gaterush.me',
        source: options.wrongSource ? window : popup,
      }),
    );
    expect(document.querySelector('#stepStage')!.innerHTML).toBe(before);
  }
  it('opens only explicit HTTP-discovered auth without native clicks, form changes or storage', async () => {
    fixture([step('email', false, { collectName: true }), step('soundcloud')]);
    const native = vi.fn();
    document.querySelector('[data-go]')!.addEventListener('click', native);
    expect(gaterush.actions!(document, url)).toEqual([]);
    await discover();
    authorize();
    expect(window.open).toHaveBeenCalledWith(
      'https://gaterush.me/auth/soundcloud?slug=Ab_1-2',
      'gatebreaker-gaterush-Ab_1-2',
      'popup,width=500,height=650',
    );
    expect(native).not.toHaveBeenCalled();
    expect((document.querySelector('#emailInput') as HTMLInputElement).value).toBe('');
    expect(gaterush.actionProgress!('gaterush-soundcloud', document, url)?.state).toBe('complete');
  });
  it('submits email/name directly before discovering auth and retries HEAD only after callback', async () => {
    fixture([step('email', false, { collectName: true }), step('soundcloud'), step('instagram')]);
    const discovery = await discover();
    const calls = vi.mocked(discovery.fetch).mock.calls;
    expect(calls.map(([target, init]) => [target, init?.method])).toEqual([
      ['https://gaterush.me/download/Ab_1-2', 'HEAD'],
      ['https://gaterush.me/save-email/Ab_1-2', 'POST'],
      ['https://gaterush.me/gate-step/Ab_1-2', 'POST'],
      ['https://gaterush.me/download/Ab_1-2', 'HEAD'],
    ]);
    const body = calls[1]![1]?.body as URLSearchParams;
    expect(body.get('email')).toBe('gatebreakeros@proton.me');
    expect(body.get('name')).toBe(body.get('email')!.split('@')[0]);
    authorize();
    const next = ctx([attachment()]);
    expect(await gaterush.resolve(gaterush.inspect(document, url)!, next)).toMatchObject({
      ok: true,
    });
    expect(next.fetch).toHaveBeenCalledTimes(1);
    expect(gaterush.actions!(document, url)).toEqual([]);
  });
  it.each([
    { origin: 'https://evil.example' },
    { slug: 'Other1' },
    { wrongSource: true },
    { type: 'unknown' },
  ])('rejects unbound callback %o', async (options) => {
    fixture([step('soundcloud')]);
    await discover();
    authorize(options);
    expect(gaterush.actionProgress!('gaterush-soundcloud', document, url)?.state).toBe('waiting');
  });
  it('accepts the source-proven type-only callback and an optional matching slug', async () => {
    for (const options of [{}, { slug: 'Ab_1-2' }]) {
      fixture([step('soundcloud')]);
      await discover();
      authorize(options);
      expect(gaterush.actionProgress!('gaterush-soundcloud', document, url)?.state).toBe(
        'complete',
      );
      const context = ctx([attachment()]);
      expect(await gaterush.resolve(gaterush.inspect(document, url)!, context)).toMatchObject({
        ok: true,
      });
    }
  });
  it('rejects type-only callbacks from an older owned popup after a newer attempt starts', async () => {
    fixture([step('soundcloud')]);
    await discover();
    const older = document.createElement('iframe');
    const newer = document.createElement('iframe');
    document.body.append(older, newer);
    const open = vi
      .spyOn(window, 'open')
      .mockReturnValueOnce(older.contentWindow)
      .mockReturnValueOnce(newer.contentWindow);
    expect(gaterush.performAction!('gaterush-soundcloud', document, url, 'activate').ok).toBe(true);
    expect(gaterush.performAction!('gaterush-soundcloud', document, url, 'activate').ok).toBe(true);
    window.dispatchEvent(
      new MessageEvent('message', {
        data: { type: 'sc-auth' },
        origin: 'https://gaterush.me',
        source: older.contentWindow,
      }),
    );
    expect(gaterush.actionProgress!('gaterush-soundcloud', document, url)?.state).toBe('waiting');
    window.dispatchEvent(
      new MessageEvent('message', {
        data: { type: 'sc-auth' },
        origin: 'https://gaterush.me',
        source: newer.contentWindow,
      }),
    );
    expect(gaterush.actionProgress!('gaterush-soundcloud', document, url)?.state).toBe('complete');
    expect(open).toHaveBeenCalledTimes(2);
  });
  it('never treats DOM progress or enabled native Download as authentication proof', async () => {
    fixture([step('soundcloud')]);
    done(1);
    document.querySelector('#download')!.removeAttribute('disabled');
    document.querySelector('#download')!.classList.add('ready');
    expect(gaterush.actions!(document, url)).toEqual([]);
    await discover();
    expect(gaterush.actionProgress!('gaterush-soundcloud', document, url)?.state).toBe('waiting');
  });
  it('does not declare ready on provisional callback success when server still denies', async () => {
    fixture([step('soundcloud')]);
    await discover();
    authorize();
    const context = ctx([denied()]);
    expect(await gaterush.resolve(gaterush.inspect(document, url)!, context)).toMatchObject({
      ok: false,
      code: 'server-required',
    });
    expect(context.fetch).toHaveBeenCalledTimes(1);
    expect(gaterush.actionProgress!('gaterush-soundcloud', document, url)?.state).toBe('waiting');
  });
  it('clearly rejects denied comment gates after one read-only HEAD with no writes or consent', async () => {
    fixture([
      step('email'),
      step('soundcloud', false, { enableScComment: true }),
      step('instagram'),
    ]);
    const context = ctx([denied()]);
    expect(gaterush.presentation!(document, url)).not.toBeNull();
    expect(await gaterush.resolve(gaterush.inspect(document, url)!, context)).toMatchObject({
      ok: false,
      code: 'not-supported',
    });
    expect(context.fetch).toHaveBeenCalledTimes(1);
    expect(gaterush.actions!(document, url)).toEqual([]);
    expect(gaterush.performAction!('gaterush-soundcloud', document, url, 'activate').ok).toBe(
      false,
    );
  });
  it('does not open OAuth from configuration alone or on reveal/non-OAuth actions', async () => {
    fixture([step('soundcloud')]);
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    expect(gaterush.performAction!('gaterush-soundcloud', document, url, 'activate').ok).toBe(
      false,
    );
    expect(open).not.toHaveBeenCalled();
    await discover();
    expect(gaterush.performAction!('gaterush-soundcloud', document, url, 'reveal').ok).toBe(false);
    expect(open).not.toHaveBeenCalled();
    expect(gaterush.performAction!('gaterush-email', document, url, 'activate').ok).toBe(false);
    expect(open).not.toHaveBeenCalled();
    expect(gaterush.performAction!('gaterush-soundcloud', document, url, 'activate').ok).toBe(
      false,
    );
  });
});
