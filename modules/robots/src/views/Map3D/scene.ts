// Scene setup inspired by t90-map-card (MIT), https://github.com/gdelagardelle/t90-map-card.
import {
  AmbientLight,
  BoxGeometry,
  BufferGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DirectionalLight,
  Group,
  InstancedMesh,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  Object3D,
  Raycaster,
  Scene,
  Vector2,
  Vector3,
  WebGLRenderer,
} from 'three';
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
  const size = Math.hypot(layout.frame.width, layout.frame.height);
  const unit = Math.max(layout.frame.width, layout.frame.height) / 100;
  const rings = layout.rooms.map((room) => room.rings);
  const guard = segmentGuard(rings, layout.walls, unit * 0.4);
  const light = new DirectionalLight(0xffffff, 1.55);
  light.position.set(-1, 2, 1);
  scene.add(new AmbientLight(0xffffff, 1.1), light);
  const rooms = layout.rooms.map((room) => {
    const slab = roomSlab(room.rings);
    const top = new MeshBasicMaterial();
    const sides = new MeshLambertMaterial();
    const mesh = new Mesh(slab, [top, sides]);
    scene.add(mesh);
    return {
      ...room,
      mesh,
      top,
      sides,
      labelElement: viewport.querySelector<HTMLElement>(`[data-map3d-room="${room.id}"]`),
      colorElement: viewport.querySelector(`[data-map3d-color="${room.id}"]`),
    };
  });
  const walls = wallSegments(layout.walls);
  const wallMaterial = new MeshLambertMaterial();
  const wallMesh = new InstancedMesh(new BoxGeometry(1, 1, 1), wallMaterial, walls.length);
  const wall = new Object3D();
  walls.forEach(({ x, z, length, angle }, index) => {
    wall.position.set(x, WALL_HEIGHT / 2, z);
    wall.scale.set(length, WALL_HEIGHT, WALL_WIDTH);
    wall.rotation.y = angle;
    wall.updateMatrix();
    wallMesh.setMatrixAt(index, wall.matrix);
  });
  if (walls.length) scene.add(wallMesh);

  const dockMaterial = new MeshLambertMaterial();
  const dock = new Mesh(new BoxGeometry(360, 220, 490), dockMaterial);
  const botMaterial = new MeshLambertMaterial();
  const botDisc = new Mesh(new CylinderGeometry(215, 215, 110, 24), botMaterial);
  botDisc.position.y = 75;
  const heading = new Mesh(
    new ConeGeometry(75, 145, 3),
    new MeshBasicMaterial({ color: 0xffffff }),
  );
  heading.rotation.z = -Math.PI / 2;
  heading.position.set(88, 142, 0);
  const bot = new Group();
  bot.add(botDisc, heading);
  bot.visible = dock.visible = false;
  const trail = new LineSegments(
    new BufferGeometry(),
    new LineBasicMaterial({ transparent: true }),
  );
  scene.add(dock, bot, trail);

  const labelPoint = new Vector3();
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  let width = 0;
  let height = 0;
  let pendingFrame = 0;
  let disposed = false;
  let motion: MarkerMotion | null = null;
  let sample: Pt | null = null;
  let lastPositionAt: number | null = null;
  let moved = false;

  function invalidate() {
    if (!pendingFrame && !disposed) pendingFrame = requestAnimationFrame(draw);
  }
  const camera = createCamera(canvas, size, invalidate);

  function placeBot(x: number, z: number, angle: number | null) {
    moved = moved || (bot.visible && (bot.position.x !== x || bot.position.z !== z));
    bot.position.set(x, 0, z);
    if (angle !== null) bot.rotation.y = (-angle * Math.PI) / 180;
    bot.visible = true;
  }

  function draw(now: number) {
    if (motion) {
      const t = reducedMotion.matches ? 1 : Math.min(1, (now - motion.start) / motion.duration);
      const point = pointAt(motion.track, easeTravel(t));
      placeBot(point.x, point.y, t >= 1 ? motion.heading : point.heading);
      if (t >= 1) motion = null;
    }
    const cameraMoving = camera.update(
      now,
      bot.visible ? bot.position : null,
      moved,
      reducedMotion.matches,
    );
    moved = false;
    if (width && height) {
      renderer.render(scene, camera.camera);
      for (const {
        labelElement: label,
        label: [x, z],
      } of rooms) {
        if (!label) continue;
        labelPoint.set(x, 170, z).project(camera.camera);
        label.hidden = Math.abs(labelPoint.x) > 0.95 || Math.abs(labelPoint.y) > 0.94;
        label.style.left = `${(labelPoint.x + 1) * 50}%`;
        label.style.top = `${(1 - labelPoint.y) * 50}%`;
      }
    }
    pendingFrame = 0;
    if (cameraMoving || motion) invalidate();
  }

  const resize = new ResizeObserver(() => {
    width = viewport.clientWidth;
    height = viewport.clientHeight;
    if (!width || !height) return;
    renderer.setSize(width, height, false);
    camera.resize(width, height);
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
      const probe = room.colorElement;
      if (probe) {
        room.top.color.copy(readColor(probe));
        room.sides.color.copy(room.top.color).multiplyScalar(0.72);
      }
    }
    const wallProbe = viewport.querySelector('.rb-map3d-wall-color');
    const dockProbe = viewport.querySelector('.rb-map3d-dock-color');
    const liveProbe = viewport.querySelector('.rb-map3d-live-color');
    if (wallProbe) wallMaterial.color.copy(readColor(wallProbe));
    if (dockProbe) dockMaterial.color.copy(readColor(dockProbe));
    if (liveProbe) {
      const accent = readColor(liveProbe);
      botMaterial.color.copy(accent);
      trail.material.color.copy(accent);
    }
    invalidate();
  }

  const theme = viewport.closest('[data-theme]');
  const themeObserver = new MutationObserver(updateColors);
  if (theme) themeObserver.observe(theme, { attributes: true, attributeFilter: ['data-theme'] });
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
    dock.visible = dockAt !== null;
    if (dockAt) {
      const [x, z] = station?.station ?? dockAt;
      dock.position.set(x, 110, z);
      dock.rotation.y = (-(station?.angle ?? 0) * Math.PI) / 180;
    }
    const target = parked ? station.robot : raw;
    const angle = parked ? station.angle : next.robot?.a != null ? -next.robot.a + rotation : null;
    const path = pathPoints(next.path).map(([x, y]) => layout.project(x, y));
    if (!target) {
      sample = motion = null;
      lastPositionAt = null;
      bot.visible = false;
    } else {
      const changed = !sample || sample[0] !== target[0] || sample[1] !== target[1];
      if (changed || !moving || reducedMotion.matches) {
        const now = performance.now();
        const from: Pt | null = bot.visible ? [bot.position.x, bot.position.z] : null;
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
        if (!motion) {
          placeBot(...target, angle);
          if (!moving) moved = false;
        }
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
    const points = runs.flatMap((run) =>
      run
        .slice(1)
        .flatMap(([x, z], i) => [new Vector3(run[i]![0], 24, run[i]![1]), new Vector3(x, 24, z)]),
    );
    trail.geometry.dispose();
    trail.geometry = new BufferGeometry().setFromPoints(points);
    trail.visible = !!points.length;
    trail.material.opacity = trailMode === 'full' ? 0.85 : 0.55;
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
    setView(view: CameraView, moving: boolean) {
      camera.setView(view, moving && bot.visible ? bot.position : null, reducedMotion.matches);
    },
    dispose() {
      disposed = true;
      cancelAnimationFrame(pendingFrame);
      resize.disconnect();
      themeObserver.disconnect();
      camera.controls.dispose();
      canvas.removeEventListener('webglcontextlost', contextLost);
      for (const { mesh, top, sides } of rooms) {
        mesh.geometry.dispose();
        top.dispose();
        sides.dispose();
      }
      wallMesh.dispose();
      wallMesh.geometry.dispose();
      wallMaterial.dispose();
      dock.geometry.dispose();
      dockMaterial.dispose();
      botDisc.geometry.dispose();
      botMaterial.dispose();
      heading.geometry.dispose();
      heading.material.dispose();
      trail.geometry.dispose();
      trail.material.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      canvas.remove();
    },
  };
}
