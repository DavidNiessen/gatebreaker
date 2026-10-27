import { describe, it, expect, vi } from 'vitest';
import { deliveryTargets, deliver } from '../src/application/deliver';
import { actionError } from '../src/ui/action-error';
import type { Resolution } from '../src/domain/provider';
import type { PageStatus } from '../src/platform/messages';
const file = 'https://downloads.example.invalid/mix.wav';
describe('automatic delivery boundary', () => {
  it('keeps files separate from page destinations and preserves fragment keys', () => {
    expect(deliveryTargets({ ok: true, url: file, method: 'public-file' })).toEqual([
      { url: file, kind: 'file' },
    ]);
    const url = 'https://mega.nz/file/fixture#secret-key';
    expect(deliveryTargets({ ok: true, url, method: 'embedded-link' })).toEqual([
      { url, kind: 'page' },
    ]);
  });
  it('validates the complete file set before starting any transfer', () => {
    const first = { ok: true, url: file, kind: 'file', method: 'provider-request' } as const;
    expect(
      deliveryTargets({
        ...first,
        destinations: [
          { label: 'first', url: file },
          { label: 'second', url: file + '2' },
        ],
      }),
    ).toHaveLength(2);
    for (const url of [
      'http://example.com/file',
      'https://localhost/a',
      'https://127.0.0.1/a',
      'javascript:alert(1)',
      file,
    ]) {
      expect(
        deliveryTargets({
          ...first,
          destinations: [
            { label: 'first', url: file },
            { label: 'bad', url },
          ],
        }),
      ).toBeNull();
    }
    expect(deliveryTargets({ ...first, destinations: [] })).toBeNull();
    expect(
      deliveryTargets({ ...first, destinations: [{ label: 'different', url: file + '2' }] }),
    ).toBeNull();
    expect(
      deliveryTargets({
        ...first,
        destinations: Array.from({ length: 21 }, (_, i) => ({ label: 'file', url: file + i })),
      }),
    ).toBeNull();
  });
  it('starts every file once through the browser API without opening file tabs', async () => {
    const start = vi.fn().mockResolvedValue(7),
      open = vi.fn();
    expect(
      await deliver(
        [
          { url: file, kind: 'file' },
          { url: file + '2', kind: 'file' },
        ],
        start,
        open,
        () => true,
      ),
    ).toMatchObject({ state: 'started', files: 2 });
    expect(start.mock.calls).toEqual([[file], [file + '2']]);
    expect(open).not.toHaveBeenCalled();
  });
  it('opens page destinations rather than saving HTML as a file', async () => {
    const start = vi.fn(),
      open = vi.fn().mockResolvedValue({ id: 1 });
    expect(await deliver([{ url: file, kind: 'page' }], start, open, () => true)).toMatchObject({
      state: 'started',
      files: 0,
    });
    expect(open).toHaveBeenCalledExactlyOnceWith(file);
    expect(start).not.toHaveBeenCalled();
  });
  it('contains browser rejection and never retries automatically', async () => {
    const start = vi.fn().mockRejectedValue(Error('browser rejected'));
    expect(await deliver([{ url: file, kind: 'file' }], start, vi.fn(), () => true)).toMatchObject({
      state: 'failed',
      files: 0,
    });
    expect(start).toHaveBeenCalledOnce();
  });
  it('stops remaining files when cancelled', async () => {
    let active = true;
    const start = vi.fn(async () => {
      active = false;
    });
    expect(
      await deliver(
        [
          { url: file, kind: 'file' },
          { url: file + '2', kind: 'file' },
        ],
        start,
        vi.fn(),
        () => active,
      ),
    ).toMatchObject({ state: 'failed', files: 1 });
    expect(start).toHaveBeenCalledOnce();
  });
});
describe('errors-only native notice', () => {
  const state = (result: Resolution | null = null): PageStatus => ({
    enabled: true,
    busy: false,
    gate: null,
    result,
    actionStates: {
      email: { state: 'complete', message: 'Email completed' },
      spotify: { state: 'waiting', message: 'Waiting for login' },
    },
    preparedEmail: 'cosmos@icloud.com',
    actionMessage: 'Log entry',
  });
  it('does not expose routine progress, success logs, or the generated address', () =>
    expect(actionError(state())).toBe(''));
  it('shows one error and avoids duplicating the main result error', () => {
    const s = {
      ...state(),
      actionStates: { email: { state: 'error' as const, message: 'Email rejected' } },
    };
    expect(actionError(s)).toBe('Email rejected');
    expect(
      actionError({
        ...s,
        result: { ok: false, code: 'server-required', message: 'Email rejected' },
      }),
    ).toBe('');
  });
  it('shows a browser-delivery failure with recovery', () =>
    expect(
      actionError({
        ...state(),
        delivery: { state: 'failed', files: 0, message: 'Use the link to retry.' },
      }),
    ).toBe('Use the link to retry.'));
});
