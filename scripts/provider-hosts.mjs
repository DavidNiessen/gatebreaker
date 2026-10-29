import { readFile } from 'node:fs/promises';

const hosts = JSON.parse(
  await readFile(new URL('../config/provider-hosts.json', import.meta.url), 'utf8'),
);
if (
  !Array.isArray(hosts) ||
  hosts.length === 0 ||
  !hosts.every(
    (host) =>
      typeof host === 'string' &&
      host.length <= 253 &&
      (host === '*.bandcamp.com' || /^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/.test(host)),
  ) ||
  new Set(hosts).size !== hosts.length
)
  throw new Error(
    'Provider hosts must be unique public hostnames (only Bandcamp permits subdomains)',
  );

export const providerHosts = Object.freeze(hosts);
