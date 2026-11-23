// Scene setup inspired by t90-map-card (MIT), https://github.com/gdelagardelle/t90-map-card.
import {
  BoxGeometry,
  Color,
  CylinderGeometry,
  InstancedMesh,
  Mesh,
  MeshBasicMaterial,
  Object3D,
  Raycaster,
  Scene,
  Vector2,
  Vector3,
  WebGLRenderer,
} from 'three';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js';
import { clipTrail, segmentGuard, type MapRotation, type VectorMap } from '../../map/geometry.js';
import {
  easeTravel,
  glideDuration,
  pathPoints,
  planGlide,
  pointAt,
  type Pt,
} from '../../map/motion.js';
import { dockPose, trailLayers, type MarkerTone, type TrailMode } from '../VectorMap.js';
import { createCamera, type CameraView } from './camera.js';
import { planGeometry, roomSlab, wallSegments, WALL_HEIGHT, WALL_WIDTH } from './geometry.js';

type ScreenBox = { left: number; right: number; top: number; bottom: number };

function overlaps(a: ScreenBox, b: ScreenBox) {
  return (
    a.left < b.right + 3 && a.right + 3 > b.left && a.top < b.bottom + 3 && a.bottom + 3 > b.top
  );
}

function lineGeometry(runs: Pt[][], y: number, closed = false) {
  return new LineSegmentsGeometry().setPositions(
    runs.flatMap((run) =>
      run.flatMap(([x, z], i) => {
        const next = run[i + 1] ?? (closed ? run[0] : undefined);
        return next ? [x, y, z, next[0], y, next[1]] : [];
      }),
    ),
  );
}

type MarkerMotion = { track: Pt[]; start: number; duration: number; heading: number | null };

export function createScene(
  viewport: HTMLDivElement,
  map: VectorMap,
  rotation: MapRotation,
  onToggle: (id: number) => void,
  onUnavailable: () => void,
) {
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('webgl2', { antialias: true, alpha: true });
  if (!context) return null;
  const renderer = new WebGLRenderer({ canvas, context, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  canvas.setAttribute('aria-hidden', 'true');

  const scene = new Scene();
  const layout = planGeometry(map, rotation);
  const unit = Math.max(layout.frame.width, layout.frame.height) / 100;
  const rings = layout.rooms.map((room) => room.rings);
  const guard = segmentGuard(rings, layout.walls, unit * 0.4);
  const selectionInk = new LineMaterial({ linewidth: 2.4, alphaToCoverage: true });
  const liveInk = new LineMaterial({
    linewidth: 1.8,
    alphaToCoverage: true,
    dashed: true,
    dashSize: unit * 1.7,
    gapSize: unit,
  });
  const rooms = layout.rooms.map((room) => {
    const skin = new MeshBasicMaterial();
    const mesh = new Mesh(roomSlab(room.rings), skin);
    const outline = lineGeometry(room.rings, 8, true);
    const selected = new LineSegments2(outline, selectionInk);
    const live = new LineSegments2(outline, liveInk).computeLineDistances();
    live.position.y = 5;
    scene.add(mesh, selected, live);
    const labelElement = viewport.querySelector<HTMLElement>(`[data-map3d-room="${room.id}"]`)!;
    return { ...room, mesh, skin, selected, live, labelElement, priority: 0 };
  });
  const walls = wallSegments(layout.walls, WALL_WIDTH * 1.8);
  const wallSide = new MeshBasicMaterial();
  const wallCap = new MeshBasicMaterial({
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  });
  const wallMesh = new InstancedMesh(
    new BoxGeometry(1, 1, 1),
    [wallSide, wallSide, wallCap, wallSide, wallSide, wallSide],
    walls.length,
  );
  const joints = new Map<string, { x: number; z: number; count: number }>();
  const wall = new Object3D();
  const floor = layout.floor.map(([x, z]) => new Vector3(x, 0, z));
  const structure = [...floor];
  walls.forEach(({ x, z, length, angle, ends }, index) => {
    wall.position.set(x, WALL_HEIGHT / 2, z);
    wall.scale.set(length, WALL_HEIGHT, WALL_WIDTH);
    wall.rotation.y = angle;
    wall.updateMatrix();
    wallMesh.setMatrixAt(index, wall.matrix);
    for (const [ex, ez] of ends) {
      const key = `${ex}:${ez}`;
      const joint = joints.get(key) ?? { x: ex, z: ez, count: 0 };
      joint.count++;
      joints.set(key, joint);
      structure.push(new Vector3(ex, WALL_HEIGHT, ez));
    }
  });
  const junctions = [...joints.values()].filter(({ count }) => count > 1);
  const jointMesh = new InstancedMesh(
    new CylinderGeometry(WALL_WIDTH / 2, WALL_WIDTH / 2, WALL_HEIGHT, 8),
    [wallSide, wallCap, wallSide],
    junctions.length,
  );
  junctions.forEach(({ x, z }, index) => {
    wall.position.set(x, WALL_HEIGHT / 2, z);
    wall.scale.setScalar(1);
    wall.rotation.y = 0;
    wall.updateMatrix();
    jointMesh.setMatrixAt(index, wall.matrix);
  });
  if (walls.length) scene.add(wallMesh);
  if (junctions.length) scene.add(jointMesh);

  const bot = new Vector3();
  const dock = new Vector3();
  let hasBot = false;
  let hasDock = false;
  let heading = 0;
  const botElement = viewport.querySelector<HTMLElement>('.rb-map3d-bot')!;
  const dockElement = viewport.querySelector<HTMLElement>('.rb-map3d-dock')!;
  const trail = new LineSegments2(
    new LineSegmentsGeometry(),
    new LineMaterial({ transparent: true, depthWrite: false, alphaToCoverage: true }),
  );
  trail.visible = false;
  scene.add(trail);

  const screenPoint = new Vector3();
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  let width = 0;
  let height = 0;
  let pendingFrame = 0;
  let disposed = false;
  let motion: MarkerMotion | null = null;
  let sample: Pt | null = null;
  let lastPositionAt: number | null = null;

  function invalidate() {
    if (!pendingFrame && !disposed) pendingFrame = requestAnimationFrame(draw);
  }
  const camera = createCamera(canvas, floor, structure, invalidate);

  function placeBot(x: number, z: number, angle: number | null) {
    bot.set(x, 0, z);
    if (angle !== null) heading = (angle * Math.PI) / 180;
    hasBot = true;
  }

  function project(x: number, z: number) {
    screenPoint.set(x, 0, z).project(camera.camera);
    return { x: ((screenPoint.x + 1) * width) / 2, y: ((1 - screenPoint.y) * height) / 2 };
  }

  function place(element: HTMLElement, x: number, y: number) {
    element.style.left = `${(x * 100) / width}%`;
    element.style.top = `${(y * 100) / height}%`;
  }

  function marker(element: HTMLElement, point: Vector3, visible: boolean, radius: number) {
    const at = project(point.x, point.z);
    element.hidden =
      !visible ||
      at.x < -radius ||
      at.x > width + radius ||
      at.y < -radius ||
      at.y > height + radius;
    if (element.hidden) return null;
    const x = Math.max(radius, Math.min(width - radius, at.x));
    const y = Math.max(radius, Math.min(height - radius, at.y));
    place(element, x, y);
    return { left: x - radius, right: x + radius, top: y - radius, bottom: y + radius };
  }

  function drawOverlays() {
    const occupied: ScreenBox[] = [];
    const robotBox = marker(botElement, bot, hasBot, 14);
    const dockBox = marker(dockElement, dock, hasDock, 11);
    if (dockBox && robotBox && overlaps(dockBox, robotBox)) {
      // The station and robot share almost the same projection when parked.
      const x = (robotBox.left + robotBox.right) / 2;
      const y = (robotBox.top + robotBox.bottom) / 2;
      const station = project(dock.x, dock.z);
      const nearby = [
        [x + 28, y],
        [x - 28, y],
        [x, y + 28],
        [x, y - 28],
      ]
        .filter(([dx, dy]) => dx! >= 11 && dx! <= width - 11 && dy! >= 11 && dy! <= height - 11)
        .sort(
          ([ax, ay], [bx, by]) =>
            Math.hypot(ax! - station.x, ay! - station.y) -
            Math.hypot(bx! - station.x, by! - station.y),
        )[0];
      if (nearby) {
        const [dx, dy] = nearby;
        place(dockElement, dx!, dy!);
        occupied.push({ left: dx! - 11, right: dx! + 11, top: dy! - 11, bottom: dy! + 11 });
      }
    } else if (dockBox) occupied.push(dockBox);
    if (robotBox) {
      occupied.push(robotBox);
      const origin = project(bot.x, bot.z);
      const ahead = project(bot.x + Math.cos(heading) * unit, bot.z + Math.sin(heading) * unit);
      botElement.style.setProperty(
        '--rb-heading',
        `${Math.atan2(ahead.y - origin.y, ahead.x - origin.x)}rad`,
      );
    }

    // Measure in one pass, then hide lower-priority labels. Selected labels keep their badge
    // exactly on the anchor, using the same offset as the 2D room label.
    const ordered = [...rooms].sort((a, b) => b.priority - a.priority);
    for (const {
      labelElement,
      label: [x, z],
    } of ordered) {
      const at = project(x, z);
      place(labelElement, at.x, at.y);
      labelElement.hidden = false;
    }
    const stage = viewport.getBoundingClientRect();
    const measured = ordered.map(({ labelElement }) => labelElement.getBoundingClientRect());
    ordered.forEach(({ labelElement }, i) => {
      const { left, right, top, bottom } = measured[i]!;
      const hidden =
        left < stage.left || right > stage.right || top < stage.top || bottom > stage.bottom;
      const box = {
        left: left - stage.left,
        right: right - stage.left,
        top: top - stage.top,
        bottom: bottom - stage.top,
      };
      labelElement.hidden = hidden || occupied.some((obstacle) => overlaps(box, obstacle));
      if (!labelElement.hidden) occupied.push(box);
    });
  }

  function draw(now: number) {
    if (motion) {
      const t = reducedMotion.matches ? 1 : Math.min(1, (now - motion.start) / motion.duration);
      const point = pointAt(motion.track, easeTravel(t));
      placeBot(point.x, point.y, t >= 1 ? motion.heading : point.heading);
      if (t >= 1) motion = null;
    }
    const cameraMoving = camera.update(now, hasBot ? bot : null, reducedMotion.matches);
    if (width && height) {
      renderer.render(scene, camera.camera);
      drawOverlays();
      const coverage = camera.coverage();
      canvas.dataset.floorCoverage = String(Math.max(coverage.x, coverage.y));
    }
    pendingFrame = 0;
    if (cameraMoving || motion) invalidate();
  }

  const resize = new ResizeObserver(() => {
    width = viewport.clientWidth;
    height = viewport.clientHeight;
    if (!width || !height) return;
    renderer.setSize(width, height, false);
    camera.resize(width, height, hasBot ? bot : null);
    invalidate();
  });
  resize.observe(viewport);

  // Resolve the same CSS colours as SVG rooms, including oklch and color-mix().
  const pixel = document.createElement('canvas');
  pixel.width = pixel.height = 1;
  const ink = pixel.getContext('2d', { willReadFrequently: true })!;
  function readColor(element: Element, fallback = '#ffffff') {
    ink.clearRect(0, 0, 1, 1);
    ink.fillStyle = fallback;
    ink.fillStyle = getComputedStyle(element).color;
    ink.fillRect(0, 0, 1, 1);
    const [r, g, b] = ink.getImageData(0, 0, 1, 1).data;
    return new Color().setHex((r! << 16) + (g! << 8) + b!);
  }
  function updateColors() {
    for (const room of rooms) {
      const { labelElement } = room;
      const selected = labelElement.hasAttribute('data-selected');
      const live = labelElement.hasAttribute('data-live');
      room.priority = Number(selected) * 2 + Number(live);
      room.skin.color.copy(readColor(labelElement.querySelector('.rb-map3d-room-color')!));
      room.selected.visible = selected;
      room.live.visible = live;
    }
    wallSide.color.copy(readColor(viewport.querySelector('.rb-map3d-wall-color')!));
    wallCap.color.copy(readColor(viewport.querySelector('.rb-map3d-cap-color')!));
    const accent = readColor(viewport.querySelector('.rb-map3d-live-color')!);
    trail.material.color.copy(accent);
    selectionInk.color.copy(accent);
    liveInk.color.copy(readColor(viewport.querySelector('.rb-map3d-live-edge')!));
    invalidate();
  }

  const theme = viewport.closest('[data-theme]');
  const themeObserver = new MutationObserver(updateColors);
  if (theme) themeObserver.observe(theme, { attributes: true, attributeFilter: ['data-theme'] });
  const darkScheme = window.matchMedia('(prefers-color-scheme: dark)');
  darkScheme.addEventListener('change', updateColors);
  updateColors();

  function updateMap(next: VectorMap, tone: MarkerTone, trailMode: TrailMode) {
    const raw = next.robot ? layout.project(next.robot.x, next.robot.y) : null;
    const dockAt = next.dock ? layout.project(next.dock.x, next.dock.y) : null;
    const station = dockAt ? dockPose(dockAt, layout.walls, rings, 220, WALL_WIDTH) : null;
    const moving = tone === 'cleaning' || tone === 'returning';
    const parked =
      station &&
      (tone === 'docked' ||
        (tone === 'idle' &&
          dockAt &&
          raw &&
          Math.hypot(raw[0] - dockAt[0], raw[1] - dockAt[1]) < 440));
    hasDock = dockAt !== null;
    if (dockAt) {
      const [x, z] = station?.station ?? dockAt;
      dock.set(x, 0, z);
    }
    const target = parked ? station.robot : raw;
    const angle = parked ? station.angle : next.robot?.a != null ? -next.robot.a + rotation : null;
    const path = pathPoints(next.path).map(([x, y]) => layout.project(x, y));
    if (!target) {
      sample = motion = null;
      lastPositionAt = null;
      hasBot = false;
    } else {
      const changed = !sample || sample[0] !== target[0] || sample[1] !== target[1];
      if (changed || !moving || reducedMotion.matches) {
        const now = performance.now();
        const from: Pt | null = hasBot ? [bot.x, bot.z] : null;
        const track =
          changed && moving && !reducedMotion.matches
            ? planGlide(from, target, path, {
                blocked: (a, b) => !guard.ok(a, b),
                maxGap: unit * 12,
              }).track
            : [target];
        motion =
          track.length > 1
            ? {
                track,
                start: now,
                duration: glideDuration(lastPositionAt === null ? null : now - lastPositionAt),
                heading: angle,
              }
            : null;
        if (!motion) placeBot(...target, angle);
        if (changed) lastPositionAt = now;
      } else if (motion) {
        motion.heading = angle;
      } else {
        placeBot(...target, angle);
      }
      sample = target;
    }

    const count = trailLayers(trailMode, tone, path.length).line;
    const runs = count ? clipTrail(path.slice(-count), rings, layout.walls, unit * 0.4) : [];
    trail.geometry.dispose();
    trail.geometry = lineGeometry(runs, 16);
    trail.visible = runs.some((run) => run.length > 1);
    trail.material.linewidth = trailMode === 'full' ? 1.5 : 3;
    trail.material.opacity = trailMode === 'full' ? 0.7 : 1;
    invalidate();
  }

  const activePointers = new Set<number>();
  let tap: { id: number; x: number; y: number } | null = null;
  function pointerDown(event: PointerEvent) {
    activePointers.add(event.pointerId);
    tap =
      activePointers.size === 1 && event.button === 0
        ? { id: event.pointerId, x: event.clientX, y: event.clientY }
        : null;
  }
  function pointerMove(event: PointerEvent) {
    if (tap && Math.hypot(event.clientX - tap.x, event.clientY - tap.y) > 7) tap = null;
  }
  function pointerEnd(event: PointerEvent) {
    activePointers.delete(event.pointerId);
    const pick = event.type === 'pointerup' && tap?.id === event.pointerId;
    tap = null;
    if (!pick) return;
    const rect = canvas.getBoundingClientRect();
    const cursor = new Vector2(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      1 - ((event.clientY - rect.top) / rect.height) * 2,
    );
    const ray = new Raycaster();
    ray.setFromCamera(cursor, camera.camera);
    const hit = ray.intersectObjects(rooms.map((room) => room.mesh))[0];
    const room = rooms.find(({ mesh }) => mesh === hit?.object);
    if (room) onToggle(room.id);
  }
  function contextLost(event: Event) {
    event.preventDefault();
    onUnavailable();
  }
  canvas.addEventListener('pointerdown', pointerDown);
  canvas.addEventListener('pointermove', pointerMove);
  canvas.addEventListener('pointerup', pointerEnd);
  canvas.addEventListener('pointercancel', pointerEnd);
  canvas.addEventListener('webglcontextlost', contextLost);
  viewport.prepend(canvas);

  return {
    updateColors,
    updateMap,
    setView(view: CameraView) {
      camera.setView(view, hasBot ? bot : null, reducedMotion.matches);
    },
    dispose() {
      disposed = true;
      cancelAnimationFrame(pendingFrame);
      resize.disconnect();
      themeObserver.disconnect();
      camera.controls.dispose();
      canvas.removeEventListener('webglcontextlost', contextLost);
      darkScheme.removeEventListener('change', updateColors);
      canvas.removeEventListener('pointerdown', pointerDown);
      canvas.removeEventListener('pointermove', pointerMove);
      canvas.removeEventListener('pointerup', pointerEnd);
      canvas.removeEventListener('pointercancel', pointerEnd);
      for (const { mesh, skin, selected } of rooms) {
        mesh.geometry.dispose();
        skin.dispose();
        selected.geometry.dispose();
      }
      selectionInk.dispose();
      liveInk.dispose();
      wallMesh.dispose();
      wallMesh.geometry.dispose();
      jointMesh.dispose();
      jointMesh.geometry.dispose();
      wallSide.dispose();
      wallCap.dispose();
      trail.geometry.dispose();
      trail.material.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      canvas.remove();
    },
  };
}
