import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { providers } from '../src/providers';

describe('provider composition and page permission boundary', () => {
  it('registers only implemented providers with explicit page hosts', () => {
    expect(providers.map((provider) => provider.id)).toEqual([
      'hypeddit',
      'sub2unlock',
      'boost',
      'rekonise',
      'valorizd',
      'push',
      'gaterush',
      'droploud',
    ]);
    const hosts: unknown = JSON.parse(readFileSync('config/provider-hosts.json', 'utf8'));
    expect(hosts).toEqual([
      'hypeddit.com',
      'www.hypeddit.com',
      'sub2unlock.com',
      'boost.ink',
      'de.boost.ink',
      'nl.boost.ink',
      'rekonise.com',
      'www.rekonise.com',
      'www.valorizd.app',
      'push.fm',
      'gaterush.me',
      'droploud.com',
    ]);
    for (const host of hosts as string[])
      expect(
        providers.some((provider) =>
          provider.matches(
            new URL(
              `https://${host}${host === 'droploud.com' ? '/track/12345678-1234-4123-8123-123456789abc' : host === 'www.valorizd.app' ? '/gates/example-gate' : host === 'push.fm' ? '/cu/example' : '/abc123'}`,
            ),
          ),
        ),
      ).toBe(true);
  });
  it.each([
    'https://www.toneden.io/example/post/free-download',
    'https://rekonise.com.evil.invalid/example-gate-abcde',
    'https://mboost.me/example',
    'https://sub2unlock.net/Abc123',
    'https://boost.ink.evil.invalid/Abc123',
    'https://sub2unlock.com.evil.invalid/Abc123',
  ])('does not advertise unverified or unrelated origins: %s', (url) => {
    expect(providers.some((provider) => provider.matches(new URL(url)))).toBe(false);
  });
});
