import type { Gate } from '../../domain/provider';
import { hypedditEmail } from './session';

const profiles = ['sc', 'yt', 'sp', 'dz', 'mc', 'tw', 'ig', 'ap', 'th'];
const scalarKeys = new Set([
  'file',
  'wrndk',
  'download_action',
  'download_visit',
  'profile_downloads',
  'page',
  'time',
  'is_skippable',
  'steps',
  'email',
  'is_mobile',
  'gvf',
  'external_id',
  'hypesource',
  'adcode',
  'lifetime_fan_spotify',
  'lifetime_fan_deezer',
  'lifetime_fan_apple',
]);
const arrayKeys = new Set([
  'skip_gate_steps[]',
  ...profiles.map((service) => `additional_${service}_user_id[]`),
  ...['dz', 'ap', 'th'].map((service) => `additional_${service}_type_array[]`),
]);

function value(document: Document, id: string): string {
  return document.querySelector<HTMLInputElement>(`[id="${id}"]`)?.value.trim() ?? '';
}

/** Read only the gate's native identifier from its literal JSON declaration. */
function externalId(document: Document): string {
  const found: string[] = [];
  for (const script of [...document.querySelectorAll('script:not([src])')].slice(0, 64)) {
    const source = script.textContent ?? '';
    if (source.length > 32768) continue;
    const declarations = [
      ...source.matchAll(
        /(?:^|[\r\n;])\s*(?:var|let|const)\s+jsonGateData\s*=\s*(\{[^\r\n]{0,16384}\})\s*;/g,
      ),
    ];
    for (const declaration of declarations) {
      try {
        const data: unknown = JSON.parse(declaration[1]!);
        if (!data || typeof data !== 'object' || Array.isArray(data)) continue;
        const record = data as Record<string, unknown>;
        if (
          record['uid'] !== value(document, 'current_download_file_listner') ||
          typeof record['externID'] !== 'string' ||
          !/^[a-f0-9]{64}$/.test(record['externID'])
        )
          continue;
        found.push(record['externID']);
      } catch {
        /* Never evaluate a JavaScript declaration or guess an identifier. */
      }
    }
  }
  return found.length === 1 ? found[0]! : '';
}

/** Ordinary website request data, never Spotify/SoundCloud credentials. */
export function captureWebsiteRequest(document: Document): string {
  const fields: Record<string, string | string[]> = {
    file: value(document, 'current_download_file_listner'),
    wrndk: value(document, 'wrndk'),
    download_action: 'DOWNLOAD',
    download_visit: 'true',
    profile_downloads: 'true',
    page: 'nonsingle',
    time: '0',
    is_skippable: value(document, 'is_skippable') || '0',
    steps: value(document, 'nwSteps'),
    email: hypedditEmail(document)?.email ?? value(document, 'email_address'),
    is_mobile: value(document, 'is_mobile'),
    gvf: '0',
    external_id: externalId(document),
    hypesource: value(document, 'hypesource'),
    adcode: value(document, 'adcode'),
    lifetime_fan_spotify: document.querySelector('#lifetime_fan_sp') ? '0' : '',
    lifetime_fan_deezer: document.querySelector('#lifetime_fan_dz') ? '0' : '',
    lifetime_fan_apple: document.querySelector('#lifetime_fan_ap') ? '0' : '',
  };
  for (const service of profiles) {
    const inputs = [
      ...document.querySelectorAll<HTMLInputElement>(
        `input[name="additional_${service}_user_id[]"]`,
      ),
    ];
    if (inputs.length)
      fields[`additional_${service}_user_id[]`] = inputs.slice(0, 50).map((input) => input.value);
    if (['dz', 'ap', 'th'].includes(service) && inputs.length)
      fields[`additional_${service}_type_array[]`] = inputs
        .slice(0, 50)
        .map((input) => input.dataset['profile_type'] ?? '');
  }
  const skips = [
    ...document.querySelectorAll<HTMLInputElement>('input[name="skip_gate_steps[]"]'),
  ].map((input) => input.value);
  // Only skip steps for which the website actually provides a skip control.
  for (const control of document.querySelectorAll<HTMLElement>('[data-step]')) {
    const step = control.dataset['step'];
    if (
      step &&
      (control.id === `skipper_${step}` || control.id === 'skipper') &&
      !control.hidden &&
      !control.classList.contains('hide')
    )
      skips.push(step);
  }
  fields['skip_gate_steps[]'] = [...new Set(skips)].filter((step) =>
    /^[a-zA-Z0-9_-]{1,32}$/.test(step),
  );
  return JSON.stringify(fields);
}

export function buildWebsiteRequest(gate: Gate): URLSearchParams {
  const fields: unknown = JSON.parse(gate.metadata['websiteRequest'] ?? '{}');
  if (!fields || typeof fields !== 'object' || Array.isArray(fields))
    throw new Error('Missing website request');
  const body = new URLSearchParams();
  for (const [key, value] of Object.entries(fields)) {
    if (key === 'external_id' && (typeof value !== 'string' || !/^(?:[a-f0-9]{64})?$/.test(value)))
      continue;
    if (scalarKeys.has(key) && typeof value === 'string' && value.length <= 2048)
      body.set(key, value);
    else if (
      arrayKeys.has(key) &&
      Array.isArray(value) &&
      value.length <= 50 &&
      value.every((item) => typeof item === 'string' && item.length <= 2048)
    )
      for (const item of value) body.append(key, item as string);
  }
  body.set('file', gate.id);
  body.set('download_action', 'DOWNLOAD');
  for (const service of ['spotify', 'deezer', 'apple']) {
    const key = 'lifetime_fan_' + service;
    if (body.has(key)) body.set(key, body.get(key) === '' ? '' : '0');
  }
  return body;
}
