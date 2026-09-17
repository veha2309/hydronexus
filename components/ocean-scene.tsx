'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

import {
  boundsFor,
  colorFor,
  depthsFor,
  sample,
  type Dataset,
  type Palette,
  type SensorKind,
} from '@/lib/ocean';
import {
  fittingDistance,
  globePosition,
  magnitudeRelief,
  wavePhaseOffset,
  type OceanView,
} from '@/lib/scene-math';

export type SceneProps = {
  data: Dataset;
  environment?: Dataset;
  variable: string;
  depth: number;
  time: string;
  palette: Palette;
  min: number;
  max: number;
  log: boolean;
  opacity: number;
  exaggeration: number;
  renderMode: 'volume' | 'slice' | 'iso';
  iso: number;
  currents: boolean;
  enhancedLighting: boolean;
  lightingStrength: number;
  sensors: SensorKind[];
  selected: string | null;
  onSelect: (id: string | null) => void;
  cameraReset: number;
  view: OceanView;
  sectionLatitude: number;
  leftPanel: boolean;
  rightPanel: boolean;
  focusRequest: number;
  zoomRequest: { direction: number; serial: number };
};
type Polygon = number[][][];
type Geography = {
  features: { geometry: { type: string; coordinates: Polygon | Polygon[] } }[];
};
type Tween = {
  from: THREE.Vector3;
  to: THREE.Vector3;
  fromTarget: THREE.Vector3;
  toTarget: THREE.Vector3;
  start: number;
  duration: number;
};
type Engine = {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  controls: OrbitControls;
  world: THREE.Group;
  field: THREE.Group;
  instruments: THREE.Group;
  particleGroup: THREE.Group;
  environmentGroup: THREE.Group;
  ambient: THREE.HemisphereLight;
  sun: THREE.DirectionalLight;
  rim: THREE.DirectionalLight;
  stars: THREE.Points;
  mask: THREE.CanvasTexture | null;
  pickables: THREE.Object3D[];
  tween: Tween | null;
  animate: ((dt: number) => void) | null;
  waveAnimate: ((dt: number) => void) | null;
  environmentAnimate: ((dt: number) => void) | null;
  resize: () => void;
};
const SENSOR_COLORS = {
  Argo: '#6df4d4',
  Glider: '#c5a3ff',
  CTD: '#ffc687',
  BGC: '#aceb8d',
};
function clearGroup(group: THREE.Group) {
  group.traverse((object) => {
    const mesh = object as THREE.Mesh;
    mesh.geometry?.dispose();
    if (mesh.material)
      for (const material of Array.isArray(mesh.material)
        ? mesh.material
        : [mesh.material]) {
        (material as THREE.MeshBasicMaterial).map?.dispose();
        material.dispose();
      }
  });
  group.clear();
}

function cloudTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 64;
  const context = canvas.getContext('2d')!;
  const gradient = context.createRadialGradient(64, 32, 4, 64, 32, 58);
  gradient.addColorStop(0, 'rgba(235,248,255,0.72)');
  gradient.addColorStop(0.45, 'rgba(220,240,250,0.32)');
  gradient.addColorStop(1, 'rgba(210,235,248,0)');
  context.fillStyle = gradient;
  context.fillRect(0, 0, 128, 64);
  return new THREE.CanvasTexture(canvas);
}
function inRing(lon: number, lat: number, ring: number[][]) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i],
      b = ring[j];
    if (
      a[1] > lat !== b[1] > lat &&
      lon < ((b[0] - a[0]) * (lat - a[1])) / (b[1] - a[1]) + a[0]
    )
      inside = !inside;
  }
  return inside;
}
function label(text: string, color = '#789ead', width = 2.3) {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 72;
  const ctx = canvas.getContext('2d')!;
  ctx.font = '500 34px Segoe UI';
  ctx.fillStyle = color;
  ctx.textAlign = 'center';
  ctx.fillText(text, 128, 46);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      depthTest: true,
      toneMapped: false,
    }),
  );
  sprite.scale.set(width * 1.8, (width * 1.8 * 72) / 256, 1);
  return sprite;
}
function instrumentLabel(text: string, color: string) {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d')!;
  const name = text.length > 24 ? `${text.slice(0, 23)}…` : text;
  ctx.font = '600 28px Segoe UI';
  canvas.width = Math.ceil(ctx.measureText(name).width) + 40;
  canvas.height = 60;
  ctx.font = '600 28px Segoe UI';
  ctx.fillStyle = '#0b202e';
  ctx.beginPath();
  ctx.roundRect(1, 1, canvas.width - 2, 58, 12);
  ctx.fill();
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.fillStyle = '#edf7fa';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(name, canvas.width / 2, 30);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      toneMapped: false,
      sizeAttenuation: false,
      depthWrite: false,
    }),
  );
  sprite.scale.set((0.026 * canvas.width) / 60, 0.026, 1);
  sprite.center.set(0.5, -0.3);
  return sprite;
}
function lines(
  points: THREE.Vector3[],
  color = 0x3c687b,
  opacity = 0.35,
  segments = false,
) {
  const geometry = new THREE.BufferGeometry().setFromPoints(points),
    material = new THREE.LineBasicMaterial({
      color,
      transparent: true,
      opacity,
      toneMapped: false,
    });
  return segments
    ? new THREE.LineSegments(geometry, material)
    : new THREE.Line(geometry, material);
}
function animateCamera(
  e: Engine,
  to: THREE.Vector3,
  target: THREE.Vector3,
  duration = 850,
) {
  e.tween = {
    from: e.camera.position.clone(),
    to,
    fromTarget: e.controls.target.clone(),
    toTarget: target,
    start: performance.now(),
    duration: matchMedia('(prefers-reduced-motion: reduce)').matches
      ? 1
      : duration,
  };
}
function fitCamera(e: Engine, p: SceneProps, animate = true) {
  const width = e.renderer.domElement.clientWidth,
    height = e.renderer.domElement.clientHeight;
  const left = p.leftPanel && width >= 1100 ? 280 : 0,
    right = p.rightPanel && width >= 1100 ? 360 : 0;
  e.camera.setViewOffset(
    width,
    height,
    -(left - right) / 2,
    -12,
    width,
    height,
  );
  let distance = fittingDistance(
    p.view === 'globe' || p.view === 'section' ? 8 : 11.3,
    width,
    height,
    left + right + 70,
    135,
  );
  let target = new THREE.Vector3(0, p.view === 'globe' ? 0 : -1.7, 0),
    direction: THREE.Vector3;
  const b = boundsFor(p.data);
  if (p.view === 'map') {
    const scale = 20 / Math.max(b.east - b.west, b.north - b.south);
    const halfWidth =
      ((b.east - b.west) *
        scale *
        Math.cos((((b.north + b.south) / 2) * Math.PI) / 180)) /
      2;
    const halfHeight = ((b.north - b.south) * scale) / 2;
    const tangent = Math.tan((20 * Math.PI) / 180);
    distance =
      Math.max(
        halfWidth /
          ((tangent * Math.max(160, width - left - right - 110)) / height),
        halfHeight / ((tangent * Math.max(160, height - 170)) / height),
      ) * 1.04;
  }
  if (p.view === 'globe')
    direction = new THREE.Vector3(
      ...globePosition(
        (b.north + b.south) / 2 + 7,
        (b.east + b.west) / 2 - 4,
        1,
      ),
    );
  else if (p.view === 'map') {
    direction = new THREE.Vector3(0, 1, 0.001);
    target = new THREE.Vector3();
  } else if (p.view === 'section') direction = new THREE.Vector3(0, 0.08, 1);
  else direction = new THREE.Vector3(0.7, 0.82, 1.15).normalize();
  e.controls.enableRotate = p.view !== 'section' && p.view !== 'map';
  e.controls.mouseButtons.LEFT =
    p.view === 'map' ? THREE.MOUSE.PAN : THREE.MOUSE.ROTATE;
  e.controls.touches.ONE =
    p.view === 'map' ? THREE.TOUCH.PAN : THREE.TOUCH.ROTATE;
  e.controls.minDistance = p.view === 'globe' ? 10.5 : 9;
  e.controls.maxDistance = Math.max(100, distance * 1.8);
  e.controls.maxPolarAngle = p.view === 'globe' ? Math.PI : Math.PI * 0.49;
  const position = target.clone().addScaledVector(direction, distance);
  if (animate) animateCamera(e, position, target);
  else {
    e.camera.position.copy(position);
    e.controls.target.copy(target);
    e.controls.update();
  }
}

export default function OceanScene(props: SceneProps) {
  const host = useRef<HTMLDivElement>(null),
    engine = useRef<Engine | null>(null),
    latest = useRef(props);
  const consumedFocus = useRef(0);
  const [geography, setGeography] = useState<Geography | null>(null),
    [error, setError] = useState('');
  useEffect(() => {
    latest.current = props;
  }, [props]);
  useEffect(() => {
    const controller = new AbortController();
    fetch('/coastlines.json', { signal: controller.signal })
      .then((r) => {
        if (!r.ok) throw new Error('Unable to load coastline data.');
        return r.json();
      })
      .then(setGeography)
      .catch((e) => {
        if (e.name !== 'AbortError') setError(e.message);
      });
    return () => controller.abort();
  }, []);
  const domain = useMemo(() => {
    if (!geography) return null;
    const b = boundsFor(props.data),
      cx = (b.east + b.west) / 2,
      cy = (b.north + b.south) / 2;
    const scale = 20 / Math.max(b.east - b.west, b.north - b.south),
      cos = Math.cos((cy * Math.PI) / 180);
    const all = geography.features.flatMap((f) =>
      f.geometry.type === 'Polygon'
        ? [f.geometry.coordinates as Polygon]
        : f.geometry.type === 'MultiPolygon'
          ? (f.geometry.coordinates as Polygon[])
          : [],
    );
    const polygons = all
      .map((p) => ({
        p,
        minX: Math.min(...p[0].map((v) => v[0])),
        maxX: Math.max(...p[0].map((v) => v[0])),
        minY: Math.min(...p[0].map((v) => v[1])),
        maxY: Math.max(...p[0].map((v) => v[1])),
      }))
      .filter(
        (p) =>
          p.maxX >= b.west &&
          p.minX <= b.east &&
          p.maxY >= b.south &&
          p.minY <= b.north,
      );
    return {
      b,
      all,
      polygons,
      x: (lon: number) => (lon - cx) * scale * cos,
      z: (lat: number) => -(lat - cy) * scale,
      isLand: (lon: number, lat: number) =>
        polygons.some(
          ({ p, minX, maxX, minY, maxY }) =>
            lon >= minX &&
            lon <= maxX &&
            lat >= minY &&
            lat <= maxY &&
            inRing(lon, lat, p[0]) &&
            !p.slice(1).some((r) => inRing(lon, lat, r)),
        ),
    };
  }, [geography, props.data]);
  useEffect(() => {
    const el = host.current!;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    } catch {
      queueMicrotask(() =>
        setError(
          'WebGL is unavailable. Enable hardware acceleration to use the 3D views. Profiles remain available.',
        ),
      );
      return;
    }
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.localClippingEnabled = true;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    renderer.setClearColor(0x040d16, 0);
    el.appendChild(renderer.domElement);
    renderer.domElement.setAttribute(
      'aria-label',
      'Interactive ocean scene. Use the view buttons and instrument list for keyboard navigation.',
    );
    const scene = new THREE.Scene(),
      camera = new THREE.PerspectiveCamera(40, 1, 0.1, 350),
      controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.065;
    controls.zoomSpeed = 0.6;
    controls.rotateSpeed = 0.65;
    const world = new THREE.Group(),
      field = new THREE.Group(),
      instruments = new THREE.Group(),
      particleGroup = new THREE.Group(),
      environmentGroup = new THREE.Group();
    scene.add(world, field, environmentGroup, instruments, particleGroup);
    const ambient = new THREE.HemisphereLight(0xb6eaff, 0x102435, 2.1);
    scene.add(ambient);
    const key = new THREE.DirectionalLight(0xc9eeff, 2.4);
    key.position.set(-12, 18, -18);
    scene.add(key);
    const rim = new THREE.DirectionalLight(0x9dbbcc, 0);
    rim.position.set(14, 6, 10);
    scene.add(rim);
    const starPositions = new Float32Array(650 * 3);
    for (let i = 0; i < 650; i++) {
      const a = i * 2.399963,
        t = Math.acos(1 - (2 * (i + 0.5)) / 650),
        r = 85 + (i % 23);
      starPositions.set(
        [
          r * Math.sin(t) * Math.cos(a),
          r * Math.cos(t),
          r * Math.sin(t) * Math.sin(a),
        ],
        i * 3,
      );
    }
    const stars = new THREE.Points(
      new THREE.BufferGeometry().setAttribute(
        'position',
        new THREE.BufferAttribute(starPositions, 3),
      ),
      new THREE.PointsMaterial({
        color: 0xa7c6d6,
        size: 0.065,
        transparent: true,
        opacity: 0.42,
        depthWrite: false,
        toneMapped: false,
      }),
    );
    scene.add(stars);
    const e: Engine = {
      scene,
      camera,
      renderer,
      controls,
      world,
      field,
      instruments,
      particleGroup,
      environmentGroup,
      ambient,
      sun: key,
      rim,
      stars,
      mask: null,
      pickables: [],
      tween: null,
      animate: null,
      waveAnimate: null,
      environmentAnimate: null,
      resize: () => {},
    };
    e.resize = () => {
      const { width, height } = el.getBoundingClientRect();
      renderer.setSize(width, height);
      camera.aspect = width / Math.max(1, height);
      camera.updateProjectionMatrix();
      fitCamera(e, latest.current);
    };
    engine.current = e;
    const observer = new ResizeObserver(e.resize);
    observer.observe(el);
    e.resize();
    fitCamera(e, latest.current, false);
    const stopTween = () => {
      e.tween = null;
    };
    controls.addEventListener('start', stopTween);
    let frame = 0,
      last = performance.now();
    const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
    const tick = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      if (e.tween) {
        const p = Math.min(1, (now - e.tween.start) / e.tween.duration),
          t = 1 - Math.pow(1 - p, 3);
        camera.position.lerpVectors(e.tween.from, e.tween.to, t);
        controls.target.lerpVectors(e.tween.fromTarget, e.tween.toTarget, t);
        if (p === 1) e.tween = null;
      }
      if (!document.hidden) {
        if (!reducedMotion.matches) {
          e.animate?.(dt);
          e.waveAnimate?.(dt);
          e.environmentAnimate?.(dt);
        }
        controls.update();
        renderer.render(scene, camera);
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    let down = new THREE.Vector2();
    const onDown = (event: PointerEvent) => {
      down = new THREE.Vector2(event.clientX, event.clientY);
    };
    const onUp = (event: PointerEvent) => {
      if (down.distanceTo(new THREE.Vector2(event.clientX, event.clientY)) > 5)
        return;
      const rect = el.getBoundingClientRect(),
        ray = new THREE.Raycaster();
      ray.setFromCamera(
        new THREE.Vector2(
          ((event.clientX - rect.left) / rect.width) * 2 - 1,
          (-(event.clientY - rect.top) / rect.height) * 2 + 1,
        ),
        camera,
      );
      const hit = ray.intersectObjects(e.pickables)[0];
      if (event.button !== 0) return;
      if (hit) {
        if (
          latest.current.view === 'globe' &&
          hit.point.dot(camera.position.clone().sub(hit.point)) < 0
        )
          return;
        latest.current.onSelect(hit.object.userData.id);
      } else latest.current.onSelect(null);
    };
    const onLost = (event: Event) => {
      event.preventDefault();
      setError(
        'The browser lost its graphics context. Reload to restore the scene.',
      );
    };
    renderer.domElement.addEventListener('pointerdown', onDown);
    renderer.domElement.addEventListener('pointerup', onUp);
    renderer.domElement.addEventListener('webglcontextlost', onLost);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      controls.dispose();
      [world, field, environmentGroup, instruments, particleGroup].forEach(
        clearGroup,
      );
      e.mask?.dispose();
      stars.geometry.dispose();
      (stars.material as THREE.Material).dispose();
      renderer.dispose();
      renderer.domElement.remove();
      engine.current = null;
    };
  }, []);
  useEffect(() => {
    if (engine.current) fitCamera(engine.current, latest.current);
  }, [
    props.view,
    props.cameraReset,
    props.leftPanel,
    props.rightPanel,
    props.data,
  ]);
  useEffect(() => {
    const e = engine.current;
    if (
      !e ||
      !props.focusRequest ||
      !domain ||
      consumedFocus.current === props.focusRequest
    )
      return;
    consumedFocus.current = props.focusRequest;
    const o = props.data.observations.find((o) => o.id === props.selected);
    if (!o) return;
    if (props.view === 'globe') {
      const v = new THREE.Vector3(...globePosition(o.latitude, o.longitude, 1));
      animateCamera(
        e,
        v.clone().multiplyScalar(17),
        v.clone().multiplyScalar(3),
      );
    } else {
      const target = new THREE.Vector3(
        domain.x(o.longitude),
        -0.6,
        domain.z(o.latitude),
      );
      const direction = e.camera.position
        .clone()
        .sub(e.controls.target)
        .normalize();
      animateCamera(e, target.clone().addScaledVector(direction, 17), target);
    }
  }, [props.focusRequest, props.data, props.selected, props.view, domain]);
  useEffect(() => {
    const e = engine.current;
    if (!e || !props.zoomRequest.serial) return;
    const direction = e.camera.position.clone().sub(e.controls.target);
    const distance = THREE.MathUtils.clamp(
      direction.length() * (props.zoomRequest.direction > 0 ? 0.8 : 1.25),
      e.controls.minDistance,
      e.controls.maxDistance,
    );
    animateCamera(
      e,
      e.controls.target
        .clone()
        .add(direction.normalize().multiplyScalar(distance)),
      e.controls.target.clone(),
      280,
    );
  }, [props.zoomRequest]);
  // Static geography is kept separate from the fields, so sliders never rebuild the globe texture.
  useEffect(() => {
    const e = engine.current;
    if (!e || !domain) return;
    clearGroup(e.world);
    e.mask?.dispose();
    const { b, x, z, all, polygons } = domain,
      y = (d: number) => ((-d / 2000) * props.exaggeration) / 5;
    const maxDepth = depthsFor(props.data).at(-1)!;
    const maskCanvas = document.createElement('canvas');
    maskCanvas.width = 1536;
    maskCanvas.height = 1536;
    const maskCtx = maskCanvas.getContext('2d')!;
    maskCtx.fillStyle = 'white';
    maskCtx.fillRect(0, 0, 1536, 1536);
    maskCtx.fillStyle = 'black';
    for (const { p } of polygons) {
      maskCtx.beginPath();
      for (const ring of p) {
        ring.forEach(([lon, lat], i) => {
          const px = ((lon - b.west) / (b.east - b.west)) * 1536,
            py = ((b.north - lat) / (b.north - b.south)) * 1536;
          if (i === 0) maskCtx.moveTo(px, py);
          else maskCtx.lineTo(px, py);
        });
        maskCtx.closePath();
      }
      maskCtx.fill('evenodd');
    }
    e.mask = new THREE.CanvasTexture(maskCanvas);
    e.mask.anisotropy = Math.min(8, e.renderer.capabilities.getMaxAnisotropy());
    e.stars.visible = props.view === 'globe';
    if (props.view === 'globe') {
      const canvas = document.createElement('canvas');
      canvas.width = 2048;
      canvas.height = 1024;
      const ctx = canvas.getContext('2d')!;
      ctx.fillStyle = '#092c40';
      ctx.fillRect(0, 0, 2048, 1024);
      for (const p of all) {
        ctx.beginPath();
        for (const ring of p) {
          ring.forEach(([lon, lat], i) => {
            const px = ((lon + 180) / 360) * 2048,
              py = ((90 - lat) / 180) * 1024;
            if (i === 0) ctx.moveTo(px, py);
            else ctx.lineTo(px, py);
          });
          ctx.closePath();
        }
        ctx.fillStyle = '#285052';
        ctx.fill('evenodd');
        ctx.strokeStyle = '#53817d';
        ctx.lineWidth = 0.55;
        ctx.stroke();
      }
      ctx.strokeStyle = '#689da522';
      ctx.lineWidth = 0.65;
      for (let lon = -180; lon <= 180; lon += 15) {
        ctx.beginPath();
        ctx.moveTo(((lon + 180) / 360) * 2048, 0);
        ctx.lineTo(((lon + 180) / 360) * 2048, 1024);
        ctx.stroke();
      }
      for (let lat = -75; lat <= 75; lat += 15) {
        ctx.beginPath();
        ctx.moveTo(0, ((90 - lat) / 180) * 1024);
        ctx.lineTo(2048, ((90 - lat) / 180) * 1024);
        ctx.stroke();
      }
      const texture = new THREE.CanvasTexture(canvas);
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.anisotropy = 8;
      e.world.add(
        new THREE.Mesh(
          new THREE.SphereGeometry(8, 128, 96),
          new THREE.MeshPhongMaterial({
            map: texture,
            shininess: 12,
            specular: 0x235265,
          }),
        ),
      );
      const atmosphere = new THREE.Mesh(
        new THREE.SphereGeometry(8.12, 96, 64),
        new THREE.ShaderMaterial({
          vertexShader:
            'varying vec3 n; varying vec3 v; void main(){vec4 p=modelViewMatrix*vec4(position,1.);n=normalize(normalMatrix*normal);v=normalize(-p.xyz);gl_Position=projectionMatrix*p;}',
          fragmentShader:
            'varying vec3 n; varying vec3 v; void main(){float r=pow(1.-abs(dot(normalize(n),normalize(v))),3.);gl_FragColor=vec4(.1,.62,.86,r*.55);}',
          transparent: true,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        }),
      );
      atmosphere.renderOrder = 5;
      e.world.add(atmosphere);
      const outline: THREE.Vector3[] = [];
      for (let i = 0; i <= 60; i++)
        outline.push(
          new THREE.Vector3(
            ...globePosition(
              b.south,
              b.west + ((b.east - b.west) * i) / 60,
              8.055,
            ),
          ),
        );
      for (let i = 0; i <= 60; i++)
        outline.push(
          new THREE.Vector3(
            ...globePosition(
              b.south + ((b.north - b.south) * i) / 60,
              b.east,
              8.055,
            ),
          ),
        );
      for (let i = 60; i >= 0; i--)
        outline.push(
          new THREE.Vector3(
            ...globePosition(
              b.north,
              b.west + ((b.east - b.west) * i) / 60,
              8.055,
            ),
          ),
        );
      for (let i = 60; i >= 0; i--)
        outline.push(
          new THREE.Vector3(
            ...globePosition(
              b.south + ((b.north - b.south) * i) / 60,
              b.west,
              8.055,
            ),
          ),
        );
      e.world.add(lines(outline, 0x7adeca, 0.7));
    } else {
      const bottom = y(maxDepth),
        section = props.view === 'section';
      const clips = [
        new THREE.Plane(new THREE.Vector3(1, 0, 0), -x(b.west)),
        new THREE.Plane(new THREE.Vector3(-1, 0, 0), x(b.east)),
        new THREE.Plane(new THREE.Vector3(0, 0, 1), -z(b.north)),
        new THREE.Plane(new THREE.Vector3(0, 0, -1), z(b.south)),
      ];
      if (!section)
        for (const { p } of polygons) {
          const shape = new THREE.Shape(
            p[0].map((v) => new THREE.Vector2(x(v[0]), -z(v[1]))),
          );
          for (const hole of p.slice(1))
            shape.holes.push(
              new THREE.Path(
                hole.map((v) => new THREE.Vector2(x(v[0]), -z(v[1]))),
              ),
            );
          const land = new THREE.Mesh(
            new THREE.ExtrudeGeometry(shape, {
              depth: -bottom + 0.12,
              bevelEnabled: false,
              steps: 1,
            }),
            [
              new THREE.MeshStandardMaterial({
                color: 0x202e38,
                roughness: 1,
                clippingPlanes: clips,
              }),
              new THREE.MeshStandardMaterial({
                color: 0x14212b,
                roughness: 1,
                clippingPlanes: clips,
              }),
            ],
          );
          land.rotation.x = -Math.PI / 2;
          land.position.y = bottom;
          e.world.add(land);
          const coast = lines(
            p[0].map((v) => new THREE.Vector3(x(v[0]), 0.14, z(v[1]))),
            0x83959f,
            0.45,
          );
          (coast.material as THREE.LineBasicMaterial).clippingPlanes = clips;
          e.world.add(coast);
        }
      const grid: THREE.Vector3[] = [],
        zs = section ? 0 : z(b.south),
        zn = section ? 0 : z(b.north);
      for (let i = 0; i <= 7; i++) {
        const lon = b.west + ((b.east - b.west) * i) / 7;
        if (!section)
          grid.push(
            new THREE.Vector3(x(lon), bottom - 0.02, zs),
            new THREE.Vector3(x(lon), bottom - 0.02, zn),
          );
        const t = label(
          `${Math.abs(lon).toFixed(0)}\u00b0${lon < 0 ? 'W' : 'E'}`,
          '#bfd0d6',
          1.2,
        );
        t.position.set(x(lon), bottom - 0.5, zs + (section ? 0.1 : 0.6));
        e.world.add(t);
      }
      if (!section)
        for (let i = 0; i <= 6; i++) {
          const lat = b.south + ((b.north - b.south) * i) / 6;
          grid.push(
            new THREE.Vector3(x(b.west), bottom - 0.02, z(lat)),
            new THREE.Vector3(x(b.east), bottom - 0.02, z(lat)),
          );
          if (props.view === 'map' && i % 2 === 0) {
            const tick = label(
              `${Math.abs(lat).toFixed(0)}°${lat < 0 ? 'S' : 'N'}`,
              '#bfd0d6',
              1.1,
            );
            tick.position.set(x(b.west) - 0.9, 0.3, z(lat));
            e.world.add(tick);
          }
        }
      e.world.add(lines(grid, 0x52798d, 0.23, true));
      if (props.view !== 'map')
        for (let i = 0; i <= 4; i++) {
          const d = (maxDepth * i) / 4;
          const t = label(`${d.toFixed(0)} m`, '#90adbd', 1.5);
          t.position.set(x(b.east) + 0.8, y(d), section ? 0.1 : z(b.south));
          e.world.add(t);
          if (section)
            e.world.add(
              lines(
                [
                  new THREE.Vector3(x(b.west), y(d), 0.015),
                  new THREE.Vector3(x(b.east), y(d), 0.015),
                ],
                0xb5dce2,
                0.18,
              ),
            );
        }
      if (!section) {
        const box = new THREE.BoxGeometry(
            x(b.east) - x(b.west),
            -bottom,
            zs - zn,
          ),
          border = new THREE.LineSegments(
            new THREE.EdgesGeometry(box),
            new THREE.LineBasicMaterial({
              color: 0x518997,
              transparent: true,
              opacity: 0.38,
            }),
          );
        border.position.y = bottom / 2;
        e.world.add(border);
        box.dispose();
        const places: [string, number, number][] = [
          ['India', 22, 79],
          ['Sri Lanka', 7.1, 80.8],
          ['Arabian Sea', 12, 69],
          ['Bay of Bengal', 17, 87],
        ];
        for (const [name, lat, lon] of places)
          if (lon > b.west && lon < b.east && lat > b.south && lat < b.north) {
            const t = label(
              name,
              name === 'India' || name === 'Sri Lanka' ? '#b6c4cc' : '#223943',
              name === 'India' ? 2.5 : 2,
            );
            t.position.set(
              x(lon),
              props.environment
                ? 0.82
                : props.data.grid?.depth.length === 1
                  ? 0.72
                  : 0.3,
              z(lat),
            );
            e.world.add(t);
          }
      }
    }
  }, [
    domain,
    props.view,
    props.data,
    props.environment,
    props.exaggeration,
  ]);
  useEffect(() => {
    const e = engine.current;
    if (!e) return;
    const amount = props.enhancedLighting ? props.lightingStrength : 0;
    e.ambient.intensity = 2.1 - amount * 0.4;
    e.sun.intensity = 2.4 + amount * 0.5;
    e.rim.intensity = amount * 0.35;
  }, [props.enhancedLighting, props.lightingStrength]);
  useEffect(() => {
    const e = engine.current;
    if (!e || !domain) return;
    e.waveAnimate = null;
    clearGroup(e.field);
    const { b, x, z } = domain,
      {
        data,
        variable,
        depth,
        time,
        palette,
        min,
        max,
        log,
        opacity,
        renderMode,
        iso,
        view,
      } = props;
    if (!data.grid && !data.synthetic) return;
    const y = (d: number) => ((-d / 2000) * props.exaggeration) / 5,
      maxDepth = depthsFor(data).at(-1)!;
    const globe = view === 'globe',
      magnitudeSurface =
        Boolean(data.grid && data.grid.depth.length === 1) &&
        (variable === 'wave_height' || variable === 'wind_speed') &&
        view !== 'map' &&
        view !== 'section',
      rgb = new THREE.Color();
    const meshGrid = (
      nx: number,
      ny: number,
      coordinate: (
        u: number,
        v: number,
      ) => { lon: number; lat: number; d: number | null; pos: THREE.Vector3 },
      alpha: number,
      mask = true,
    ) => {
      const positions: number[] = [],
        colors: number[] = [],
        uvs: number[] = [],
        indices: number[] = [],
        missingIndices: number[] = [],
        valid: boolean[] = [],
        ocean: boolean[] = [],
        waveParameters: { height: number | null; period: number | null; direction: number | null }[] = [];
      for (let j = 0; j <= ny; j++)
        for (let i = 0; i <= nx; i++) {
          const c = coordinate(i / nx, j / ny),
            value =
              c.d === null
                ? null
                : sample(data, variable, c.lat, c.lon, c.d, time);
          if (magnitudeSurface && value !== null) {
            const relief = magnitudeRelief(variable, value, min, max);
            if (globe)
              c.pos.addScaledVector(c.pos.clone().normalize(), relief * 0.18);
            else c.pos.y += relief;
          }
          positions.push(...c.pos.toArray());
          waveParameters.push({
            height: value,
            period:
              variable === 'wave_height' && c.d !== null
                ? sample(data, 'wave_period', c.lat, c.lon, c.d, time)
                : null,
            direction:
              variable === 'wave_height' && c.d !== null
                ? sample(data, 'wave_direction', c.lat, c.lon, c.d, time)
                : null,
          });
          uvs.push(
            (c.lon - b.west) / (b.east - b.west),
            (c.lat - b.south) / (b.north - b.south),
          );
          ocean.push(!domain.isLand(c.lon, c.lat));
          valid.push(
            value !== null &&
              Number.isFinite(value) &&
              (mask || !domain.isLand(c.lon, c.lat)),
          );
          rgb.setRGB(
            ...colorFor(value ?? min, min, max, palette, log),
            THREE.SRGBColorSpace,
          );
          colors.push(rgb.r, rgb.g, rgb.b);
        }
      for (let j = 0; j < ny; j++)
        for (let i = 0; i < nx; i++) {
          const a = j * (nx + 1) + i,
            c = a + nx + 1;
          if (valid[a] && valid[a + 1] && valid[c]) indices.push(a, a + 1, c);
          else if (ocean[a] && ocean[a + 1] && ocean[c])
            missingIndices.push(a, a + 1, c);
          if (valid[a + 1] && valid[c] && valid[c + 1])
            indices.push(a + 1, c + 1, c);
          else if (ocean[a + 1] && ocean[c] && ocean[c + 1])
            missingIndices.push(a + 1, c + 1, c);
        }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute(
        'position',
        new THREE.Float32BufferAttribute(positions, 3),
      );
      geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
      geo.setIndex(indices);
      if (magnitudeSurface) geo.computeVertexNormals();
      const mesh = new THREE.Mesh(
        geo,
        magnitudeSurface
          ? new THREE.MeshStandardMaterial({
              vertexColors: true,
              side: THREE.DoubleSide,
              transparent: true,
              opacity: alpha,
              alphaMap: mask ? e.mask : null,
              alphaTest: 0.02,
              depthWrite: true,
              roughness: 0.62,
              metalness: 0.06,
            })
          : new THREE.MeshBasicMaterial({
              vertexColors: true,
              side: THREE.DoubleSide,
              transparent: true,
              opacity: alpha,
              alphaMap: mask ? e.mask : null,
              alphaTest: 0.02,
              depthWrite: false,
              toneMapped: false,
            }),
      );
      e.field.add(mesh);
      if (
        magnitudeSurface &&
        variable === 'wave_height' &&
        !globe &&
        data.grid?.fields.wave_period &&
        data.grid.fields.wave_direction
      ) {
        const attribute = geo.getAttribute('position') as THREE.BufferAttribute,
          base = Float32Array.from(attribute.array as ArrayLike<number>);
        let seconds = 0,
          pending = 0;
        e.waveAnimate = (dt) => {
          seconds += dt;
          pending += dt;
          if (pending < 1 / 30) return;
          pending = 0;
          for (let index = 0; index < waveParameters.length; index++) {
            const offset = index * 3,
              parameters = waveParameters[index];
            attribute.setY(
              index,
              base[offset + 1] +
                wavePhaseOffset(
                  parameters.height,
                  parameters.period,
                  parameters.direction,
                  base[offset],
                  base[offset + 2],
                  seconds,
                ),
            );
          }
          attribute.needsUpdate = true;
          geo.computeVertexNormals();
        };
      }
      if (missingIndices.length && !magnitudeSurface) {
        const missingGeometry = geo.clone();
        missingGeometry.setIndex(missingIndices);
        e.field.add(
          new THREE.Mesh(
            missingGeometry,
            new THREE.MeshBasicMaterial({
              color: 0x78909c,
              side: THREE.DoubleSide,
              transparent: true,
              opacity: Math.min(0.34, Math.max(0.14, alpha * 0.42)),
              alphaMap: mask ? e.mask : null,
              alphaTest: 0.02,
              wireframe: true,
              depthWrite: false,
              polygonOffset: true,
              polygonOffsetFactor: -1,
              toneMapped: false,
            }),
          ),
        );
      }
    };
    const horizontal = (
      depthAt: (lat: number, lon: number) => number | null,
      alpha: number,
      resolution = 96,
    ) => {
      const nativeGrid = magnitudeSurface ? data.grid : undefined,
        horizontalResolution = nativeGrid
          ? nativeGrid.longitude.length - 1
          : resolution,
        verticalResolution = nativeGrid ? nativeGrid.latitude.length - 1 : 76;
      return meshGrid(
        horizontalResolution,
        verticalResolution,
        (u, v) => {
          const lon = nativeGrid
              ? nativeGrid.longitude[
                  Math.min(
                    nativeGrid.longitude.length - 1,
                    Math.round(u * horizontalResolution),
                  )
                ]
              : b.west + u * (b.east - b.west),
            lat = nativeGrid
              ? nativeGrid.latitude[
                  Math.min(
                    nativeGrid.latitude.length - 1,
                    Math.round(v * verticalResolution),
                  )
                ]
              : b.south + v * (b.north - b.south),
            d = depthAt(lat, lon);
          return {
            lon,
            lat,
            d,
            pos: globe
              ? new THREE.Vector3(...globePosition(lat, lon, 8.04))
              : new THREE.Vector3(x(lon), y(d ?? 0), z(lat)),
          };
        },
        alpha,
      );
    };
    if (view === 'section') {
      meshGrid(
        150,
        90,
        (u, v) => {
          const lon = b.west + u * (b.east - b.west),
            d = v * maxDepth;
          return {
            lon,
            lat: props.sectionLatitude,
            d,
            pos: new THREE.Vector3(x(lon), y(d), 0),
          };
        },
        opacity,
        false,
      );
      e.field.add(
        lines(
          [
            new THREE.Vector3(x(b.west), y(depth), 0.05),
            new THREE.Vector3(x(b.east), y(depth), 0.05),
          ],
          0xffffff,
          0.7,
        ),
      );
    } else if (globe || view === 'map') horizontal(() => depth, opacity);
    else {
      if (renderMode === 'iso')
        horizontal((lat, lon) => {
          const ds = depthsFor(data);
          for (let k = 1; k < ds.length; k++) {
            const a = sample(data, variable, lat, lon, ds[k - 1], time),
              b = sample(data, variable, lat, lon, ds[k], time);
            if (
              a !== null &&
              b !== null &&
              a !== b &&
              (iso - a) * (iso - b) <= 0
            )
              return ds[k - 1] + ((iso - a) / (b - a)) * (ds[k] - ds[k - 1]);
          }
          return null;
        }, opacity);
      else {
        if (renderMode === 'volume') {
          for (const d of [maxDepth, maxDepth * 0.65, maxDepth * 0.3, 0])
            horizontal(() => d, opacity * 0.045, 54);
          meshGrid(
            96,
            52,
            (u, v) => {
              const lon = b.west + u * (b.east - b.west),
                d = v * maxDepth;
              return {
                lon,
                lat: b.south,
                d,
                pos: new THREE.Vector3(x(lon), y(d), z(b.south)),
              };
            },
            opacity * 0.55,
          );
          meshGrid(
            76,
            52,
            (u, v) => {
              const lat = b.south + u * (b.north - b.south),
                d = v * maxDepth;
              return {
                lon: b.east,
                lat,
                d,
                pos: new THREE.Vector3(x(b.east), y(d), z(lat)),
              };
            },
            opacity * 0.4,
          );
        }
        horizontal(() => depth, opacity);
      }
    }
  }, [
    domain,
    props.data,
    props.variable,
    props.depth,
    props.time,
    props.palette,
    props.min,
    props.max,
    props.log,
    props.opacity,
    props.exaggeration,
    props.renderMode,
    props.iso,
    props.view,
    props.sectionLatitude,
  ]);
  useEffect(() => {
    const e = engine.current,
      environment = props.environment;
    if (!e || !domain) return;
    clearGroup(e.environmentGroup);
    e.environmentAnimate = null;
    if (
      !environment?.grid ||
      props.view === 'map' ||
      props.view === 'section' ||
      !environment.grid.fields.wave_height
    )
      return;
    const grid = environment.grid,
      { b, x, z } = domain,
      times = grid.time,
      environmentTime = times.reduce((nearest, candidate) =>
        Math.abs(Date.parse(candidate) - Date.parse(props.time)) <
        Math.abs(Date.parse(nearest) - Date.parse(props.time))
          ? candidate
          : nearest,
      ),
      spec = environment.variables.find((item) => item.id === 'wave_height'),
      min = spec?.min ?? 0,
      max = spec?.max ?? 8,
      nx = grid.longitude.length - 1,
      ny = grid.latitude.length - 1,
      positions: number[] = [],
      colors: number[] = [],
      indices: number[] = [],
      parameters: { height: number | null; period: number | null; direction: number | null }[] = [],
      color = new THREE.Color();
    for (let j = 0; j <= ny; j++)
      for (let i = 0; i <= nx; i++) {
        const lon = grid.longitude[i],
          lat = grid.latitude[j],
          height = sample(environment, 'wave_height', lat, lon, 0, environmentTime),
          period = sample(environment, 'wave_period', lat, lon, 0, environmentTime),
          direction = sample(environment, 'wave_direction', lat, lon, 0, environmentTime),
          relief = magnitudeRelief('wave_height', height, min, max) * 0.58;
        positions.push(x(lon), 0.08 + relief, z(lat));
        color.setRGB(
          ...colorFor(height ?? min, min, max, 'ocean', false),
          THREE.SRGBColorSpace,
        );
        colors.push(color.r, color.g, color.b);
        parameters.push({ height, period, direction });
      }
    const valid = (index: number) =>
      parameters[index].height !== null &&
      !domain.isLand(
        grid.longitude[index % (nx + 1)],
        grid.latitude[Math.floor(index / (nx + 1))],
      );
    for (let j = 0; j < ny; j++)
      for (let i = 0; i < nx; i++) {
        const a = j * (nx + 1) + i,
          c = a + nx + 1;
        if (valid(a) && valid(a + 1) && valid(c)) indices.push(a, a + 1, c);
        if (valid(a + 1) && valid(c) && valid(c + 1))
          indices.push(a + 1, c + 1, c);
      }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    const surface = new THREE.Mesh(
      geometry,
      new THREE.MeshStandardMaterial({
        vertexColors: true,
        transparent: true,
        opacity: 0.42,
        roughness: 0.42,
        metalness: 0.08,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    );
    surface.renderOrder = 3;
    e.environmentGroup.add(surface);

    const windCount = 110,
      windPositions = new Float32Array(windCount * 6),
      windGeometry = new THREE.BufferGeometry();
    windGeometry.setAttribute('position', new THREE.BufferAttribute(windPositions, 3));
    const windLines = new THREE.LineSegments(
      windGeometry,
      new THREE.LineBasicMaterial({
        color: 0xd8f4ff,
        transparent: true,
        opacity: 0.82,
        depthWrite: false,
        toneMapped: false,
      }),
    );
    windLines.frustumCulled = false;
    e.environmentGroup.add(windLines);
    const windSeeds = Array.from({ length: windCount }, (_, index) => ({
      lon: b.west + ((index * 0.618034) % 1) * (b.east - b.west),
      lat: b.south + ((index * 0.414214) % 1) * (b.north - b.south),
      age: index % 20,
    }));

    const texture = cloudTexture(),
      clouds = Array.from({ length: 16 }, (_, index) => {
        const sprite = new THREE.Sprite(
          new THREE.SpriteMaterial({
            map: texture,
            color: 0xe8f7ff,
            transparent: true,
            opacity: 0.1 + (index % 4) * 0.02,
            depthWrite: false,
          }),
        );
        sprite.userData.lon = b.west + ((index * 0.754877) % 1) * (b.east - b.west);
        sprite.userData.lat = b.south + ((index * 0.56984) % 1) * (b.north - b.south);
        sprite.position.set(x(sprite.userData.lon), 1.05 + (index % 3) * 0.13, z(sprite.userData.lat));
        sprite.scale.set(1.6 + (index % 5) * 0.35, 0.7 + (index % 3) * 0.18, 1);
        e.environmentGroup.add(sprite);
        return sprite;
      });
    const base = Float32Array.from(
      (geometry.getAttribute('position') as THREE.BufferAttribute).array as ArrayLike<number>,
    );
    let seconds = 0,
      pending = 0;
    e.environmentAnimate = (dt) => {
      seconds += dt;
      pending += dt;
      if (pending < 1 / 30) return;
      const step = pending;
      pending = 0;
      const attribute = geometry.getAttribute('position') as THREE.BufferAttribute;
      for (let index = 0; index < parameters.length; index++) {
        const offset = index * 3,
          item = parameters[index];
        attribute.setY(
          index,
          base[offset + 1] +
            wavePhaseOffset(
              item.height,
              item.period,
              item.direction,
              base[offset],
              base[offset + 2],
              seconds,
            ),
        );
      }
      attribute.needsUpdate = true;
      geometry.computeVertexNormals();
      windSeeds.forEach((seed, index) => {
        const u = sample(environment, 'wind_u', seed.lat, seed.lon, 0, environmentTime),
          v = sample(environment, 'wind_v', seed.lat, seed.lon, 0, environmentTime),
          start = index * 6;
        seed.lon += (u ?? 0) * step * 0.035;
        seed.lat += (v ?? 0) * step * 0.035;
        seed.age += step;
        if (
          seed.lon < b.west || seed.lon > b.east ||
          seed.lat < b.south || seed.lat > b.north || seed.age > 24
        ) {
          seed.lon = b.west + ((index * 0.754877 + seconds * 0.01) % 1) * (b.east - b.west);
          seed.lat = b.south + ((index * 0.56984 + seconds * 0.01) % 1) * (b.north - b.south);
          seed.age = 0;
        }
        const hidden = u === null || v === null || domain.isLand(seed.lon, seed.lat),
          px = x(seed.lon),
          pz = z(seed.lat),
          scale = 0.04;
        windPositions.set(
          hidden ? [0, 0, 0, 0, 0, 0] : [px, 0.72, pz, px - (u ?? 0) * scale, 0.72, pz + (v ?? 0) * scale],
          start,
        );
      });
      windGeometry.attributes.position.needsUpdate = true;
      clouds.forEach((cloud, index) => {
        const u = sample(environment, 'wind_u', cloud.userData.lat, cloud.userData.lon, 0, environmentTime) ?? 0,
          v = sample(environment, 'wind_v', cloud.userData.lat, cloud.userData.lon, 0, environmentTime) ?? 0;
        cloud.userData.lon += u * step * 0.012;
        cloud.userData.lat += v * step * 0.012;
        if (cloud.userData.lon > b.east) cloud.userData.lon = b.west;
        if (cloud.userData.lon < b.west) cloud.userData.lon = b.east;
        if (cloud.userData.lat > b.north) cloud.userData.lat = b.south;
        if (cloud.userData.lat < b.south) cloud.userData.lat = b.north;
        cloud.position.x = x(cloud.userData.lon);
        cloud.position.z = z(cloud.userData.lat);
        cloud.material.rotation = Math.sin(seconds * 0.08 + index) * 0.08;
      });
    };
  }, [domain, props.environment, props.time, props.view]);
  useEffect(() => {
    const e = engine.current;
    if (!e || !domain) return;
    clearGroup(e.instruments);
    e.pickables = [];
    const { b, x, z } = domain,
      globe = props.view === 'globe',
      section = props.view === 'section';
    const y = (d: number) => ((-d / 2000) * props.exaggeration) / 5;
    for (const o of props.data.observations) {
      if (
        !props.sensors.includes(o.kind) ||
        o.longitude < b.west ||
        o.longitude > b.east ||
        o.latitude < b.south ||
        o.latitude > b.north ||
        Date.parse(o.time) > Date.parse(props.time) ||
        (section && Math.abs(o.latitude - props.sectionLatitude) > 0.5)
      )
        continue;
      const chosen = o.id === props.selected,
        color = SENSOR_COLORS[o.kind],
        surface = globe
          ? new THREE.Vector3(...globePosition(o.latitude, o.longitude, 8.16))
          : new THREE.Vector3(
              x(o.longitude),
              0.24,
              section ? 0.12 : z(o.latitude),
            );
      const marker = new THREE.Mesh(
        new THREE.SphereGeometry(chosen ? 0.14 : 0.11, 16, 12),
        new THREE.MeshBasicMaterial({
          color: props.view === 'map' ? '#163649' : color,
          toneMapped: false,
        }),
      );
      marker.position.copy(surface);
      marker.userData.id = o.id;
      e.instruments.add(marker);
      e.pickables.push(marker);
      const halo = new THREE.Mesh(
        new THREE.RingGeometry(chosen ? 0.21 : 0.15, chosen ? 0.24 : 0.17, 40),
        new THREE.MeshBasicMaterial({
          color,
          transparent: true,
          opacity: chosen ? 0.9 : 0.55,
          side: THREE.DoubleSide,
          toneMapped: false,
        }),
      );
      halo.position.copy(surface);
      if (globe)
        halo.quaternion.setFromUnitVectors(
          new THREE.Vector3(0, 0, 1),
          surface.clone().normalize(),
        );
      else if (!section) halo.rotation.x = -Math.PI / 2;
      e.instruments.add(halo);
      // A larger invisible pick target improves selection without enlarging the visible marker.
      const target = new THREE.Mesh(
        new THREE.SphereGeometry(0.28, 8, 6),
        new THREE.MeshBasicMaterial({
          transparent: true,
          opacity: 0,
          depthWrite: false,
        }),
      );
      target.position.copy(surface);
      target.userData.id = o.id;
      e.instruments.add(target);
      e.pickables.push(target);
      if (!globe) {
        const points = o.points.map(
          (p) =>
            new THREE.Vector3(
              x(p.longitude ?? o.longitude),
              y(p.depth),
              section ? 0.08 : z(p.latitude ?? o.latitude),
            ),
        );
        e.instruments.add(
          lines(points, new THREE.Color(color).getHex(), chosen ? 0.95 : 0.4),
        );
        if (chosen)
          for (const point of points) {
            const node = new THREE.Mesh(
              new THREE.SphereGeometry(0.035, 6, 6),
              new THREE.MeshBasicMaterial({ color, toneMapped: false }),
            );
            node.position.copy(point);
            e.instruments.add(node);
          }
      }
      if (chosen) {
        const t = instrumentLabel(
          o.id.split('@')[0].replace(/^DEMO-/, ''),
          color,
        );
        t.position
          .copy(surface)
          .add(
            globe
              ? surface.clone().normalize().multiplyScalar(0.45)
              : new THREE.Vector3(0, 0.45, 0),
          );
        e.instruments.add(t);
      }
    }
  }, [
    domain,
    props.data,
    props.sensors,
    props.selected,
    props.time,
    props.view,
    props.exaggeration,
    props.sectionLatitude,
  ]);
  useEffect(() => {
    const e = engine.current;
    if (!e || !domain) return;
    e.animate = null;
    clearGroup(e.particleGroup);
    const { data, depth, time } = props;
    if (
      !props.currents ||
      props.view === 'section' ||
      (!(!data.grid && data.synthetic) &&
        !(data.grid?.fields.u && data.grid.fields.v))
    )
      return;
    const { b, x, z } = domain,
      globe = props.view === 'globe',
      count = 150,
      trail = 9;
    const pos = new Float32Array(count * trail * 6),
      colors = new Float32Array(count * trail * 6);
    const point = (lat: number, lon: number) =>
      globe
        ? new THREE.Vector3(...globePosition(lat, lon, 8.075))
        : new THREE.Vector3(
            x(lon),
            ((-depth / 2000) * props.exaggeration) / 5 + 0.055,
            z(lat),
          );
    const seeds = Array.from({ length: count }, (_, i) => {
      const lon = b.west + ((i * 0.618034) % 1) * (b.east - b.west),
        lat = b.south + ((i * 0.414214) % 1) * (b.north - b.south);
      return {
        lon,
        lat,
        age: i % 30,
        history: Array.from({ length: trail + 1 }, () => point(lat, lon)),
      };
    });
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    const stream = new THREE.LineSegments(
      geometry,
      new THREE.LineBasicMaterial({
        vertexColors: true,
        transparent: true,
        opacity: 0.85,
        depthWrite: false,
        toneMapped: false,
      }),
    );
    stream.frustumCulled = false;
    e.particleGroup.add(stream);
    let elapsed = 0;
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    e.animate = (dt) => {
      elapsed += dt;
      if (elapsed < (reduced ? 0.6 : 0.055)) return;
      const step = elapsed;
      elapsed = 0;
      seeds.forEach((p, i) => {
        const u = sample(data, 'u', p.lat, p.lon, depth, time),
          v = sample(data, 'v', p.lat, p.lon, depth, time);
        p.lon += (u ?? 0) * step * 2.7;
        p.lat += (v ?? 0) * step * 2.7;
        p.age += step;
        const outside =
          p.lon > b.east ||
          p.lon < b.west ||
          p.lat > b.north ||
          p.lat < b.south;
        if (outside || p.age > 40) {
          p.lon =
            b.west + ((i * 0.754877 + p.age * 0.01) % 1) * (b.east - b.west);
          p.lat =
            b.south + ((i * 0.56984 + p.age * 0.02) % 1) * (b.north - b.south);
          p.age = 0;
          p.history.fill(point(p.lat, p.lon));
        }
        p.history.unshift(point(p.lat, p.lon));
        p.history.pop();
        const hidden = u === null || v === null || domain.isLand(p.lon, p.lat);
        for (let j = 0; j < trail; j++) {
          const idx = (i * trail + j) * 6,
            a = p.history[j],
            c = p.history[j + 1],
            alpha = hidden ? 0 : (1 - j / trail) * 0.8;
          pos.set(
            hidden ? [0, 0, 0, 0, 0, 0] : [...a.toArray(), ...c.toArray()],
            idx,
          );
          colors.set(
            [
              0.5 * alpha,
              alpha,
              0.88 * alpha,
              0.5 * alpha,
              alpha,
              0.88 * alpha,
            ],
            idx,
          );
        }
      });
      geometry.attributes.position.needsUpdate = true;
      geometry.attributes.color.needsUpdate = true;
    };
    return () => {
      e.animate = null;
    };
  }, [
    domain,
    props.data,
    props.currents,
    props.depth,
    props.time,
    props.view,
    props.exaggeration,
  ]);
  return (
    <div className="scene-canvas" ref={host}>
      {!geography && !error && (
        <output className="scene-loading">Loading coastline geometry…</output>
      )}
      {error && (
        <div className="scene-error" role="alert">
          {error}
        </div>
      )}
    </div>
  );
}
