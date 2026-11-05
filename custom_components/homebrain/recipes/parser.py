"""schema.org Recipe extraction: JSON-LD (incl. ``@graph``) with a microdata fallback.

Docs: https://schema.org/Recipe ·
https://developers.google.com/search/docs/appearance/structured-data/recipe

The result is the same normalised shape the manual editor sends to ``store.create``.
"""

from __future__ import annotations

import html as html_mod
import json
import re
from html.parser import HTMLParser
from typing import Any
from urllib.parse import parse_qs, urljoin, urlsplit

from .units import (
    detect_durations,
    is_countable,
    is_group_header,
    parse_ingredient,
    parse_iso_duration,
)

_LD_RE = re.compile(
    r"<script[^>]*type\s*=\s*[\"']application/ld\+json[\"'][^>]*>(.*?)</script>",
    re.I | re.S,
)
_YT_ID = re.compile(r"^[A-Za-z0-9_-]{11}$")
MAX_STEPS = 80
MAX_INGREDIENTS = 120


class RecipeParseError(Exception):
    """No schema.org Recipe on the page."""


def _text(value: Any) -> str:
    """Strip tags/entities and collapse whitespace."""
    if value is None:
        return ""
    if isinstance(value, list):
        value = " ".join(_text(v) for v in value)
    if isinstance(value, dict):
        value = value.get("text") or value.get("name") or ""
    text = re.sub(r"<br\s*/?>", "\n", str(value), flags=re.I)
    text = re.sub(r"<[^>]+>", " ", text)
    text = html_mod.unescape(text).replace("\xa0", " ")
    return re.sub(r"[ \t\r\f\v]+", " ", text).strip()


def _types(node: dict[str, Any]) -> set[str]:
    raw = node.get("@type")
    values = raw if isinstance(raw, list) else [raw]
    return {str(v).rsplit("/", 1)[-1] for v in values if v}


def _walk(node: Any):
    if isinstance(node, list):
        for item in node:
            yield from _walk(item)
    elif isinstance(node, dict):
        yield node
        for key in ("@graph", "mainEntity", "mainEntityOfPage", "itemListElement"):
            if key in node and isinstance(node[key], (list, dict)):
                yield from _walk(node[key])


def _load_json(raw: str) -> Any:
    raw = raw.strip().removeprefix("<!--").removesuffix("-->").strip()
    try:
        return json.loads(raw)
    except ValueError:
        # Some CMSs emit raw newlines/tabs inside strings.
        try:
            return json.loads(re.sub(r"[\r\n\t]+", " ", raw))
        except ValueError:
            return None


def find_jsonld_recipe(page: str) -> dict[str, Any] | None:
    for block in _LD_RE.findall(page or ""):
        data = _load_json(html_mod.unescape(block) if "&quot;" in block else block)
        for node in _walk(data):
            if "Recipe" in _types(node):
                return node
    return None


# ---------- microdata ----------
class _Microdata(HTMLParser):
    """Collects itemprops inside the first ``itemtype=…schema.org/Recipe`` scope."""

    _VOID = {"img", "meta", "link", "br", "hr", "input", "source"}

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.depth = 0
        self.recipe_depth: int | None = None
        self.nested: list[int] = []  # depths of nested non-recipe itemscopes
        self.props: dict[str, list[str]] = {}
        self.open: list[tuple[str, int, list[str]]] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        a = {k: v or "" for k, v in attrs}
        if tag not in self._VOID:
            self.depth += 1
        if self.recipe_depth is None:
            if "itemscope" in a and re.search(r"schema\.org/Recipe\b", a.get("itemtype", "")):
                self.recipe_depth = self.depth
            return
        prop = a.get("itemprop")
        if prop and not self.nested:
            value = a.get("content") or a.get("datetime")
            if tag == "img" and not value:
                value = a.get("src")
            if value:
                self.props.setdefault(prop, []).append(value)
            elif tag not in self._VOID:
                self.open.append((prop, self.depth, []))
        if "itemscope" in a and tag not in self._VOID and prop not in ("recipeInstructions",):
            self.nested.append(self.depth)

    def handle_endtag(self, tag: str) -> None:
        if tag in self._VOID or self.recipe_depth is None:
            if tag not in self._VOID:
                self.depth -= 1
            return
        while self.open and self.open[-1][1] >= self.depth:
            prop, _d, chunks = self.open.pop()
            value = re.sub(r"\s+", " ", "".join(chunks)).strip()
            if value:
                self.props.setdefault(prop, []).append(value)
        if self.nested and self.nested[-1] == self.depth:
            self.nested.pop()
        if self.depth == self.recipe_depth:
            self.recipe_depth = -1  # done; ignore the rest of the page
        self.depth -= 1

    def handle_data(self, data: str) -> None:
        for _prop, _d, chunks in self.open:
            chunks.append(data)
        if self.open and data.strip() == "":
            return


def find_microdata_recipe(page: str) -> dict[str, Any] | None:
    parser = _Microdata()
    try:
        parser.feed(page or "")
        parser.close()
    except Exception:  # noqa: BLE001 - malformed HTML must not crash the import
        pass
    props = parser.props
    if not props.get("name"):
        return None
    single = ("name", "description", "recipeYield", "prepTime", "cookTime", "totalTime", "image")
    node: dict[str, Any] = {"@type": "Recipe"}
    for key, values in props.items():
        node[key] = values[0] if key in single else values
    if "ingredients" in node and "recipeIngredient" not in node:
        node["recipeIngredient"] = node.pop("ingredients")
    return node


# ---------- normalisation ----------
def _image_url(value: Any, base: str) -> str | None:
    if isinstance(value, list):
        for item in value:
            if url := _image_url(item, base):
                return url
        return None
    if isinstance(value, dict):
        value = value.get("url") or value.get("contentUrl")
    if isinstance(value, str) and value.strip():
        url = urljoin(base, value.strip())
        return url if url.startswith("https://") else None
    return None


def _servings(value: Any) -> int | None:
    values = value if isinstance(value, list) else [value]
    for item in values:
        if isinstance(item, (int, float)) and 0 < item < 1000:
            return int(item)
        if m := re.search(r"\d+", str(item or "")):
            n = int(m.group(0))
            if 0 < n < 1000:
                return n
    return None


def youtube_id(url: Any) -> str | None:
    """``watch?v=``, ``youtu.be/``, ``/embed/``, ``/shorts/`` -> 11-char video id."""
    if not isinstance(url, str) or not url:
        return None
    parts = urlsplit(url.strip())
    host = (parts.hostname or "").lower().removeprefix("www.").removeprefix("m.")
    candidate = None
    if host == "youtu.be":
        candidate = parts.path.strip("/").split("/")[0]
    elif host in ("youtube.com", "youtube-nocookie.com", "music.youtube.com"):
        if parts.path == "/watch":
            candidate = (parse_qs(parts.query).get("v") or [""])[0]
        else:
            m = re.match(r"^/(?:embed|shorts|v|live)/([^/?#]+)", parts.path)
            candidate = m.group(1) if m else None
    return candidate if candidate and _YT_ID.match(candidate) else None


def _video(node: dict[str, Any]) -> tuple[str | None, list[dict[str, Any]]]:
    videos = node.get("video")
    for video in videos if isinstance(videos, list) else [videos]:
        if isinstance(video, str):
            if vid := youtube_id(video):
                return vid, []
            continue
        if not isinstance(video, dict):
            continue
        for key in ("embedUrl", "contentUrl", "url"):
            if vid := youtube_id(video.get(key)):
                parts = video.get("hasPart")
                clips = []
                for clip in parts if isinstance(parts, list) else [parts]:
                    if isinstance(clip, dict) and isinstance(clip.get("startOffset"), (int, float)):
                        clips.append(
                            {"name": _text(clip.get("name")), "start": int(clip["startOffset"])}
                        )
                return vid, sorted(clips, key=lambda c: c["start"])
    return None, []


def _split_text_steps(text: str) -> list[str]:
    lines = [ln.strip() for ln in re.split(r"\n+", text) if ln.strip()]
    if len(lines) <= 1:
        lines = [s.strip() for s in re.split(r"(?:^|\s)\d{1,2}[.)]\s+", text) if s.strip()]
    return [re.sub(r"^\d{1,2}[.)]\s*", "", ln) for ln in lines]


def _steps(value: Any) -> list[dict[str, Any]]:
    steps: list[dict[str, Any]] = []

    def add(text: str, group: str | None, video_url: Any = None) -> None:
        text = _text(text)
        if not text:
            return
        if (header := is_group_header(text)) is not None:
            nonlocal_group[0] = header
            return
        step: dict[str, Any] = {"text": text, "group": group or nonlocal_group[0]}
        durations = detect_durations(text)
        if durations:
            step["timerSeconds"] = durations[0]["seconds"]
        if isinstance(video_url, str) and (m := re.search(r"[?&#]t=(\d+)", video_url)):
            step["videoTs"] = int(m.group(1))
        steps.append(step)

    nonlocal_group: list[str | None] = [None]

    def visit(item: Any, group: str | None) -> None:
        if isinstance(item, list):
            for child in item:
                visit(child, group)
        elif isinstance(item, str):
            for line in _split_text_steps(_text(item)):
                add(line, group)
        elif isinstance(item, dict):
            kinds = _types(item)
            if "HowToSection" in kinds:
                visit(item.get("itemListElement") or [], _text(item.get("name")) or group)
            elif "ItemList" in kinds:
                visit(item.get("itemListElement") or [], group)
            else:
                add(item.get("text") or item.get("name") or "", group, item.get("url"))

    visit(value, None)
    return steps[:MAX_STEPS]


# Store limits (store.validate_recipe) – clamp here so an import never fails validation.
NAME_MAX = 200
NOTE_MAX = 200
GROUP_MAX = 60
_NOTE_ONLY_RE = re.compile(r"^[(\[]\s*(?P<note>[^()\[\]]*?)\s*[)\]][.:]?$")


def _note_only(text: str) -> str | None:
    """``(mrkev, celer, petržel)`` / ``[volitelně]`` -> inner text; ``None`` otherwise."""
    m = _NOTE_ONLY_RE.match(text)
    return m.group("note").strip(" ,;") if m else None


def _add_note(item: dict[str, Any], note: str) -> None:
    joined = "; ".join(part for part in (item.get("note"), note) if part)
    item["note"] = joined[:NOTE_MAX].rstrip() or None


def _ingredients(lines: Any) -> list[dict[str, Any]]:
    """Ingredient lines -> items; never an item with an empty name.

    Group headers (``Na omáčku:``) set the group. A line that is only a note
    (``(mrkev, celer, petržel)``) annotates the previous ingredient, or extends/becomes
    the group header when nothing precedes it in the current group.
    """
    items: list[dict[str, Any]] = []
    group: str | None = None
    for raw in lines if isinstance(lines, list) else [lines]:
        text = _text(raw)
        if not text:
            continue
        if (header := is_group_header(text)) is not None:
            group = header[:GROUP_MAX]
            continue
        note = _note_only(text)
        parsed = parse_ingredient(text) if note is None else None
        if parsed is not None and not (parsed.get("name") or "").strip():
            # Defensive: anything else that parses to an empty name is a note too.
            note = parsed.get("note") or None
            parsed = None if note else {**parsed, "name": text}
        if parsed is None:
            if note:
                previous = items[-1] if items and items[-1]["group"] == group else None
                if previous is not None:
                    _add_note(previous, note)
                else:
                    # "Na omáčku:" + "(kořenová zelenina)" -> "Na omáčku (kořenová zelenina)".
                    group = (f"{group} ({note})" if group else note)[:GROUP_MAX].rstrip()
            continue
        parsed["name"] = parsed["name"].strip()[:NAME_MAX]
        if parsed.get("note"):
            parsed["note"] = parsed["note"][:NOTE_MAX].rstrip()
        parsed["group"] = group
        parsed["countable"] = is_countable(parsed["unit"], parsed["qty"])
        parsed["raw"] = text
        items.append(parsed)
    return items[:MAX_INGREDIENTS]


def _tags(node: dict[str, Any]) -> list[str]:
    tags: list[str] = []
    for key in ("recipeCategory", "recipeCuisine", "keywords"):
        value = node.get(key)
        for item in value if isinstance(value, list) else [value]:
            for tag in re.split(r"[,;]", _text(item)):
                tag = tag.strip().lower()
                if tag and len(tag) <= 30 and tag not in tags:
                    tags.append(tag)
    return tags[:8]


def normalise(node: dict[str, Any], url: str) -> dict[str, Any]:
    name = _text(node.get("name"))
    if not name:
        raise RecipeParseError("Recipe without name")
    video_id, clips = _video(node)
    steps = _steps(node.get("recipeInstructions"))
    # Clips (VideoObject.hasPart) map onto steps by order when the counts agree.
    if clips and len(clips) == len(steps):
        for step, clip in zip(steps, clips, strict=True):
            step.setdefault("videoTs", clip["start"])
    host = (urlsplit(url).hostname or "").removeprefix("www.")
    return {
        "title": name[:200],
        "description": _text(node.get("description"))[:1000] or None,
        "servings": _servings(node.get("recipeYield")),
        "prepSeconds": parse_iso_duration(node.get("prepTime")),
        "cookSeconds": parse_iso_duration(node.get("cookTime")),
        "totalSeconds": parse_iso_duration(node.get("totalTime")),
        "sourceUrl": url,
        "sourceName": host or None,
        "youtubeId": video_id,
        "ingredients": _ingredients(node.get("recipeIngredient") or node.get("ingredients")),
        "steps": steps,
        "tags": _tags(node),
        "photoUrl": _image_url(node.get("image"), url),
    }


def parse_recipe_page(page: str, url: str) -> dict[str, Any]:
    """HTML page -> normalised recipe; raises :class:`RecipeParseError`."""
    node = find_jsonld_recipe(page) or find_microdata_recipe(page)
    if node is None:
        raise RecipeParseError("No schema.org Recipe found")
    recipe = normalise(node, url)
    if recipe["totalSeconds"] is None and (recipe["prepSeconds"] or recipe["cookSeconds"]):
        recipe["totalSeconds"] = (recipe["prepSeconds"] or 0) + (recipe["cookSeconds"] or 0)
    return recipe
