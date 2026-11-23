import { useCallback, useEffect, useState } from 'react';
import type { HeatingApi } from '../../api.js';
import type { HeatingHistory, HeatingSnapshot, HistoryKey, HistoryRange } from '../../types.js';

const POLL_MS = 30_000;

export function useHeating(api: HeatingApi | null) {
  const [snap, setSnap] = useState<HeatingSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(() => {
    if (!api) return;
    api.get().then(
      (s) => {
        setSnap(s);
        setError(null);
      },
      (e: unknown) => setError(e instanceof Error ? e.message : 'Topení neodpovědělo.'),
    );
  }, [api]);
  useEffect(() => {
    load();
    const unsub = api?.subscribe?.((s) => setSnap(s));
    const tick = setInterval(() => {
      if (typeof document === 'undefined' || !document.hidden) load();
    }, POLL_MS);
    return () => {
      clearInterval(tick);
      unsub?.();
    };
  }, [api, load]);
  return { snap, error };
}

export function useHistory(api: HeatingApi | null, range: HistoryRange, keys: HistoryKey[]) {
  const [data, setData] = useState<{ id: string; h: HeatingHistory | null } | null>(null);
  const id = `${range}:${keys.join(',')}`;
  useEffect(() => {
    if (!api) return;
    let live = true;
    api.history(range, keys).then(
      (h) => live && setData({ id, h }),
      () => live && setData({ id, h: null }),
    );
    return () => {
      live = false;
    };
    // keys are part of `id`
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api, id]);
  return data?.id === id ? data.h : undefined;
}
