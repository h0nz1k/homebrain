"""Import of the owner's own Vivino data export (GDPR CSV) → personalRating / personalNote.

Vivino has no public API and its terms forbid scraping, so the only automated path is the
export the owner downloads from vivino.com (Settings → export your data). Rows are paired
with existing wines by producer + name + vintage; exact pairs are pre-selected, fuzzy pairs
must be confirmed in the UI. Nothing is created – only personal fields of matched wines.
"""

from __future__ import annotations

import csv
import io
from typing import Any

from .domain import WineError, evaluate_rating
from .lookup import fold, tokens

MAX_ROWS = 2000
FUZZY_MIN = 0.6
_HEADERS = {
    "producer": ("winery", "producer", "vinarstvi"),
    "name": ("wine name", "wine", "name", "nazev"),
    "vintage": ("vintage", "rocnik"),
    "rating": ("your rating", "my rating", "rating"),
    "review": ("your review", "review"),
    "note": ("personal note", "note", "poznamka"),
    "scanned": ("scan date", "date"),
}


def _columns(header: list[str]) -> dict[str, int]:
    folded = [fold(h) for h in header]
    out: dict[str, int] = {}
    for key, aliases in _HEADERS.items():
        for alias in aliases:
            if alias in folded:
                out[key] = folded.index(alias)
                break
    if "name" not in out:
        raise WineError("IMPORT_VIVINO_UNRECOGNISED")
    return out


def parse_export(content: str) -> list[dict[str, Any]]:
    text = content.lstrip("\ufeff")
    try:
        dialect = csv.Sniffer().sniff(text[:4096], delimiters=",;\t")
    except csv.Error:
        dialect = csv.excel
    reader = csv.reader(io.StringIO(text), dialect)
    try:
        header = next(reader)
    except StopIteration as err:
        raise WineError("IMPORT_VIVINO_UNRECOGNISED") from err
    cols = _columns(header)
    rows: list[dict[str, Any]] = []
    for n, cells in enumerate(reader, start=1):
        if n > MAX_ROWS:
            raise WineError("IMPORT_TOO_MANY_ROWS")

        def cell(key: str, cells: list[str] = cells) -> str:
            idx = cols.get(key)
            return cells[idx].strip() if idx is not None and idx < len(cells) else ""

        name = cell("name")
        if not name:
            continue
        vintage_raw = cell("vintage")
        vintage = int(vintage_raw) if vintage_raw.isdigit() else None
        if vintage is not None and not 1800 < vintage < 2200:
            vintage = None
        rating: float | None = None
        if raw := cell("rating").replace(",", "."):
            try:
                rating = float(raw)
                evaluate_rating(rating)
            except (ValueError, WineError):
                rating = None
            if rating == 0:
                rating = None  # Vivino exports 0 for "not rated"
        note_parts = [p for p in (cell("review"), cell("note")) if p]
        rows.append(
            {
                "row": n,
                "producer": cell("producer")[:200] or None,
                "name": name[:200],
                "vintage": vintage,
                "rating": rating,
                "note": "\n\n".join(note_parts)[:3500] or None,
                "scanned": cell("scanned")[:20] or None,
            }
        )
    return rows


def _score(row: dict[str, Any], wine: dict[str, Any]) -> float:
    want = set(tokens(row["name"]))
    have = set(tokens(f"{wine['name']} {wine.get('labelName') or ''}"))
    if not want:
        return 0.0
    name_score = len(want & have) / len(want)
    prod_row = set(tokens(row.get("producer")))
    prod_wine = set(tokens(wine.get("producer")))
    if prod_row and prod_wine and not prod_row & prod_wine:
        # Producer named on both sides but different – allow only when the producer word
        # appears in the wine name (Vivino often puts the winery into "Wine name").
        if not prod_row & have:
            return 0.0
    score = name_score
    if row.get("vintage") and wine.get("vintage"):
        score += 0.15 if row["vintage"] == wine["vintage"] else -0.3
    return round(score, 3)


def _is_exact(row: dict[str, Any], wine: dict[str, Any]) -> bool:
    same_name = fold(row["name"]) in (
        fold(wine["name"]),
        fold(f"{wine['name']} {wine.get('labelName') or ''}"),
        fold(wine.get("labelName")),
    )
    same_prod = not row.get("producer") or fold(row["producer"]) == fold(wine.get("producer"))
    return same_name and same_prod and row.get("vintage") == wine.get("vintage")


def _changes(row: dict[str, Any], wine: dict[str, Any]) -> tuple[dict[str, Any], bool]:
    changes: dict[str, Any] = {}
    conflict = False
    if row["rating"] is not None and row["rating"] != wine.get("personalRating"):
        changes["personalRating"] = row["rating"]
        conflict = wine.get("personalRating") is not None
    note = row.get("note")
    current = (wine.get("personalNote") or "").strip()
    if note and note not in current:
        changes["personalNote"] = (f"{current}\n\nVivino: {note}" if current else note)[:4000]
    return changes, conflict


def plan(rows: list[dict[str, Any]], wines: list[dict[str, Any]]) -> list[dict[str, Any]]:
    items: list[dict[str, Any]] = []
    by_id = {w["id"]: w for w in wines}
    for row in rows:
        exact = [w for w in wines if _is_exact(row, w)]
        scored = sorted(
            ((s, w) for w in wines if (s := _score(row, w)) >= FUZZY_MIN),
            key=lambda sw: (-sw[0], sw[1]["id"]),
        )
        item: dict[str, Any] = {**row, "match": "none", "wineId": None, "candidates": []}
        if len(exact) == 1:
            item.update(match="exact", wineId=exact[0]["id"])
        elif scored:
            item.update(match="fuzzy", wineId=scored[0][1]["id"])
        item["candidates"] = [
            {
                "wineId": w["id"],
                "name": w["name"],
                "labelName": w.get("labelName"),
                "producer": w["producer"],
                "vintage": w.get("vintage"),
                "score": s,
            }
            for s, w in scored[:3]
        ]
        if item["wineId"]:
            changes, conflict = _changes(row, by_id[item["wineId"]])
            item.update(changes=changes, conflict=conflict)
            item["selected"] = item["match"] == "exact" and bool(changes) and not conflict
            if not changes:
                item["match"] = item["match"] + "_unchanged"
        else:
            item.update(changes={}, conflict=False, selected=False)
        items.append(item)
    return items


def run_vivino_import(
    store: Any, content: str, dry_run: bool, accept: list[dict[str, Any]] | None
) -> dict[str, Any]:
    rows = parse_export(content)
    wines = store.list({"sort": "id"})
    items = plan(rows, wines)
    summary: dict[str, int] = {}
    for item in items:
        summary[item["match"]] = summary.get(item["match"], 0) + 1
    result: dict[str, Any] = {"dryRun": dry_run, "rows": len(rows), "summary": summary}
    if dry_run:
        result["plan"] = items
        return result
    by_row = {i["row"]: i for i in items}
    by_id = {w["id"]: w for w in wines}
    applied = 0
    for choice in accept or []:
        item = by_row.get(choice.get("row"))
        wine_id = choice.get("wineId")
        if item is None or wine_id not in by_id:
            continue
        allowed = {item["wineId"], *(c["wineId"] for c in item["candidates"])}
        if wine_id not in allowed:
            continue  # never apply to a wine the plan did not offer
        changes, _conflict = _changes(item, by_id[wine_id])
        if changes:
            by_id[wine_id] = store.update(wine_id, changes)
            applied += 1
    result["applied"] = applied
    return result
