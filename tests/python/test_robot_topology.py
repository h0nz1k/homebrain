"""Roboti: planar room topology (synthetic, invented floor plans only)."""

import math
import random

from custom_components.homebrain.robots.topology import (
    JOG_PX,
    _kind,
    absorb_small_regions,
    assemble,
    build_topology,
    ring_area,
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


def flat_area(rings: list[list[tuple[float, float]]]) -> float:
    return sum(ring_area(r) for r in rings)


HOUSE = [  # three rooms sharing walls + a T-junction
    (1, 2, 2, 30, 20),
    (2, 30, 2, 50, 20),
    (3, 2, 20, 50, 34),
]


def test_arcs_cover_every_boundary_once_and_rooms_tile() -> None:
    labels = grid(52, 36, HOUSE)
    arcs, _ = trace_arcs(labels, 52, 36)
    rooms, floor = assemble(arcs)
    # Exact pixel areas before any simplification.
    assert flat_area(rooms[1]) == 28 * 18
    assert flat_area(rooms[2]) == 20 * 18
    assert flat_area(rooms[3]) == 48 * 14
    assert flat_area(floor) == sum(flat_area(r) for r in rooms.values())


def test_rectangular_rooms_become_four_corner_polygons() -> None:
    topo = build_topology(grid(52, 36, HOUSE), 52, 36)
    for label in (1, 2):
        (ring,) = topo.rooms[label]
        assert len(ring) == 4
    # Room 3 has a T-junction node on its lower edge: 5 points, one of them collinear.
    (ring3,) = topo.rooms[3]
    assert len(ring3) in (4, 5)
    for ring in [r for rings in topo.rooms.values() for r in rings]:
        for a, b in zip(ring, ring[1:] + ring[:1], strict=True):
            assert abs(a[0] - b[0]) < 1e-6 or abs(a[1] - b[1]) < 1e-6  # axis-aligned


def _noisy_house(seed: int) -> list[int]:
    rnd = random.Random(seed)
    width, height = 52, 36
    labels = grid(width, height, HOUSE)
    # 1-pixel bumps and dents along every boundary (pixel noise of a lidar map).
    for _ in range(120):
        x, y = rnd.randrange(1, width - 1), rnd.randrange(1, height - 1)
        i = y * width + x
        neighbours = {labels[i - 1], labels[i + 1], labels[i - width], labels[i + width]}
        if len(neighbours | {labels[i]}) > 1:
            labels[i] = rnd.choice(sorted(neighbours))
    return labels


def test_shared_edges_tile_without_gaps_or_overlaps_after_simplification() -> None:
    for seed in range(5):
        topo = build_topology(_noisy_house(seed), 52, 36)
        total = sum(flat_area(r) for r in topo.rooms.values())
        # Arcs are shared, so the rooms sum to the floor outline exactly (no slivers).
        assert math.isclose(total, flat_area(topo.floor), abs_tol=1e-6)
        assert abs(total - 48 * 32) < 48 * 32 * 0.03
        # Every divider is used by exactly two rooms (once each way).
        for arc in topo.arcs:
            assert arc.left != arc.right


def test_noise_is_straightened() -> None:
    topo = build_topology(_noisy_house(7), 52, 36)
    for label in (1, 2):
        assert sum(len(r) for r in topo.rooms[label]) <= 6
    assert all(len(line) <= 4 for line in topo.dividers)


def test_small_specks_and_pockets_join_their_surroundings() -> None:
    labels = grid(40, 30, [(1, 2, 2, 38, 28), (0, 20, 20, 24, 24)])
    big2 = grid(40, 30, [(2, 30, 2, 38, 10)])
    labels = [b or a for a, b in zip(labels, big2, strict=True)]
    labels[11 * 40 + 11] = 2  # detached speck of room 2
    out = absorb_small_regions(labels, 40, 30)
    assert out[11 * 40 + 11] == 1
    assert out[21 * 40 + 21] == 1  # enclosed 4×4 pocket filled
    topo = build_topology(labels, 40, 30)
    assert len(topo.rooms[1]) == 1  # no hole left
    assert len(topo.floor) == 1


def test_rotated_map_snaps_to_its_own_axes() -> None:
    width = height = 80
    theta = math.radians(20)
    c, s = math.cos(theta), math.sin(theta)
    labels = [0] * (width * height)
    for y in range(height):
        for x in range(width):
            u = (x - 40) * c + (y - 40) * s
            v = -(x - 40) * s + (y - 40) * c
            if -25 <= u < 25 and -15 <= v < 15:
                labels[y * width + x] = 1 if u < 0 else 2
    topo = build_topology(labels, width, height)
    assert abs(math.degrees(topo.theta) - 20) < 1.5
    for ring in topo.rooms[1] + topo.rooms[2]:
        assert len(ring) <= 6
    assert math.isclose(
        sum(flat_area(r) for r in topo.rooms.values()), flat_area(topo.floor), abs_tol=1e-6
    )


def test_map_change_rebuilds_from_new_labels() -> None:
    """Re-segmented map (room 2 split into 2 + 4, room 3 renumbered 5): no stale geometry."""
    before = build_topology(grid(52, 36, HOUSE), 52, 36)
    after_rects = [(1, 2, 2, 30, 20), (2, 30, 2, 50, 11), (4, 30, 11, 50, 20), (5, 2, 20, 50, 34)]
    after = build_topology(grid(52, 36, after_rects), 52, 36)
    assert sorted(before.rooms) == [1, 2, 3]
    assert sorted(after.rooms) == [1, 2, 4, 5]
    assert math.isclose(
        flat_area(after.rooms[2]) + flat_area(after.rooms[4]), flat_area(before.rooms[2])
    )
    assert math.isclose(flat_area(after.floor), flat_area(before.floor))
    assert len(after.dividers) > len(before.dividers)


def test_walls_between_rooms_become_one_shared_divider() -> None:
    """Rooms separated by a 2-px wall (floor, not room) meet in the middle: no double wall."""
    width, height = 44, 24
    labels = grid(width, height, [(1, 2, 2, 20, 22), (2, 22, 2, 42, 22)])
    floor = grid(width, height, [(1, 1, 1, 43, 23)])  # walls all around + the seam
    topo = build_topology(labels, width, height, floor=floor)
    assert len(topo.floor) == 1
    assert len(topo.dividers) == 1
    (divider,) = topo.dividers
    assert {round(x) for x, _ in divider} == {21}
    assert math.isclose(flat_area(topo.floor), 42 * 22)


def test_regularize_turns_chamfers_into_corners_and_flattens_jogs() -> None:
    from custom_components.homebrain.robots.topology import regularize

    chamfer = [(0.0, 0.0), (10.0, 0.0), (13.0, 3.0), (13.0, 12.0)]
    assert regularize(chamfer) == [(0.0, 0.0), (13.0, 0.0), (13.0, 12.0)]
    jog = [(0.0, 0.0), (10.0, 0.0), (10.0, 1.5), (14.0, 1.5), (14.0, 9.0)]
    assert regularize(jog) == [(0.0, 0.0), (14.0, 0.0), (14.0, 9.0)]


def axis_segments(rings: list[list[tuple[float, float]]]) -> list[tuple[str, float]]:
    out = []
    for ring in rings:
        for a, b in zip(ring, ring[1:] + ring[:1], strict=True):
            out.append((_kind(a, b), math.dist(a, b)))
    return out


def test_step_at_a_junction_node_is_flattened() -> None:
    # Room 2's top wall sits 3 px (15 cm) above room 1's, exactly where their divider meets
    # the outline: no single arc owns that step, only the junction-aware pass removes it.
    labels = grid(44, 30, [(1, 2, 2, 22, 20), (2, 22, 2, 42, 23)])
    topo = build_topology(labels, 44, 30)
    top1 = max(y for x, y in topo.rooms[1][0])
    top2 = max(y for x, y in topo.rooms[2][0])
    assert top1 == top2
    for rings in topo.rooms.values():
        assert all(kind == "d" or length >= JOG_PX for kind, length in axis_segments(rings))
    assert math.isclose(
        sum(flat_area(r) for r in topo.rooms.values()), flat_area(topo.floor), rel_tol=1e-9
    )


def test_diagonal_room_seam_becomes_an_axis_corner() -> None:
    # Segmentation cut two rooms along a ~18° staircase: seams are not walls → right angles.
    width, height = 60, 40
    labels = [0] * (width * height)
    for y in range(2, 38):
        for x in range(2, 58):
            labels[y * width + x] = 1 if x < 24 + (y - 2) // 3 else 2
    topo = build_topology(labels, width, height)
    assert topo.dividers
    for seam in topo.dividers:
        assert all(_kind(a, b) in "hv" for a, b in zip(seam, seam[1:], strict=False))
    assert math.isclose(
        sum(flat_area(r) for r in topo.rooms.values()), flat_area(topo.floor), rel_tol=1e-9
    )
