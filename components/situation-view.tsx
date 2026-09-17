'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';
import {
  AlertTriangle,
  Box,
  CheckCircle2,
  Clock3,
  Globe2,
  Info,
  Layers3,
  Map,
  Navigation,
  Radio,
  ScanLine,
  SlidersHorizontal,
  Waves,
} from 'lucide-react';
import {
  DEMO,
  DEPTHS,
  TIMES,
  type Palette,
  type SensorKind,
} from '@/lib/ocean';
import type { OceanView } from '@/lib/scene-math';

const OceanScene = dynamic(() => import('./ocean-scene'), {
  ssr: false,
  loading: () => (
    <output className="scene-loading">Preparing ocean view…</output>
  ),
});

const legend = [
  ['Observed', 'Direct measurement', 'observed'],
  ['Forecast', 'Numerical model output', 'forecast'],
  ['Possible', 'Automated, uncertain indication', 'provisional'],
  ['Reviewed', 'Analyst-confirmed signal', 'reviewed'],
  ['Official', 'Authorized agency bulletin', 'official'],
] as const;

const VIEW_LABELS: Record<OceanView, string> = {
  globe: 'Indian Ocean · Global context',
  map: 'Indian Ocean · Surface conditions',
  volume: 'Indian Ocean · Water column',
  section: 'Indian Ocean · East–west depth section',
};

const SENSOR_KINDS: SensorKind[] = ['Argo', 'Glider', 'CTD', 'BGC'];

export default function SituationView() {
  const [view, setView] = useState<OceanView>('globe');
  const [cameraReset, setCameraReset] = useState(0);
  const [variable, setVariable] = useState('temperature');
  const [depth, setDepth] = useState(0);
  const [currents, setCurrents] = useState(true);
  const [showObservations, setShowObservations] = useState(true);
  const [selected, setSelected] = useState<string | null>(null);
  const specification =
    DEMO.variables.find((item) => item.id === variable) ?? DEMO.variables[0];
  const palette: Palette =
    variable === 'temperature'
      ? 'thermal'
      : variable === 'chlorophyll'
        ? 'viridis'
        : 'ocean';
  const observation =
    DEMO.observations.find((item) => item.id === selected) ?? null;
  const observationPoint = observation?.points.reduce((nearest, point) =>
    Math.abs(point.depth - depth) < Math.abs(nearest.depth - depth)
      ? point
      : nearest,
  );

  return (
    <main className="situation-view">
      <header className="situation-header">
        <div className="brand situation-brand">
          <Waves size={30} strokeWidth={1.5} />
          <div>
            <strong>
              Hydro<span>Nexus</span>
            </strong>
            <small>Ocean situation view</small>
          </div>
        </div>
        <div className="situation-status">
          <span className="status-pulse" aria-hidden="true" />
          Demonstration data
        </div>
        <div className="situation-view-switch" aria-label="Map style">
          <button
            className={view === 'globe' ? 'active' : ''}
            onClick={() => setView('globe')}
            type="button"
          >
            <Globe2 size={16} /> Globe
          </button>
          <button
            className={view === 'map' ? 'active' : ''}
            onClick={() => setView('map')}
            type="button"
          >
            <Map size={16} /> Surface
          </button>
          <button
            className={view === 'volume' ? 'active' : ''}
            onClick={() => setView('volume')}
            type="button"
          >
            <Box size={16} /> Water column
          </button>
          <button
            className={view === 'section' ? 'active' : ''}
            onClick={() => setView('section')}
            type="button"
          >
            <ScanLine size={16} /> Depth section
          </button>
        </div>
      </header>

      <section className="situation-stage" aria-label="Ocean situation map">
        <OceanScene
          data={DEMO}
          variable={variable}
          depth={depth}
          time={TIMES[0]}
          palette={palette}
          min={specification.min}
          max={specification.max}
          log={false}
          opacity={0.82}
          exaggeration={5}
          renderMode={view === 'volume' ? 'volume' : 'slice'}
          iso={(specification.min + specification.max) / 2}
          currents={currents}
          enhancedLighting
          lightingStrength={0.5}
          sensors={showObservations ? SENSOR_KINDS : []}
          selected={selected}
          onSelect={setSelected}
          cameraReset={cameraReset}
          view={view}
          sectionLatitude={14.8}
          leftPanel={false}
          rightPanel={false}
          focusRequest={0}
          zoomRequest={{ direction: 0, serial: 0 }}
        />

        <div className="situation-title">
          <p className="eyebrow">{VIEW_LABELS[view]}</p>
          <h1>Understand what the ocean data indicates.</h1>
          <p>
            Observations, forecasts and possible risk signals are kept distinct
            so uncertainty is never mistaken for an official warning.
          </p>
        </div>

        <aside
          className="situation-panel situation-overview"
          aria-label="Current overview"
        >
          <div className="situation-panel-heading">
            <div>
              <p className="eyebrow">Current overview</p>
              <h2>No verified active signals</h2>
            </div>
            <CheckCircle2 size={21} />
          </div>
          <p>
            Live source connectors are being commissioned. The ocean field
            currently shown is synthetic and must not be used for safety,
            navigation or response decisions.
          </p>
          <dl className="situation-facts">
            <div>
              <dt>
                <Radio size={15} /> Signals
              </dt>
              <dd>0 active</dd>
            </div>
            <div>
              <dt>
                <AlertTriangle size={15} /> Official bulletins
              </dt>
              <dd>Connector pending</dd>
            </div>
            <div>
              <dt>
                <Clock3 size={15} /> Data age
              </dt>
              <dd>Demonstration</dd>
            </div>
          </dl>
          <a
            className="official-source"
            href="https://tsunami.incois.gov.in/"
            target="_blank"
            rel="noreferrer"
          >
            Check the official INCOIS warning centre
          </a>
        </aside>

        <aside
          className="situation-panel situation-legend"
          aria-label="Scientific status legend"
        >
          <div className="situation-panel-heading compact">
            <div>
              <p className="eyebrow">Evidence status</p>
              <h2>How to read the map</h2>
            </div>
            <Layers3 size={19} />
          </div>
          <ul>
            {legend.map(([title, description, status]) => (
              <li key={status}>
                <span className={`signal-key ${status}`} aria-hidden="true" />
                <span>
                  <strong>{title}</strong>
                  <small>{description}</small>
                </span>
              </li>
            ))}
          </ul>
        </aside>

        <aside
          className="situation-panel situation-layers"
          aria-label="Simulation layers and observations"
        >
          <div className="situation-panel-heading compact">
            <div>
              <p className="eyebrow">Simulation controls</p>
              <h2>Layers &amp; observations</h2>
            </div>
            <SlidersHorizontal size={19} />
          </div>
          <div className="situation-layer-fields">
            <label>
              <span>Ocean layer</span>
              <select
                value={variable}
                onChange={(event) => setVariable(event.target.value)}
              >
                {DEMO.variables.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.label} · {item.unit}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Depth</span>
              <select
                value={depth}
                onChange={(event) => setDepth(Number(event.target.value))}
              >
                {DEPTHS.map((item) => (
                  <option key={item} value={item}>
                    {item.toLocaleString()} m
                  </option>
                ))}
              </select>
            </label>
            <label className="situation-check">
              <input
                type="checkbox"
                checked={currents}
                onChange={(event) => setCurrents(event.target.checked)}
              />
              <span>Current flow</span>
            </label>
            <label className="situation-check">
              <input
                type="checkbox"
                checked={showObservations}
                onChange={(event) => {
                  setShowObservations(event.target.checked);
                  if (!event.target.checked) setSelected(null);
                }}
              />
              <span>Observation markers</span>
            </label>
          </div>
          {showObservations ? (
            <label className="situation-observation-select">
              <span>Inspect observation</span>
              <select
                value={selected ?? ''}
                onChange={(event) => setSelected(event.target.value || null)}
              >
                <option value="">Choose a marker</option>
                {DEMO.observations.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.kind} · {item.id.replace('DEMO-', '')}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          {observation && observationPoint ? (
            <div className="situation-observation-card">
              <div>
                <Navigation size={15} />
                <strong>{observation.kind}</strong>
                <span>{observation.id.replace('DEMO-', '')}</span>
              </div>
              <p>
                Nearest sample: {observationPoint.depth.toLocaleString()} m ·{' '}
                {observationPoint.values[variable]?.toFixed(2) ?? 'Missing'}{' '}
                {specification.unit}
              </p>
              <small>Synthetic observation · demonstration only</small>
            </div>
          ) : null}
        </aside>

        <div className="situation-controls">
          <button
            type="button"
            onClick={() => setCameraReset((value) => value + 1)}
          >
            <Globe2 size={16} /> Reset view
          </button>
          <span>
            <Info size={14} /> Drag to explore · Scroll to zoom
          </span>
        </div>
      </section>
    </main>
  );
}
