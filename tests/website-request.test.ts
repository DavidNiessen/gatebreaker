import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Gate, ProviderContext } from '../src/domain/provider';
import { hypeddit } from '../src/providers/hypeddit';
import { buildWebsiteRequest, captureWebsiteRequest } from '../src/providers/hypeddit/request';

const pageUrl = new URL('https://hypeddit.com/fixture-artist/fixture-track');

function fixture(): void {
  document.body.innerHTML = `
    <a id="downloadProcess">Download</a>
    <meta name="csrf-token" content="fixture-csrf" />
    <input id="current_download_file_listner" value="fixture123" />
    <input id="wrndk" value="fixture-session" />
    <input id="is_unlimited" value="1" />
    <input id="is_skippable" value="0" />
    <input id="nwSteps" value="email,sc,sp" />
    <input id="email_address" value="fixture@example.invalid" />
    <input id="is_mobile" value="0" />
    <input name="additional_sp_user_id[]" value="artist-one" />
    <input name="additional_sp_user_id[]" value="artist-two" />
    <input name="additional_dz_user_id[]" value="album-one" data-profile_type="album" />
    <a id="skipper_sc" data-step="sc">Optional SoundCloud</a>
    <a id="skipper_sp" data-step="sp" class="hide">Required Spotify</a>
    <a data-step="email">Unrelated element</a>
    <input id="access_token" value="must-not-capture" />
    <input name="spotify_refresh_token" value="must-not-capture" />`;
}

function gateWith(fields: unknown): Gate {
  return {
    provider: 'hypeddit',
    id: 'fixture123',
    title: 'Fixture',
    steps: ['email', 'sc', 'sp'],
    metadata: {
      wrndk: 'fixture-session',
      csrf: 'fixture-csrf',
      unlimited: '1',
      websiteRequest: JSON.stringify(fields),
    },
  };
}

function capturedGate(): Gate {
  const gate = hypeddit.inspect(document, pageUrl);
  expect(gate).not.toBeNull();
  return gate!;
}

function context(intent?: ProviderContext['intent']) {
  const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(
    new Response(
      JSON.stringify({
        download_status: true,
        URL: 'https://hypeddit.com/download/fixture-original',
      }),
      { headers: { 'content-type': 'application/json' } },
    ),
  );
  const probePublicFile = vi.fn<ProviderContext['probePublicFile']>().mockResolvedValue(null);
  return { pageUrl, fetch, probePublicFile, ...(intent ? { intent } : {}) };
}

beforeEach(fixture);

describe('website request capture', () => {
  it('preserves only the current gate native identifier and attribution fields', () => {
    const identifier = 'a'.repeat(64);
    document.body.insertAdjacentHTML(
      'beforeend',
      '<input id="hypesource" value="authored-source"><input id="adcode" value="authored-ad"><script>var jsonGateData = ' +
        JSON.stringify({
          uid: 'fixture123',
          externID: identifier,
          access_token: 'not-an-account-token',
        }) +
        ';</script>',
    );
    const body = buildWebsiteRequest(capturedGate());
    expect(body.get('external_id')).toBe(identifier);
    expect(body.get('hypesource')).toBe('authored-source');
    expect(body.get('adcode')).toBe('authored-ad');
    expect(body.toString()).not.toContain('not-an-account-token');
  });
  it.each([
    'var jsonGateData = {"uid":"another-gate","externID":"' + 'b'.repeat(64) + '"};',
    'var jsonGateData = {"uid":"fixture123","externID":"invalid"};',
    'var jsonGateData = (()=>{throw Error("must not execute")})();',
  ])('does not guess identifiers from mismatched or executable declarations', (source) => {
    document.body.insertAdjacentHTML('beforeend', '<script>' + source + '</script>');
    expect(buildWebsiteRequest(capturedGate()).get('external_id')).toBe('');
  });
  it('rejects ambiguous duplicate gate declarations', () => {
    for (const letter of ['a', 'b']) {
      const script = document.createElement('script');
      script.textContent =
        'var jsonGateData = ' +
        JSON.stringify({ uid: 'fixture123', externID: letter.repeat(64) }) +
        ';';
      document.body.append(script);
    }
    expect(buildWebsiteRequest(capturedGate()).get('external_id')).toBe('');
  });

  it('captures ordinary website fields and ordered profile arrays without credentials or unknown inputs', () => {
    const fields = JSON.parse(captureWebsiteRequest(document)) as Record<string, unknown>;
    expect(fields).toMatchObject({
      file: 'fixture123',
      wrndk: 'fixture-session',
      email: 'fixture@example.invalid',
      steps: 'email,sc,sp',
      is_skippable: '0',
      'additional_sp_user_id[]': ['artist-one', 'artist-two'],
      'additional_dz_user_id[]': ['album-one'],
      'additional_dz_type_array[]': ['album'],
    });
    expect(fields).not.toHaveProperty('access_token');
    expect(fields).not.toHaveProperty('spotify_refresh_token');
    expect(JSON.stringify(fields)).not.toContain('must-not-capture');
  });

  it('captures actual optional skip controls without skipping every listed platform', () => {
    expect(buildWebsiteRequest(capturedGate()).getAll('skip_gate_steps[]')).toEqual(['sc']);
    expect(buildWebsiteRequest(capturedGate()).get('steps')).toBe('email,sc,sp');
  });

  it('preserves native skipped values, deduplicates them, and rejects malformed step names', () => {
    document.body.insertAdjacentHTML(
      'beforeend',
      `
      <input name="skip_gate_steps[]" value="sc" />
      <input name="skip_gate_steps[]" value="email" />
      <input name="skip_gate_steps[]" value="../unsafe" />
      <a id="skipper" data-step="email">Optional email</a>
      <a id="skipper_long" data-step="${'x'.repeat(33)}">Invalid step</a>`,
    );
    expect(buildWebsiteRequest(capturedGate()).getAll('skip_gate_steps[]')).toEqual([
      'sc',
      'email',
    ]);
  });

  it('ignores hidden optional controls and does not infer optionality from generic data-step elements', () => {
    document.querySelector<HTMLElement>('#skipper_sc')!.hidden = true;
    expect(buildWebsiteRequest(capturedGate()).getAll('skip_gate_steps[]')).toEqual([]);
  });

  it('caps DOM profile collections to fifty entries with their corresponding type values', () => {
    document.querySelector('[name="additional_dz_user_id[]"]')!.remove();
    for (let index = 0; index < 55; index++) {
      const input = document.createElement('input');
      input.name = 'additional_dz_user_id[]';
      input.value = `profile-${index}`;
      input.dataset['profile_type'] = `type-${index}`;
      document.body.append(input);
    }
    const body = buildWebsiteRequest(capturedGate());
    expect(body.getAll('additional_dz_user_id[]')).toHaveLength(50);
    expect(body.getAll('additional_dz_user_id[]').at(-1)).toBe('profile-49');
    expect(body.getAll('additional_dz_type_array[]').at(-1)).toBe('type-49');
  });
});

describe('website request serialization boundary', () => {
  it('forces the inspected file, DOWNLOAD action, and lifetime opt-outs despite metadata overrides', () => {
    const body = buildWebsiteRequest(
      gateWith({
        file: 'other-file',
        download_action: 'DELETE',
        lifetime_fan_spotify: '1',
        lifetime_fan_deezer: '1',
        lifetime_fan_apple: '1',
      }),
    );
    expect(body.get('file')).toBe('fixture123');
    expect(body.get('download_action')).toBe('DOWNLOAD');
    for (const service of ['spotify', 'deezer', 'apple'])
      expect(body.get(`lifetime_fan_${service}`)).toBe('0');
  });

  it('keeps only known scalar and array fields, excluding credentials and arbitrary form fields', () => {
    const body = buildWebsiteRequest(
      gateWith({
        email: 'fixture@example.invalid',
        wrndk: 'session',
        'additional_sc_user_id[]': ['artist'],
        'additional_ap_type_array[]': ['artist'],
        access_token: 'secret',
        refresh_token: 'secret',
        csrf: 'secret',
        redirect: 'https://evil.example/',
        __proto__: 'ignored',
        'additional_unknown_user_id[]': ['unknown'],
      }),
    );
    expect(body.get('email')).toBe('fixture@example.invalid');
    expect(body.getAll('additional_sc_user_id[]')).toEqual(['artist']);
    expect(body.getAll('additional_ap_type_array[]')).toEqual(['artist']);
    for (const field of [
      'access_token',
      'refresh_token',
      'csrf',
      'redirect',
      '__proto__',
      'additional_unknown_user_id[]',
    ])
      expect(body.has(field)).toBe(false);
    expect(body.toString()).not.toContain('secret');
  });

  it('rejects oversized or incorrectly typed values instead of coercing them into form data', () => {
    const body = buildWebsiteRequest(
      gateWith({
        email: { value: 'invalid' },
        wrndk: 'x'.repeat(2049),
        steps: 123,
        'additional_sp_user_id[]': ['valid', 42],
        'additional_sc_user_id[]': Array.from({ length: 51 }, () => 'artist'),
        'additional_dz_user_id[]': ['x'.repeat(2049)],
        'skip_gate_steps[]': 'sp',
      }),
    );
    for (const field of [
      'email',
      'wrndk',
      'steps',
      'additional_sp_user_id[]',
      'additional_sc_user_id[]',
      'additional_dz_user_id[]',
      'skip_gate_steps[]',
    ])
      expect(body.has(field)).toBe(false);
  });

  it('accepts bounded values and URL-encodes strings rather than interpreting extra fields', () => {
    const email = 'value&access_token=not-a-field@example.invalid';
    const body = buildWebsiteRequest(
      gateWith({
        email,
        wrndk: 'x'.repeat(2048),
        'additional_sp_user_id[]': Array.from({ length: 50 }, (_, i) => String(i)),
      }),
    );
    expect(new URLSearchParams(body.toString()).get('email')).toBe(email);
    expect(body.has('access_token')).toBe(false);
    expect(body.get('wrndk')).toHaveLength(2048);
    expect(body.getAll('additional_sp_user_id[]')).toHaveLength(50);
  });

  it.each([null, [], 'string', 123, false])('rejects non-object metadata: %j', (fields) => {
    expect(() => buildWebsiteRequest(gateWith(fields))).toThrow();
  });

  it('rejects unreadable JSON metadata', () => {
    const gate = gateWith({});
    expect(() =>
      buildWebsiteRequest({ ...gate, metadata: { ...gate.metadata, websiteRequest: '{broken' } }),
    ).toThrow();
  });
});

describe('explicit website-session resolution', () => {
  it('avoids public probing and sends website email, profiles, and only native optional skips', async () => {
    const request = context('website-session');
    const result = await hypeddit.resolve(capturedGate(), request);
    expect(request.probePublicFile).not.toHaveBeenCalled();
    expect(request.fetch).toHaveBeenCalledOnce();
    const [endpoint, options] = request.fetch.mock.calls[0]!;
    expect(endpoint).toBe('https://hypeddit.com/gate/download/ul');
    expect(options).toMatchObject({
      method: 'POST',
      credentials: 'same-origin',
      redirect: 'error',
      cache: 'no-store',
    });
    expect(options?.headers).toMatchObject({ 'X-CSRF-TOKEN': 'fixture-csrf' });
    const body = options!.body as URLSearchParams;
    expect(body.get('email')).toBe('fixture@example.invalid');
    expect(body.getAll('additional_sp_user_id[]')).toEqual(['artist-one', 'artist-two']);
    expect(body.getAll('skip_gate_steps[]')).toEqual(['sc']);
    expect(result).toMatchObject({ ok: true, method: 'website-session' });
  });

  it.each(['direct', undefined] as const)(
    'omits email and profile data for %s resolution',
    async (intent) => {
      const request = context(intent);
      const result = await hypeddit.resolve(capturedGate(), request);
      expect(request.probePublicFile).toHaveBeenCalledExactlyOnceWith('fixture123');
      const body = request.fetch.mock.calls[0]![1]!.body as URLSearchParams;
      expect(body.has('email')).toBe(false);
      expect([...body.keys()].some((key) => key.startsWith('additional_'))).toBe(false);
      expect(body.getAll('skip_gate_steps[]')).toEqual(['email', 'sc', 'sp']);
      expect(result).toMatchObject({ ok: true, method: 'skip-request' });
    },
  );

  it('does not send captured website fields when direct public-file resolution succeeds', async () => {
    const request = context('direct');
    request.probePublicFile.mockResolvedValue('https://hypeddit.com/download/fixture-original');
    expect(await hypeddit.resolve(capturedGate(), request)).toMatchObject({
      ok: true,
      method: 'public-file',
    });
    expect(request.fetch).not.toHaveBeenCalled();
  });

  it('continues to require valid ordinary website-session details before posting', async () => {
    const gate = capturedGate();
    const request = context('website-session');
    expect(
      await hypeddit.resolve({ ...gate, metadata: { ...gate.metadata, csrf: '' } }, request),
    ).toMatchObject({ ok: false, code: 'session-expired' });
    expect(request.probePublicFile).not.toHaveBeenCalled();
    expect(request.fetch).not.toHaveBeenCalled();
  });
});
