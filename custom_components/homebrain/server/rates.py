"""Byte rates from cumulative counters (Proxmox guest netin/netout), kept in memory only."""

from __future__ import annotations

from collections.abc import Hashable
from typing import Final

# Forget a guest's sample after this long without a new value (stopped guest, removed entity).
STALE_S: Final = 15 * 60


class CounterRates:
    """``rate = Δbytes / Δt`` per key; first sample, counter reset or stale sample → ``None``.

    The sample time is the moment the integration last wrote the counter (``last_reported``),
    not the request time: several panels polling between two Proxmox updates get the same rate
    instead of a bogus 0 B/s, and no recorder query is needed.
    """

    def __init__(self) -> None:
        # key → (counter, sample time, last rate)
        self._samples: dict[Hashable, tuple[float, float, float | None]] = {}

    def rate(self, key: Hashable, counter: float | None, at: float | None) -> float | None:
        if counter is None or at is None:
            self._samples.pop(key, None)
            return None
        prev = self._samples.get(key)
        if prev is not None and at == prev[1] and counter == prev[0]:
            return prev[2]
        rate: float | None = None
        if prev is not None and at > prev[1] and at - prev[1] <= STALE_S and counter >= prev[0]:
            rate = (counter - prev[0]) / (at - prev[1])
        self._samples[key] = (counter, at, rate)
        return rate

    def prune(self, keep: set[Hashable]) -> None:
        for key in self._samples.keys() - keep:
            del self._samples[key]
