import { describe, expect, it, vi } from 'vitest';
import type { ConnectionLike } from '@homebrain/ha-client';
import { getCoffeeApi, type CoffeeStatus } from './coffee.js';

describe('Coffee WebSocket client', () => {
  it('subscribes to status and sends the invitation command without arguments', async () => {
    const unsubscribe = vi.fn();
    const onStatus = vi.fn();
    let publish: (status: CoffeeStatus) => void = () => {};
    const subscribeMessage = vi.fn(async (callback: (status: CoffeeStatus) => void) => {
      publish = callback;
      return unsubscribe;
    });
    const sendMessagePromise = vi.fn(async () => ({ ok: true, reason: null }));
    const api = getCoffeeApi({
      subscribeMessage,
      sendMessagePromise,
    } as unknown as ConnectionLike)!;
    const stop = api.subscribe(onStatus);

    expect(subscribeMessage).toHaveBeenCalledWith(expect.any(Function), {
      type: 'homebrain/today/coffee/subscribe',
    });
    const snapshot = { reason: 'cooldown', cooldown_until: '2026-11-08T12:00:30Z' } as const;
    publish(snapshot);
    publish({ reason: null, cooldown_until: null });
    expect(onStatus.mock.calls).toEqual([[snapshot], [{ reason: null, cooldown_until: null }]]);

    await expect(api.invite()).resolves.toEqual({ ok: true, reason: null });
    expect(sendMessagePromise).toHaveBeenCalledExactlyOnceWith({
      type: 'homebrain/today/coffee/invite',
    });

    stop();
    publish({ reason: 'cooldown' });
    await vi.waitFor(() => expect(unsubscribe).toHaveBeenCalledOnce());
    expect(onStatus).toHaveBeenCalledTimes(2);
  });

  it('does not send an invitation while disconnected', async () => {
    const sendMessagePromise = vi.fn();
    const api = getCoffeeApi({
      connected: false,
      sendMessagePromise,
      subscribeMessage: vi.fn(),
    })!;
    await expect(api.invite()).resolves.toEqual({ ok: false, reason: 'send_failed' });
    expect(sendMessagePromise).not.toHaveBeenCalled();
  });
});
