import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
const hooks = vi.hoisted(() => ({ get: vi.fn(), set: vi.fn() }));
vi.mock('../src/extension/platform/browser', () => ({
  extension: { storage: { local: { get: hooks.get, set: hooks.set } } },
}));
import {
  canReuseSpotify,
  rememberSpotify,
  reusableSpotifyAddress,
  spotifyReuseKey,
  validSpotifyReuse,
} from '../src/extension/platform/spotify-reuse';
const now = 1800000000000;
const address =
  'https://accounts.spotify.com/authorize?client_id=authored&redirect_uri=https%3A%2F%2Fhypeddit.com%2Fspotify_callback&response_type=code&scope=authored&state=authored';
beforeEach(() => {
  vi.spyOn(Date, 'now').mockReturnValue(now);
  hooks.get.mockReset();
  hooks.set.mockReset();
});
afterEach(() => vi.restoreAllMocks());
describe('nonsecret Hypeddit Spotify reuse preference', () => {
  it('accepts only a current scoped receipt', () => {
    expect(validSpotifyReuse({ version: 1, confirmedAt: now })).toBe(true);
  });
  it.each([
    null,
    true,
    {},
    [],
    { version: 2, confirmedAt: now },
    { version: 1, confirmedAt: now + 1 },
    { version: 1, confirmedAt: now - 31 * 86400000 },
    { version: 1, confirmedAt: now, token: 'never-store' },
    { version: 1, confirmedAt: 'now' },
  ])('does not trust malformed, future or stale data: %j', (value) =>
    expect(validSpotifyReuse(value)).toBe(false),
  );
  it('contains storage errors and missing receipts', async () => {
    hooks.get.mockRejectedValueOnce(Error('Unavailable'));
    expect(await canReuseSpotify()).toBe(false);
    hooks.get.mockResolvedValue({});
    expect(await canReuseSpotify()).toBe(false);
  });
  it('does not remember a cancelled or stale operation', async () => {
    await rememberSpotify(() => false);
    expect(hooks.set).not.toHaveBeenCalled();
  });
  it('stores only a timestamp receipt and no credential or authorization fields', async () => {
    await rememberSpotify(() => true);
    expect(hooks.set).toHaveBeenCalledExactlyOnceWith({
      [spotifyReuseKey]: { version: 1, confirmedAt: now },
    });
    hooks.get.mockResolvedValue({ [spotifyReuseKey]: { version: 1, confirmedAt: now } });
    expect(await canReuseSpotify()).toBe(true);
  });
});
describe('background Spotify URL boundary', () => {
  it('accepts the exact native route', () => expect(reusableSpotifyAddress(address)).toBe(address));
  it.each([
    null,
    1,
    address.replace('accounts.spotify.com', 'accounts.spotify.com.evil.invalid'),
    address.replace('https:', 'http:'),
    address + '&state=duplicate',
    address + '#fragment',
    address.replace('spotify_callback', 'elsewhere'),
    address.replace('response_type=code', 'response_type=token'),
    address.replace('scope=authored', 'scope='),
    address.replace('accounts.spotify.com', 'secret@accounts.spotify.com'),
    address.replace('accounts.spotify.com', 'accounts.spotify.com:8443'),
  ])('rejects an unsupported authorization address: %j', (value) =>
    expect(reusableSpotifyAddress(value)).toBeNull(),
  );
});
