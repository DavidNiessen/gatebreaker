import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { providers } from '../src/core/providers';

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
      'downloadgater',
      'stillhype',
      'pumpyoursound',
      'mypresskit',
      'bandcamp',
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
      'downloadgater.com',
      'stillhype.io',
      'www.stillhype.io',
      'pumpyoursound.com',
      'www.pumpyoursound.com',
      'mypresskit.info',
      'www.mypresskit.info',
      'bandcamp.com',
      '*.bandcamp.com',
    ]);
    for (const host of hosts as string[]) {
      const exampleHost = host === '*.bandcamp.com' ? 'fixture.bandcamp.com' : host;
      const pathname = host.includes('bandcamp.com')
        ? host === 'bandcamp.com'
          ? '/download'
          : '/album/original'
        : host.includes('stillhype.io') || host === 'downloadgater.com'
          ? '/g/original'
          : host.includes('pumpyoursound.com')
            ? '/f/pump-your-sound/original/12345'
            : host.includes('mypresskit.info')
              ? '/gate/original'
              : host === 'droploud.com'
                ? '/track/12345678-1234-4123-8123-123456789abc'
                : host === 'www.valorizd.app'
                  ? '/gates/example-gate'
                  : host === 'push.fm'
                    ? '/cu/example'
                    : '/abc123';
      const query =
        host === 'bandcamp.com'
          ? '?fsig=0123456789abcdef0123456789abcdef&id=123&ts=1900000000&type=album'
          : '';
      expect(
        providers.some((provider) =>
          provider.matches(new URL(`https://${exampleHost}${pathname}${query}`)),
        ),
        host,
      ).toBe(true);
    }
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
