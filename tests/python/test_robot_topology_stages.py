"""Roboti: unit tests per vectorisation stage + the 1 s budget (synthetic plans only).

Every fixture here is an invented floor plan; no real home geometry is ever used.
See docs/modules/robots-map.md for the pipeline these stages belong to.
"""

import math
import os
import random
import time

import pytest

from custom_components.homebrain.robots.topology import (
    MIN_POCKET_PX,
    MIN_REGION_PX,
    _kind,
    absorb_small_regions,
    build_topology,
    components,
    grid_angle,
    partition_floor,
    ring_area,
    simplify_arc,
    smooth_labels,
    trace_arcs,
)


def grid(width: int, height: int, rects: list[tuple[int, int, int, int, int]]) -> list[int]:
    """Row-major labels; ``rects`` = (label, x0, y0, x1, y1) half-open, later wins."""
    out = [0] * (width * height)
    for label, x0, y0, x1, y1 in rects:
        for y in range(y0, y1):
            for x in range(x0, x1):
                out[y * width + x] = label
    return out


def area(rings: list[list[tuple[float, float]]]) -> float:
    return sum(ring_area(r) for r in rings)


# --- stage 1: label clean-up ---------------------------------------------------------


def test_components_are_four_connected_and_flag_the_border() -> None:
    # Two blocks of label 1 touch only diagonally → two components; label 2 hits the edge.
    labels = grid(10, 6, [(1, 1, 1, 3, 3), (1, 3, 3, 5, 5), (2, 7, 0, 10, 6)])
    found = sorted((label, len(px), edge) for label, px, edge in components(labels, 10, 6))
    assert (1, 4, False) in found
    assert found.count((1, 4, False)) == 2
    assert (2, 18, True) in found


def test_small_islands_join_the_surrounding_room_and_big_pockets_stay_floor() -> None:
    w, h = 120, 80
    # Room 2 = a real room on the right + a detached 25 px speck inside room 1.
    labels = grid(w, h, [(1, 0, 0, 80, h), (2, 80, 0, w, h), (2, 10, 10, 15, 15)])
    out = absorb_small_regions(labels, w, h)
    assert 25 < MIN_REGION_PX
    assert out[12 * w + 12] == 1 and out[40 * w + 100] == 2
    # An enclosed unscanned pocket (label 0) below the pocket limit becomes room floor;
    # the unmapped outside (touching the grid edge) stays 0.
    labels = grid(w, h, [(1, 2, 2, w - 2, h - 2), (0, 40, 30, 60, 50)])
    assert 20 * 20 < MIN_POCKET_PX
    out = absorb_small_regions(labels, w, h)
    assert out[40 * w + 50] == 1 and out[0] == 0


def test_majority_filter_removes_one_pixel_spurs_but_keeps_corners() -> None:
    w, h = 30, 20
    labels = grid(w, h, [(1, 2, 2, 15, 18), (2, 15, 2, 28, 18)])
    labels[10 * w + 15] = labels[10 * w + 16] = 1  # 2 px spur of room 1 into room 2
    out = smooth_labels(labels, w, h)
    assert out[10 * w + 16] == 2  # the tip goes
    # Convex room corners survive the filter.
    assert out[2 * w + 2] == 1 and out[17 * w + 27] == 2


def test_partition_shares_wall_pixels_between_the_nearest_rooms() -> None:
    # Rooms 1 and 2 are separated by a 4 px wall band (floor mask, label 0).
    w, h = 40, 20
    labels = grid(w, h, [(1, 2, 2, 18, 18), (2, 22, 2, 38, 18)])
    floor = grid(w, h, [(1, 2, 2, 38, 18)])
    out = partition_floor(labels, floor, w, h)
    row = out[10 * w : 11 * w]
    assert row[18:20] == [1, 1] and row[20:22] == [2, 2]  # split in the middle of the wall


# --- stage 2: arcs ---------------------------------------------------------------------


def test_each_shared_boundary_is_one_arc_between_two_junction_nodes() -> None:
    labels = grid(52, 36, [(1, 2, 2, 30, 20), (2, 30, 2, 50, 20), (3, 2, 20, 50, 34)])
    arcs, _ = trace_arcs(labels, 52, 36)
    pairs = sorted(tuple(sorted((a.left, a.right))) for a in arcs)
    assert pairs.count((1, 2)) == 1 and pairs.count((1, 3)) == 1 and pairs.count((2, 3)) == 1
    # Arcs between rooms end on nodes where three labels meet (shared by all three arcs).
    inner = [a for a in arcs if a.left and a.right]
    nodes = [n for a in inner for n in (a.start, a.end)]
    assert any(nodes.count(n) >= 2 for n in nodes)


# --- stage 3: simplification + snapping -----------------------------------------------


def test_simplify_keeps_corners_and_drops_pixel_stairs() -> None:
    stairs = [(float(i // 2), float((i + 1) // 2)) for i in range(40)]  # 45° pixel staircase
    simple = simplify_arc(stairs, 2.0)
    assert simple[0] == stairs[0] and simple[-1] == stairs[-1]
    assert len(simple) <= 3
    rect = [(0.0, 0.0), (10.0, 0.0), (10.0, 6.0), (0.0, 6.0), (0.0, 0.0)]
    loop = simplify_arc(rect, 2.0)  # closed loops restart at a real corner
    assert loop[0] == loop[-1] and set(loop) == set(rect) and len(loop) == 5


@pytest.mark.parametrize("degrees", [0.0, 7.0, 23.0])
def test_grid_angle_finds_the_plan_rotation(degrees: float) -> None:
    w, h = 140, 140
    c, s = math.cos(math.radians(degrees)), math.sin(math.radians(degrees))
    labels = [0] * (w * h)
    for y in range(h):
        for x in range(w):
            u = (x - 70) * c + (y - 70) * s
            v = -(x - 70) * s + (y - 70) * c
            if abs(u) < 45 and abs(v) < 30:
                labels[y * w + x] = 1
    theta = grid_angle(labels, w, h)
    err = abs(math.degrees(theta) - degrees) % 90
    # The box-blur estimator keeps a small bias at shallow angles (~2.5° at 7°); snapping
    # (SNAP_DEG = 14°) tolerates it. Tighten this if the estimator improves.
    assert min(err, 90 - err) < 3.0


def test_snapped_plan_has_only_axis_or_true_diagonal_edges() -> None:
    labels, w, h = synthetic_flat(seed=3)
    topo = build_topology(labels, w, h)
    for rings in topo.rooms.values():
        for ring in rings:
            for a, b in zip(ring, ring[1:] + ring[:1], strict=True):
                kind = _kind(a, b)
                if kind == "d":  # a kept diagonal is a real 45° wall (bay window)
                    ang = math.degrees(math.atan2(abs(b[1] - a[1]), abs(b[0] - a[0])))
                    assert abs(ang - 45) <= 12.5
    assert math.isclose(sum(area(r) for r in topo.rooms.values()), area(topo.floor), rel_tol=1e-9)


# --- fixture + performance budget ---------------------------------------------------------


def synthetic_flat(seed: int = 1, k: int = 4) -> tuple[list[int], int, int]:
    """Invented 8-room flat (~12 × 9 m at 5 cm/px for k=4) with lidar-like edge jitter."""
    plan = [  # label, x0, y0, x1, y1 in metres×10
        (1, 0, 0, 52, 40),  # living room
        (2, 52, 0, 90, 30),  # kitchen
        (3, 52, 30, 90, 56),  # dining
        (4, 0, 40, 52, 56),  # hall
        (5, 0, 56, 18, 76),  # wc
        (6, 18, 56, 42, 76),  # bathroom
        (7, 42, 56, 66, 76),  # utility
        (8, 66, 56, 90, 76),  # wardrobe
    ]
    rng = random.Random(seed)
    w, h = 90 * k // 1 + 8, 76 * k + 8
    labels = [0] * (w * h)
    for label, x0, y0, x1, y1 in plan:
        for y in range(y0 * k, y1 * k):
            for x in range(x0 * k, x1 * k):
                labels[(y + 4) * w + x + 4] = label
    # Jitter: flip ~3 % of boundary pixels to a neighbour's label (scan noise).
    for i in range(w, w * (h - 1)):
        if labels[i] and labels[i + 1] != labels[i] and rng.random() < 0.03:
            labels[i] = labels[i + 1]
    return labels, w, h


def test_rooms_tile_the_outline_on_the_synthetic_flat() -> None:
    labels, w, h = synthetic_flat()
    topo = build_topology(labels, w, h)
    assert sorted(topo.rooms) == list(range(1, 9))
    assert math.isclose(sum(area(r) for r in topo.rooms.values()), area(topo.floor), rel_tol=1e-9)
    # A rectangle-ish room ends up with few vertices (no pixel stairs left).
    assert all(len(ring) <= 12 for ring in topo.rooms[6])


def test_vectorisation_stays_within_one_second_on_the_synthetic_flat() -> None:
    # Budget: 1 s CPU on the dev host for a full-size plan (k=5 → ~460 × 390 px). CI
    # runners are slower and noisy, so CI gets HB_PERF_FACTOR headroom (default 3×).
    labels, w, h = synthetic_flat(seed=2, k=5)
    factor = float(os.environ.get("HB_PERF_FACTOR", "3" if os.environ.get("CI") else "1"))
    start = time.process_time()
    topo = build_topology(labels, w, h)
    took = time.process_time() - start
    assert topo.rooms
    assert took < 1.0 * factor, f"vectorisation took {took:.2f} s"
