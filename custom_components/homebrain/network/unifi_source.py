"""Where the read-only UniFi connection gets its account from (V2).

* ``ha_integration`` (default with exactly one HA ``unifi`` entry): reuse the account of Home
  Assistant's own UniFi integration. Host, port, site, username, password and ``verify_ssl``
  are read from that config entry **at connect time** through the public
  ``hass.config_entries`` API – HomeBrain never copies the password into its own storage,
  options, WebSocket answers or logs.
* ``manual``: HomeBrain's own account entered in the options flow (legacy options without
  ``source`` but with ``url`` are manual).
* ``off``: direct reading switched off explicitly.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Final

from homeassistant.config_entries import ConfigEntry, ConfigEntryState
from homeassistant.core import HomeAssistant

from .unifi_client import UnifiConfig

UNIFI_DOMAIN: Final = "unifi"
SOURCE_HA: Final = "ha_integration"
SOURCE_MANUAL: Final = "manual"
SOURCE_OFF: Final = "off"
SOURCES: Final = (SOURCE_HA, SOURCE_MANUAL, SOURCE_OFF)
DEFAULT_PORT: Final = 443


def ha_unifi_entries(hass: HomeAssistant) -> list[ConfigEntry]:
    """Configured (not disabled) entries of HA's UniFi integration."""
    return [e for e in hass.config_entries.async_entries(UNIFI_DOMAIN) if not e.disabled_by]


def config_from_ha_entry(entry: ConfigEntry) -> UnifiConfig | None:
    """Connection settings of a loaded HA UniFi entry (in memory only, never persisted)."""
    data = entry.data
    host = str(data.get("host") or "").strip()
    if not host:
        return None
    port = int(data.get("port") or DEFAULT_PORT)
    return UnifiConfig(
        url=f"https://{host}:{port}",
        site=str(data.get("site") or "default"),
        username=str(data.get("username") or ""),
        password=str(data.get("password") or ""),
        # HA also accepts a CA bundle path here; any truthy value means "verify"
        verify_ssl=bool(data.get("verify_ssl", False)),
    )


@dataclass(frozen=True)
class UnifiSource:
    kind: str
    entry_id: str | None = None
    manual: UnifiConfig | None = field(default=None, repr=False)

    @classmethod
    def from_options(cls, raw: Any, hass: HomeAssistant) -> UnifiSource | None:
        """Source from ``options["network_unifi"]``; ``None`` = direct reading off."""
        raw = raw if isinstance(raw, dict) else {}
        kind = raw.get("source")
        if kind == SOURCE_OFF:
            return None
        if kind == SOURCE_MANUAL or (kind is None and raw.get("url")):
            cfg = UnifiConfig.from_options(raw)
            return cls(SOURCE_MANUAL, manual=cfg) if cfg else None
        if kind == SOURCE_HA:
            return cls(SOURCE_HA, entry_id=raw.get("entry_id") or None)
        # nothing chosen yet: reuse HA's UniFi account when there is exactly one
        return cls(SOURCE_HA) if len(ha_unifi_entries(hass)) == 1 else None

    @classmethod
    def from_config(cls, cfg: UnifiConfig) -> UnifiSource:
        return cls(SOURCE_MANUAL, manual=cfg)

    def ha_entry(self, hass: HomeAssistant) -> ConfigEntry | None:
        if self.kind != SOURCE_HA:
            return None
        if self.entry_id:
            entry = hass.config_entries.async_get_entry(self.entry_id)
            return entry if entry is not None and entry.domain == UNIFI_DOMAIN else None
        entries = ha_unifi_entries(hass)
        return entries[0] if len(entries) == 1 else None

    def resolve(self, hass: HomeAssistant) -> UnifiConfig | None:
        """Account to connect with right now; ``None`` = HA source missing / not loaded."""
        if self.kind == SOURCE_MANUAL:
            return self.manual
        entry = self.ha_entry(hass)
        if entry is None or entry.state is not ConfigEntryState.LOADED:
            return None
        return config_from_ha_entry(entry)

    def account(self, hass: HomeAssistant) -> str | None:
        """Username for the settings label (admin only) – never the password or host."""
        if self.kind == SOURCE_MANUAL:
            return self.manual.username if self.manual else None
        entry = self.ha_entry(hass)
        return str(entry.data.get("username") or "") or None if entry else None
