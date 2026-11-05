"""Voice / free-text wine write-off: normalize Czech, fuzzy match, consume via store."""

from __future__ import annotations

import difflib
import re
import uuid
from dataclasses import dataclass
from typing import Any

from .domain import TARGET_NOT_FOUND, WineError
from .store import WineStore, fold

MATCH_MIN = 0.80
MATCH_MARGIN = 0.15

_FILLER_PHRASES = (
    "vypil jsem",
    "vypila jsem",
    "vypili jsme",
    "odepsat",
    "odepsat lahev",
    "odepsat lahve",
    "odepiš",
    "odepis",
    "odepsi",
    "odepis mi",
    "vypil jsem si",
    "vypila jsem si",
    "otevreli jsme",
    "vypito",
    "prosim",
    "prosím",
)

_FILLER_TOKENS = frozenset(
    {
        "lahev",
        "lahve",
        "lahvi",
        "láhev",
        "láhve",
        "láhvi",
        "flasa",
        "flase",
        "flaše",
        "flasu",
        "flasky",
        "lahvicky",
        "rocnik",
        "rocniku",
        "vino",
        "vina",
        "jednu",
        "jedna",
        "jeden",
        "bottle",
        "bottles",
    }
)

_COUNT_WORDS: dict[str, int] = {
    "jedna": 1,
    "jednu": 1,
    "jeden": 1,
    "dve": 2,
    "tri": 3,
    "ctyri": 4,
    "pet": 5,
    "sest": 6,
}

_VINTAGE_4 = re.compile(r"\b(19\d{2}|20\d{2})\b")
_VINTAGE_SHORT = re.compile(r"\brocnik\s+(\d{2})\b")
_COUNT_DIGIT = re.compile(r"\b(\d{1,2})\s*(?:lahev|lahve|lahvi|flase|flaše|x)\b")
_UNIT = r"(?:lahev|lahve|lahvi|lahvicky|flasu|flasky|flase|flasa)"
# Count words only with a unit ("dve lahve") or as the first word ("dve frankovky"), so
# wine names containing them ("Tramin pet", "Pet-Nat") stay intact.
_COUNT_WORD = re.compile(rf"\b(jedna|jednu|jeden|dve|tri|ctyri|pet|sest)\s+{_UNIT}\b")
_COUNT_WORD_LEAD = re.compile(r"^(jedna|jednu|jeden|dve|tri|ctyri|pet|sest)\s+(?!nat\b)")
_PET_NAT = re.compile(r"\bpet[\s-]*nat\b")
_FILLER_RE = re.compile(
    r"\b(?:"
    + "|".join(
        re.escape(p) for p in sorted({fold(p) for p in _FILLER_PHRASES}, key=len, reverse=True)
    )
    + r")\b"
)


@dataclass(frozen=True)
class ParsedVoice:
    raw: str
    query: str
    vintage: int | None
    quantity: int


def normalize_czech_text(text: str) -> str:
    """Lowercase, strip diacritics, collapse whitespace."""
    folded = re.sub(r"\s+", " ", fold(text.strip())).strip()
    return _PET_NAT.sub("petnat", folded)


def _strip_fillers(folded: str) -> str:
    """Remove command phrases on word boundaries only (``Prosimerice`` keeps ``prosim``)."""
    return re.sub(r"\s+", " ", _FILLER_RE.sub(" ", folded)).strip()


def parse_vintage_and_quantity(folded: str) -> tuple[str, int | None, int]:
    """Return (wine query, optional vintage, quantity default 1)."""
    text = folded
    vintage: int | None = None
    m4 = _VINTAGE_4.search(text)
    if m4:
        vintage = int(m4.group(1))
        text = (text[: m4.start()] + text[m4.end() :]).strip()
    else:
        ms = _VINTAGE_SHORT.search(text)
        if ms:
            yy = int(ms.group(1))
            vintage = 2000 + yy if yy < 50 else 1900 + yy
            text = (text[: ms.start()] + text[ms.end() :]).strip()

    quantity = 1
    md = _COUNT_DIGIT.search(text)
    if md:
        quantity = int(md.group(1))
        text = (text[: md.start()] + text[md.end() :]).strip()
    else:
        mw = _COUNT_WORD.search(text) or _COUNT_WORD_LEAD.search(text)
        if mw:
            quantity = _COUNT_WORDS.get(mw.group(1), 1)
            text = (text[: mw.start()] + " " + text[mw.end() :]).strip()

    tokens = [t for t in text.split() if t and t not in _FILLER_TOKENS]
    query = " ".join(tokens)
    return query, vintage, quantity


def parse_voice_text(text: str) -> ParsedVoice:
    raw = text.strip()
    folded = normalize_czech_text(raw)
    stripped = _strip_fillers(folded)
    query, vintage, quantity = parse_vintage_and_quantity(stripped)
    return ParsedVoice(raw=raw, query=query, vintage=vintage, quantity=quantity)


def token_set_ratio(left: str, right: str) -> float:
    """Lightweight fuzzy score in [0, 1] using stdlib difflib."""
    if not left or not right:
        return 0.0
    la, lb = left.split(), right.split()
    sa, sb = set(la), set(lb)
    inter = sa & sb
    if not inter:
        return difflib.SequenceMatcher(None, left, right).ratio()
    sorted_inter = " ".join(sorted(inter))
    sorted_a = " ".join(sorted(sa))
    sorted_b = " ".join(sorted(sb))
    return max(
        difflib.SequenceMatcher(None, sorted_inter, sorted_a).ratio(),
        difflib.SequenceMatcher(None, sorted_inter, sorted_b).ratio(),
        difflib.SequenceMatcher(None, sorted_a, sorted_b).ratio(),
    )


MIN_TOKEN_COVERAGE = 0.6
TOKEN_MATCH_MIN = 0.75


def token_coverage(query: str, blob: str) -> float:
    """Share of query words that fuzzily appear in the blob (Czech inflection, typos).

    Guards against false ambiguity from one shared word: "Synthetic Merlot" must not
    match "Synthetic Ryzlink" just because both share the first word.
    """
    words = [w for w in query.split() if not w.isdigit()]
    if not words:
        return 1.0
    blob_words = blob.split()
    hit = 0
    for word in words:
        if any(
            bw.startswith(word)
            or (word.startswith(bw) and len(bw) >= 4)
            or difflib.SequenceMatcher(None, word, bw).ratio() >= TOKEN_MATCH_MIN
            for bw in blob_words
        ):
            hit += 1
    return hit / len(words)


# Czech case endings (folded, no diacritics) → nominative candidates, longest suffix first.
# Assist hears "vypil jsem Pálavu / Frankovku / Blauburgeru / Veltlínského zeleného"; the
# catalogue stores the 1st case. A lemma is only used when it is literally a word of the
# wine being scored, so the normaliser can never invent a match on its own.
_CASE_ENDINGS: tuple[tuple[str, tuple[str, ...]], ...] = (
    ("eho", ("e", "y")),  # veltlinskeho → veltlinske, rynskeho → rynsky
    ("emu", ("e", "y")),
    ("ovi", ("",)),  # blauburgerovi → blauburger
    ("ym", ("e", "y")),  # zelenym → zelene
    ("em", ("", "e")),  # blauburgerem → blauburger, zelenem → zelene
    ("ou", ("a",)),  # frankovkou → frankovka
    ("ce", ("ka",)),  # (o) frankovce → frankovka
    ("ii", ("ia",)),  # moravii → moravia
    ("u", ("a", "")),  # palavu → palava, ryzlinku → ryzlink, traminu → tramin
    ("y", ("a", "")),  # frankovky → frankovka
    ("e", ("a",)),  # (o) palave → palava
    ("a", ("",)),  # (z) blauburgera → blauburger
)
_LEMMA_MIN_STEM = 3
_LEMMA_PENALTY = 0.02


def czech_lemma_candidates(word: str) -> list[str]:
    """Nominative candidates for one folded word (``frankovku`` → ``[frankovka, frankovk]``)."""
    if len(word) < _LEMMA_MIN_STEM + 1 or not word.isalpha():
        return []
    out: list[str] = []
    for suffix, replacements in _CASE_ENDINGS:
        if not word.endswith(suffix):
            continue
        stem = word[: -len(suffix)]
        if len(stem) < _LEMMA_MIN_STEM:
            continue
        for repl in replacements:
            cand = stem + repl
            if cand != word and cand not in out:
                out.append(cand)
    return out


def lemmatize_query_for(query: str, blob: str) -> str:
    """Rewrite declined query words to the nominative used by this wine (exact words kept)."""
    blob_words = set(blob.split())
    words = []
    for word in query.split():
        if word not in blob_words:
            word = next((c for c in czech_lemma_candidates(word) if c in blob_words), word)
        words.append(word)
    return " ".join(words)


def score_wine(parsed: ParsedVoice, blob: str) -> float | None:
    """Match score of one wine, ``None`` when too few query words are covered.

    Exact word forms take priority: a declined query is lemmatised against the wine's own
    words and scored with a small penalty, so a literal match still ranks first.
    """
    variants = [(parsed.query, 0.0)]
    lemmatized = lemmatize_query_for(parsed.query, blob)
    if lemmatized != parsed.query:
        variants.append((lemmatized, _LEMMA_PENALTY))
    best: float | None = None
    for query, penalty in variants:
        if token_coverage(query, blob) < MIN_TOKEN_COVERAGE:
            continue
        q = f"{query} {parsed.vintage}" if parsed.vintage is not None else query
        score = token_set_ratio(q, blob) - penalty
        best = score if best is None else max(best, score)
    return best


def wine_match_blob(wine: dict[str, Any]) -> str:
    parts = [wine.get("name") or "", wine.get("labelName") or "", wine.get("predicate") or ""]
    parts.extend(wine.get("grapeVarieties") or [])
    if wine.get("vintage") is not None:
        parts.append(str(wine["vintage"]))
    return normalize_czech_text(" ".join(p for p in parts if p))


def rank_in_stock_wines(wines: list[dict[str, Any]], parsed: ParsedVoice) -> list[dict[str, Any]]:
    """Ranked candidate dicts: wine, score (in-stock only for matching)."""
    if not parsed.query:
        return []
    scored: list[tuple[float, dict[str, Any]]] = []
    for wine in wines:
        if wine.get("quantity", 0) <= 0:
            continue
        score = score_wine(parsed, wine_match_blob(wine))
        if score is None:
            continue
        if parsed.vintage is not None and wine.get("vintage") == parsed.vintage:
            score = min(1.0, score + 0.08)
        scored.append((score, wine))
    scored.sort(key=lambda t: (-t[0], t[1]["id"]))
    return [{"wine": w, "score": round(s, 4)} for s, w in scored if s > 0.05]


def decide_match(candidates: list[dict[str, Any]]) -> str:
    if not candidates:
        return "not_found"
    top = candidates[0]["score"]
    second = candidates[1]["score"] if len(candidates) > 1 else 0.0
    if top >= MATCH_MIN and (top - second) >= MATCH_MARGIN:
        return "unique"
    if top >= 0.45:
        return "ambiguous"
    return "not_found"


def wine_public_summary(wine: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": wine["id"],
        "name": wine["name"],
        "labelName": wine.get("labelName"),
        "vintage": wine.get("vintage"),
        "quantity": wine.get("quantity"),
    }


def candidate_public(entry: dict[str, Any]) -> dict[str, Any]:
    return {**wine_public_summary(entry["wine"]), "score": entry["score"]}


def display_name(wine: dict[str, Any]) -> str:
    base = wine.get("name") or "Víno"
    vintage = wine.get("vintage")
    return f"{base} {vintage}" if vintage else base


def czech_response(result: dict[str, Any]) -> str:
    status = result.get("status")
    if status == "consumed":
        wine = result["wine"]
        qty = wine.get("quantity", 0)
        if qty == 0:
            return f"Odepsáno: {display_name(wine)}. Pozor, to byla poslední láhev."
        return f"Odepsáno: {display_name(wine)}, zbývá {qty} {bottles_word(qty)}."
    if status == "ambiguous":
        names = []
        for c in result.get("candidates", [])[:3]:
            wine = c.get("wine") if isinstance(c.get("wine"), dict) else c
            names.append(display_name(wine))
        if len(names) >= 2:
            options = [f"{ORDINALS[i]} {n}" for i, n in enumerate(names)]
            listed = ", ".join(options[:-1]) + f", nebo {options[-1]}"
            return f"Mám víc podobných vín. Myslíš {listed}?"
        if names:
            return f"Našel jsem jen {names[0]}. Myslíš to první, nebo ani jedno?"
        return "Které víno máš na mysli?"
    if status == "out_of_stock":
        wine = result.get("wine") or {}
        have = wine.get("quantity") or 0
        if wine and have > 0:
            return f"Od vína {display_name(wine)} mám jen {have} {bottles_word(have)}."
        if wine:
            return f"{display_name(wine)} už ve vinotéce není."
        return "Tohle víno ve vinotéce nemám."
    if status == "not_found":
        return "Tohle víno ve vinotéce nemám."
    if status == "dismissed":
        return "Dobře, nic neodepisuji."
    if status == "no_pending":
        return "Nemám žádné nevyřízené odepsání."
    if status == "bad_choice":
        return "Tolik možností nebylo."
    if status == "invalid_quantity":
        return "Neplatné množství."
    return "Nepodařilo se zpracovat požadavek."


ORDINALS = ("první", "druhé", "třetí", "čtvrté", "páté")


def bottles_word(qty: int) -> str:
    if qty == 1:
        return "láhev"
    if 2 <= qty <= 4:
        return "láhve"
    return "lahví"


def _voice_actor(actor: dict[str, Any] | None) -> dict[str, Any]:
    base = dict(actor or {})
    base.setdefault("type", "assist")
    base.setdefault("source", "voice")
    return base


def _parsed_meta(parsed: ParsedVoice) -> dict[str, Any]:
    return {"query": parsed.query, "vintage": parsed.vintage, "quantity": parsed.quantity}


def apply_voice_consume(
    store: WineStore,
    text: str,
    source_operation_id: str,
    *,
    dry_run: bool = False,
    actor: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Parse text, match, consume or queue ambiguous pending."""
    parsed = parse_voice_text(text)
    if parsed.quantity < 1:
        return {"status": "invalid_quantity"}

    replay = store.voice_replay_consume(source_operation_id)
    if replay is not None:
        out = replay
        out.setdefault("status", "consumed")
        return out

    existing = store.voice_pending_by_op(source_operation_id)
    if existing is not None:
        return {
            "status": "ambiguous",
            "pendingId": existing["id"],
            "candidates": existing["candidates"],
            "parsed": _parsed_meta(parsed),
        }

    in_stock = store.list({"inStockOnly": True})
    ranked = rank_in_stock_wines(in_stock, parsed)
    decision = decide_match(ranked)

    if decision == "not_found":
        zero_match = _best_zero_stock(store, parsed)
        if zero_match is not None:
            return {
                "status": "out_of_stock",
                "wine": wine_public_summary(zero_match),
                "candidates": [candidate_public({"wine": zero_match, "score": 1.0})],
            }
        return {"status": "not_found", "parsed": _parsed_meta(parsed)}

    if decision == "ambiguous":
        cands = [candidate_public(c) for c in ranked[:5]]
        if dry_run:
            return {
                "status": "ambiguous",
                "candidates": cands,
                "dryRun": True,
                "parsed": _parsed_meta(parsed),
            }
        pending_id = store.voice_pending_add(
            parsed.raw,
            parsed.query,
            parsed.vintage,
            parsed.quantity,
            cands,
            source_operation_id,
        )
        return {
            "status": "ambiguous",
            "pendingId": pending_id,
            "candidates": cands,
            "parsed": _parsed_meta(parsed),
        }

    wine = ranked[0]["wine"]
    qty = parsed.quantity
    if wine["quantity"] < qty:
        return {
            "status": "out_of_stock",
            "wine": wine_public_summary(wine),
            "candidates": [candidate_public(ranked[0])],
        }

    last_bottle = wine["quantity"] == qty
    if dry_run:
        return {
            "status": "consumed",
            "dryRun": True,
            "wine": wine_public_summary({**wine, "quantity": wine["quantity"] - qty}),
            "lastBottle": last_bottle,
            "parsed": _parsed_meta(parsed),
        }

    confirmed = qty > 1 or wine["quantity"] == 1
    reason = f"Hlas: {parsed.raw[:180]}"
    result = store.consume(
        wine["id"],
        qty,
        confirmed,
        source_operation_id,
        reason,
        _voice_actor(actor),
    )
    consumed = result["wine"]
    out: dict[str, Any] = {
        "status": "consumed",
        "wine": wine_public_summary(consumed),
        "event": result.get("event"),
        "replayed": result.get("replayed", False),
        "lastBottle": last_bottle and consumed["quantity"] == 0,
    }
    return out


def _best_zero_stock(store: WineStore, parsed: ParsedVoice) -> dict[str, Any] | None:
    ranked: list[tuple[float, dict[str, Any]]] = []
    for wine in store.list({}):
        if wine.get("quantity", 0) > 0:
            continue
        score = score_wine(parsed, wine_match_blob(wine))
        if score is not None and score > 0.05:
            ranked.append((score, wine))
    ranked.sort(key=lambda t: (-t[0], t[1]["id"]))
    if ranked and ranked[0][0] >= MATCH_MIN:
        second = ranked[1][0] if len(ranked) > 1 else 0.0
        if ranked[0][0] - second >= MATCH_MARGIN:
            return ranked[0][1]
    return None


def resolve_voice_pending(
    store: WineStore,
    pending_id: str,
    wine_id: str | None,
    *,
    actor: dict[str, Any] | None = None,
) -> dict[str, Any]:
    pending = store.voice_pending_get(pending_id)
    if pending is None:
        raise WineError(TARGET_NOT_FOUND)
    if wine_id is None:
        store.voice_pending_delete(pending_id)
        return {"status": "dismissed", "pendingId": pending_id}

    replay = store.voice_replay_consume(pending["sourceOperationId"])
    if replay is not None:
        store.voice_pending_delete(pending_id)
        replay["status"] = "consumed"
        return replay

    wine = store.get(wine_id)
    qty = pending["quantity"]
    if wine["quantity"] < qty:
        return {"status": "out_of_stock", "wine": wine_public_summary(wine)}
    last_bottle = wine["quantity"] == qty
    confirmed = qty > 1 or wine["quantity"] == 1
    reason = f"Hlas (potvrzení): {pending['rawText'][:180]}"
    result = store.consume(
        wine_id,
        qty,
        confirmed,
        pending["sourceOperationId"],
        reason,
        _voice_actor(actor),
    )
    store.voice_pending_delete(pending_id)
    consumed = result["wine"]
    return {
        "status": "consumed",
        "wine": wine_public_summary(consumed),
        "event": result.get("event"),
        "replayed": result.get("replayed", False),
        "lastBottle": last_bottle and consumed["quantity"] == 0,
    }


def new_voice_operation_id() -> str:
    return f"voice:{uuid.uuid4().hex}"


PENDING_FOLLOWUP_MAX_AGE_S = 30 * 60


def choose_latest_pending(
    store: WineStore,
    choice: int | None,
    *,
    actor: dict[str, Any] | None = None,
    max_age_s: int = PENDING_FOLLOWUP_MAX_AGE_S,
) -> dict[str, Any]:
    """Assist follow-up: pick candidate ``choice`` (1-based) of the newest pending, or dismiss.

    ``choice=None`` dismisses. Only pendings younger than ``max_age_s`` qualify, so a stray
    "to první" days later cannot write off a forgotten request (it stays in the UI queue).
    """
    pending = store.voice_pending_latest(max_age_s)
    if pending is None:
        return {"status": "no_pending"}
    if choice is None:
        return resolve_voice_pending(store, pending["id"], None, actor=actor)
    candidates = pending["candidates"]
    if not 1 <= choice <= len(candidates):
        return {"status": "bad_choice", "pendingId": pending["id"]}
    return resolve_voice_pending(store, pending["id"], candidates[choice - 1]["id"], actor=actor)
