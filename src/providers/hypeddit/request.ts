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
    lifetime_fan_spotify: '0',
    lifetime_fan_deezer: '0',
    lifetime_fan_apple: '0',
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
  for (const service of ['spotify', 'deezer', 'apple']) body.set(`lifetime_fan_${service}`, '0');
  return body;
}
