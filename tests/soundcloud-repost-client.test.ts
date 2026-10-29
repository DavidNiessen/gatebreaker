import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
const h = vi.hoisted(() => ({ send: vi.fn() }));
vi.mock('../src/extension/platform/browser', () => ({
  extension: { runtime: { sendMessage: h.send } },
}));
import { repostSoundcloud } from '../src/extension/platform/soundcloud-repost';

const request = {
  provider: 'droploud' as const,
  gateId: 'e8769ae1-5c90-43ee-bfe3-9fbbe50c5b89',
  url: 'https://soundcloud.com/artist/track',
};
let finish!: (value: unknown) => void;
beforeEach(() => {
  vi.useFakeTimers();
  h.send.mockReset();
  h.send.mockImplementation(async (message) => {
    if (message.type === 'gatebreaker:soundcloud-repost')
      return new Promise((resolve) => {
        finish = resolve;
      });
    if (message.type === 'gatebreaker:soundcloud-repost-heartbeat') return { state: 'loading' };
    return { state: 'cancelled' };
  });
});
afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
});

describe('SoundCloud owned-operation client', () => {
  it('sends a bounded request and heartbeat without exposing page details in progress', async () => {
    const progress = vi.fn();
    const pending = repostSoundcloud(request, undefined, progress);
    expect(h.send.mock.calls[0]![0]).toMatchObject({
      type: 'gatebreaker:soundcloud-repost',
      ...request,
    });
    const operation = h.send.mock.calls[0]![0].operation;
    expect(operation).toMatch(/^[a-f0-9-]{36}$/);
    await vi.advanceTimersByTimeAsync(2000);
    expect(h.send).toHaveBeenCalledWith({
      type: 'gatebreaker:soundcloud-repost-heartbeat',
      operation,
    });
    finish({ state: 'complete' });
    expect(await pending).toEqual({ state: 'complete' });
    expect(
      progress.mock.calls.every(
        ([value]) =>
          Object.keys(value).join(',') === 'message' && !value.message.includes('artist'),
      ),
    ).toBe(true);
    const count = h.send.mock.calls.length;
    await vi.advanceTimersByTimeAsync(4000);
    expect(h.send).toHaveBeenCalledTimes(count);
  });

  it('keeps waiting while login is required and resumes automatically', async () => {
    h.send.mockImplementation(async (message) => {
      if (message.type === 'gatebreaker:soundcloud-repost')
        return new Promise((resolve) => {
          finish = resolve;
        });
      return { state: 'login-required' };
    });
    const progress = vi.fn();
    const pending = repostSoundcloud(request, undefined, progress);
    await vi.advanceTimersByTimeAsync(4000);
    expect(progress).toHaveBeenCalledWith({
      message: expect.stringContaining('Sign in to SoundCloud'),
    });
    finish({ state: 'complete' });
    expect(await pending).toEqual({ state: 'complete' });
  });

  it('does no work for an already-aborted signal and cancels an active job on abort', async () => {
    const prior = new AbortController();
    prior.abort();
    expect(await repostSoundcloud(request, prior.signal)).toEqual({ state: 'cancelled' });
    expect(h.send).not.toHaveBeenCalled();
    const controller = new AbortController();
    const pending = repostSoundcloud(request, controller.signal);
    const operation = h.send.mock.calls[0]![0].operation;
    controller.abort();
    expect(await pending).toEqual({ state: 'cancelled' });
    expect(h.send).toHaveBeenCalledWith({
      type: 'gatebreaker:cancel-soundcloud-repost',
      operation,
    });
    finish({ state: 'complete' });
    await vi.advanceTimersByTimeAsync(4000);
  });

  it('stops when a restarted worker no longer recognizes the operation', async () => {
    h.send.mockImplementation(async (message) => {
      if (message.type === 'gatebreaker:soundcloud-repost') return new Promise(() => {});
      return { state: 'cancelled' };
    });
    const pending = repostSoundcloud(request);
    await vi.advanceTimersByTimeAsync(2000);
    expect(await pending).toEqual({ state: 'cancelled' });
  });

  it.each([
    null,
    { state: 'complete', token: 'never-expose' },
    { state: 'unknown' },
    { state: 'loading' },
  ])('cancels unexpected final responses %j', async (value) => {
    const pending = repostSoundcloud(request);
    finish(value);
    expect(await pending).toEqual({ state: 'failed' });
    expect(
      h.send.mock.calls.some(
        ([message]) => message.type === 'gatebreaker:cancel-soundcloud-repost',
      ),
    ).toBe(true);
  });

  it('cancels at its deadline instead of leaving background processing running', async () => {
    const pending = repostSoundcloud(request);
    await vi.advanceTimersByTimeAsync(120001);
    expect(await pending).toEqual({ state: 'cancelled' });
    expect(
      h.send.mock.calls.some(
        ([message]) => message.type === 'gatebreaker:cancel-soundcloud-repost',
      ),
    ).toBe(true);
  });
});
