import { describe, expect, it, vi } from 'vitest';
import { createWsPeopleSource, type PersonPresence } from './people.js';

const jan: PersonPresence = { id: 'person.jan', name: 'Jan', color: 'blue', status: 'home' };

describe('createWsPeopleSource', () => {
  it('subscribes to homebrain/people/subscribe and forwards pushes', async () => {
    let push: (msg: unknown) => void = () => undefined;
    const unsub = vi.fn();
    const connection = {
      sendMessagePromise: vi.fn(),
      subscribeMessage: vi.fn(async (cb: (msg: unknown) => void, message: { type: string }) => {
        push = cb;
        void message;
        return unsub;
      }),
    };
    const seen: PersonPresence[][] = [];
    const stop = createWsPeopleSource(connection).subscribe((p) => seen.push(p));
    await Promise.resolve();
    expect(connection.subscribeMessage.mock.calls[0]![1]).toEqual({
      type: 'homebrain/people/subscribe',
    });
    push({ people: [jan] });
    push({ people: [{ ...jan, status: 'away' }] });
    expect(seen.map((p) => p[0]!.status)).toEqual(['home', 'away']);
    stop();
    await Promise.resolve();
    await Promise.resolve();
    expect(unsub).toHaveBeenCalled();
    push({ people: [jan] });
    expect(seen).toHaveLength(2);
  });

  it('hides the indicator when the subscription is refused', async () => {
    const connection = {
      sendMessagePromise: vi.fn(),
      subscribeMessage: vi.fn(() => Promise.reject(new Error('unauthorized'))),
    };
    const seen: PersonPresence[][] = [];
    createWsPeopleSource(connection).subscribe((p) => seen.push(p));
    await new Promise((r) => setTimeout(r, 0));
    expect(seen).toEqual([[]]);
  });
});
