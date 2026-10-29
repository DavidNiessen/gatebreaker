import { describe, expect, it, vi } from 'vitest';
import {
  bandcamp,
  bandcampGrantUrl,
  bandcampStatUrl,
  parseBandcampStat,
} from '../src/core/providers/bandcamp';
import type { ProviderContext } from '../src/core';

const pageUrl = new URL('https://authored.bandcamp.com/album/free-release');
const signature = 'a'.repeat(32),
  renewed = 'b'.repeat(32);
const grant = `https://bandcamp.com/download?fsig=${signature}&id=123&ts=12345.0&type=album`;
const file = `https://popplers5.bandcamp.com/download/album?enc=flac&fsig=${signature}&id=123&ts=12345.0`;
const final = 'https://p4.bcbits.com/download/album/authored/original.zip?signature=authored';
const parseHtml = (html: string) => new DOMParser().parseFromString(html, 'text/html');
function product(
  extra: Record<string, unknown> = {},
  currentExtra: Record<string, unknown> = {},
): Document {
  const document = parseHtml(
    '<h2 class="trackTitle">Free release</h2><script data-tralbum></script>',
  );
  document.querySelector('[data-tralbum]')!.setAttribute(
    'data-tralbum',
    JSON.stringify({
      id: 123,
      item_type: 'album',
      url: pageUrl.href,
      current: {
        id: 123,
        type: 'album',
        title: 'Free release',
        download_pref: 1,
        minimum_price: 9,
        ...currentExtra,
      },
      freeDownloadPage: grant,
      trackinfo: [{ file: { 'mp3-128': 'https://t4.bcbits.com/stream/authored-preview' } }],
      ...extra,
    }),
  );
  return document;
}
function receipt(itemExtra: Record<string, unknown> = {}): Document {
  const document = parseHtml('<main class="download-panel" data-blob></main>');
  document.querySelector('[data-blob]')!.setAttribute(
    'data-blob',
    JSON.stringify({
      download_items: [
        {
          item_id: 123,
          type: 'album',
          title: 'Free release',
          is_pure_free: true,
          paid_for: false,
          downloads: { flac: { url: file }, wav: { url: file.replace('enc=flac', 'enc=wav') } },
          ...itemExtra,
        },
      ],
    }),
  );
  return document;
}
function serialize(document: Document) {
  return document.documentElement.outerHTML;
}
function context(
  fetch: typeof globalThis.fetch,
  url = pageUrl,
  signal?: AbortSignal,
): ProviderContext {
  return {
    pageUrl: url,
    fetch,
    parseHtml,
    probePublicFile: async () => null,
    ...(signal ? { signal } : {}),
  };
}
function status(input: string | URL | Request, values: Record<string, unknown> = {}) {
  return new Response(
    JSON.stringify({
      result: 'ok',
      url: String(input).replace(/^https:\/\//, ''),
      download_url: final,
      ...values,
    }),
    { headers: { 'content-type': 'application/json' } },
  );
}

describe('Bandcamp free release and signed receipt matching', () => {
  it('does not reuse a release grant in a different page context', async () => {
    const gate = bandcamp.inspect(product(), pageUrl)!;
    const fetch = vi.fn<typeof globalThis.fetch>();
    expect(
      await bandcamp.resolve(
        gate,
        context(fetch, new URL('https://authored.bandcamp.com/album/different-release')),
      ),
    ).toMatchObject({ ok: false, code: 'not-supported' });
    expect(fetch).not.toHaveBeenCalled();
  });
  it.each([
    'https://artist.bandcamp.com/album/release',
    'https://artist.bandcamp.com/track/song',
    grant,
  ])('recognizes %s', (url) => expect(bandcamp.matches(new URL(url))).toBe(true));
  it.each([
    'https://artist.bandcamp.com/music',
    'https://artist.bandcamp.com/album/release/checkout',
    'https://daily.bandcamp.com/album/release',
    'https://artist.bandcamp.com.evil.test/album/release',
    'http://artist.bandcamp.com/album/release',
    'https://name:secret@artist.bandcamp.com/track/song',
    'https://bandcamp.com/download?id=123',
  ])('rejects %s', (url) => expect(bandcamp.matches(new URL(url))).toBe(false));
  it('keeps grants and previews out of public metadata', () => {
    const gate = bandcamp.inspect(product(), pageUrl)!;
    expect(gate).toEqual({
      provider: 'bandcamp',
      id: '123',
      title: 'Free release',
      steps: [],
      metadata: {},
    });
    expect(JSON.stringify(gate)).not.toContain(signature);
    expect(JSON.stringify(gate)).not.toContain('stream');
  });
  it('rejects mismatched data IDs, type and canonical release URL', () => {
    expect(bandcamp.inspect(product({ id: 456 }), pageUrl)).toBeNull();
    expect(bandcamp.inspect(product({ item_type: 'track' }), pageUrl)).toBeNull();
    expect(
      bandcamp.inspect(product({ url: 'https://other.bandcamp.com/album/release' }), pageUrl),
    ).toBeNull();
  });
  it('refuses paid products even when minimum_price is zero and a grant-like field exists', async () => {
    const gate = bandcamp.inspect(product({}, { download_pref: 2, minimum_price: 0 }), pageUrl)!;
    const fetcher = vi.fn<typeof fetch>();
    expect(await bandcamp.resolve(gate, context(fetcher))).toMatchObject({
      ok: false,
      code: 'not-supported',
    });
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('requires the artist-issued free grant to match release ID/type', async () => {
    const gate = bandcamp.inspect(
      product({ freeDownloadPage: grant.replace('id=123', 'id=456') }),
      pageUrl,
    )!;
    const fetcher = vi.fn<typeof fetch>();
    expect(await bandcamp.resolve(gate, context(fetcher))).toMatchObject({
      ok: false,
      code: 'not-supported',
    });
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('allows an explicitly supplied paid-for receipt but not an ungranted receipt', () => {
    expect(
      bandcamp.inspect(receipt({ is_pure_free: false, paid_for: true }), new URL(grant)),
    ).not.toBeNull();
    expect(
      bandcamp.inspect(receipt({ is_pure_free: false, paid_for: false }), new URL(grant)),
    ).toBeNull();
  });
});
describe('Bandcamp original-file verification', () => {
  it('reads the free grant then verifies FLAC without requesting media', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockImplementation(async (input) =>
        String(input) === grant
          ? new Response(serialize(receipt()), { headers: { 'content-type': 'text/html' } })
          : status(input),
      );
    expect(await bandcamp.resolve(bandcamp.inspect(product(), pageUrl)!, context(fetcher))).toEqual(
      { ok: true, url: final, kind: 'file', method: 'provider-request' },
    );
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(fetcher.mock.calls[0]![0]).toBe(grant);
    const stat = new URL(String(fetcher.mock.calls[1]![0]));
    expect(stat.pathname).toBe('/statdownload/album');
    expect(stat.searchParams.get('enc')).toBe('flac');
    expect(stat.searchParams.get('.vrs')).toBe('1');
    expect(
      fetcher.mock.calls.every(
        ([, init]) => init?.credentials === 'omit' && init.redirect === 'error',
      ),
    ).toBe(true);
  });
  it('uses WAV when FLAC is absent', async () => {
    const document = receipt({ downloads: { wav: { url: file.replace('enc=flac', 'enc=wav') } } });
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async (input) => status(input));
    expect(
      await bandcamp.resolve(
        bandcamp.inspect(document, new URL(grant))!,
        context(fetcher, new URL(grant)),
      ),
    ).toMatchObject({ ok: true });
    expect(new URL(String(fetcher.mock.calls[0]![0])).searchParams.get('enc')).toBe('wav');
  });
  it('renews exactly once only from a matched native free-expiration response', async () => {
    let calls = 0;
    const retry = file.replace(signature, renewed).replace('ts=12345.0', 'ts=12346.123');
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async (input) => {
      calls++;
      return calls === 1
        ? status(input, { result: 'err', errortype: 'ExpiredFreeDownloadError', retry_url: retry })
        : status(input);
    });
    expect(
      await bandcamp.resolve(
        bandcamp.inspect(receipt(), new URL(grant))!,
        context(fetcher, new URL(grant)),
      ),
    ).toMatchObject({ ok: true });
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(new URL(String(fetcher.mock.calls[1]![0])).searchParams.get('fsig')).toBe(renewed);
  });
  it('stops repeated free expiration instead of looping', async () => {
    let calls = 0;
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async (input) =>
      status(input, {
        result: 'err',
        errortype: 'ExpiredFreeDownloadError',
        retry_url: file.replace(signature, (++calls === 1 ? 'b' : 'c').repeat(32)),
      }),
    );
    expect(
      await bandcamp.resolve(
        bandcamp.inspect(receipt(), new URL(grant))!,
        context(fetcher, new URL(grant)),
      ),
    ).toMatchObject({ ok: false, code: 'server-required' });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it.each([
    'ExpirationError',
    'NoLongerFreeError',
    'SubscriptionUnauthorizedError',
    'DownloadsDisabledError',
  ])('does not renew %s', async (errortype) => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockImplementation(async (input) =>
        status(input, { result: 'err', errortype, retry_url: file.replace(signature, renewed) }),
      );
    expect(
      await bandcamp.resolve(
        bandcamp.inspect(receipt(), new URL(grant))!,
        context(fetcher, new URL(grant)),
      ),
    ).toMatchObject({ ok: false, code: 'server-required' });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('rejects mismatched status nonce and unsafe renewal targets', async () => {
    for (const values of [
      {
        url:
          'popplers5.bandcamp.com/statdownload/album?enc=flac&fsig=' +
          signature +
          '&id=123&ts=12345.0&.rand=99999999999999&.vrs=1',
      },
      {
        result: 'err',
        errortype: 'ExpiredFreeDownloadError',
        retry_url: file.replace('id=123', 'id=456'),
      },
      {
        result: 'err',
        errortype: 'ExpiredFreeDownloadError',
        retry_url: file.replace('popplers5.bandcamp.com', 'evil.example'),
      },
    ]) {
      const fetcher = vi
        .fn<typeof fetch>()
        .mockImplementation(async (input) => status(input, values));
      expect(
        await bandcamp.resolve(
          bandcamp.inspect(receipt(), new URL(grant))!,
          context(fetcher, new URL(grant)),
        ),
      ).toMatchObject({ ok: false, code: 'invalid-response' });
    }
  });
  it.each([
    'https://p4.bcbits.com.evil.test/download/album/x',
    'https://t4.bcbits.com/stream/preview',
    'https://p4.bcbits.com/download/track/wrong.wav',
    'https://user:secret@p4.bcbits.com/download/album/x',
  ])('rejects unapproved original %s', async (download_url) => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockImplementation(async (input) => status(input, { download_url }));
    expect(
      await bandcamp.resolve(
        bandcamp.inspect(receipt(), new URL(grant))!,
        context(fetcher, new URL(grant)),
      ),
    ).toMatchObject({ ok: false, code: 'unsafe-destination' });
  });
  it('does not substitute another receipt item or a preview-only download', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(serialize(receipt({ item_id: 456 })), {
        headers: { 'content-type': 'text/html' },
      }),
    );
    expect(
      await bandcamp.resolve(bandcamp.inspect(product(), pageUrl)!, context(fetcher)),
    ).toMatchObject({ ok: false, code: 'server-required' });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(
      bandcamp.inspect(
        receipt({ downloads: { 'mp3-128': { url: 'https://t4.bcbits.com/stream/x' } } }),
        new URL(grant),
      ),
    ).toBeNull();
  });
  it('honors cancellation before requests', async () => {
    const fetcher = vi.fn<typeof fetch>();
    await expect(
      bandcamp.resolve(
        bandcamp.inspect(product(), pageUrl)!,
        context(fetcher, pageUrl, AbortSignal.abort()),
      ),
    ).rejects.toThrow();
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('parses the exact legacy wrapper inertly and rejects trailing executable text', () => {
    const json = '{"result":"ok","url":"authored"}';
    expect(
      parseBandcampStat(`if ( window.Downloads ) { Downloads.statResult( ${json} ) };`),
    ).toEqual(JSON.parse(json));
    expect(
      parseBandcampStat(`if ( window.Downloads ) { Downloads.statResult( ${json} ) };alert(1)`),
    ).toBeNull();
  });
  it('restricts metadata bridge URL shapes', () => {
    expect(bandcampGrantUrl(grant)).not.toBeNull();
    expect(bandcampGrantUrl(grant + '&callback=evil')).toBeNull();
    expect(
      bandcampStatUrl(file.replace('/download/', '/statdownload/') + '&.rand=123&.vrs=1'),
    ).not.toBeNull();
    expect(bandcampStatUrl(file)).toBeNull();
  });
});
