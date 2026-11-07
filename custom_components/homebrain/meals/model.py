"""Pure mapping of a Mealie meal plan to the Dnes „Co se dnes vaří“ rows.

Input rows are what the HA ``mealie.get_mealplan`` service returns (``mealplan`` list):
``entry_type`` (breakfast/lunch/dinner/side/snack/drink/dessert), ``mealplan_date``, ``title``
and an optional ``recipe`` (``name``, ``slug``, ``original_url``). Rows are matched to Recepty
(the HomeBrain recipe store) by source URL, Mealie slug in the source URL, or folded title.
"""

from __future__ import annotations

from collections.abc import Iterable, Mapping
from datetime import date
from typing import Any, Final

from ..recipes.store import fold

# Order of the day; unknown Mealie types go last as „Jídlo“.
MEAL_TYPES: Final = {
    "breakfast": "Snídaně",
    "lunch": "Oběd",
    "snack": "Svačina",
    "dinner": "Večeře",
    "side": "Příloha",
    "dessert": "Dezert",
    "drink": "Nápoj",
}
_ORDER: Final = {kind: i for i, kind in enumerate(MEAL_TYPES)}


def _url(value: Any) -> str:
    return str(value or "").strip().rstrip("/").lower() if isinstance(value, str) else ""


def match_recipe(recipe: Mapping[str, Any], local: Iterable[Mapping[str, Any]]) -> str | None:
    """Id of the Recepty recipe for a Mealie recipe, else ``None``."""
    url, slug, name = _url(recipe.get("original_url")), recipe.get("slug"), fold(recipe.get("name"))
    candidates = list(local)
    for rule in (
        lambda r: url and _url(r.get("sourceUrl")) == url,
        lambda r: (
            isinstance(slug, str) and slug and _url(r.get("sourceUrl")).endswith(f"/{slug.lower()}")
        ),
        lambda r: name and fold(r.get("title")) == name,
    ):
        hit = next((r for r in candidates if rule(r)), None)
        if hit is not None:
            return str(hit["id"])
    return None


def build_meals(
    plans: Iterable[Any], today: date, local: Iterable[Mapping[str, Any]]
) -> list[dict[str, Any]]:
    """Today's meals sorted by meal type (breakfast → drink), then by plan order."""
    local = list(local)
    day = today.isoformat()
    rows: list[tuple[int, int, dict[str, Any]]] = []
    for i, plan in enumerate(plans):
        if not isinstance(plan, Mapping) or str(plan.get("mealplan_date") or "")[:10] != day:
            continue
        recipe = plan.get("recipe") if isinstance(plan.get("recipe"), Mapping) else None
        title = (recipe or {}).get("name") or plan.get("title")
        if not isinstance(title, str) or not title.strip():
            continue
        kind = str(plan.get("entry_type") or "")
        known = kind in MEAL_TYPES
        rows.append(
            (
                _ORDER.get(kind, len(_ORDER)),
                i,
                {
                    "id": str(plan.get("mealplan_id", i)),
                    "type": kind if known else "other",
                    "label": MEAL_TYPES[kind] if known else "Jídlo",
                    "title": title.strip()[:200],
                    "slug": recipe.get("slug") if recipe else None,
                    "recipe_id": match_recipe(recipe, local) if recipe else None,
                },
            )
        )
    return [row for _, _, row in sorted(rows, key=lambda r: (r[0], r[1]))]
