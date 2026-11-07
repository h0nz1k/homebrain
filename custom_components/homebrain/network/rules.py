"""Problem rules of the Síť module (pure functions over a network snapshot).

Every rule returns ``Problem`` dicts with Czech copy: ``title`` (what), ``context`` (where/how
long) and ``fix`` („Co s tím“). Times are epoch seconds. Severity order: critical > warning >
notice > info; notice/info are shown as tips.
"""

from __future__ import annotations

from collections.abc import Callable, Iterable
from statistics import median
from typing import Any, Final

Snapshot = dict[str, Any]
Problem = dict[str, Any]

SEVERITY_ORDER: Final = {"critical": 0, "warning": 1, "notice": 2, "info": 3}
PROBLEM_SEVERITIES: Final = frozenset({"critical", "warning"})

INTERNET_DOWN_AFTER_S: Final = 120
INTERNET_LATENCY_MS: Final = 150.0
INTERNET_JITTER_MS: Final = 50.0
INTERNET_LOSS_PCT: Final = 2.0
AP_OFFLINE_AFTER_S: Final = 180
FLAPS_WARNING: Final = 3
FLAPS_CRITICAL: Final = 6
CPU_PCT: Final = 85.0
IMBALANCE_MIN_CLIENTS: Final = 12
POE_NOTICE: Final = 0.8
POE_WARNING: Final = 0.95
IMPORTANT_OFFLINE_AFTER_S: Final = 600
WRONG_AP_AFTER_S: Final = 900
# V2 (own read-only UniFi account)
MESH_WEAK_DBM: Final = -65
IMPORTANT_WEAK_DBM: Final = -75
PORT_FLAPS_24H: Final = 3
CONGESTED_PCT: Final = 60
CONGESTED_SELF_PCT: Final = 20


def _problem(
    rule: str,
    severity: str,
    target: tuple[str, str],
    title: str,
    context: str,
    fix: str,
    since: float | None = None,
    important: bool = False,
    actions: list[dict[str, str]] | None = None,
    source: str = "v1",
) -> Problem:
    return {
        "id": f"{rule}:{target[1]}",
        "rule": rule,
        "severity": severity,
        "target": {"kind": target[0], "id": target[1]},
        "title": title,
        "context": context,
        "fix": fix,
        "since": since,
        "important": important,
        "actions": actions or [],
        "source": source,
    }


def _minutes(seconds: float) -> str:
    minutes = max(1, int(seconds // 60))
    if minutes < 60:
        return f"{minutes} min"
    hours, rest = divmod(minutes, 60)
    return f"{hours} h {rest} min" if rest else f"{hours} h"


def _speed(mbps: int) -> str:
    if mbps < 1000:
        return f"{mbps} Mb/s"
    gbps = mbps / 1000
    return f"{gbps:g}".replace(".", ",") + " Gb/s"


def _times(n: int) -> str:
    return f"{n}×"


def internet_rules(snap: Snapshot, now: float) -> list[Problem]:
    net = snap.get("internet")
    if not net:
        return []
    since = net.get("since")
    if net.get("online") is False:
        if since is not None and now - since < INTERNET_DOWN_AFTER_S:
            return []
        return [
            _problem(
                "internet_down",
                "critical",
                ("internet", "internet"),
                "Internet nefunguje",
                f"Bez připojení {_minutes(now - since)}." if since else "Bez připojení.",
                "Restartujte router a optický převodník (ONT). Když výpadek trvá přes 15 min, "
                "volejte poruchovou linku poskytovatele.",
                since,
            )
        ]
    lat, jit, loss = net.get("latency_ms"), net.get("jitter_ms"), net.get("loss_pct")
    bad = []
    if lat is not None and lat > INTERNET_LATENCY_MS:
        bad.append(f"odezva {round(lat)} ms")
    if jit is not None and jit > INTERNET_JITTER_MS:
        bad.append(f"kolísání {round(jit)} ms")
    if loss is not None and loss > INTERNET_LOSS_PCT:
        bad.append(f"ztráta {round(loss, 1)} %")
    if not bad:
        return []
    return [
        _problem(
            "internet_degraded",
            "warning",
            ("internet", "internet"),
            "Internet je pomalý",
            "Teď: " + ", ".join(bad) + ".",
            "Zjistěte, kdo právě stahuje nebo zálohuje. Když to trvá, restartujte router.",
        )
    ]


def _uplink_hint(ap: dict[str, Any]) -> str:
    up = ap.get("uplink") or {}
    if up.get("name") and up.get("port"):
        return f"na switchi {up['name']}, port {up['port']}"
    if up.get("name"):
        return f"na switchi {up['name']}"
    return "u napájení"


def ap_rules(snap: Snapshot, now: float) -> list[Problem]:
    out: list[Problem] = []
    for ap in snap.get("aps", []):
        target = ("ap", ap["id"])
        since = ap.get("state_since")
        if ap.get("state") not in (None, "connected"):
            if since is None or now - since >= AP_OFFLINE_AFTER_S:
                dur = f" {_minutes(now - since)}" if since else ""
                out.append(
                    _problem(
                        "ap_offline",
                        "critical",
                        target,
                        f"{ap['name']} je offline",
                        f"Wi-Fi bod nekomunikuje{dur}; klienti přešli jinam.",
                        f"Zkontrolujte kabel a PoE {_uplink_hint(ap)}. "
                        "Pomůže vytažení a zasunutí kabelu (restart napájení).",
                        since,
                        actions=[{"label": "Detail AP", "route": f"ap/{ap['id']}"}],
                    )
                )
            continue
        flaps = ap.get("flaps_24h") or 0
        if flaps >= FLAPS_WARNING:
            out.append(
                _problem(
                    "ap_flapping",
                    "critical" if flaps >= FLAPS_CRITICAL else "warning",
                    target,
                    f"{ap['name']} vypadává",
                    f"{_times(flaps)} odpojeno za 24 h.",
                    f"Zkontrolujte kabel a PoE {_uplink_hint(ap)}. Když výpadky trvají, "
                    "přesuňte AP na port s rezervou.",
                    actions=[{"label": "Detail AP", "route": f"ap/{ap['id']}"}],
                )
            )
        if (
            not ap.get("uplink")
            and ap.get("mesh_capable", True)
            and ap.get("uplink_known") is False
        ):
            out.append(
                _problem(
                    "uplink_missing",
                    "info",
                    target,
                    f"{ap['name']} bez kabelu (mesh)",
                    "Bod se připojuje bezdrátově přes jiný bod.",
                    "Mesh je pomalejší a citlivější na rušení; když to jde, přiveďte k bodu kabel.",
                )
            )
    return out


def load_rules(snap: Snapshot, now: float) -> list[Problem]:
    out: list[Problem] = []
    for dev in [*snap.get("aps", []), *snap.get("switches", [])]:
        if dev.get("state") not in (None, "connected"):
            continue
        kind = "ap" if dev in snap.get("aps", []) else "switch"
        cpu, mem = dev.get("cpu_pct"), dev.get("mem_pct")
        if cpu is not None and cpu > CPU_PCT:
            out.append(
                _problem(
                    "device_high_cpu",
                    "warning",
                    (kind, dev["id"]),
                    f"{dev['name']} je přetížený",
                    f"Procesor {round(cpu)} %.",
                    "Restartujte zařízení v noci. Opakuje se to? Zkontrolujte kanály a rušení.",
                )
            )
        threshold = dev.get("mem_threshold") or 90.0
        if mem is not None and mem > threshold:
            out.append(
                _problem(
                    "device_high_mem",
                    "notice",
                    (kind, dev["id"]),
                    f"{dev['name']}: plná paměť",
                    f"Paměť {round(mem)} % (běžně do {round(threshold)} %).",
                    "Restartujte zařízení v noci, kdy nikomu nevadí krátký výpadek.",
                )
            )
    return out


def imbalance_rules(snap: Snapshot, now: float) -> list[Problem]:
    aps = [a for a in snap.get("aps", []) if a.get("state") in (None, "connected")]
    counts = [a.get("clients") or 0 for a in aps]
    if len(aps) < 2:
        return []
    med = median(counts)
    out = []
    for ap in aps:
        n = ap.get("clients") or 0
        if n < IMBALANCE_MIN_CLIENTS or n < 2 * med:
            continue
        idle = [
            o
            for o in aps
            if o is not ap
            and o.get("floor_id") == ap.get("floor_id")
            and (o.get("clients") or 0) < 0.3 * n
        ]
        if not idle:
            continue
        out.append(
            _problem(
                "client_imbalance",
                "notice",
                ("ap", ap["id"]),
                f"{ap['name']} má většinu klientů",
                f"{n} zařízení, {idle[0]['name']} na stejném patře "
                f"jen {idle[0].get('clients') or 0}.",
                f"Snižte vysílací výkon {ap['name']} nebo zapněte band steering, "
                "ať se zařízení rozloží.",
            )
        )
    return out


def poe_rules(snap: Snapshot, now: float) -> list[Problem]:
    out = []
    for sw in snap.get("switches", []):
        poe = sw.get("poe") or {}
        used, budget = poe.get("used_w"), poe.get("budget_w")
        if not used or not budget:
            continue
        ratio = used / budget
        if ratio < POE_NOTICE:
            continue
        spare = [
            o
            for o in snap.get("switches", [])
            if o is not sw and (o.get("poe") or {}).get("budget_w")
        ]
        hint = ""
        if spare:
            best = max(spare, key=lambda o: o["poe"]["budget_w"] - (o["poe"].get("used_w") or 0))
            free = best["poe"]["budget_w"] - (best["poe"].get("used_w") or 0)
            hint = f" do {best['name']} (zbývá {round(free)} W)"
        out.append(
            _problem(
                "poe_near_budget",
                "warning" if ratio >= POE_WARNING else "notice",
                ("switch", sw["id"]),
                f"PoE na {sw['name']} je na {round(ratio * 100)} %",
                f"{round(used, 1)} W z {round(budget)} W.",
                f"Nové PoE zařízení zapojte{hint or ' do switche s rezervou'}.",
            )
        )
    return out


def port_rules(snap: Snapshot, now: float) -> list[Problem]:
    out = []
    for sw in [*snap.get("switches", []), *snap.get("aps", [])]:
        cap = sw.get("max_link_mbps") or 1000
        for port in sw.get("ports", []):
            if port.get("speed_mbps") != 100 or cap <= 100:
                continue
            powered = bool(port.get("poe_w"))
            out.append(
                _problem(
                    "port_slow",
                    "warning" if powered else "notice",
                    ("port", f"{sw['id']}:{port['n']}"),
                    f"{sw['name']}, port {port['n']}: jen 100 Mb/s",
                    f"Port umí {_speed(cap)}, linka jede jen na zlomek.",
                    "Vyměňte patch kabel nebo zkontrolujte konektor; "
                    "100 Mb/s bývá vadný pár v kabelu.",
                )
            )
    return out


def firmware_rules(snap: Snapshot, now: float) -> list[Problem]:
    pending = [
        d
        for d in [*snap.get("aps", []), *snap.get("switches", [])]
        if (d.get("fw") or {}).get("update")
    ]
    if not pending:
        return []
    names = ", ".join(d["name"] for d in pending[:3]) + ("…" if len(pending) > 3 else "")
    n = len(pending)
    noun = "přístroj" if n == 1 else "přístroje" if n < 5 else "přístrojů"
    return [
        _problem(
            "firmware_available",
            "info",
            ("firmware", "all"),
            f"Firmware pro {n} {noun}",
            names + ".",
            "Aktualizujte v noci v UniFi; Wi-Fi bod se na ~2 min odpojí.",
        )
    ]


def important_rules(snap: Snapshot, now: float) -> list[Problem]:
    out = []
    aps = {a["id"]: a for a in snap.get("aps", [])}
    floors = {f["id"]: f["name"] for f in snap.get("floors", [])}
    for c in snap.get("clients", []):
        if not c.get("important"):
            continue
        target = ("client", c["id"])
        since = c.get("since")
        if not c.get("online"):
            if since is not None and now - since < IMPORTANT_OFFLINE_AFTER_S:
                continue
            out.append(
                _problem(
                    "important_offline",
                    "warning",
                    target,
                    f"{c['label']} je offline",
                    f"Mimo síť {_minutes(now - since)}." if since else "Mimo síť.",
                    "Zkontrolujte napájení zařízení a vypněte/zapněte na něm Wi-Fi.",
                    since,
                    important=True,
                )
            )
            continue
        expected = c.get("expected_floor_id")
        ap = aps.get(c.get("ap_id") or "")
        if not expected or not ap or ap.get("floor_id") == expected:
            continue
        ap_since = c.get("ap_since")
        if ap_since is not None and now - ap_since < WRONG_AP_AFTER_S:
            continue
        here = floors.get(ap.get("floor_id") or "", "jiné patro")
        want = floors.get(expected, "jeho patro")
        out.append(
            _problem(
                "important_wrong_ap",
                "warning",
                target,
                f"{c['label']} drží vzdálený bod",
                f"Připojený na {ap['name']} – {here}, očekávané patro: {want}"
                + (f", {_minutes(now - ap_since)}." if ap_since else "."),
                "Vypněte a zapněte Wi-Fi na zařízení. "
                "Opakuje se to? Povolte rychlý roaming (802.11r).",
                ap_since,
                important=True,
            )
        )
    return out


def _dbm(value: int) -> str:
    return f"{value} dBm".replace("-", "\u2212")


def mesh_rules(snap: Snapshot, now: float) -> list[Problem]:
    out = []
    for ap in snap.get("aps", []):
        link = ap.get("link") or {}
        signal = link.get("signal_dbm")
        if link.get("type") != "mesh" or signal is None or signal >= MESH_WEAK_DBM:
            continue
        parent = (ap.get("uplink") or {}).get("name") or "nadřazený AP"
        out.append(
            _problem(
                "mesh_weak",
                "warning",
                ("ap", ap["id"]),
                f"{ap['name']}: slabý bezdrátový spoj",
                f"Mesh spoj na {parent} má {_dbm(signal)} (stabilní je od {_dbm(-60)}).",
                "Posuňte AP blíž k rodiči nebo mezi ně nedávejte zdi a kov; nejlépe ho "
                "připojte kabelem. Kanál 5 GHz rodiče nastavte pevně mimo DFS.",
                source="v2",
            )
        )
    return out


def signal_rules(snap: Snapshot, now: float) -> list[Problem]:
    aps = {a["id"]: a["name"] for a in snap.get("aps", [])}
    out = []
    for c in snap.get("clients", []):
        signal = c.get("signal_dbm")
        if not c.get("important") or not c.get("online") or c.get("wired"):
            continue
        if signal is None or signal >= IMPORTANT_WEAK_DBM:
            continue
        where = aps.get(c.get("ap_id") or "")
        out.append(
            _problem(
                "important_weak_signal",
                "warning",
                ("client", c["id"]),
                f"{c['label']}: slabý signál Wi-Fi",
                f"{_dbm(signal)}" + (f" na {where}" if where else "") + " – hrozí výpadky.",
                "Přesuňte zařízení blíž k Wi-Fi bodu nebo přidejte AP; pevně umístěné "
                "zařízení raději připojte kabelem.",
                important=True,
                source="v2",
            )
        )
    return out


def flapping_port_rules(snap: Snapshot, now: float) -> list[Problem]:
    out = []
    for dev in [*snap.get("switches", []), *snap.get("aps", [])]:
        for port in dev.get("ports", []):
            drops = port.get("link_down_24h")
            if drops is None or drops < PORT_FLAPS_24H:
                continue
            out.append(
                _problem(
                    "port_flapping",
                    "warning",
                    ("port", f"{dev['id']}:{port['n']}"),
                    f"{dev['name']}, port {port['n']}: linka padá",
                    f"Za posledních 24 h spojení spadlo {_times(drops)}.",
                    "Zkontrolujte kabel a konektory na obou koncích; opakované výpadky dělá "
                    "vadný kabel, uvolněný konektor nebo slabé napájení PoE.",
                    source="v2",
                )
            )
    return out


def channel_rules(snap: Snapshot, now: float) -> list[Problem]:
    out = []
    for ap in snap.get("aps", []):
        for r in ap.get("radios") or []:
            total, own = r.get("utilization_pct"), r.get("self_pct")
            if total is None or own is None:
                continue
            if total < CONGESTED_PCT or own >= CONGESTED_SELF_PCT:
                continue
            band = r["band"].replace(".", ",")
            out.append(
                _problem(
                    "channel_congested",
                    "warning",
                    ("radio", f"{ap['id']}:{r['band']}"),
                    f"{ap['name']}: rušený kanál {r['channel']} ({band} GHz)",
                    f"Kanál je vytížený na {total} %, vlastní provoz z toho jen {own} % – "
                    "zbytek jsou sousední sítě nebo rušení.",
                    "V UniFi zvolte pro toto rádio jiný kanál (5 GHz: 36–48 nebo 149+, "
                    "ve 2,4 GHz jen 1, 6 nebo 11), případně užší šířku pásma.",
                    source="v2",
                )
            )
    return out


def _mesh_pair(a: dict[str, Any], b: dict[str, Any]) -> bool:
    def child_of(child: dict[str, Any], parent: dict[str, Any]) -> bool:
        return (child.get("link") or {}).get("type") == "mesh" and (child.get("uplink") or {}).get(
            "id"
        ) == parent["id"]

    return child_of(a, b) or child_of(b, a)


def same_channel_rules(snap: Snapshot, now: float) -> list[Problem]:
    by_channel: dict[int, list[dict[str, Any]]] = {}
    for ap in snap.get("aps", []):
        for r in ap.get("radios") or []:
            if r.get("band") == "5" and r.get("channel"):
                by_channel.setdefault(r["channel"], []).append(ap)
    out = []
    for channel, aps in sorted(by_channel.items()):
        clash = {
            x["id"]: x
            for i, a in enumerate(aps)
            for b in aps[i + 1 :]
            if not _mesh_pair(a, b)
            for x in (a, b)
        }
        if not clash:
            continue
        names = sorted(x["name"] for x in clash.values())
        out.append(
            _problem(
                "same_channel_neighbors",
                "notice",
                ("channel", f"5:{channel}"),
                f"{len(names)} Wi-Fi body na stejném kanálu {channel} (5 GHz)",
                ", ".join(names[:-1]) + f" a {names[-1]} si navzájem berou vysílací čas.",
                "Dejte sousedním AP různé kanály 5 GHz (např. 36, 44, 149); mesh AP musí "
                "zůstat na kanálu svého rodiče.",
                source="v2",
            )
        )
    return out


RULES: Final[tuple[Callable[[Snapshot, float], list[Problem]], ...]] = (
    internet_rules,
    ap_rules,
    load_rules,
    imbalance_rules,
    poe_rules,
    port_rules,
    firmware_rules,
    important_rules,
    mesh_rules,
    signal_rules,
    flapping_port_rules,
    channel_rules,
    same_channel_rules,
)


def sort_problems(problems: Iterable[Problem]) -> list[Problem]:
    return sorted(
        problems,
        key=lambda p: (
            SEVERITY_ORDER.get(p["severity"], 9),
            not p.get("important"),
            p.get("since") if p.get("since") is not None else float("inf"),
        ),
    )


def evaluate(snap: Snapshot, now: float) -> list[Problem]:
    """All problems of a snapshot, most important first."""
    return sort_problems(p for rule in RULES for p in rule(snap, now))


def summary(snap: Snapshot, problems: list[Problem]) -> dict[str, Any]:
    """Role-safe summary for adults and the kiosk: no device list, no names of clients."""
    serious = [p for p in problems if p["severity"] in PROBLEM_SEVERITIES]
    tips = [p for p in problems if p["severity"] not in PROBLEM_SEVERITIES]
    top = serious[0] if serious else None
    internet = snap.get("internet") or {}
    return {
        "status": "problem" if top else "ok",
        "headline": top["title"] if top else "Síť v pořádku",
        "severity": top["severity"] if top else None,
        "problems_count": len(serious),
        "tips_count": len(tips),
        "internet_online": internet.get("online") if internet else None,
        "updated_at": snap.get("updated_at"),
    }
