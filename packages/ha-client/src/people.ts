import { useEffect, useState } from 'react';
import type { ConnectionLike } from './index.js';

/** One „Kdo je doma“ row (server `homebrain/people/*`): never zones, GPS or attributes. */
export interface PersonPresence {
  id: string;
  name: string;
  color: string;
  status: 'home' | 'away' | 'unknown';
}

export interface PeopleSource {
  /** Calls `onPeople` with the full list now and on every status change; returns stop(). */
  subscribe(onPeople: (people: PersonPresence[]) => void): () => void;
}

const POLL_MS = 60_000;

/** Live WS source: `homebrain/people/subscribe` (fallback: poll `homebrain/people/get`). */
export function createWsPeopleSource(connection: ConnectionLike): PeopleSource {
  return {
    subscribe(onPeople) {
      let stopped = false;
      const emit = (people: unknown) => {
        if (!stopped) onPeople(Array.isArray(people) ? (people as PersonPresence[]) : []);
      };
      if (connection.subscribeMessage) {
        const unsub = connection
          .subscribeMessage<{ people?: unknown }>(
            (msg) => emit(msg?.people),
            {
              type: 'homebrain/people/subscribe',
            },
            { resubscribe: true },
          )
          .catch(() => {
            emit([]); // no access / older backend: hide the indicator
            return undefined;
          });
        return () => {
          stopped = true;
          void unsub.then((fn) => fn?.());
        };
      }
      const load = () =>
        connection.sendMessagePromise<{ people?: unknown }>({ type: 'homebrain/people/get' }).then(
          (res) => emit(res?.people),
          () => emit([]),
        );
      void load();
      const timer = setInterval(load, POLL_MS);
      return () => {
        stopped = true;
        clearInterval(timer);
      };
    },
  };
}

export type PeopleSourceFactory = (connection: ConnectionLike | undefined) => PeopleSource | null;
let factory: PeopleSourceFactory = (connection) =>
  connection ? createWsPeopleSource(connection) : null;

/** Dev/tests replace the WS source with a synthetic household. */
export function setPeopleSourceFactory(next: PeopleSourceFactory): void {
  factory = next;
}

/** Live „Kdo je doma“ list; `null` until the first answer (render nothing meanwhile). */
export function usePeople(connection: ConnectionLike | undefined): PersonPresence[] | null {
  const [people, setPeople] = useState<PersonPresence[] | null>(null);
  useEffect(() => {
    const source = factory(connection);
    if (!source) return;
    return source.subscribe((next) => setPeople(next));
  }, [connection]);
  return people;
}
