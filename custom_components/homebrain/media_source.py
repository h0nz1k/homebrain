"""Short-lived media source for wine label photos handed to HA ``ai_task`` (#81).

``ai_task.generate_data`` only accepts attachments as media-source IDs that resolve to a
local file. The wine lookup writes the owner's label photo to
``/config/homebrain/tmp/label-<token>.*``, registers the random token here, calls the AI
task and deletes the file right after (≤ 5 min TTL as a safety net). Nothing is browsable.
"""

from __future__ import annotations

import time

from homeassistant.components.media_player import MediaClass
from homeassistant.components.media_source import (
    BrowseMediaSource,
    MediaSource,
    MediaSourceItem,
    PlayMedia,
    Unresolvable,
)
from homeassistant.core import HomeAssistant

from .const import DOMAIN
from .wine.lookup import LABEL_TTL_S, cleanup_label_photos, label_photos


async def async_get_media_source(hass: HomeAssistant) -> MediaSource:
    return LabelPhotoSource(hass)


class LabelPhotoSource(MediaSource):
    name = "HomeBrain"

    def __init__(self, hass: HomeAssistant) -> None:
        super().__init__(DOMAIN)
        self.hass = hass

    async def async_resolve_media(self, item: MediaSourceItem) -> PlayMedia:
        kind, _, token = (item.identifier or "").partition("/")
        entry = label_photos(self.hass).get(token) if kind == "label" else None
        if entry is None or time.monotonic() - entry[2] > LABEL_TTL_S:
            await self.hass.async_add_executor_job(cleanup_label_photos, self.hass)
            raise Unresolvable("Unknown or expired label photo")
        path, mime, _at = entry
        return PlayMedia(url=f"/api/{DOMAIN}/label/{token}", mime_type=mime, path=path)

    async def async_browse_media(self, item: MediaSourceItem) -> BrowseMediaSource:
        return BrowseMediaSource(
            domain=DOMAIN,
            identifier=None,
            media_class=MediaClass.DIRECTORY,
            media_content_type="",
            title="HomeBrain",
            can_play=False,
            can_expand=True,
            children=[],
            children_media_class=MediaClass.IMAGE,
        )
