"""Vectoriser for the robot map raster (contours.py): straight walls from pixel stairs."""

from __future__ import annotations

import numpy as np

from custom_components.homebrain.robots.contours import area, close_mask, simplify, snap, trace


def test_trace_gives_outer_loop_and_hole_with_opposite_orientation():
    mask = np.zeros((8, 8), dtype=bool)
    mask[1:7, 1:7] = True
    mask[3:5, 3:5] = False
    loops = sorted(trace(np, mask), key=lambda lp: -abs(area(lp)))
    assert [area(lp) for lp in loops] == [36.0, -4.0]


def test_simplify_and_snap_straighten_a_one_pixel_wobble():
    mask = np.zeros((12, 40), dtype=bool)
    mask[2:10, 2:38] = True
    mask[1, 15:22] = True  # 1 px bump on the top wall (scan noise)
    (loop,) = trace(np, mask)
    pts = snap(simplify(loop, 1.3))
    assert len(pts) == 4
    xs = sorted({round(x, 3) for x, _ in pts})
    ys = sorted({round(y, 3) for _, y in pts})
    assert len(xs) == 2 and len(ys) == 2  # axis-aligned rectangle again


def test_close_mask_bridges_a_one_pixel_gap():
    wall = np.zeros((5, 9), dtype=bool)
    wall[:, :4] = True
    wall[:, 5:] = True
    assert close_mask(np, wall)[1:4, 4].all()
