"""Ship the Czech Assist sentences into ``<config>/custom_sentences/cs/``.

HA's default conversation agent only reads custom sentences from the config directory, not
from integrations, so HomeBrain keeps a managed copy there. A copy whose marker line was
removed is treated as user-owned and never overwritten.
"""

from __future__ import annotations

import logging
from pathlib import Path

from homeassistant.core import HomeAssistant

_LOGGER = logging.getLogger(__name__)

LANGUAGE = "cs"
FILENAME = "homebrain_wine.yaml"
MANAGED_MARKER = "# managed-by: homebrain"
BUNDLED = Path(__file__).resolve().parent.parent / "custom_sentences" / LANGUAGE / FILENAME


def sync_sentences(target_dir: Path, source: Path = BUNDLED) -> bool:
    """Copy ``source`` into ``target_dir``; return True when the file changed."""
    content = source.read_text(encoding="utf-8")
    target = target_dir / FILENAME
    if target.exists():
        current = target.read_text(encoding="utf-8")
        if MANAGED_MARKER not in current or current == content:
            return False
    target_dir.mkdir(parents=True, exist_ok=True)
    tmp = target.with_suffix(".yaml.tmp")
    tmp.write_text(content, encoding="utf-8")
    tmp.replace(target)
    return True


async def async_install_sentences(hass: HomeAssistant) -> bool:
    """Sync the sentences and reload Czech intents when they changed."""
    target_dir = Path(hass.config.path("custom_sentences", LANGUAGE))
    try:
        changed = await hass.async_add_executor_job(sync_sentences, target_dir)
    except OSError as err:
        _LOGGER.warning("HomeBrain: cannot install Assist sentences: %s", err)
        return False
    if changed and hass.services.has_service("conversation", "reload"):
        await hass.services.async_call("conversation", "reload", {"language": LANGUAGE})
    return changed
