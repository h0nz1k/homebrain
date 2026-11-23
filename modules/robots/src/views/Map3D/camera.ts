import { Box2, OrthographicCamera, Vector2, Vector3 } from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

export type CameraView = 'overview' | 'top' | 'follow';

const FIT = 0.84; // 8% padding on each side of the limiting canvas axis.

/**
 * `floor` are the room polygons, `structure` adds the wall tops: the camera frames what is drawn,
 * not the raw map extents. `focus` returns the active room (and robot) for the follow view.
 */
export function createCamera(
  canvas: HTMLCanvasElement,
  floor: Vector3[],
  structure: Vector3[],
  focus: () => Vector3[],
  invalidate: () => void,
) {
  const bounds = new Box2().setFromPoints(floor.map(({ x, z }) => new Vector2(x, z)));
  const middle = bounds.getCenter(new Vector2());
  const center = new Vector3(middle.x, 0, middle.y);
  const size = Math.max(1, bounds.getSize(new Vector2()).length());
  const camera = new OrthographicCamera(-1, 1, 1, -1, 1, size * 5);
  const controls = new OrbitControls(camera, canvas);
  controls.enablePan = false;
  controls.minZoom = 0.65;
  controls.maxZoom = 4;
  controls.maxPolarAngle = Math.PI * 0.42;
  controls.addEventListener('change', invalidate);

  let aspect = 1;
  let view: CameraView = 'overview';
  // Follow keeps the overview tilt, so the plan still reads as 3D while the robot moves.
  const overview = new Vector3(0.42, 1, 0.64).normalize().multiplyScalar(size * 2);
  const top = new Vector3(0, size * 2, size * 0.00001);
  const fitCamera = camera.clone();
  const projected = new Vector3();

  function frame(offset: Vector3, points: Vector3[], around: Vector3 | null) {
    const look = around ?? center;
    fitCamera.position.copy(look).add(offset);
    fitCamera.lookAt(look);
    fitCamera.updateMatrixWorld();
    const box = new Box2().makeEmpty();
    for (const point of points) {
      projected.copy(point).applyMatrix4(fitCamera.matrixWorldInverse);
      box.expandByPoint(new Vector2(projected.x, projected.y));
    }
    return box;
  }

  function fit(offset: Vector3) {
    const box = frame(offset, structure, null);
    const { x, y } = box.getSize(new Vector2());
    const shift = box.getCenter(new Vector2());
    const target = new Vector3(shift.x, shift.y, 0)
      .applyQuaternion(fitCamera.quaternion)
      .add(center);
    return { target, offset, halfHeight: Math.max(1, x / aspect, y) / (2 * FIT) };
  }

  function preset(next: CameraView, robot: Vector3 | null) {
    if (next !== 'follow' || !robot) return fit(next === 'top' ? top : overview);
    // The robot stays in the centre; the view grows until the whole active room fits around it.
    const box = frame(overview, [robot, ...focus()], robot);
    const reach = Math.max(
      Math.max(-box.min.x, box.max.x) / aspect,
      Math.max(-box.min.y, box.max.y),
    );
    const whole = fit(overview).halfHeight;
    return {
      target: robot.clone(),
      offset: overview,
      halfHeight: Math.min(whole * 2, Math.max(size * 0.12, reach / FIT)),
    };
  }

  function aim(target: Vector3, offset: Vector3, halfHeight: number, zoom: number) {
    controls.target.copy(target);
    camera.position.copy(target).add(offset);
    camera.left = -halfHeight * aspect;
    camera.right = halfHeight * aspect;
    camera.top = halfHeight;
    camera.bottom = -halfHeight;
    camera.zoom = zoom;
    camera.updateProjectionMatrix();
    controls.update();
    camera.updateMatrixWorld();
  }

  let transition: {
    start: number;
    target: Vector3;
    offset: Vector3;
    halfHeight: number;
    zoom: number;
  } | null = null;
  controls.addEventListener('start', () => {
    transition = null;
  });

  function reset(robot: Vector3 | null) {
    transition = null;
    const { target, offset, halfHeight } = preset(view, robot);
    aim(target, offset, halfHeight, 1);
  }

  // Width / height of the default view including padding: the stage takes this shape.
  const overviewBox = frame(overview, structure, null).getSize(new Vector2());
  const shape = overviewBox.x / Math.max(1, overviewBox.y);

  reset(null);
  return {
    camera,
    controls,
    shape,
    resize(width: number, height: number, robot: Vector3 | null) {
      aspect = width / height;
      reset(robot);
    },
    setView(next: CameraView, robot: Vector3 | null, reduced: boolean) {
      view = next;
      // Follow keeps its tilt fixed so the robot stays centred while it drives.
      controls.enableRotate = view !== 'follow';
      controls.minZoom = view === 'follow' ? 1 : 0.65;
      if (reduced) reset(robot);
      else {
        transition = {
          start: performance.now(),
          target: controls.target.clone(),
          offset: camera.position.clone().sub(controls.target),
          halfHeight: camera.top,
          zoom: camera.zoom,
        };
      }
      invalidate();
    },
    update(now: number, robot: Vector3 | null, reduced: boolean) {
      if (transition) {
        const t = reduced ? 1 : Math.min(1, Math.max(0, (now - transition.start) / 300));
        const ease = 1 - (1 - t) ** 3;
        const { target, offset, halfHeight } = preset(view, robot);
        aim(
          transition.target.clone().lerp(target, ease),
          transition.offset.clone().lerp(offset, ease),
          transition.halfHeight + (halfHeight - transition.halfHeight) * ease,
          transition.zoom + (1 - transition.zoom) * ease,
        );
        if (t >= 1) transition = null;
      } else if (view === 'follow' && robot) {
        const { target, offset, halfHeight } = preset(view, robot);
        if (!controls.target.equals(target) || camera.top !== halfHeight)
          aim(target, offset, halfHeight, camera.zoom);
      }
      return transition !== null;
    },
  };
}
