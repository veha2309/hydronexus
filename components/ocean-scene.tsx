'use client';
import { useEffect, useRef, useState } from 'react';
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

export type SceneProps = {
  data: Dataset;
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
  sensors: SensorKind[];
  selected: string | null;
  onSelect: (id: string) => void;
  cameraReset: number;
};
type Polygon = number[][][];
type Geography = {
  features: {
    properties: { name?: string };
    geometry: { type: string; coordinates: Polygon | Polygon[] };
  }[];
};
const SENSOR_COLORS = {
  Argo: '#65e3d1',
  Glider: '#c6a0ff',
  CTD: '#efbd72',
  BGC: '#88d978',
};
function insideRing(lon: number, lat: number, ring: number[][]) {
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
function dispose(group: THREE.Group) {
  group.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.geometry) m.geometry.dispose();
    if (m.material) {
      const mats = Array.isArray(m.material) ? m.material : [m.material];
      mats.forEach((mat) => {
        const map = (mat as THREE.MeshBasicMaterial).map;
        if (map) map.dispose();
        mat.dispose();
      });
    }
  });
  group.clear();
}
function textSprite(text: string, color = '#769baa', size = 0.5) {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 64;
  const c = canvas.getContext('2d')!;
  c.font = '24px Segoe UI';
  c.fillStyle = color;
  c.textAlign = 'center';
  c.fillText(text, 256, 42);
  const texture = new THREE.CanvasTexture(canvas);
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      depthTest: false,
    }),
  );
  sprite.scale.set(size * 8, size, 1);
  return sprite;
}

export default function OceanScene(props: SceneProps) {
  const host = useRef<HTMLDivElement>(null),
    latest = useRef(props);
  useEffect(() => {
    latest.current = props;
  }, [props]);
  const engine = useRef<{
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    renderer: THREE.WebGLRenderer;
    controls: OrbitControls;
    group: THREE.Group;
    pickables: THREE.Object3D[];
    animate: ((dt: number) => void) | null;
  } | null>(null);
  const [geography, setGeography] = useState<Geography | null>(null),
    [error, setError] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    fetch('/coastlines.json', { signal: controller.signal })
      .then((r) => {
        if (!r.ok) throw new Error('Coastline data could not be loaded.');
        return r.json();
      })
      .then(setGeography)
      .catch((e) => {
        if (e.name !== 'AbortError') setError(e.message);
      });
    return () => controller.abort();
  }, []);
  useEffect(() => {
    const el = host.current!;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    } catch {
      queueMicrotask(() =>
        setError(
          '3D rendering needs WebGL. Enable browser hardware acceleration; profiles and controls remain available.',
        ),
      );
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.localClippingEnabled = true;
    renderer.setClearColor(0x071824, 0);
    el.appendChild(renderer.domElement);
    renderer.domElement.setAttribute(
      'aria-label',
      'Interactive 3D ocean. Drag to orbit, scroll to zoom, or select instruments from the adjacent list.',
    );
    const scene = new THREE.Scene(),
      camera = new THREE.PerspectiveCamera(42, 1, 0.1, 300);
    camera.position.set(17, 16, 23);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.07;
    controls.target.set(0, -1, 0);
    controls.minDistance = 8;
    controls.maxDistance = 65;
    controls.maxPolarAngle = Math.PI * 0.49;
    const group = new THREE.Group();
    scene.add(group);
    scene.add(new THREE.HemisphereLight(0xc9f3ff, 0x173140, 2));
    engine.current = {
      scene,
      camera,
      renderer,
      controls,
      group,
      pickables: [],
      animate: null,
    };
    const resize = () => {
      const { width, height } = el.getBoundingClientRect();
      renderer.setSize(width, height);
      camera.aspect = width / Math.max(1, height);
      camera.updateProjectionMatrix();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(el);
    resize();
    let last = performance.now(),
      frame = 0;
    const tick = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.06);
      last = now;
      engine.current?.animate?.(dt);
      controls.update();
      renderer.render(scene, camera);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    let down = { x: 0, y: 0 };
    const onDown = (e: PointerEvent) => {
      down = { x: e.clientX, y: e.clientY };
    };
    const onUp = (e: PointerEvent) => {
      if (Math.hypot(e.clientX - down.x, e.clientY - down.y) > 5) return;
      const rect = el.getBoundingClientRect();
      const ray = new THREE.Raycaster();
      ray.setFromCamera(
        new THREE.Vector2(
          ((e.clientX - rect.left) / rect.width) * 2 - 1,
          (-(e.clientY - rect.top) / rect.height) * 2 + 1,
        ),
        camera,
      );
      const hit = ray.intersectObjects(engine.current?.pickables ?? [])[0];
      if (hit) latest.current.onSelect(hit.object.userData.id);
    };
    renderer.domElement.addEventListener('pointerdown', onDown);
    renderer.domElement.addEventListener('pointerup', onUp);
    const contextLost = (e: Event) => {
      e.preventDefault();
      setError(
        'The browser lost its 3D context. Reload to restore the ocean view.',
      );
    };
    renderer.domElement.addEventListener('webglcontextlost', contextLost);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      controls.dispose();
      dispose(group);
      renderer.dispose();
      renderer.domElement.remove();
      engine.current = null;
    };
  }, []);
  useEffect(() => {
    const e = engine.current;
    if (e) {
      e.camera.position.set(17, 16, 23);
      e.controls.target.set(0, -1, 0);
      e.controls.update();
    }
  }, [props.cameraReset]);
  useEffect(() => {
    const e = engine.current;
    if (!e || !geography) return;
    const {
      data,
      variable,
      depth,
      time,
      palette,
      min,
      max,
      log,
      opacity,
      exaggeration,
      renderMode,
      iso,
      currents,
      sensors,
      selected,
    } = props;
    dispose(e.group);
    e.pickables = [];
    e.animate = null;
    const b = boundsFor(data),
      cx = (b.west + b.east) / 2,
      cy = (b.south + b.north) / 2,
      scale = 20 / Math.max(b.east - b.west, b.north - b.south),
      cos = Math.cos((cy * Math.PI) / 180);
    const x = (lon: number) => (lon - cx) * scale * cos,
      z = (lat: number) => -(lat - cy) * scale;
    // Display depth is intentionally exaggerated independently of horizontal projection.
    const y = (d: number) => ((-d / 2000) * exaggeration) / 5;
    const maxDepth = depthsFor(data).at(-1)!;
    const polygons: Polygon[] = [];
    for (const f of geography.features) {
      const list =
        f.geometry.type === 'Polygon'
          ? [f.geometry.coordinates as Polygon]
          : f.geometry.type === 'MultiPolygon'
            ? (f.geometry.coordinates as Polygon[])
            : [];
      for (const p of list) {
        if (
          p[0]?.some(
            (v) =>
              v[0] >= b.west - 8 &&
              v[0] <= b.east + 8 &&
              v[1] >= b.south - 8 &&
              v[1] <= b.north + 8,
          )
        )
          polygons.push(p);
      }
    }
    const isLand = (lon: number, lat: number) =>
      polygons.some(
        (p) =>
          insideRing(lon, lat, p[0]) &&
          !p.slice(1).some((r) => insideRing(lon, lat, r)),
      );
    const clips = [
      new THREE.Plane(new THREE.Vector3(1, 0, 0), -x(b.west)),
      new THREE.Plane(new THREE.Vector3(-1, 0, 0), x(b.east)),
      new THREE.Plane(new THREE.Vector3(0, 0, 1), -z(b.north)),
      new THREE.Plane(new THREE.Vector3(0, 0, -1), z(b.south)),
    ];
    for (const poly of polygons) {
      const shape = new THREE.Shape(
        poly[0].map((p) => new THREE.Vector2(x(p[0]), -z(p[1]))),
      );
      for (const hole of poly.slice(1))
        shape.holes.push(
          new THREE.Path(hole.map((p) => new THREE.Vector2(x(p[0]), -z(p[1])))),
        );
      const land = new THREE.Mesh(
        new THREE.ShapeGeometry(shape),
        new THREE.MeshBasicMaterial({
          color: 0x294653,
          side: THREE.DoubleSide,
          clippingPlanes: clips,
        }),
      );
      land.rotation.x = -Math.PI / 2;
      land.position.y = 0.08;
      e.group.add(land);
      const coast = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints(
          poly[0].map((p) => new THREE.Vector3(x(p[0]), 0.1, z(p[1]))),
        ),
        new THREE.LineBasicMaterial({
          color: 0x7296a1,
          transparent: true,
          opacity: 0.8,
          clippingPlanes: clips,
        }),
      );
      e.group.add(coast);
    }
    const gridPoints: THREE.Vector3[] = [];
    const lonStep = Math.max(1, Math.ceil((b.east - b.west) / 7)),
      latStep = Math.max(1, Math.ceil((b.north - b.south) / 6));
    for (
      let lon = Math.ceil(b.west / lonStep) * lonStep;
      lon <= b.east;
      lon += lonStep
    ) {
      gridPoints.push(
        new THREE.Vector3(x(lon), y(maxDepth) - 0.04, z(b.south)),
        new THREE.Vector3(x(lon), y(maxDepth) - 0.04, z(b.north)),
      );
      const t = textSprite(`${lon}Â°${lon < 0 ? 'W' : 'E'}`);
      t.position.set(x(lon), y(maxDepth), z(b.south) + 0.5);
      e.group.add(t);
    }
    for (
      let lat = Math.ceil(b.south / latStep) * latStep;
      lat <= b.north;
      lat += latStep
    ) {
      gridPoints.push(
        new THREE.Vector3(x(b.west), y(maxDepth) - 0.04, z(lat)),
        new THREE.Vector3(x(b.east), y(maxDepth) - 0.04, z(lat)),
      );
      const t = textSprite(`${Math.abs(lat)}Â°${lat < 0 ? 'S' : 'N'}`);
      t.position.set(x(b.west) - 0.7, y(maxDepth), z(lat));
      e.group.add(t);
    }
    e.group.add(
      new THREE.LineSegments(
        new THREE.BufferGeometry().setFromPoints(gridPoints),
        new THREE.LineBasicMaterial({
          color: 0x376073,
          transparent: true,
          opacity: 0.38,
        }),
      ),
    );
    const box = new THREE.BoxGeometry(
      x(b.east) - x(b.west),
      -y(maxDepth),
      z(b.south) - z(b.north),
    );
    const edges = new THREE.LineSegments(
      new THREE.EdgesGeometry(box),
      new THREE.LineBasicMaterial({
        color: 0x3a8192,
        transparent: true,
        opacity: 0.4,
      }),
    );
    edges.position.y = y(maxDepth) / 2;
    e.group.add(edges);
    box.dispose();
    const nx = 46,
      ny = 38;
    const meshAt = (
      depthAt: (lat: number, lon: number) => number | null,
      alpha: number,
    ) => {
      const positions: number[] = [],
        colors: number[] = [],
        indices: number[] = [],
        valid: boolean[] = [];
      for (let row = 0; row <= ny; row++)
        for (let col = 0; col <= nx; col++) {
          const lat = b.south + ((b.north - b.south) * row) / ny,
            lon = b.west + ((b.east - b.west) * col) / nx,
            d = depthAt(lat, lon);
          const value =
            d === null ? null : sample(data, variable, lat, lon, d, time);
          const good =
            d !== null &&
            value !== null &&
            Number.isFinite(value) &&
            !isLand(lon, lat);
          valid.push(good);
          positions.push(x(lon), y(d ?? 0), z(lat));
          colors.push(...colorFor(value ?? min, min, max, palette, log));
        }
      for (let row = 0; row < ny; row++)
        for (let col = 0; col < nx; col++) {
          const a = row * (nx + 1) + col,
            bb = a + 1,
            c = a + nx + 1,
            d = c + 1;
          if (valid[a] && valid[bb] && valid[c]) indices.push(a, bb, c);
          if (valid[bb] && valid[c] && valid[d]) indices.push(bb, d, c);
        }
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute(
        'position',
        new THREE.Float32BufferAttribute(positions, 3),
      );
      geometry.setAttribute(
        'color',
        new THREE.Float32BufferAttribute(colors, 3),
      );
      geometry.setIndex(indices);
      geometry.computeVertexNormals();
      e.group.add(
        new THREE.Mesh(
          geometry,
          new THREE.MeshBasicMaterial({
            vertexColors: true,
            side: THREE.DoubleSide,
            transparent: true,
            opacity: alpha,
            depthWrite: false,
          }),
        ),
      );
    };
    if (data.grid || data.synthetic) {
      if (renderMode === 'volume') {
        const ds = depthsFor(data);
        [...ds].reverse().forEach((d) => meshAt(() => d, opacity * 0.16));
        meshAt(() => depth, opacity * 0.85);
      }
      if (renderMode === 'slice') meshAt(() => depth, opacity);
      if (renderMode === 'iso')
        meshAt((lat, lon) => {
          const ds = depthsFor(data);
          for (let k = 1; k < ds.length; k++) {
            const v0 = sample(data, variable, lat, lon, ds[k - 1], time),
              v1 = sample(data, variable, lat, lon, ds[k], time);
            if (
              v0 !== null &&
              v1 !== null &&
              v0 !== v1 &&
              (iso - v0) * (iso - v1) <= 0
            )
              return ds[k - 1] + ((iso - v0) / (v1 - v0)) * (ds[k] - ds[k - 1]);
          }
          return null;
        }, opacity);
    }
    const places: [string, number, number][] = [
      ['I N D I A', 22, 79],
      ['SRI LANKA', 7.1, 80.8],
      ['ARABIAN SEA', 13, 67],
      ['BAY OF BENGAL', 17, 86],
      ['INDIAN OCEAN', 2, 87],
    ];
    for (const [label, lat, lon] of places)
      if (lon > b.west && lon < b.east && lat > b.south && lat < b.north) {
        const t = textSprite(
          label,
          label.includes('SEA') || label.includes('BENGAL')
            ? '#77aabb'
            : '#a5b9c2',
          0.32,
        );
        t.position.set(x(lon), 0.4, z(lat));
        e.group.add(t);
      }
    for (const o of data.observations) {
      if (
        !sensors.includes(o.kind) ||
        o.longitude < b.west ||
        o.longitude > b.east ||
        o.latitude < b.south ||
        o.latitude > b.north ||
        Date.parse(o.time) > Date.parse(time)
      )
        continue;
      const marker = new THREE.Mesh(
        new THREE.SphereGeometry(selected === o.id ? 0.22 : 0.15, 16, 12),
        new THREE.MeshBasicMaterial({ color: SENSOR_COLORS[o.kind] }),
      );
      marker.position.set(x(o.longitude), 0.24, z(o.latitude));
      marker.userData.id = o.id;
      e.group.add(marker);
      e.pickables.push(marker);
      const halo = new THREE.Mesh(
        new THREE.RingGeometry(
          selected === o.id ? 0.32 : 0.24,
          selected === o.id ? 0.39 : 0.28,
          32,
        ),
        new THREE.MeshBasicMaterial({
          color: SENSOR_COLORS[o.kind],
          side: THREE.DoubleSide,
          transparent: true,
          opacity: 0.65,
        }),
      );
      halo.rotation.x = -Math.PI / 2;
      halo.position.copy(marker.position);
      e.group.add(halo);
      const points = o.points.map(
        (p) =>
          new THREE.Vector3(
            x(p.longitude ?? o.longitude),
            y(p.depth),
            z(p.latitude ?? o.latitude),
          ),
      );
      e.group.add(
        new THREE.Line(
          new THREE.BufferGeometry().setFromPoints(points),
          new THREE.LineBasicMaterial({
            color: SENSOR_COLORS[o.kind],
            transparent: true,
            opacity: selected === o.id ? 0.95 : 0.4,
          }),
        ),
      );
      if (selected === o.id) {
        const t = textSprite(o.id, SENSOR_COLORS[o.kind], 0.3);
        t.position.copy(marker.position).add(new THREE.Vector3(0, 0.6, 0));
        e.group.add(t);
      }
    }
    if (
      currents &&
      (data.synthetic || (data.grid?.fields.u && data.grid.fields.v))
    ) {
      const count = 180,
        pos = new Float32Array(count * 3);
      const seeds = Array.from({ length: count }, (_, i) => ({
        lon: b.west + ((i * 0.61803398875) % 1) * (b.east - b.west),
        lat: b.south + ((i * 0.41421356237) % 1) * (b.north - b.south),
      }));
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      const cloud = new THREE.Points(
        geometry,
        new THREE.PointsMaterial({
          color: 0xd9fff0,
          size: 0.06,
          transparent: true,
          opacity: 0.9,
          depthTest: false,
        }),
      );
      e.group.add(cloud);
      e.animate = (dt) => {
        seeds.forEach((p, i) => {
          const u = sample(data, 'u', p.lat, p.lon, depth, time),
            v = sample(data, 'v', p.lat, p.lon, depth, time);
          p.lon += (u ?? 0) * dt * 1.4;
          p.lat += (v ?? 0) * dt * 1.4;
          if (p.lon > b.east) p.lon = b.west;
          if (p.lon < b.west) p.lon = b.east;
          if (p.lat > b.north) p.lat = b.south;
          if (p.lat < b.south) p.lat = b.north;
          pos[i * 3] = x(p.lon);
          pos[i * 3 + 1] =
            u === null || v === null || isLand(p.lon, p.lat)
              ? -100
              : y(depth) + 0.08;
          pos[i * 3 + 2] = z(p.lat);
        });
        geometry.attributes.position.needsUpdate = true;
      };
    }
    return () => {
      e.animate = null;
      dispose(e.group);
    };
  }, [
    geography,
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
    props.currents,
    props.sensors,
    props.selected,
  ]);
  return (
    <div className="scene-canvas" ref={host}>
      {error && (
        <div className="scene-error" role="alert">
          {error}
        </div>
      )}
    </div>
  );
}
