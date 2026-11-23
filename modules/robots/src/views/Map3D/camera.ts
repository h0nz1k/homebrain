import { OrthographicCamera, Vector3 } from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

export type CameraView = 'overview' | 'top' | 'follow';

export function createCamera(canvas: HTMLCanvasElement, size: number, invalidate: () => void) {
  const camera = new OrthographicCamera(-1, 1, 1, -1, 10, size * 12);
  const controls = new OrbitControls(camera, canvas);
  controls.enablePan = false;
  controls.minZoom = 0.65;
  controls.maxZoom = 4;
  controls.maxPolarAngle = Math.PI * 0.46;
  controls.addEventListener('change', invalidate);

  let view: CameraView = 'overview';
  const overview = new Vector3(0.62, 1, 0.95).normalize().multiplyScalar(size * 2);
  const top = new Vector3(0, size * 2, 0.01);
  const center = new Vector3();
  let transition: {
    start: number;
    target: Vector3;
    offset: Vector3;
    zoom: number;
  } | null = null;

  function aim(target: Vector3, offset: Vector3, zoom: number) {
    controls.target.copy(target);
    camera.position.copy(target).add(offset);
    camera.zoom = zoom;
    camera.updateProjectionMatrix();
    controls.update();
  }
  aim(center, overview, 1);

  controls.addEventListener('start', () => {
    transition = null;
  });

  function follow(position: Vector3) {
    if (view !== 'follow' || controls.target.equals(position)) return;
    camera.position.sub(controls.target).add(position);
    controls.target.copy(position);
    controls.update();
  }

  return {
    camera,
    controls,
    resize(width: number, height: number) {
      const aspect = width / height;
      const halfHeight = (size * 0.57) / Math.min(1, aspect);
      camera.left = -halfHeight * aspect;
      camera.right = halfHeight * aspect;
      camera.top = halfHeight;
      camera.bottom = -halfHeight;
      camera.updateProjectionMatrix();
    },
    setView(next: CameraView, robot: Vector3 | null, reduced: boolean) {
      view = next;
      if (next === 'follow' && !robot) {
        transition = null;
        return;
      }
      const zoom = next === 'follow' ? 1.45 : 1;
      if (reduced) {
        transition = null;
        aim(next === 'follow' && robot ? robot : center, next === 'top' ? top : overview, zoom);
      } else {
        transition = {
          start: performance.now(),
          target: controls.target.clone(),
          offset: camera.position.clone().sub(controls.target),
          zoom: camera.zoom,
        };
      }
      invalidate();
    },
    update(now: number, robot: Vector3 | null, moved: boolean, reduced: boolean) {
      if (transition) {
        const t = reduced ? 1 : Math.min(1, (now - transition.start) / 300);
        const ease = 1 - (1 - t) ** 3;
        const target = view === 'follow' && robot ? robot : center;
        const offset = view === 'top' ? top : overview;
        const zoom = view === 'follow' ? 1.45 : 1;
        aim(
          transition.target.clone().lerp(target, ease),
          transition.offset.clone().lerp(offset, ease),
          transition.zoom + (zoom - transition.zoom) * ease,
        );
        if (t >= 1) transition = null;
      } else if (robot && moved) {
        follow(robot);
      }
      return transition !== null;
    },
  };
}
