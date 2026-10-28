import { describe, expect, it, vi } from 'vitest';
import type { Gate, ProviderContext } from '../src/core/domain/provider';
import { publicFileUrl, safeDestination } from '../src/core/providers/hypeddit/urls';
import {
  buildSkipRequest,
  hypeddit,
  parseDownloadResponse,
} from '../src/extension/providers/hypeddit';

const pageUrl = new URL('https://hypeddit.com/fixture-artist/fixture-track');
const gateId = 'fixture-gate_123';
const publicUrl = `https://hypeddit-gates-prod.s3.amazonaws.com/${gateId}_main`;
const stepCodes = [
  'email',
  'sc',
  'sp',
  'yt',
  'ig',
  'tw',
  'fb',
  'dn',
  'dz',
  'ap',
  'fbmsgr',
  'th',
  'tk',
  'bc',
  'unknown',
] as const;

function fixture(steps: readonly string[] = stepCodes): Document {
  const document = window.document.implementation.createHTMLDocument('Fixture | Hypeddit');
  document.head.innerHTML = '<meta name="csrf-token" content="fixture-csrf-not-a-real-token">';
  document.body.innerHTML = `
    <h1>Fixture track</h1>
    <button id="downloadProcess">Download</button>
    <input id="current_download_file_listner" value="${gateId}">
    <input id="nwSteps">
    <input id="wrndk" value="fixture-session-not-a-real-token">
    <input id="is_unlimited" value="1">
  `;
  document.querySelector<HTMLInputElement>('#nwSteps')!.value = steps.join(',');
  return document;
}

function gate(document = fixture()): Gate {
  const inspected = hypeddit.inspect(document, pageUrl);
  if (!inspected) throw new Error('The sanitized fixture should describe a download gate.');
  return inspected;
}

function json(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}

function context(response = json({ download_status: false, URL: '' })) {
  const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(response);
  const probePublicFile = vi.fn<ProviderContext['probePublicFile']>().mockResolvedValue(null);
  return { pageUrl, fetch, probePublicFile } satisfies ProviderContext;
}

describe('Hypeddit page recognition', () => {
  it.each(['https://hypeddit.com/artist/track', 'https://www.hypeddit.com/artist/track'])(
    'recognizes an exact provider origin: %s',
    (url) => {
      expect(hypeddit.matches(new URL(url))).toBe(true);
    },
  );

  it.each([
    'http://hypeddit.com/artist/track',
    'https://hypeddit.com.evil.example/artist/track',
    'https://evil.example/hypeddit.com/artist/track',
    'https://hypeddit.com@evil.example/artist/track',
    'https://user:password@hypeddit.com/artist/track',
    'https://hypeddit.com:8443/artist/track',
    'https://downloads.hypeddit.com/artist/track',
  ])('rejects a spoofed or untrusted provider origin: %s', (url) => {
    const candidate = new URL(url);
    expect(hypeddit.matches(candidate)).toBe(false);
    expect(hypeddit.inspect(fixture(), candidate)).toBeNull();
  });

  it('reads all supplied step codes, including an unknown code', () => {
    const inspected = gate();
    expect(inspected.steps).toEqual(stepCodes);
    expect(inspected.id).toBe(gateId);
    expect(inspected.title).toBe('Fixture track');
  });

  it('handles empty, reordered, repeated, and invalid step metadata', () => {
    expect(gate(fixture([])).steps).toEqual([]);
    expect(gate(fixture(['sp', 'email', 'sp', 'sc', 'bad value', '../escape'])).steps).toEqual([
      'sp',
      'email',
      'sc',
    ]);
  });

  it.each(['../escape', 'gate/id', 'gate?x=1', 'a'.repeat(65), ''])(
    'rejects an invalid gate identifier: %s',
    (id) => {
      const document = fixture();
      document.querySelector<HTMLInputElement>('#current_download_file_listner')!.value = id;
      expect(hypeddit.inspect(document, pageUrl)).toBeNull();
      expect(publicFileUrl(id)).toBeNull();
    },
  );

  it('does not mistake a link gate or an unrelated account page for a download gate', () => {
    const linkGate = fixture();
    linkGate.body.insertAdjacentHTML(
      'beforeend',
      '<button id="gateDownloadButton" data-type="linkGate">Continue</button>',
    );
    expect(hypeddit.inspect(linkGate, pageUrl)).toBeNull();
    const unrelated = fixture();
    unrelated.querySelector('#downloadProcess')!.remove();
    expect(hypeddit.inspect(unrelated, pageUrl)).toBeNull();
  });
});

describe('Hypeddit skip request', () => {
  it.each(stepCodes)('preserves the dynamically supplied %s code as a skip request', (code) => {
    const body = buildSkipRequest(gate(fixture([code])));
    expect(body.getAll('skip_gate_steps[]')).toEqual([code]);
    expect(body.get('steps')).toBe(code);
    expect(body.get('is_skippable')).toBe('1');
  });

  it('does not submit email, account credentials, or instructions to perform social actions', () => {
    const body = buildSkipRequest(gate());
    expect(body.getAll('skip_gate_steps[]')).toEqual(stepCodes);
    expect(body.get('file')).toBe(gateId);
    for (const name of [
      'email',
      'first_name',
      'name',
      'access_token',
      'refresh_token',
      'password',
      'soundcloud_id',
      'spotify_id',
      'follow',
      'save',
      'like',
      'comment',
    ]) {
      expect(body.has(name), name).toBe(false);
    }
    expect(body.get('lifetime_fan_spotify')).toBe('0');
    expect(body.get('lifetime_fan_deezer')).toBe('0');
    expect(body.get('lifetime_fan_apple')).toBe('0');
  });
});

describe('download response validation', () => {
  it.each(['', ' ', undefined, null])(
    'does not report success for download_status=true without a URL (%s)',
    (URL) => {
      expect(parseDownloadResponse({ download_status: true, URL }, pageUrl)).toMatchObject({
        ok: false,
        code: 'server-required',
      });
    },
  );

  it.each([false, 'true', 1, undefined])('requires a boolean success status (%s)', (status) => {
    expect(
      parseDownloadResponse({ download_status: status, URL: publicUrl }, pageUrl),
    ).toMatchObject({ ok: false, code: 'server-required' });
  });

  it.each([null, [], 'not-json', 1])('rejects an unexpected response shape (%s)', (value) => {
    expect(parseDownloadResponse(value, pageUrl)).toMatchObject({
      ok: false,
      code: 'invalid-response',
    });
  });

  it.each([
    'javascript:alert(1)',
    'data:text/html,fixture',
    'http://hypeddit.com/download/fixture',
    'https://hypeddit.com.evil.example/download/fixture',
    'https://hypeddit.com@evil.example/download/fixture',
    'https://user:secret@hypeddit.com/download/fixture',
    'https://hypeddit.com:8443/download/fixture',
    'https://hypeddit.com/download/fixture#fragment',
    'https://hypeddit.com/gate/download/ul',
    'https://hypeddit.com/download/fixture/extra',
    'https://hypeddit-gates-prod.s3.amazonaws.com/fixture-gate_123_preview',
    'https://hypeddit-gates-prod.s3.amazonaws.com/fixture-gate_123_preview.mp3',
    'https://hypeddit-gates-prod.s3.amazonaws.com/fixture-gate_123_main/extra',
    'https://hypeddit-gates-prod.s3.amazonaws.com.evil.example/fixture-gate_123_main',
    'https://evil.example/fixture-gate_123_main',
  ])('rejects an unsafe or preview destination: %s', (URL) => {
    expect(safeDestination(URL, pageUrl)).toBeNull();
    expect(parseDownloadResponse({ download_status: true, URL }, pageUrl)).toMatchObject({
      ok: false,
      code: 'unsafe-destination',
    });
  });

  it('accepts a verified public main-object destination', () => {
    expect(parseDownloadResponse({ download_status: true, URL: publicUrl }, pageUrl)).toEqual({
      ok: true,
      url: publicUrl,
      method: 'skip-request',
    });
  });

  it('resolves a relative provider download URL against the provider origin', () => {
    expect(
      parseDownloadResponse({ download_status: true, URL: '/download/fixture-file' }, pageUrl),
    ).toEqual({
      ok: true,
      url: 'https://hypeddit.com/download/fixture-file',
      method: 'skip-request',
    });
  });
});

describe('Hypeddit resolution', () => {
  it('uses an available public main file without submitting a skip request', async () => {
    const dependencies = context();
    dependencies.probePublicFile.mockResolvedValue(publicUrl);
    expect(await hypeddit.resolve(gate(), dependencies)).toEqual({
      ok: true,
      url: publicUrl,
      method: 'public-file',
    });
    expect(dependencies.probePublicFile).toHaveBeenCalledExactlyOnceWith(gateId);
    expect(dependencies.fetch).not.toHaveBeenCalled();
  });

  it.each(['not-found', 'rejected'])('falls back after a %s public-file probe', async (outcome) => {
    const dependencies = context(json({ download_status: true, URL: publicUrl }));
    if (outcome === 'rejected')
      dependencies.probePublicFile.mockRejectedValue(new Error('fixture'));
    expect(await hypeddit.resolve(gate(), dependencies)).toMatchObject({
      ok: true,
      method: 'skip-request',
    });
    expect(dependencies.fetch).toHaveBeenCalledOnce();
    const [url, init] = dependencies.fetch.mock.calls[0]!;
    expect(url).toBe('https://hypeddit.com/gate/download/ul');
    expect(init).toMatchObject({
      method: 'POST',
      credentials: 'same-origin',
      redirect: 'error',
      cache: 'no-store',
    });
    expect(init?.signal).toBeInstanceOf(AbortSignal);
    expect(init?.body).toBeInstanceOf(URLSearchParams);
    expect((init?.body as URLSearchParams).getAll('skip_gate_steps[]')).toEqual(stepCodes);
  });

  it('reports server enforcement when the server accepts a request but releases no URL', async () => {
    const dependencies = context(json({ download_status: true, URL: '' }));
    expect(await hypeddit.resolve(gate(), dependencies)).toMatchObject({
      ok: false,
      code: 'server-required',
    });
    expect(dependencies.fetch).toHaveBeenCalledOnce();
  });

  it('does not submit a request for a legacy unsupported layout', async () => {
    const document = fixture();
    document.querySelector<HTMLInputElement>('#is_unlimited')!.value = '0';
    const dependencies = context();
    expect(await hypeddit.resolve(gate(document), dependencies)).toMatchObject({
      ok: false,
      code: 'not-supported',
    });
    expect(dependencies.fetch).not.toHaveBeenCalled();
  });

  it('requires both session fields before making a skip request', async () => {
    const document = fixture();
    document.querySelector('meta[name="csrf-token"]')!.remove();
    const dependencies = context();
    expect(await hypeddit.resolve(gate(document), dependencies)).toMatchObject({
      ok: false,
      code: 'session-expired',
    });
    expect(dependencies.fetch).not.toHaveBeenCalled();
  });

  it.each([
    [401, 'session-expired'],
    [403, 'session-expired'],
    [419, 'session-expired'],
    [429, 'rate-limited'],
    [500, 'network-error'],
    [503, 'network-error'],
  ])('handles server HTTP %s without treating it as a file', async (status, code) => {
    const dependencies = context(json({}, status as number));
    expect(await hypeddit.resolve(gate(), dependencies)).toMatchObject({ ok: false, code });
  });

  it('rejects an HTML browser check instead of exposing it as a download', async () => {
    const dependencies = context(
      new Response('<html>Fixture browser check</html>', {
        headers: { 'content-type': 'text/html' },
      }),
    );
    expect(await hypeddit.resolve(gate(), dependencies)).toMatchObject({
      ok: false,
      code: 'invalid-response',
    });
  });

  it.each(['{malformed', 'x'.repeat(128 * 1024 + 1)])(
    'rejects malformed or oversized JSON data',
    async (body) => {
      const dependencies = context(
        new Response(body, { headers: { 'content-type': 'application/json' } }),
      );
      expect(await hypeddit.resolve(gate(), dependencies)).toMatchObject({
        ok: false,
        code: 'invalid-response',
      });
    },
  );
});
