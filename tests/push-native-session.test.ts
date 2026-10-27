import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { push } from '../src/providers/push';
import { pushSession, pushModel } from '../src/providers/push-session';
import type { ProviderContext } from '../src/domain/provider';

const slug = 'authored-reuse';
const driver = 'spotify-follow';
const url = new URL(`https://push.fm/cu/${slug}`);
const actionId = `push-login-${driver}`;
const otherCookie = 'authored-other-gate';
const token = 'authored-opaque-gate-receipt';
function value() {
  return {
    [`${slug}${driver}`]: {
      link: `cu/${slug}`,
      serviceId: `${slug}${driver}`,
      status: { driver, token },
    },
  };
}
function store(input: unknown, name = slug) {
  document.cookie = `${name}=${typeof input === 'string' ? input : JSON.stringify(input)}; path=/`;
}
function progress() {
  return push.actionProgress!(actionId, document, url);
}
function json(input: unknown, status = 200) {
  return new Response(JSON.stringify(input), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}
function context(): ProviderContext {
  return {
    pageUrl: url,
    automate: true,
    probePublicFile: vi.fn(),
    fetch: vi
      .fn()
      .mockResolvedValueOnce(
        json({
          slug,
          title: 'Authored gate',
          type: 'url',
          content_count: 1,
          minimum_actions: 1,
          actions: [
            {
              id: 42,
              driver,
              required: true,
              provider: {
                client_authentication: false,
                client_execution: false,
              },
            },
          ],
        }),
      )
      .mockResolvedValueOnce(json({}, 403))
      .mockResolvedValueOnce(json({ body: 'https://example.org/authored.zip' })),
  };
}
let button: HTMLButtonElement;
beforeEach(() => {
  document.cookie = `${slug}=; Max-Age=0; path=/`;
  document.cookie = `${otherCookie}=; Max-Age=0; path=/`;
  document.head.innerHTML =
    '<meta property="og:title" content="Authored reuse"><meta name="csrf-token" content="authored-csrf-000000000000">';
  document.body.innerHTML =
    '<div id="app"><button class="btn-spotify action-required">Followed on Spotify</button></div><script type="fixture/javascript" src="https://d29xpkeqnsbaz3.cloudfront.net/release/js/products.js"></script>';
  button = document.querySelector('button')!;
  button.disabled = true;
  // This restoration fixture begins after normal HTTP refusal and validated current metadata.
  const current = pushSession(push.inspect(document, url)!)!;
  current.authRequired = true;
  current.model = pushModel({
    minimum_actions: 1,
    actions: [
      {
        id: 42,
        driver,
        required: true,
        provider: { client_authentication: false, client_execution: false },
      },
    ],
  })!;
});
afterEach(() => {
  vi.restoreAllMocks();
  document.cookie = `${slug}=; Max-Age=0; path=/`;
  document.cookie = `${otherCookie}=; Max-Age=0; path=/`;
});
describe('native PUSH same-gate receipt reuse', () => {
  it('recognizes PUSH-restored completion without a sign-in click or storage write', () => {
    store(value());
    const click = vi.spyOn(button, 'click');
    const before = document.cookie;
    expect(progress()).toMatchObject({ state: 'complete' });
    expect(click).not.toHaveBeenCalled();
    expect(document.cookie).toBe(before);
  });
  it('does not treat a cookie alone as native completion', () => {
    store(value());
    button.disabled = false;
    expect(progress()).toMatchObject({ state: 'waiting' });
  });
  it('does not treat a disabled button alone as authenticated', () => {
    expect(progress()).toMatchObject({ state: 'waiting' });
  });
  it('ignores another gate cookie and never transfers completion across gates', () => {
    store(value(), otherCookie);
    expect(progress()).toMatchObject({ state: 'waiting' });
  });
  it.each([
    ['malformed JSON', '{not-json'],
    ['non-object', []],
    [
      'wrong entry key',
      {
        wrong: {
          link: `cu/${slug}`,
          serviceId: `${slug}${driver}`,
          status: { driver, token },
        },
      },
    ],
    [
      'wrong link',
      {
        [`${slug}${driver}`]: {
          ...value()[`${slug}${driver}`],
          link: 'cu/another',
        },
      },
    ],
    [
      'wrong service id',
      {
        [`${slug}${driver}`]: {
          ...value()[`${slug}${driver}`],
          serviceId: 'another',
        },
      },
    ],
    [
      'wrong driver',
      {
        [`${slug}${driver}`]: {
          ...value()[`${slug}${driver}`],
          status: { driver: 'spotify-save', token },
        },
      },
    ],
    [
      'empty token',
      {
        [`${slug}${driver}`]: {
          ...value()[`${slug}${driver}`],
          status: { driver, token: '' },
        },
      },
    ],
    [
      'whitespace token',
      {
        [`${slug}${driver}`]: {
          ...value()[`${slug}${driver}`],
          status: { driver, token: 'bad token' },
        },
      },
    ],
    [
      'unknown receipt field',
      {
        [`${slug}${driver}`]: { ...value()[`${slug}${driver}`], unknown: true },
      },
    ],
    [
      'unknown status field',
      {
        [`${slug}${driver}`]: {
          ...value()[`${slug}${driver}`],
          status: { driver, token, access_token: 'not-a-gate-receipt' },
        },
      },
    ],
  ])('rejects %s', (_name, input) => {
    store(input);
    expect(progress()).toMatchObject({ state: 'waiting' });
  });
  it('contains unavailable cookie storage', () => {
    vi.spyOn(document, 'cookie', 'get').mockImplementation(() => {
      throw new DOMException('Blocked', 'SecurityError');
    });
    expect(progress()).toMatchObject({ state: 'waiting' });
  });
  it('rejects an oversized native cookie and oversized receipt', () => {
    vi.spyOn(document, 'cookie', 'get').mockReturnValue(`${slug}=${'x'.repeat(16385)}`);
    expect(progress()).toMatchObject({ state: 'waiting' });
    vi.mocked(Object.getOwnPropertyDescriptor(document, 'cookie')!.get!).mockReturnValue(
      `${slug}=${JSON.stringify({ [`${slug}${driver}`]: { ...value()[`${slug}${driver}`], status: { driver, token: 'x'.repeat(8193) } } })}`,
    );
    expect(progress()).toMatchObject({ state: 'waiting' });
  });
  it('submits the unchanged native receipt only after Download and still requires server validation', async () => {
    store(value());
    expect(progress()).toMatchObject({ state: 'complete' });
    const ctx = context();
    expect(ctx.fetch).not.toHaveBeenCalled();
    expect(await push.resolve(push.inspect(document, url)!, ctx)).toMatchObject({ ok: true });
    expect(ctx.fetch).toHaveBeenCalledTimes(3);
    const final = new URL(vi.mocked(ctx.fetch).mock.calls[2]![0] as string);
    expect(JSON.parse(atob(final.searchParams.get('token')!))).toEqual({
      actions: { [driver]: token },
    });
  });
  it('does not turn an expired server receipt into success', async () => {
    store(value());
    expect(progress()).toMatchObject({ state: 'complete' });
    const ctx = context();
    vi.mocked(ctx.fetch)
      .mockReset()
      .mockResolvedValueOnce(
        json({
          slug,
          title: 'Authored gate',
          type: 'url',
          content_count: 1,
          minimum_actions: 1,
          actions: [
            {
              id: 42,
              driver,
              required: true,
              provider: {
                client_authentication: false,
                client_execution: false,
              },
            },
          ],
        }),
      )
      .mockResolvedValue(json({}, 403));
    expect(await push.resolve(push.inspect(document, url)!, ctx)).toMatchObject({
      ok: false,
      code: 'server-required',
    });
  });
});
