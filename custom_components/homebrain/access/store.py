"""Přístup (BioLock): HA-side labels and the pure parsing helpers.

The sensor (DFRobot SEN0677) stores the biometric templates; it only knows an ID, a modality
(face 1–1000, palm 1001–2000) and a short name. It cannot tell a right palm from a left one,
so HomeBrain keeps two *labels* per ID in ``/config/homebrain/access.json``:

* ``hand`` – ``right`` / ``left`` for palm IDs,
* ``person`` – optional grouping name (overrides the name stored in the sensor),
* ``enrolled_at`` – date of the enrolment (stamped when HomeBrain saw it succeed).

Per person (folded name) it keeps ``child`` (re-enrol sooner), plus the set of IDs already
notified about re-enrolment and the module settings.

Never store anything biometric here: the file holds IDs and labels only.
"""

from __future__ import annotations

import json
import os
import re
from pathlib import Path
from typing import Any

FACE_IDS = range(1, 1001)
PALM_IDS = range(1001, 2001)
HANDS = ("right", "left")
MAX_PERSON = 40
STORE_VERSION = 1


class AccessError(Exception):
    """Validation error with a stable code for the WS layer."""

    def __init__(self, code: str) -> None:
        super().__init__(code)
        self.code = code


def modality(user_id: int) -> str:
    if user_id in FACE_IDS:
        return "face"
    if user_id in PALM_IDS:
        return "palm"
    raise AccessError("invalid_user_id")


def _bool(value: Any) -> bool:
    return str(value).strip().lower() in ("true", "1", "yes", "on")


def parse_users_page(data: dict[str, Any]) -> dict[str, Any]:
    """Parse one ``esphome.biolock_users`` event.

    ``users`` is ``id|type|name|allowed;…`` (firmware ``sen0677.cpp``), paged by 10 IDs.
    Malformed items are skipped instead of failing the whole page.
    """
    users = []
    for item in str(data.get("users") or "").split(";"):
        parts = item.split("|")
        if len(parts) != 4:
            continue
        try:
            user_id = int(parts[0])
            kind = modality(user_id)
        except (ValueError, AccessError):
            continue
        users.append(
            {
                "id": user_id,
                "type": kind,
                "name": parts[2][:20],
                "allowed": parts[3] == "allowed",
            }
        )

    def _int(key: str, default: int) -> int:
        try:
            return int(data.get(key, default))
        except (TypeError, ValueError):
            return default

    return {
        "page": _int("page", 1),
        "pages": max(1, _int("pages", 1)),
        "total": _int("total", len(users)),
        "incomplete": _bool(data.get("incomplete", False)),
        "users": users,
    }


class UserListAssembler:
    """Collect the pages of one listing; returns the full list once the last page arrives."""

    def __init__(self) -> None:
        self._pages: dict[int, list[dict[str, Any]]] = {}

    def add(self, page: dict[str, Any]) -> list[dict[str, Any]] | None:
        if page["page"] == 1:
            self._pages = {}
        self._pages[page["page"]] = page["users"]
        if all(n in self._pages for n in range(1, page["pages"] + 1)):
            users = [u for n in sorted(self._pages) for u in self._pages[n]]
            self._pages = {}
            return sorted(users, key=lambda u: u["id"])
        return None


_DATE = re.compile(r"^\d{4}-\d{2}-\d{2}$")


def fold(name: str) -> str:
    return " ".join(name.split()).casefold()


def validate_label(
    user_id: int, hand: str | None, person: str | None, enrolled_at: str | None = None
) -> dict[str, str]:
    """A label entry (empty dict = remove)."""
    kind = modality(user_id)
    label: dict[str, str] = {}
    if hand is not None:
        if kind != "palm":
            raise AccessError("hand_for_face")
        if hand not in HANDS:
            raise AccessError("invalid_hand")
        label["hand"] = hand
    if person is not None:
        person = " ".join(person.split())
        if len(person) > MAX_PERSON:
            raise AccessError("invalid_person")
        if person:
            label["person"] = person
    if enrolled_at:
        if not _DATE.match(enrolled_at[:10]) or len(enrolled_at) != 10:
            raise AccessError("invalid_date")
        label["enrolled_at"] = enrolled_at
    return label


DEFAULT_SETTINGS = {"notify_reenroll": True}


class LabelStore:
    """JSON file with labels only; written atomically (tmp + replace). Blocking: run in executor."""

    def __init__(self, path: Path) -> None:
        self.path = path

    def load_all(self) -> dict[str, Any]:
        try:
            raw = json.loads(self.path.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            raw = {}
        raw = raw if isinstance(raw, dict) else {}
        labels: dict[str, dict[str, str]] = {}
        src = raw.get("labels") if isinstance(raw.get("labels"), dict) else {}
        for key, value in src.items():
            if not isinstance(value, dict):
                continue
            try:
                entry = validate_label(
                    int(key), value.get("hand"), value.get("person"), value.get("enrolled_at")
                )
            except (ValueError, AccessError):
                continue
            if entry:
                labels[str(int(key))] = entry
        people: dict[str, dict[str, bool]] = {}
        for key, value in (
            (raw.get("people") or {}).items() if isinstance(raw.get("people"), dict) else []
        ):
            if isinstance(value, dict) and value.get("child") is True and fold(str(key)):
                people[fold(str(key))[:MAX_PERSON]] = {"child": True}
        notified = (
            sorted(
                {
                    int(x)
                    for x in raw.get("notified") or []
                    if str(x).isdigit() and 1 <= int(x) <= 2000
                }
            )
            if isinstance(raw.get("notified"), list)
            else []
        )
        settings = dict(DEFAULT_SETTINGS)
        if isinstance(raw.get("settings"), dict):
            for key in DEFAULT_SETTINGS:
                if isinstance(raw["settings"].get(key), bool):
                    settings[key] = raw["settings"][key]
        return {"labels": labels, "people": people, "notified": notified, "settings": settings}

    def load(self) -> dict[str, dict[str, str]]:
        return self.load_all()["labels"]

    def save_all(self, doc: dict[str, Any]) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        tmp = self.path.with_suffix(".tmp")
        body = {"version": STORE_VERSION, **doc}
        tmp.write_text(json.dumps(body, ensure_ascii=False, indent=2, sort_keys=True), "utf-8")
        os.replace(tmp, self.path)

    def set(self, user_id: int, hand: str | None, person: str | None) -> dict[str, dict[str, str]]:
        """Set hand/person; keeps ``enrolled_at``."""
        doc = self.load_all()
        old = doc["labels"].get(str(user_id), {})
        entry = validate_label(user_id, hand, person, old.get("enrolled_at"))
        if entry:
            doc["labels"][str(user_id)] = entry
        else:
            doc["labels"].pop(str(user_id), None)
        self.save_all(doc)
        return doc["labels"]

    def stamp_enrolled(self, user_id: int, day: str) -> dict[str, Any]:
        doc = self.load_all()
        entry = dict(doc["labels"].get(str(user_id), {}))
        entry["enrolled_at"] = validate_label(user_id, None, None, day)["enrolled_at"]
        doc["labels"][str(user_id)] = entry
        doc["notified"] = [x for x in doc["notified"] if x != user_id]
        self.save_all(doc)
        return doc

    def set_person(self, person: str, child: bool) -> dict[str, Any]:
        key = fold(person)
        if not key or len(key) > MAX_PERSON:
            raise AccessError("invalid_person")
        doc = self.load_all()
        if child:
            doc["people"][key] = {"child": True}
        else:
            doc["people"].pop(key, None)
        self.save_all(doc)
        return doc

    def set_settings(self, **values: bool) -> dict[str, Any]:
        doc = self.load_all()
        doc["settings"].update({k: bool(v) for k, v in values.items() if k in DEFAULT_SETTINGS})
        self.save_all(doc)
        return doc

    def mark_notified(self, ids: list[int]) -> dict[str, Any]:
        doc = self.load_all()
        doc["notified"] = sorted(set(doc["notified"]) | set(ids))
        self.save_all(doc)
        return doc

    def forget(self, user_id: int) -> dict[str, dict[str, str]]:
        doc = self.load_all()
        gone = doc["labels"].pop(str(user_id), None) is not None
        if user_id in doc["notified"]:
            doc["notified"].remove(user_id)
            gone = True
        if gone:
            self.save_all(doc)
        return doc["labels"]
