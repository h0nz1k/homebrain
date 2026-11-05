import { useEffect, useState, type CSSProperties } from 'react';
import type { ComputedScene } from '../data/scene.js';

function SceneLayer({
  scene,
  incoming,
  finish,
}: {
  scene: ComputedScene;
  incoming: boolean;
  finish: () => void;
}) {
  const [visible, setVisible] = useState(!incoming);
  useEffect(() => {
    if (!incoming) return;
    const timer = setTimeout(() => setVisible(true), 20);
    return () => clearTimeout(timer);
  }, [incoming]);
  const style = {
    '--sky-top': scene.colours.top,
    '--sky-mid': scene.colours.mid,
    '--sky-horizon': scene.colours.horizon,
    '--cloud-opacity': scene.cloudOpacity,
    '--rain-opacity': scene.rainOpacity,
    '--severity-color': scene.severity.color,
    '--severity-opacity': scene.severity.opacity,
    '--sun-glow': Math.min(0.42, scene.sunGlow * 0.42),
    '--sun-x': `${scene.sun.x * 100}%`,
    '--sun-y': `${scene.sun.y * 60}%`,
    opacity: visible ? 1 : 0,
  } as CSSProperties;
  return (
    <div
      className="scene"
      data-testid="sky-layer"
      data-scene-key={scene.key}
      style={style}
      onTransitionEnd={(event) => {
        if (event.target === event.currentTarget && event.propertyName === 'opacity') finish();
      }}
    >
      {scene.phase === 'night' && <div className="today-stars" />}
      <div className="today-clouds today-clouds-far" />
      <div className="today-clouds today-clouds-near" />
      {scene.rainOpacity > 0 && <div className="today-rain" />}
      <div className="today-hills today-hills-far" />
      <div className="today-hills today-hills-near" />
      <div className="today-severity-light" />
    </div>
  );
}
export function AmbientSky({
  scene,
  reducedMotion,
}: {
  scene: ComputedScene;
  reducedMotion: boolean;
}) {
  const [layers, setLayers] = useState([scene]);
  // Keep the previous painted scene until the new scene has finished fading in.
  if (layers[layers.length - 1] !== scene) {
    setLayers(
      layers[layers.length - 1]?.key === scene.key
        ? [...layers.slice(0, -1), scene]
        : [layers[layers.length - 1]!, scene],
    );
  }
  const key = scene.key;
  useEffect(() => {
    const timer = setTimeout(
      () => setLayers((current) => (current.length > 1 ? current.slice(-1) : current)),
      reducedMotion ? 240 : 3040,
    );
    return () => clearTimeout(timer);
  }, [key, reducedMotion]);
  return (
    <div className="today-ambient" data-testid="ambient-sky" aria-hidden="true">
      {layers.map((layer, i) => (
        <SceneLayer
          key={layer.key}
          scene={layer}
          incoming={i > 0}
          finish={() => setLayers((current) => current.slice(-1))}
        />
      ))}
    </div>
  );
}
