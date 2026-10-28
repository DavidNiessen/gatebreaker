import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  pendingRequiredSignIns,
  waitForNativeAction,
} from '../src/extension/application/gate-actions';
import type { GateAction, GateActionProgress } from '../src/core/domain/provider';

afterEach(() => vi.useRealTimers());

describe('required native actions', () => {
  const login = (id: string, required = true): GateAction => ({
    id,
    kind: 'sign-in',
    required,
    label: id,
    description: id,
  });
  it('requires every required login but excludes email and optional logins', () => {
    const actions: GateAction[] = [
      login('spotify'),
      login('soundcloud'),
      login('optional', false),
      { ...login('email'), kind: 'email' },
    ];
    expect(pendingRequiredSignIns(actions).map((a) => a.id)).toEqual(['spotify', 'soundcloud']);
    expect(
      pendingRequiredSignIns(actions, {
        spotify: { state: 'waiting', message: 'pending' },
        soundcloud: { state: 'error', message: 'retry' },
      }),
    ).toHaveLength(2);
    expect(
      pendingRequiredSignIns(actions, { spotify: { state: 'complete', message: 'done' } }).map(
        (a) => a.id,
      ),
    ).toEqual(['soundcloud']);
    expect(
      pendingRequiredSignIns(actions, {
        spotify: { state: 'complete', message: 'done' },
        soundcloud: { state: 'complete', message: 'done' },
      }),
    ).toEqual([]);
  });
  it.each(['complete', 'error'] as const)(
    'waits for native %s rather than a click',
    async (state) => {
      vi.useFakeTimers();
      let value: GateActionProgress | null = { state: 'waiting', message: 'clicked' };
      const controller = new AbortController();
      const read = vi.fn(() => value);
      let settled = false;
      const pending = waitForNativeAction(read, controller.signal).then((v) => {
        settled = true;
        return v;
      });
      await vi.advanceTimersByTimeAsync(500);
      expect(settled).toBe(false);
      value = { state, message: 'native response' };
      await vi.advanceTimersByTimeAsync(100);
      expect(await pending).toEqual(value);
      expect(vi.getTimerCount()).toBe(0);
    },
  );
  it('times out without retrying or claiming success', async () => {
    vi.useFakeTimers();
    const pending = waitForNativeAction(() => null, new AbortController().signal, 1000);
    await vi.advanceTimersByTimeAsync(1000);
    expect(await pending).toMatchObject({ state: 'error' });
    expect(vi.getTimerCount()).toBe(0);
  });
  it('aborts polling and rejects an already aborted request', async () => {
    vi.useFakeTimers();
    const controller = new AbortController();
    const pending = waitForNativeAction(() => null, controller.signal);
    const rejection = expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    controller.abort();
    await rejection;
    expect(vi.getTimerCount()).toBe(0);
    expect(() => waitForNativeAction(() => null, controller.signal)).toThrow();
  });
  it('contains native progress reader errors and clears its timers', async () => {
    vi.useFakeTimers();
    expect(
      await waitForNativeAction(() => {
        throw Error('stale DOM');
      }, new AbortController().signal),
    ).toMatchObject({ state: 'error' });
    expect(vi.getTimerCount()).toBe(0);
  });
});
