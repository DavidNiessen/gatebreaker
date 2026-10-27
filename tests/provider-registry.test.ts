import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { providers } from '../src/providers';

describe('provider composition and page permission boundary', () => {
  it('registers only implemented providers with explicit page hosts', () => {
    expect(providers.map((provider) => provider.id)).toEqual(['hypeddit', 'sub2unlock', 'boost']);
    const hosts: unknown = JSON.parse(readFileSync('config/provider-hosts.json', 'utf8'));
    expect(hosts).toEqual([
      'hypeddit.com',
      'www.hypeddit.com',
      'sub2unlock.com',
      'boost.ink',
      'de.boost.ink',
      'nl.boost.ink',
    ]);
    for (const host of hosts as string[])
      expect(
        providers.some((provider) => provider.matches(new URL(`https://${host}/Abc123`))),
      ).toBe(true);
  });
  it.each([
    'https://www.toneden.io/example/post/free-download',
    'https://rekonise.com/example-gate-abcde',
    'https://mboost.me/example',
    'https://sub2unlock.net/Abc123',
    'https://boost.ink.evil.invalid/Abc123',
    'https://sub2unlock.com.evil.invalid/Abc123',
  ])('does not advertise unverified or unrelated origins: %s', (url) => {
    expect(providers.some((provider) => provider.matches(new URL(url)))).toBe(false);
  });
});
