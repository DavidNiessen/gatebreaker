import { beforeEach, describe, expect, it, vi } from 'vitest';
import { sub2unlock } from '../src/extension/providers/sub2unlock';
import type { ProviderContext } from '../src/core/domain/provider';

const pageUrl = new URL('https://sub2unlock.com/Ab3xY');
const target = 'https://www.mediafire.com/file/example/test.zip/file';
function fixture(overrides: Record<string, unknown> = {}): void {
  document.body.innerHTML =
    '<div id="__next"><div class="section-padding-equal"><h3>Gate title</h3><div class="d-grid gap-4"><button>Follow</button><button>Unlock</button></div></div></div>';
  const script = document.createElement('script');
  script.id = '__NEXT_DATA__';
  script.type = 'application/json';
  script.textContent = JSON.stringify({
    page: '/[uniquer]',
    props: {
      pageProps: {
        sink: {
          data: {
            uniquer: 'Ab3xY',
            title: 'Example gate',
            deleted_at: null,
            unlocked_link: target,
            creator: { email: 'fixture@example.invalid' },
            blocks: [
              { media: { name: 'YouTube' }, step: 'Subscribe' },
              { media: { name: 'Instagram' }, step: 'Follow' },
            ],
            ...overrides,
          },
        },
      },
    },
  });
  document.body.append(script);
}
function context(): ProviderContext {
  return { pageUrl, fetch: vi.fn(), probePublicFile: vi.fn() };
}
beforeEach(() => {
  document.head.innerHTML = '';
  fixture();
});

describe('Sub2Unlock public SSR contract', () => {
  it('uses the gate destination without requests, accounts, creator data, or native actions', async () => {
    const gate = sub2unlock.inspect(document, pageUrl)!;
    const ctx = context();
    expect(gate).toMatchObject({
      id: 'Ab3xY',
      provider: 'sub2unlock',
      title: 'Example gate',
      steps: ['YouTube', 'Instagram'],
      metadata: { destination: target },
    });
    expect(JSON.stringify(gate)).not.toContain('fixture@example.invalid');
    expect(await sub2unlock.resolve(gate, ctx)).toEqual({
      ok: true,
      url: target,
      method: 'embedded-link',
    });
    expect(ctx.fetch).not.toHaveBeenCalled();
    expect(ctx.probePublicFile).not.toHaveBeenCalled();
    expect(sub2unlock.actions).toBeUndefined();
  });
  it.each(['https://sub2unlock.com/Ab3xY/', 'https://sub2unlock.com/Ab3xY?utm_source=fixture'])(
    'supports canonical path variants: %s',
    (url) => {
      expect(sub2unlock.inspect(document, new URL(url))?.id).toBe('Ab3xY');
    },
  );
  it.each([
    'http://sub2unlock.com/Ab3xY',
    'https://sub2unlock.com.evil.invalid/Ab3xY',
    'https://evilsub2unlock.com/Ab3xY',
    'https://user:pass@sub2unlock.com/Ab3xY',
    'https://sub2unlock.com:444/Ab3xY',
    'https://sub2unlock.com/',
    'https://sub2unlock.com/user/Ab3xY',
    'https://sub2unlock.com/Ab%2f3xY',
  ])('rejects an unrelated origin or route: %s', (url) => {
    expect(sub2unlock.matches(new URL(url))).toBe(false);
    expect(sub2unlock.inspect(document, new URL(url))).toBeNull();
  });
  it.each(['null', '[]', '{}', 'not json'])('contains malformed embedded JSON: %s', (text) => {
    document.querySelector('#__NEXT_DATA__')!.textContent = text;
    expect(sub2unlock.inspect(document, pageUrl)).toBeNull();
  });
  it('does not recognize another Next page or a deleted/mismatched gate', () => {
    fixture({ uniquer: 'Another' });
    expect(sub2unlock.inspect(document, pageUrl)).toBeNull();
    fixture({ deleted_at: '2026-01-01' });
    expect(sub2unlock.inspect(document, pageUrl)).toBeNull();
    fixture();
    const script = document.querySelector('#__NEXT_DATA__')!;
    const data = JSON.parse(script.textContent!);
    data.page = '/';
    script.textContent = JSON.stringify(data);
    expect(sub2unlock.inspect(document, pageUrl)).toBeNull();
  });
  it('bounds page data and titles, and treats untrusted titles as data', () => {
    fixture({ title: '<img src=x onerror=alert(1)>'.repeat(20) });
    expect(sub2unlock.inspect(document, pageUrl)?.title.length).toBe(200);
    document.querySelector('#__NEXT_DATA__')!.textContent = ' '.repeat(2 * 1024 * 1024 + 1);
    expect(sub2unlock.inspect(document, pageUrl)).toBeNull();
  });
  it('handles custom/unknown actions and repeated media names without dispatching them', () => {
    fixture({ blocks: [{ media: { name: 'Custom' } }, { media: { name: 'Custom' } }, null] });
    expect(sub2unlock.inspect(document, pageUrl)?.steps).toEqual(['Custom', 'Social action']);
  });
  it('preserves the MEGA file fragment required by a real live gate', async () => {
    const url = 'https://mega.nz/file/fixture#fixture-key';
    fixture({ unlocked_link: url });
    expect(await sub2unlock.resolve(sub2unlock.inspect(document, pageUrl)!, context())).toEqual({
      ok: true,
      url,
      method: 'embedded-link',
    });
  });
  it.each([
    'javascript:alert(1)',
    'data:text/html,hello',
    'http://example.com/file',
    'https://user:pass@example.com/file',
    'https://example.com:8443/file',
    'https://localhost/file',
    'https://127.0.0.1/file',
    'https://10.1.2.3/file',
    'https://sub2unlock.com/Ab3xY',
  ])('rejects unsafe destinations: %s', async (unlocked_link) => {
    fixture({ unlocked_link });
    expect(
      await sub2unlock.resolve(sub2unlock.inspect(document, pageUrl)!, context()),
    ).toMatchObject({ ok: false, code: 'unsafe-destination' });
  });
  it('reports missing destinations without inventing a link', async () => {
    fixture({ unlocked_link: '' });
    expect(
      await sub2unlock.resolve(sub2unlock.inspect(document, pageUrl)!, context()),
    ).toMatchObject({ ok: false, code: 'server-required' });
  });
  it('requires resolution to match the current gate and respects cancellation', async () => {
    const gate = sub2unlock.inspect(document, pageUrl)!;
    expect(
      await sub2unlock.resolve(gate, {
        ...context(),
        pageUrl: new URL('https://sub2unlock.com/Other'),
      }),
    ).toMatchObject({ ok: false, code: 'not-supported' });
    const controller = new AbortController();
    controller.abort();
    await expect(
      sub2unlock.resolve(gate, { ...context(), signal: controller.signal }),
    ).rejects.toThrow();
  });
  it('places the panel outside native action controls and rejects unrelated presentations', () => {
    const presentation = sub2unlock.presentation!(document, pageUrl)!;
    expect(presentation.anchor.tagName).toBe('H3');
    expect(Object.keys(presentation)).toEqual(['anchor']);
    expect(sub2unlock.presentation!(document, new URL('https://example.com/Ab3xY'))).toBeNull();
  });
});
