import { Box2, OrthographicCamera, Vector2, Vector3 } from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

export type CameraView = 'overview' | 'top' | 'follow';

const FIT = 0.82; // 9% padding on each side of the limiting canvas axis.

export function createCamera(
  canvas: HTMLCanvasElement,
  floor: Vector3[],
  structure: Vector3[],
  invalidate: () => void,
) {
  const bounds = new Box2().setFromPoints(floor.map(({ x, z }) => new Vector2(x, z)));
  const middle = bounds.getCenter(new Vector2());
  const center = new Vector3(middle.x, 0, middle.y);
  const extent = bounds.getSize(new Vector2());
  const size = Math.max(1, extent.length());
  const camera = new OrthographicCamera(-1, 1, 1, -1, 1, size * 5);
  const controls = new OrbitControls(camera, canvas);
  controls.enablePan = false;
  controls.minZoom = 0.65;
  controls.maxZoom = 4;
  controls.maxPolarAngle = Math.PI * 0.42;
  controls.addEventListener('change', invalidate);

  let aspect = 1;
  let view: CameraView = 'overview';
  const overview = new Vector3(0.42, 1, 0.64).normalize().multiplyScalar(size * 2);
  const top = new Vector3(0, size * 2, size * 0.00001);
  const fitCamera = camera.clone();
  const projected = new Vector3();

  function preset(next: CameraView, robot: Vector3 | null) {
    const offset = next === 'overview' ? overview : top;
    if (next === 'follow') {
      // At the default zoom the viewport covers a third of the plan's bounding rectangle.
      const half = Math.sqrt((extent.x * extent.y) / (3 * aspect)) / 2;
      return {
        target: followTarget(robot, Math.min(half, extent.y / 2, extent.x / (2 * aspect)), 1),
        offset,
        halfHeight: Math.max(1, Math.min(half, extent.y / 2, extent.x / (2 * aspect))),
      };
    }
    fitCamera.position.copy(center).add(offset);
    fitCamera.lookAt(center);
    fitCamera.updateMatrixWorld();
    const box = new Box2().makeEmpty();
    for (const point of structure) {
      projected.copy(point).applyMatrix4(fitCamera.matrixWorldInverse);
      box.expandByPoint(new Vector2(projected.x, projected.y));
    }
    const { x, y } = box.getSize(new Vector2());
    const shift = box.getCenter(new Vector2());
    const target = new Vector3(shift.x, shift.y, 0)
      .applyQuaternion(fitCamera.quaternion)
      .add(center);
    return { target, offset, halfHeight: Math.max(1, x / aspect, y) / (2 * FIT) };
  }

  function followTarget(robot: Vector3 | null, halfHeight: number, zoom: number) {
    const x = Math.min(extent.x / 2, (halfHeight * aspect) / zoom);
    const z = Math.min(extent.y / 2, halfHeight / zoom);
    return new Vector3(
      Math.max(bounds.min.x + x, Math.min(bounds.max.x - x, robot?.x ?? center.x)),
      0,
      Math.max(bounds.min.y + z, Math.min(bounds.max.y - z, robot?.z ?? center.z)),
    );
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

  reset(null);
  return {
    camera,
    controls,
    resize(width: number, height: number, robot: Vector3 | null) {
      aspect = width / height;
      reset(robot);
    },
    setView(next: CameraView, robot: Vector3 | null, reduced: boolean) {
      view = next;
      // Follow uses the plan axes so clamping keeps the viewport over the floor.
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
      } else if (view === 'follow') {
        const target = followTarget(robot, camera.top, camera.zoom);
        if (!controls.target.equals(target)) aim(target, top, camera.top, camera.zoom);
      }
      return transition !== null;
    },
    coverage() {
      const box = new Box2().makeEmpty();
      for (const point of floor) {
        projected.copy(point).project(camera);
        box.expandByPoint(new Vector2(projected.x, projected.y));
      }
      return box.getSize(new Vector2()).multiplyScalar(0.5);
    },
  };
}
