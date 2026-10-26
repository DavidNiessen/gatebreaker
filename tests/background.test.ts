import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';

type Listener = (
  message: unknown,
  sender: chrome.runtime.MessageSender,
  respond: (response: unknown) => void,
) => boolean | void;

const hooks = vi.hoisted(() => ({ addListener: vi.fn() }));

vi.mock('../src/platform/browser', () => ({
  extension: {
    runtime: { id: 'fixture-extension', onMessage: { addListener: hooks.addListener } },
  },
}));

const gateId = 'fixture123';
const publicUrl = 'https://hypeddit-gates-prod.s3.amazonaws.com/fixture123_main';
const trustedSender: chrome.runtime.MessageSender = {
  id: 'fixture-extension',
  frameId: 0,
  tab: { id: 1 } as chrome.tabs.Tab,
  url: 'https://hypeddit.com/fixture-artist/fixture-track',
};

let listener: Listener;
let fetchMock: ReturnType<typeof vi.fn<typeof fetch>>;

function dispatch(message: unknown, sender = trustedSender) {
  let respond!: (value: unknown) => void;
  const response = new Promise<unknown>((resolve) => {
    respond = resolve;
  });
  const keepOpen = listener(message, sender, respond);
  return { keepOpen, response };
}

beforeEach(async () => {
  vi.resetModules();
  hooks.addListener.mockReset();
  fetchMock = vi.fn<typeof fetch>();
  vi.stubGlobal('fetch', fetchMock);
  await import('../src/entrypoints/background');
  listener = hooks.addListener.mock.calls[0]![0] as Listener;
});

afterEach(() => vi.unstubAllGlobals());

describe('background public-file boundary', () => {
  it.each([
    { id: 'another-extension' },
    { frameId: 1 },
    { tab: undefined },
    { url: undefined },
    { url: 'not a URL' },
    { url: 'https://hypeddit.com.evil.example/artist/track' },
    { url: 'https://user:secret@hypeddit.com/artist/track' },
    { url: 'http://hypeddit.com/artist/track' },
    { url: 'https://hypeddit.com:8443/artist/track' },
  ])('rejects an untrusted sender before fetching: %j', (override) => {
    const respond = vi.fn();
    expect(
      listener(
        { type: 'gatebreaker:public-file', gateId },
        { ...trustedSender, ...override } as chrome.runtime.MessageSender,
        respond,
      ),
    ).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(respond).not.toHaveBeenCalled();
  });

  it.each([
    null,
    {},
    { type: 'gatebreaker:resolve', gateId },
    { type: 'gatebreaker:public-file', gateId: '../escape' },
    { type: 'gatebreaker:public-file', gateId: 'https://evil.example/file' },
    { type: 'gatebreaker:public-file', gateId: 'file?redirect=evil' },
    { type: 'gatebreaker:public-file', gateId: 'x'.repeat(65) },
    { type: 'gatebreaker:public-file', gateId: 123 },
  ])('rejects an unsupported operation or malformed object key: %j', (message) => {
    expect(dispatch(message).keepOpen).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('requests only the fixed public main object with a credential-free HEAD', async () => {
    fetchMock.mockResolvedValue(new Response(null, { headers: { 'content-type': 'audio/mpeg' } }));
    const request = dispatch({ type: 'gatebreaker:public-file', gateId });
    expect(request.keepOpen).toBe(true);
    expect(await request.response).toEqual({ url: publicUrl });
    expect(fetchMock).toHaveBeenCalledExactlyOnceWith(
      publicUrl,
      expect.objectContaining({
        method: 'HEAD',
        credentials: 'omit',
        redirect: 'error',
        cache: 'no-store',
        signal: expect.any(AbortSignal),
      }),
    );
  });

  it.each([403, 404, 429, 500])('does not expose an HTTP %s response as a file', async (status) => {
    fetchMock.mockResolvedValue(new Response(null, { status }));
    expect(await dispatch({ type: 'gatebreaker:public-file', gateId }).response).toEqual({
      url: null,
    });
  });

  it.each(['text/html', 'TEXT/HTML; charset=utf-8', 'application/xml', 'text/xml'])(
    'does not expose a %s error document as a file',
    async (mime) => {
      fetchMock.mockResolvedValue(new Response(null, { headers: { 'content-type': mime } }));
      expect(await dispatch({ type: 'gatebreaker:public-file', gateId }).response).toEqual({
        url: null,
      });
    },
  );

  it.each([
    new TypeError('Fixture network failure'),
    new DOMException('Fixture timeout', 'TimeoutError'),
  ])('contains probe rejection and replies with no file', async (error) => {
    fetchMock.mockRejectedValue(error);
    expect(await dispatch({ type: 'gatebreaker:public-file', gateId }).response).toEqual({
      url: null,
    });
  });

  it('coalesces concurrent probes and permits a new probe after completion', async () => {
    let finish!: (response: Response) => void;
    fetchMock.mockReturnValueOnce(
      new Promise<Response>((resolve) => {
        finish = resolve;
      }),
    );
    const first = dispatch({ type: 'gatebreaker:public-file', gateId });
    const second = dispatch({ type: 'gatebreaker:public-file', gateId });
    expect(fetchMock).toHaveBeenCalledOnce();
    finish(new Response(null, { headers: { 'content-type': 'audio/wav' } }));
    expect(await first.response).toEqual({ url: publicUrl });
    expect(await second.response).toEqual({ url: publicUrl });
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 404 }));
    expect(await dispatch({ type: 'gatebreaker:public-file', gateId }).response).toEqual({
      url: null,
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
