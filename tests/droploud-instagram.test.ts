import { afterEach, describe, expect, it, vi } from 'vitest';
import { droploud } from '../src/core/providers/droploud';
import type { ProviderContext } from '../src/core/domain/provider';

const id = 'e8769ae1-5c90-43ee-bfe3-9fbbe50c5b89';
const pageUrl = new URL(`https://droploud.com/track/${id}`);
const sid = '11111111-1111-4111-8111-111111111111';
const instagram = { id: 'instagram', type: 'instagram_follow' };
const json = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json' } });
const approved = () => json({ download_url: 'https://files.example.test/original.wav' });
function setup(steps = [instagram]) {
  const model = { track: { id, title: 'Authored Instagram gate' }, steps };
  const flight = `1:${JSON.stringify(['$', '$L1', null, { gateData: model }])}`;
  const doc = new DOMParser().parseFromString(
    `<h1 class="dtr-caption-title">Track</h1><script src="/_next/static/immutable/chunks/authored.js"></script><script>self.__next_f.push(${JSON.stringify([1, flight])})</script>`,
    'text/html',
  );
  const fetch = vi.fn<typeof globalThis.fetch>();
  const context: ProviderContext = {
    pageUrl,
    fetch,
    automate: true,
    probePublicFile: async () => null,
  };
  return { gate: droploud.inspect(doc, pageUrl)!, fetch, context };
}
afterEach(() => vi.useRealTimers());

describe('Droploud Instagram HTTP acknowledgement', () => {
  it('acknowledges the declared step without inventing an Instagram identity or using its API', async () => {
    const h = setup();
    h.fetch.mockResolvedValueOnce(json({ ok: true })).mockResolvedValueOnce(approved());
    expect(await droploud.resolve(h.gate, h.context)).toMatchObject({ ok: true });
    const [address, init] = h.fetch.mock.calls[0]!;
    expect(address).toBe(`https://api.droploud.com/api/gate/${id}/step`);
    expect(init).toMatchObject({ method: 'POST', credentials: 'include', redirect: 'error' });
    expect(JSON.parse(init!.body as string)).toEqual({
      session_id: expect.any(String),
      step: 'instagram',
    });
    expect(h.fetch).toHaveBeenCalledTimes(2);
    expect(String(h.fetch.mock.calls[1]![0])).toBe(
      `https://api.droploud.com/api/gate/${id}/download`,
    );
  });
  it('repairs the reported native-session refusal after SoundCloud has completed', async () => {
    const h = setup([instagram, { id: 'sc_follow', type: 'soundcloud_follow' }]);
    h.fetch
      .mockResolvedValueOnce(json({ error: 'Instagram step not completed' }, 403))
      .mockResolvedValueOnce(json({ connected: true }))
      .mockResolvedValueOnce(json({ ok: true }))
      .mockResolvedValueOnce(approved());
    expect(
      await droploud.resolve(h.gate, { ...h.context, readNativeSession: () => sid }),
    ).toMatchObject({ ok: true });
    expect(
      h.fetch.mock.calls.map(([url]) => new URL(String(url)).pathname.split('/').at(-1)),
    ).toEqual(['download', 'gate-status', 'step', 'download']);
    expect(JSON.parse(h.fetch.mock.calls[2]![1]!.body as string)).toEqual({
      session_id: sid,
      step: 'instagram',
    });
  });
  it('preserves a native session that already has final approval without resubmitting steps', async () => {
    const h = setup();
    h.fetch.mockResolvedValueOnce(approved());
    expect(
      await droploud.resolve(h.gate, { ...h.context, readNativeSession: () => sid }),
    ).toMatchObject({ ok: true });
    expect(h.fetch).toHaveBeenCalledTimes(1);
    expect(String(h.fetch.mock.calls[0]![0])).toContain('/download');
  });
  it.each([
    { id: 'instagram', type: 'unknown_future_step' },
    { id: 'email', type: 'instagram_follow' },
    { id: 'sc_repost', type: 'instagram_follow' },
    { id: 'instagram_other', type: 'instagram_follow' },
    { id: 'twitter', type: 'twitter_follow' },
  ])(
    'never converts an unsupported or mismatched declaration into an acknowledgment: %j',
    async (step) => {
      const h = setup([step]);
      h.fetch.mockResolvedValue(json({ error: 'Gate not completed' }, 403));
      expect(await droploud.resolve(h.gate, h.context)).toMatchObject({ ok: false });
      expect(h.fetch.mock.calls.every(([url]) => String(url).endsWith('/download'))).toBe(true);
    },
  );
  it('does not acknowledge Instagram without an explicitly automated resolution', async () => {
    const h = setup();
    h.fetch.mockResolvedValue(json({ error: 'Instagram step not completed' }, 403));
    expect(await droploud.resolve(h.gate, { ...h.context, automate: false })).toMatchObject({
      ok: false,
    });
    expect(h.fetch).toHaveBeenCalledTimes(1);
    expect(String(h.fetch.mock.calls[0]![0])).toContain('/download');
  });
  it.each([null, {}, { ok: false }, { ok: true, extra: 'unsupported' }])(
    'rejects an unconfirmed receipt %j before requesting a download',
    async (value) => {
      const h = setup();
      h.fetch.mockResolvedValue(json(value));
      expect(await droploud.resolve(h.gate, h.context)).toMatchObject({
        ok: false,
        code: 'invalid-response',
      });
      expect(h.fetch).toHaveBeenCalledTimes(1);
    },
  );
  it.each([403, 429, 500])(
    'stops after HTTP %s without a final download request',
    async (status) => {
      const h = setup();
      h.fetch.mockResolvedValue(json({ error: 'Refused' }, status));
      expect(await droploud.resolve(h.gate, h.context)).toMatchObject({ ok: false });
      expect(h.fetch).toHaveBeenCalledTimes(1);
    },
  );
  it('still requires final server approval after a valid acknowledgment', async () => {
    const h = setup();
    h.fetch
      .mockResolvedValueOnce(json({ ok: true }))
      .mockResolvedValueOnce(json({ error: 'Another required step not completed' }, 403));
    expect(await droploud.resolve(h.gate, h.context)).toMatchObject({
      ok: false,
      code: 'server-required',
    });
    expect(h.fetch).toHaveBeenCalledTimes(2);
  });
  it('never sends the Instagram acknowledgement while SoundCloud authorization is still missing', async () => {
    const h = setup([instagram, { id: 'sc_follow', type: 'soundcloud_follow' }]);
    h.fetch.mockResolvedValueOnce(json({ connected: false }));
    expect(await droploud.resolve(h.gate, h.context)).toMatchObject({
      ok: false,
      code: 'server-required',
    });
    expect(h.fetch).toHaveBeenCalledTimes(1);
    expect(String(h.fetch.mock.calls[0]![0])).toContain('/gate-status');
  });
  it('cancels after acknowledgement without submitting the final download', async () => {
    const h = setup();
    const controller = new AbortController();
    h.fetch.mockImplementationOnce(async () => {
      controller.abort();
      return json({ ok: true });
    });
    await expect(
      droploud.resolve(h.gate, { ...h.context, signal: controller.signal }),
    ).rejects.toThrow();
    expect(h.fetch).toHaveBeenCalledTimes(1);
  });
  it('drops an acknowledgment result belonging to a replaced native session', async () => {
    const h = setup();
    let current = sid;
    h.fetch
      .mockResolvedValueOnce(json({ error: 'Instagram step not completed' }, 403))
      .mockImplementationOnce(async () => {
        current = '22222222-2222-4222-8222-222222222222';
        return json({ ok: true });
      });
    expect(
      await droploud.resolve(h.gate, { ...h.context, readNativeSession: () => current }),
    ).toMatchObject({ ok: false });
    expect(h.fetch).toHaveBeenCalledTimes(2);
  });
});
