import { describe, expect, it, vi } from 'vitest';
import { droploud } from '../src/providers/droploud';
const id = '12309e08-fd88-4830-849f-a816b8781ac6';
const url = new URL(`https://droploud.com/track/${id}`);
const sid = '11111111-1111-4111-8111-111111111111';
function fixture(steps: { id: string; type: string }[] = [], unlocked = false) {
  const value = {
    track: { id, title: 'A "test" {track}' },
    steps,
    artist: { email: 'should-not-be-retained@example.test' },
    fan_prefill: { email: 'private@example.test' },
  };
  const flight = `1:["$","$L1",null,{"gateData":${JSON.stringify(value)},"trackId":"${id}"}]`;
  const html = `<script src="/_next/static/immutable/chunks/2hzo_gvdx8sta.js"></script><h1 class="dtr-caption-title">A title</h1><div class="dtr-stage"><div class="dtr-card-pane"><h2 class="dtr-card-title">${unlocked ? 'Drop unlocked!' : 'Free download'}</h2><button class="dtr-card-cta">${unlocked ? 'Download' : 'Free download'}</button></div></div><script>self.__next_f.push(${JSON.stringify([1, flight])})</script>`;
  const parsed = new DOMParser().parseFromString(html, 'text/html');
  const stored = new Map<string, string>();
  const local = new Map<string, string>();
  Object.defineProperty(parsed, 'defaultView', {
    value: {
      sessionStorage: {
        getItem: (key: string) => stored.get(key) ?? null,
        setItem: (key: string, value: string) => stored.set(key, value),
      },
      localStorage: {
        getItem: (key: string) => local.get(key) ?? null,
        setItem: (key: string, value: string) => local.set(key, value),
      },
      open: vi.fn(),
    },
  });
  return parsed;
}
const response = (body: unknown, status = 200, type = 'application/json') =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': type },
  });
function context(fetcher: typeof fetch, automate = true) {
  return {
    pageUrl: url,
    fetch: fetcher,
    probePublicFile: async () => null,
    automate,
  };
}
describe('Droploud native-session candidate', () => {
  it('matches exact HTTPS gate/track UUIDs only', () => {
    expect(droploud.matches(url)).toBe(true);
    for (const path of [
      `http://droploud.com/track/${id}`,
      `https://evil.droploud.com/track/${id}`,
      `https://droploud.com/track/not-a-uuid`,
      `https://droploud.com/track/${id}/success`,
      `https://x:d@droploud.com/track/${id}`,
    ])
      expect(droploud.matches(new URL(path))).toBe(false);
  });
  it('does no network during inspect and retains no account or model values in metadata', () => {
    const gate = droploud.inspect(fixture(), url)!;
    expect(gate.title).toBe('A "test" {track}');
    expect(gate.metadata).toEqual({});
    expect(JSON.stringify(gate)).not.toContain('private');
    expect(JSON.stringify(gate)).not.toContain('artist');
  });
  it.each(['1d0l2-pz5xzsu.js', 'new_deployment-123.js'])(
    'recognizes the native Flight model after a chunk filename changes to %s',
    (chunk) => {
      const doc = fixture();
      doc
        .querySelector('script[src]')!
        .setAttribute('src', `/_next/static/immutable/chunks/${chunk}`);
      expect(droploud.inspect(doc, url)).toMatchObject({ provider: 'droploud', id });
    },
  );
  it.each([
    '/unrelated.js',
    '/_next/static/immutable/chunks/nested/component.js',
    '/_next/static/immutable/chunks/component.css',
    'https://evil.test/_next/static/immutable/chunks/component.js',
  ])('rejects an unrelated or foreign script marker %s', (source) => {
    const doc = fixture();
    doc.querySelector('script[src]')!.setAttribute('src', source);
    expect(droploud.inspect(doc, url)).toBeNull();
  });
  it('still requires the current URL to match the bounded Flight track model', () => {
    const doc = fixture();
    expect(
      droploud.inspect(
        doc,
        new URL('https://droploud.com/track/e8769ae1-5c90-43ee-bfe3-9fbbe50c5b89'),
      ),
    ).toBeNull();
    doc.querySelector('h1')!.className = '';
    expect(droploud.inspect(doc, url)).toBeNull();
  });
  it('rejects foreign scripts, duplicate model data and appended executable script text', () => {
    const doc = fixture();
    doc
      .querySelector('script[src]')!
      .setAttribute('src', 'https://evil.test/_next/static/immutable/chunks/2hzo_gvdx8sta.js');
    expect(droploud.inspect(doc, url)).toBeNull();
    const dup = fixture();
    dup.body.append(dup.querySelector('script:not([src])')!.cloneNode(true));
    expect(droploud.inspect(dup, url)).toBeNull();
    const code = fixture();
    code.querySelector('script:not([src])')!.textContent += '; globalThis.alert(1)';
    expect(droploud.inspect(code, url)).toBeNull();
  });
  it('does not submit required social/email/comment/consent data or download before native completion', async () => {
    const doc = fixture([
      { id: 'email', type: 'email' },
      { id: 'sc_comment', type: 'soundcloud_comment' },
    ]);
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(response({ connected: false }));
    const result = await droploud.resolve(droploud.inspect(doc, url)!, context(fetcher));
    expect(result).toMatchObject({ ok: false, code: 'server-required' });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0]![0]).toBe('https://api.droploud.com/api/soundcloud/gate-status');
    expect(Object.keys(JSON.parse(fetcher.mock.calls[0]![1]!.body as string)).sort()).toEqual([
      'session_id',
      'track_id',
    ]);
  });
  it('sends the live-proven optional skip ACK, then requests original file; never fetches media', async () => {
    const doc = fixture([{ id: 'droploud_follow', type: 'droploud_follow' }]);
    doc.defaultView!.sessionStorage.setItem('dw_sid', sid);
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(response({}, 403))
      .mockResolvedValueOnce(response({ ok: true }))
      .mockResolvedValueOnce(
        response({
          download_url: 'https://files.example.test/original.wav?signature=memory',
          type: 'native',
        }),
      );
    const result = await droploud.resolve(droploud.inspect(doc, url)!, context(fetcher));
    expect(result).toMatchObject({
      ok: true,
      kind: 'file',
      method: 'provider-request',
    });
    expect(fetcher).toHaveBeenCalledTimes(3);
    expect(fetcher.mock.calls[0]![0]).toMatch(/\/download$/);
    expect(fetcher.mock.calls[1]![0]).toBe(`https://api.droploud.com/api/gate/${id}/step`);
    expect(JSON.parse(fetcher.mock.calls[1]![1]!.body as string)).toEqual({
      session_id: sid,
      step: 'droploud_follow',
    });
    expect(JSON.parse(fetcher.mock.calls[2]![1]!.body as string)).toEqual({
      session_id: sid,
    });
    expect(fetcher.mock.calls[1]![1]).toMatchObject({
      credentials: 'include',
      redirect: 'error',
      cache: 'no-store',
    });
  });
  it('never automates optional ACK without explicit Download automation context', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(response({}, 403));
    const result = await droploud.resolve(
      droploud.inspect(fixture([{ id: 'droploud_follow', type: 'droploud_follow' }]), url)!,
      context(fetcher, false),
    );
    expect(result.ok).toBe(false);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0]![0]).toMatch(/\/download$/);
  });
  it('uses the native UUID after real completion, and keeps external rewards as pages', async () => {
    const doc = fixture([{ id: 'sc_follow', type: 'soundcloud_follow' }], true);
    doc.defaultView!.sessionStorage.setItem('dw_sid', sid);
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(
      response({
        download_url: 'https://artist.example.test/download',
        type: 'external',
      }),
    );
    const result = await droploud.resolve(droploud.inspect(doc, url)!, context(fetcher));
    expect(result).toEqual({
      ok: true,
      url: 'https://artist.example.test/download',
      kind: 'page',
      method: 'provider-request',
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0]![0]).toMatch(/\/download$/);
  });
  it('rejects a corrupted native session UUID', async () => {
    const fetcher = vi.fn<typeof fetch>();
    const doc = fixture([{ id: 'sc_follow', type: 'soundcloud_follow' }], true);
    doc.defaultView!.sessionStorage.setItem('dw_sid', 'bad-session');
    expect(await droploud.resolve(droploud.inspect(doc, url)!, context(fetcher))).toMatchObject({
      ok: false,
      code: 'session-expired',
    });
    expect(fetcher).not.toHaveBeenCalled();
  });
  it.each([
    ['javascript:alert(1)', 'native'],
    ['https://droploud.com/track/' + id, 'native'],
    ['https://127.0.0.1/a', 'native'],
    ['https://files.example.test/a', 'unknown'],
  ])('fails closed for unsafe/unknown reward %s', async (destination, type) => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(response({ download_url: destination, type }));
    expect((await droploud.resolve(droploud.inspect(fixture(), url)!, context(fetcher))).ok).toBe(
      false,
    );
  });
  it.each([
    [403, 'server-required'],
    [429, 'rate-limited'],
    [401, 'session-expired'],
    [404, 'not-supported'],
  ])('maps native HTTP %s safely', async (status, code) => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(response({ error: 'private server details' }, status));
    expect(
      await droploud.resolve(droploud.inspect(fixture(), url)!, context(fetcher)),
    ).toMatchObject({ ok: false, code });
  });
  it('rejects oversized JSON and malformed ACKs without requesting the destination', async () => {
    const large = vi
      .fn<typeof fetch>()
      .mockResolvedValue(response({ download_url: 'a'.repeat(70000) }));
    expect(await droploud.resolve(droploud.inspect(fixture(), url)!, context(large))).toMatchObject(
      { ok: false, code: 'invalid-response' },
    );
    const ack = vi.fn<typeof fetch>().mockResolvedValue(response({ ok: false }));
    expect(
      await droploud.resolve(
        droploud.inspect(fixture([{ id: 'droploud_follow', type: 'droploud_follow' }]), url)!,
        context(ack),
      ),
    ).toMatchObject({ ok: false, code: 'invalid-response' });
    expect(ack).toHaveBeenCalledTimes(1);
  });
  it('aborts before any request', async () => {
    const signal = AbortSignal.abort();
    const fetcher = vi.fn<typeof fetch>();
    await expect(
      droploud.resolve(droploud.inspect(fixture(), url)!, {
        ...context(fetcher),
        signal,
      }),
    ).rejects.toBeDefined();
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('opens the source-known authorization URL explicitly only after server-confirmed missing authorization', async () => {
    const doc = fixture([{ id: 'sc_follow', type: 'soundcloud_follow' }]);
    doc.defaultView!.sessionStorage.setItem('dw_sid', sid);
    const open = vi.fn().mockReturnValue({ closed: false });
    doc.defaultView!.open = open;
    expect(droploud.actions!(doc, url)).toEqual([]);
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(response({}, 403))
      .mockResolvedValueOnce(response({ connected: false }));
    await droploud.resolve(droploud.inspect(doc, url)!, context(fetcher));
    expect(droploud.actions!(doc, url)).toMatchObject([
      { id: 'droploud-soundcloud', required: true },
    ]);
    expect(open).not.toHaveBeenCalled();
    expect(droploud.performAction!('droploud-soundcloud', doc, url, 'activate').ok).toBe(true);
    expect(open).toHaveBeenCalledTimes(1);
    expect(open.mock.calls[0]![0]).toBe(
      `https://api.droploud.com/api/soundcloud/connect?track_id=${id}&session_id=${sid}&disclose_droploud=1`,
    );
  });
  it('does not offer direct authorization for gates requiring a user-written comment', () => {
    const doc = fixture([{ id: 'sc_comment', type: 'soundcloud_comment' }]);
    const open = vi.fn();
    doc.defaultView!.open = open;
    expect(droploud.actions!(doc, url)).toEqual([]);
    expect(droploud.performAction!('droploud-soundcloud', doc, url, 'activate').ok).toBe(false);
    expect(open).not.toHaveBeenCalled();
  });
  it('ignores DOM-completed state and obtains server status before the final request', async () => {
    const doc = fixture([{ id: 'sc_follow', type: 'soundcloud_follow' }], true);
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(response({ connected: false }));
    expect(await droploud.resolve(droploud.inspect(doc, url)!, context(fetcher))).toMatchObject({
      ok: false,
      code: 'server-required',
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('reads the native per-track SID before the general SID without generating or writing any identity', async () => {
    const doc = fixture([
      { id: 'sc_comment', type: 'soundcloud_comment' },
      { id: 'email', type: 'email' },
    ]);
    const generalSid = '22222222-2222-4222-8222-222222222222';
    doc.defaultView!.sessionStorage.setItem('dw_sid', generalSid);
    doc.defaultView!.localStorage.setItem(`dw_sid:${id}`, sid);
    const create = vi.spyOn(crypto, 'randomUUID');
    const writeLocal = vi.spyOn(doc.defaultView!.localStorage, 'setItem');
    const writeSession = vi.spyOn(doc.defaultView!.sessionStorage, 'setItem');
    const readLocal = vi.spyOn(doc.defaultView!.localStorage, 'getItem');
    const readSession = vi.spyOn(doc.defaultView!.sessionStorage, 'getItem');
    const gate = droploud.inspect(doc, url)!;
    expect(droploud.actions!(doc, url)).toEqual([]);
    expect(readLocal).not.toHaveBeenCalled();
    expect(readSession).not.toHaveBeenCalled();
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      response({
        download_url: 'https://api.droploud.com/test-fixture-original.wav?signature=fixture',
        type: 'native',
      }),
    );
    expect(await droploud.resolve(gate, context(fetcher))).toMatchObject({
      ok: true,
      kind: 'file',
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0]![0]).toMatch(/\/download$/);
    expect(JSON.parse(fetcher.mock.calls[0]![1]!.body as string)).toEqual({ session_id: sid });
    expect(create).not.toHaveBeenCalled();
    expect(writeLocal).not.toHaveBeenCalled();
    expect(writeSession).not.toHaveBeenCalled();
    expect(readLocal).toHaveBeenCalledWith(`dw_sid:${id}`);
    expect(readSession).not.toHaveBeenCalled();
  });
  it('reuses a general native SID for a completed comment gate with no native DOM completion or synthetic comment', async () => {
    const doc = fixture([{ id: 'sc_comment', type: 'soundcloud_comment' }], false);
    doc.defaultView!.sessionStorage.setItem('dw_sid', sid);
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(response({ download_url: 'https://files.example.test/original.wav' }));
    const create = vi.spyOn(crypto, 'randomUUID');
    expect(await droploud.resolve(droploud.inspect(doc, url)!, context(fetcher))).toMatchObject({
      ok: true,
      kind: 'file',
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(JSON.parse(fetcher.mock.calls[0]![1]!.body as string)).toEqual({ session_id: sid });
    expect(create).not.toHaveBeenCalled();
  });
  it('does not repeat a refused native-session download without a supported state change', async () => {
    const doc = fixture([{ id: 'sc_comment', type: 'soundcloud_comment' }]);
    doc.defaultView!.sessionStorage.setItem('dw_sid', sid);
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(response({}, 403))
      .mockResolvedValueOnce(response({ connected: true }));
    expect(await droploud.resolve(droploud.inspect(doc, url)!, context(fetcher))).toMatchObject({
      ok: false,
      code: 'server-required',
    });
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(droploud.actions!(doc, url)).toEqual([]);
  });
});
