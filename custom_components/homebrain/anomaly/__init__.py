"""Hlídání domu (anomaly watch, #128): detection of unusual states from HA's own history.

Phase 1 = detection + panel only: read-only towards Home Assistant, owner actions are stored in
HomeBrain's own ``Store``. See ``docs/requirements/anomaly-watch.md``.
"""
