import { describe, expect, it, vi } from 'vitest';
import {
  stillhype,
  inspect,
  documents,
  authorizationUrl,
  verifySoundcloud,
} from '../src/core/providers/stillhype';
import type { ProviderContext } from '../src/core';
import { stillhype as extensionProvider } from '../src/extension/providers/stillhype';

const id = '11111111-1111-4111-8111-111111111111';
const fan = '22222222-2222-4222-8222-222222222222';
const url = new URL('https://www.stillhype.io/g/fixture-song-AbCd12');
const target = 'https://files.example/original.wav?signature=authored%2Fvalue';
function fixture(steps: unknown[] = [], extra = {}) {
  const campaign = {
    id,
    slug: 'fixture-song-AbCd12',
    title: 'Fixture track',
    is_published: true,
    gate_steps: steps,
    is_external_download: false,
    download_url: 'https://files.example/preview.mp3',
    artist_email: 'not-for-summary@example.test',
    ...extra,
  };
  const flight = `1:["$","$L1",null,${JSON.stringify({ campaign })}]`;
  return new DOMParser().parseFromString(
    `<h1>Fixture track</h1><script>self.__next_f.push(${JSON.stringify([1, flight])})</script>`,
    'text/html',
  );
}
const json = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });
function options(
  fetch: typeof globalThis.fetch,
  extra: Partial<ProviderContext> = {},
): ProviderContext {
  return { pageUrl: url, fetch, automate: true, probePublicFile: async () => null, ...extra };
}

describe('StillHype public model and exact routes', () => {
  it.each(['https://stillhype.io/g/song-123', 'https://www.stillhype.io/g/song-123'])(
    'matches %s',
    (address) => {
      expect(stillhype.matches(new URL(address))).toBe(true);
    },
  );
  it.each([
    'http://stillhype.io/g/song',
    'https://x.stillhype.io/g/song',
    'https://stillhype.io/g/a/b',
    'https://stillhype.io/dashboard',
    'https://name:secret@stillhype.io/g/song',
    'https://stillhype.io:444/g/song',
  ])('rejects %s', (address) => {
    expect(stillhype.matches(new URL(address))).toBe(false);
  });
  it('keeps private page fields and candidate preview addresses out of public metadata', () => {
    const gate = inspect(fixture(), url)!;
    expect(gate).toMatchObject({ provider: 'stillhype', id, title: 'Fixture track', metadata: {} });
    expect(JSON.stringify(gate)).not.toMatch(/artist_email|preview|signature/);
    expect(inspect(fixture([], { slug: 'other' }), url)).toBeNull();
    expect(inspect(fixture([], { is_published: false }), url)).toBeNull();
  });
  it('rejects executable/ambiguous Flight carriers and duplicate step IDs', () => {
    const document = fixture();
    document.querySelector('script')!.append(' ;window.evil()');
    expect(inspect(document, url)).toBeNull();
    const duplicate = fixture();
    duplicate.body.append(duplicate.querySelector('script')!.cloneNode(true));
    expect(inspect(duplicate, url)).toBeNull();
    const step = { id: 'same', type: 'email_capture', required: true };
    expect(inspect(fixture([step, step]), url)).toBeNull();
  });
});

describe('StillHype native HTTP approval', () => {
  it('initializes, submits configured email, acknowledges declared units and requires final approval', async () => {
    const document = fixture([
      { id: 'email', type: 'email_capture', required: true },
      {
        id: 'instagram',
        type: 'instagram_follow',
        required: true,
        follow_accounts: [
          { url: 'https://instagram.com/one' },
          { url: 'https://instagram.com/two' },
        ],
      },
    ]);
    const bodies: Record<string, unknown>[] = [];
    const fetch = vi.fn<typeof globalThis.fetch>().mockImplementation(async (input, init) => {
      const body = JSON.parse(String(init?.body));
      bodies.push(body);
      expect(body.campaign_id).toBe(id);
      expect(init).toMatchObject({ credentials: 'same-origin', redirect: 'error' });
      const path = new URL(String(input)).pathname;
      if (path.endsWith('/init')) return json({ fan_id: fan, completed_steps: [] });
      if (path.endsWith('/submit-email')) {
        expect(body.email).toBe('gatebreakeros@proton.me');
        return json({ fan_id: fan });
      }
      if (path.endsWith('/mark-complete')) return json({ ok: true });
      expect(path).toBe('/api/gate/unlock');
      expect(body.completed_steps).toEqual([
        'email',
        'instagram:https%3A%2F%2Finstagram.com%2Fone',
        'instagram:https%3A%2F%2Finstagram.com%2Ftwo',
      ]);
      return json({ download_url: target });
    });
    expect(await stillhype.resolve(inspect(document, url)!, options(fetch))).toEqual({
      ok: true,
      url: target,
      kind: 'file',
      method: 'provider-request',
    });
    expect(bodies).toHaveLength(5);
  });
  it('adopts the server email identity before actions and refreshes only its confirmed completions', async () => {
    const replacement = '33333333-3333-4333-8333-333333333333';
    const document = fixture([
      { id: 'instagram', type: 'instagram_follow', required: true },
      { id: 'email', type: 'email_capture', required: true },
      { id: 'website', type: 'website_visit', required: true },
    ]);
    const paths: string[] = [];
    const fetch = vi.fn<typeof globalThis.fetch>().mockImplementation(async (input, init) => {
      const path = new URL(String(input)).pathname;
      paths.push(path);
      const body = JSON.parse(String(init?.body));
      if (path.endsWith('/init'))
        return body.existing_fan_id === replacement
          ? json({ fan_id: replacement, completed_steps: ['website', 'unknown'] })
          : json({ fan_id: fan, completed_steps: ['instagram'] });
      if (path.endsWith('/submit-email')) {
        expect(paths).toEqual(['/api/gate/init', '/api/gate/submit-email']);
        expect(body.fan_id).toBe(fan);
        return json({ fan_id: replacement });
      }
      expect(body.fan_id).toBe(replacement);
      if (path.endsWith('/mark-complete')) {
        expect(body.step_id).toBe('instagram');
        return json({ ok: true });
      }
      expect(path).toBe('/api/gate/unlock');
      expect([...body.completed_steps].sort()).toEqual(['email', 'instagram', 'website']);
      return json({ download_url: target });
    });
    expect(await stillhype.resolve(inspect(document, url)!, options(fetch))).toMatchObject({
      ok: true,
      url: target,
    });
    expect(paths).toEqual([
      '/api/gate/init',
      '/api/gate/submit-email',
      '/api/gate/init',
      '/api/gate/mark-complete',
      '/api/gate/unlock',
    ]);
  });
  it.each([undefined, 'not-a-fan', 'https://example.invalid/fan'])(
    'rejects invalid server email identity %s before account actions',
    async (replacement) => {
      const document = fixture([
        { id: 'email', type: 'email_capture', required: true },
        { id: 'follow', type: 'soundcloud_follow', required: true },
      ]);
      const fetch = vi
        .fn<typeof globalThis.fetch>()
        .mockResolvedValueOnce(json({ fan_id: fan }))
        .mockResolvedValueOnce(json({ fan_id: replacement }));
      expect(await stillhype.resolve(inspect(document, url)!, options(fetch))).toMatchObject({
        ok: false,
        code: 'invalid-response',
      });
      expect(fetch).toHaveBeenCalledTimes(2);
    },
  );
  it('stops if the server does not confirm its replacement email session', async () => {
    const document = fixture([
      { id: 'email', type: 'email_capture', required: true },
      { id: 'follow', type: 'soundcloud_follow', required: true },
    ]);
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(json({ fan_id: fan }))
      .mockResolvedValueOnce(json({ fan_id: '33333333-3333-4333-8333-333333333333' }))
      .mockResolvedValueOnce(json({ fan_id: fan }));
    expect(await stillhype.resolve(inspect(document, url)!, options(fetch))).toMatchObject({
      ok: false,
      code: 'invalid-response',
    });
    expect(fetch).toHaveBeenCalledTimes(3);
  });
  it('does not invent required comments or submit unknown required steps', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>();
    const comments = fixture([{ id: 'comment', type: 'soundcloud_comment', required: true }]);
    expect(await stillhype.resolve(inspect(comments, url)!, options(fetch))).toMatchObject({
      ok: false,
      code: 'input-required',
    });
    const unknown = fixture([{ id: 'future', type: 'paid_action', required: true }]);
    expect(await stillhype.resolve(inspect(unknown, url)!, options(fetch))).toMatchObject({
      ok: false,
      code: 'not-supported',
    });
    expect(fetch).not.toHaveBeenCalled();
  });
  it('preserves server refusal and never uses campaign.download_url as an original', async () => {
    const document = fixture();
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(json({ fan_id: fan }))
      .mockResolvedValueOnce(json({ error: 'locked' }, 403));
    expect(await stillhype.resolve(inspect(document, url)!, options(fetch))).toMatchObject({
      ok: false,
      code: 'server-required',
    });
  });
  it.each([
    'http://files.example/song.wav',
    'https://localhost/song.wav',
    'https://www.stillhype.io/g/other',
    'https://x.supabase.co/storage/v1/object/public/previews/song.mp3',
  ])('rejects released unsafe/preview destination %s', async (download_url) => {
    const document = fixture();
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(json({ fan_id: fan }))
      .mockResolvedValueOnce(json({ download_url }));
    expect(await stillhype.resolve(inspect(document, url)!, options(fetch))).toMatchObject({
      ok: false,
      code: 'unsafe-destination',
    });
  });
  it('keeps approved external rewards as pages', async () => {
    const document = fixture([], { is_external_download: true });
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(json({ fan_id: fan }))
      .mockResolvedValueOnce(json({ download_url: target }));
    expect(await stillhype.resolve(inspect(document, url)!, options(fetch))).toMatchObject({
      ok: true,
      kind: 'page',
    });
  });
  it('reuses only a valid explicitly supplied native fan SID and checks final approval', async () => {
    const document = fixture([{ id: 'one', type: 'website_visit', required: true }]);
    const fetch = vi.fn<typeof globalThis.fetch>().mockImplementation(async (input, init) => {
      if (String(input).endsWith('/init')) {
        expect(JSON.parse(String(init?.body)).existing_fan_id).toBe(fan);
        return json({ fan_id: fan, completed_steps: ['one', 'forged-unknown'] });
      }
      expect(String(input).endsWith('/unlock')).toBe(true);
      expect(JSON.parse(String(init?.body)).completed_steps).toEqual(['one']);
      return json({ download_url: target });
    });
    expect(
      await stillhype.resolve(
        inspect(document, url)!,
        options(fetch, { readNativeSession: () => fan }),
      ),
    ).toMatchObject({ ok: true });
    expect(fetch).toHaveBeenCalledTimes(2);
  });
  it('does not mutate a gate without explicit automation, and honors cancellation', async () => {
    const document = fixture();
    const fetch = vi.fn<typeof globalThis.fetch>();
    const gate = inspect(document, url)!;
    expect(await stillhype.resolve(gate, options(fetch, { automate: false }))).toMatchObject({
      ok: false,
    });
    await expect(
      stillhype.resolve(gate, options(fetch, { signal: AbortSignal.abort() })),
    ).rejects.toThrow();
    expect(fetch).not.toHaveBeenCalled();
  });
  it('handles rate limits without calling final unlock', async () => {
    const document = fixture();
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValue(json({ error: 'slow down' }, 429));
    expect(await stillhype.resolve(inspect(document, url)!, options(fetch))).toMatchObject({
      ok: false,
      code: 'rate-limited',
    });
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});

describe('StillHype manual sign-in handoff', () => {
  it('uses native fan/campaign/step parameters, user comment and server verification', async () => {
    const document = fixture([
      {
        id: 'comment',
        type: 'soundcloud_comment',
        required: true,
        target_track_id: 'https://soundcloud.com/artist/song',
      },
    ]);
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(json({ fan_id: fan }))
      .mockResolvedValueOnce(json({ needs_auth: true }, 401));
    expect(
      await stillhype.resolve(
        inspect(document, url)!,
        options(fetch, { preferences: { soundcloudComment: 'My own text' } }),
      ),
    ).toMatchObject({ code: 'server-required' });
    const current = documents.get(document)!;
    const address = new URL(authorizationUrl(current, url)!);
    expect(address.origin + address.pathname).toBe('https://www.stillhype.io/api/oauth/soundcloud');
    expect(address.searchParams.get('comment_text')).toBe('My own text');
    expect(address.searchParams.get('fan_id')).toBe(fan);
    const verify = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(json({ verified: false }))
      .mockResolvedValueOnce(json({ verified: true }));
    expect(await verifySoundcloud(current, current.authStep!, options(verify))).toBe(false);
    expect(current.completed.has('comment')).toBe(false);
    expect(await verifySoundcloud(current, current.authStep!, options(verify))).toBe(true);
    expect(current.completed.has('comment')).toBe(true);
  });
  it('keeps original controls untouched and handles popup blocking honestly', async () => {
    const document = fixture([{ id: 'follow', type: 'soundcloud_follow', required: true }]);
    const native = document.createElement('button');
    native.textContent = 'Native button';
    native.onclick = vi.fn();
    document.body.append(native);
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(json({ fan_id: fan }))
      .mockResolvedValueOnce(json({ needs_auth: true }));
    await stillhype.resolve(inspect(document, url)!, options(fetch));
    const view = { open: vi.fn(() => null) };
    Object.defineProperty(document, 'defaultView', { value: view });
    const action = extensionProvider.actions!(document, url)[0]!;
    expect(extensionProvider.performAction!(action.id, document, url, 'activate')).toMatchObject({
      ok: false,
    });
    expect(native.onclick).not.toHaveBeenCalled();
    expect(native.hidden).toBe(false);
  });
});
