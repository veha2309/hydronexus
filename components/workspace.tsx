'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import {
  Waves,
  Layers3,
  FlaskConical,
  Compass,
  Play,
  Pause,
  Radar,
  Upload,
  RotateCcw,
  Thermometer,
  Droplets,
  Wind,
  Sprout,
  ChevronRight,
  Download,
  Info,
  Globe2,
  Box,
  Map as MapIcon,
  ScanLine,
  X,
  Plus,
  Minus,
  LocateFixed,
  Maximize2,
  ChevronLeft,
  BookOpen,
  SlidersHorizontal,
} from 'lucide-react';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import ProfileChart from './profile-chart';
import type { OceanView } from '@/lib/scene-math';
import {
  DEMO,
  boundsFor,
  compareProfile,
  dateLabel,
  depthsFor,
  paletteCSS,
  timesFor,
  type Dataset,
  type Palette,
  type SensorKind,
} from '@/lib/ocean';
import { parseObservations, validateDataset } from '@/lib/ingestion';
const OceanScene = dynamic(() => import('./ocean-scene'), {
  ssr: false,
  loading: () => <div className="scene-loading">Preparing the 3D ocean…</div>,
});
const KINDS: SensorKind[] = ['Argo', 'Glider', 'CTD', 'BGC'];
const icons: Record<string, typeof Thermometer> = {
  temperature: Thermometer,
  salinity: Droplets,
  speed: Wind,
  chlorophyll: Sprout,
};
function Choice({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
}) {
  return (
    <Select
      value={value}
      onValueChange={(v) => {
        if (v !== null) onChange(String(v));
      }}
    >
      <SelectTrigger aria-label={label} className="choice">
        <SelectValue>
          {options.find((o) => o.value === value)?.label}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {options.map((o) => (
          <SelectItem value={o.value} key={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
function Range({
  label,
  value,
  min = 0,
  max,
  step = 1,
  unit = '',
  onChange,
}: {
  label: string;
  value: number;
  min?: number;
  max: number;
  step?: number;
  unit?: string;
  onChange: (v: number) => void;
}) {
  return (
    <div className="range-control">
      <div className="control-label">
        {label}
        <b>
          {Number(value.toFixed(2)).toLocaleString()} {unit}
        </b>
      </div>
      <Slider
        aria-label={label}
        value={[value]}
        min={min}
        max={max}
        step={step}
        onValueChange={(v) => onChange(Array.isArray(v) ? v[0] : v)}
      />
    </div>
  );
}
function ColorRange({
  min,
  max,
  log,
  onApply,
}: {
  min: number;
  max: number;
  log: boolean;
  onApply: (a: number, b: number) => void;
}) {
  const [a, setA] = useState(String(min)),
    [b, setB] = useState(String(max)),
    [error, setError] = useState('');
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const lo = Number(a),
          hi = Number(b);
        if (
          !a.trim() ||
          !b.trim() ||
          !Number.isFinite(lo) ||
          !Number.isFinite(hi) ||
          lo >= hi ||
          (log && lo <= 0)
        ) {
          setError('Use min < max; log requires min > 0.');
          return;
        }
        setError('');
        onApply(lo, hi);
      }}
    >
      <div className="color-inputs">
        <label>
          Min
          <input
            aria-label="Colorbar minimum"
            type="number"
            step="any"
            value={a}
            onChange={(e) => setA(e.target.value)}
          />
        </label>
        <label>
          Max
          <input
            aria-label="Colorbar maximum"
            type="number"
            step="any"
            value={b}
            onChange={(e) => setB(e.target.value)}
          />
        </label>
        <button type="submit">Apply</button>
      </div>
      {error && (
        <p role="alert" className="error-text">
          {error}
        </p>
      )}
    </form>
  );
}
function download(text: string, name: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function Workspace() {
  const [data, setData] = useState<Dataset>(DEMO),
    [variable, setVariable] = useState('temperature'),
    [depth, setDepth] = useState(100),
    [timeIndex, setTimeIndex] = useState(0),
    [playing, setPlaying] = useState(false),
    [speed, setSpeed] = useState('1');
  const [palette, setPalette] = useState<Palette>('thermal'),
    [min, setMin] = useState(2),
    [max, setMax] = useState(32),
    [log, setLog] = useState(false),
    [opacity, setOpacity] = useState(0.8),
    [exaggeration, setExaggeration] = useState(20),
    [renderMode, setRenderMode] = useState<'volume' | 'slice' | 'iso'>(
      'volume',
    ),
    [iso, setIso] = useState(20),
    [currents, setCurrents] = useState(true),
    [sensors, setSensors] = useState<SensorKind[]>(KINDS),
    [selected, setSelected] = useState<string | null>(DEMO.observations[0].id),
    [compare, setCompare] = useState(true),
    [mode, setMode] = useState('scientist'),
    [cameraReset, setCameraReset] = useState(0);
  const [importOpen, setImportOpen] = useState(false),
    [importing, setImporting] = useState(false),
    [importError, setImportError] = useState(''),
    [notice, setNotice] = useState(''),
    [story, setStory] = useState(0),
    [about, setAbout] = useState(false);
  const [view, setView] = useState<OceanView>('globe');
  const [controlsOpen, setControlsOpen] = useState(true),
    [inspectorOpen, setInspectorOpen] = useState(false);
  const [sectionLatitude, setSectionLatitude] = useState(14.81),
    [focusRequest, setFocusRequest] = useState(0);
  const [zoomRequest, setZoomRequest] = useState({ direction: 0, serial: 0 });
  const fileRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const query = matchMedia('(max-width: 680px)');
    const compact = matchMedia('(max-width: 1099px)');
    const closePanels = () => {
      setControlsOpen(false);
      setInspectorOpen(false);
    };
    const onChange = () => {
      if (compact.matches) closePanels();
    };
    const frame = query.matches ? requestAnimationFrame(closePanels) : 0;
    compact.addEventListener('change', onChange);
    return () => {
      cancelAnimationFrame(frame);
      compact.removeEventListener('change', onChange);
    };
  }, []);
  const selectInstrument = (id: string | null) => {
    const next = id === selected ? null : id;
    setSelected(next);
    setInspectorOpen(next !== null);
    if (window.innerWidth < 1100) setControlsOpen(false);
  };
  const toggleControls = () => {
    setControlsOpen((v) => !v);
    if (window.innerWidth < 1100) setInspectorOpen(false);
  };
  const toggleInspector = () => {
    setInspectorOpen((v) => !v);
    if (window.innerWidth < 1100) setControlsOpen(false);
  };
  const views = [
    { id: 'globe', label: 'Globe', icon: Globe2 },
    { id: 'volume', label: 'Water column', icon: Box },
    { id: 'map', label: 'Surface map', icon: MapIcon },
    { id: 'section', label: 'Section', icon: ScanLine },
  ] as const;
  const spec =
      data.variables.find((v) => v.id === variable) ?? data.variables[0],
    times = timesFor(data),
    time = times[Math.min(timeIndex, times.length - 1)],
    depths = depthsFor(data),
    b = boundsFor(data);
  const instrument = data.observations.find((o) => o.id === selected) ?? null;
  const comparison = useMemo(
    () => (instrument ? compareProfile(data, instrument, spec.id) : null),
    [data, instrument, spec.id],
  );
  const vectorAvailable =
    (!data.grid && data.synthetic) ||
    Boolean(data.grid?.fields.u && data.grid.fields.v);
  const inRegion = (o: Dataset['observations'][number]) =>
    o.longitude >= b.west &&
    o.longitude <= b.east &&
    o.latitude >= b.south &&
    o.latitude <= b.north;
  const visible = data.observations.filter(
    (o) =>
      sensors.includes(o.kind) &&
      Date.parse(o.time) <= Date.parse(time) &&
      inRegion(o),
  );
  useEffect(() => {
    if (!playing) return;
    const id = setInterval(
      () => setTimeIndex((i) => (i + 1) % times.length),
      1200 / Number(speed),
    );
    return () => clearInterval(id);
  }, [playing, speed, times.length]);
  const chooseVariable = (id: string) => {
    const v = data.variables.find((v) => v.id === id);
    if (!v) return;
    setVariable(id);
    setMin(v.min);
    setMax(v.max);
    setLog(false);
    setIso((v.min + v.max) / 2);
    setPalette(
      id === 'temperature'
        ? 'thermal'
        : id === 'chlorophyll'
          ? 'viridis'
          : 'ocean',
    );
  };
  const loadDataset = (next: Dataset) => {
    setData(next);
    const bounds = boundsFor(next);
    setSectionLatitude((bounds.north + bounds.south) / 2);
    const v = next.variables[0];
    setVariable(v.id);
    setMin(v.min);
    setMax(v.max);
    setLog(false);
    setIso((v.min + v.max) / 2);
    setDepth(depthsFor(next)[0]);
    setTimeIndex(0);
    setPlaying(false);
    setSelected(next.observations[0]?.id ?? null);
    setCameraReset((i) => i + 1);
    setSensors(KINDS);
  };
  async function importFile(file: File) {
    setImportError('');
    setImporting(true);
    try {
      if (file.size > 25 * 1024 * 1024)
        throw new Error(
          'Maximum file size is 25 MB. Subset larger files with the Python pipeline.',
        );
      if (/\.(csv|tsv|txt)$/i.test(file.name)) {
        const observations = parseObservations(await file.text(), file.name);
        if (!observations.length) throw new Error('No observations found.');
        setData((prev) => ({ ...prev, observations }));
        setSelected(observations[0].id);
        setNotice(
          `Loaded ${observations.length} profiles from ${file.name}. Model dataset is unchanged.`,
        );
      } else if (/\.json$/i.test(file.name)) {
        const next = validateDataset(JSON.parse(await file.text()));
        loadDataset(next);
        setNotice(`Loaded ${next.name}.`);
      } else if (/\.(nc|nc4)$/i.test(file.name)) {
        const endpoint = process.env.NEXT_PUBLIC_DATA_API_URL;
        if (!endpoint)
          throw new Error(
            'NetCDF ingestion requires the Python service. Run backend/main.py and set NEXT_PUBLIC_DATA_API_URL, or convert with backend/convert.py and import the resulting JSON.',
          );
        const form = new FormData();
        form.append('file', file);
        const response = await fetch(`${endpoint.replace(/\/$/, '')}/ingest`, {
          method: 'POST',
          body: form,
        });
        const body = await response.json();
        if (!response.ok)
          throw new Error(
            typeof body.detail === 'string'
              ? body.detail
              : 'NetCDF conversion failed.',
          );
        loadDataset(validateDataset(body));
        setNotice(`Loaded ${file.name} through the xarray pipeline.`);
      } else
        throw new Error(
          'Choose a .nc, .nc4, .csv, .tsv, .txt or HydroNexus .json file.',
        );
      setImportOpen(false);
    } catch (e) {
      setImportError(e instanceof Error ? e.message : 'Import failed.');
    } finally {
      setImporting(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }
  const exportProfile = () => {
    if (!comparison || !instrument) return;
    const rows = [
      'depth_m,observation,model,observation_minus_model',
      ...comparison.points.map((p) =>
        [
          p.depth,
          p.observed ?? '',
          p.model ?? '',
          p.observed !== null && p.model !== null ? p.observed - p.model : '',
        ].join(','),
      ),
    ];
    download(
      rows.join('\n'),
      `hydronexus-${spec.id}-comparison.csv`,
      'text/csv',
    );
  };
  const stories = [
    {
      title: 'A journey into the deep',
      text: 'The sea surface is only the beginning. Move down the water column to see how temperature changes with depth. The stretched vertical scale makes these changes easier to see.',
      depth: 500,
      variable: 'temperature',
    },
    {
      title: 'Meet an ocean robot',
      text: 'Argo floats collect profiles as they rise through the ocean. Select a marker to see measurements at different depths. The orange curve is the instrument; the cyan curve is the model.',
      depth: 100,
      variable: 'temperature',
    },
    {
      title: 'Rivers within the ocean',
      text: 'Currents transport heat, nutrients and water. These moving particles follow the eastward and northward velocity fields at your selected depth. Motion is accelerated for visibility.',
      depth: 50,
      variable: 'speed',
    },
  ];
  const runStory = (i: number) => {
    setStory(i);
    setView(i === 0 ? 'volume' : i === 1 ? 'globe' : 'map');
    const s = stories[i];
    chooseVariable(s.variable);
    setDepth(Math.min(depths.at(-1)!, Math.max(depths[0], s.depth)));
    setCurrents(i === 2);
    setRenderMode(i === 0 ? 'volume' : 'slice');
    if (i === 1) setSelected(data.observations[0]?.id ?? null);
  };
  return (
    <main className="workspace" data-view={view}>
      <header className="topbar">
        <div className="brand">
          <Waves size={31} strokeWidth={1.7} />
          <div>
            <strong>
              Hydro<span>Nexus</span>
            </strong>
            <small>OCEAN INTELLIGENCE</small>
          </div>
        </div>
        <Tabs value={mode} onValueChange={(v) => setMode(String(v))}>
          <TabsList className="mode">
            <TabsTrigger value="scientist">
              <FlaskConical size={16} />
              Scientist
            </TabsTrigger>
            <TabsTrigger value="explore">
              <Compass size={16} />
              Explore
            </TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="header-actions">
          <span className="demo-badge">
            {data.synthetic ? 'SYNTHETIC MODEL' : 'IMPORTED DATA'}
          </span>
          <button
            className="icon-button"
            aria-label="About HydroNexus"
            onClick={() => setAbout(true)}
          >
            <Info size={19} />
          </button>
          <button
            className="outline-button"
            aria-label="Import data"
            onClick={() => setImportOpen(true)}
          >
            <Upload size={16} />
            <span>Import data</span>
          </button>
        </div>
      </header>
      {notice && (
        <output className="notice">
          {notice}
          <button
            aria-label="Dismiss notification"
            onClick={() => setNotice('')}
          >
            ×
          </button>
        </output>
      )}
      <div className="viewbar">
        <div className="workspace-title">
          <span className="status-dot" />
          <strong>Ocean explorer</strong>
        </div>
        <Tabs value={view} onValueChange={(v) => setView(v as OceanView)}>
          <TabsList className="view-tabs" aria-label="Ocean view">
            {views.map((v) => (
              <TabsTrigger key={v.id} value={v.id} aria-label={v.label}>
                <v.icon size={16} />
                <span>{v.label}</span>
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        <div className="view-actions">
          <button
            className={controlsOpen ? 'active' : ''}
            aria-label="Toggle layers panel"
            aria-pressed={controlsOpen}
            onClick={toggleControls}
          >
            <Layers3 size={16} />
            <span>Layers</span>
          </button>
          <button
            className={inspectorOpen ? 'active' : ''}
            aria-label="Toggle inspector panel"
            aria-pressed={inspectorOpen}
            onClick={toggleInspector}
          >
            <Radar size={16} />
            <span>Inspector</span>
          </button>
          <button
            aria-label={
              controlsOpen || inspectorOpen ? 'Hide panels' : 'Show layers'
            }
            onClick={() => {
              const show = !controlsOpen && !inspectorOpen;
              setControlsOpen(show);
              setInspectorOpen(false);
            }}
          >
            <Maximize2 size={16} />
          </button>
        </div>
      </div>
      <div
        className={`workarea ${controlsOpen ? 'left-open' : ''} ${inspectorOpen ? 'right-open' : ''}`}
      >
        <aside
          className={`panel controls ${controlsOpen ? '' : 'closed'}`}
          aria-label="Layers panel"
          inert={!controlsOpen}
        >
          <div className="panel-heading">
            <Layers3 size={18} />
            <h2>
              {mode === 'scientist' ? 'Ocean layers' : 'Explore the ocean'}
            </h2>
            <button
              className="panel-close"
              aria-label="Close layers panel"
              onClick={() => setControlsOpen(false)}
            >
              <X size={16} />
            </button>
          </div>
          {mode === 'explore' ? (
            <div className="stories">
              {stories.map((s, i) => (
                <button
                  key={s.title}
                  className={story === i ? 'story active' : 'story'}
                  onClick={() => runStory(i)}
                >
                  <span>0{i + 1}</span>
                  {s.title}
                  <ChevronRight size={15} />
                </button>
              ))}
              <p className="outreach-copy">{stories[story].text}</p>
            </div>
          ) : (
            <>
              <p className="eyebrow">MODEL VARIABLES</p>
              <div>
                {data.variables.map((v) => {
                  const Icon = icons[v.id] ?? Layers3;
                  return (
                    <button
                      key={v.id}
                      aria-pressed={v.id === spec.id}
                      className={`layer ${v.id === spec.id ? 'active' : ''}`}
                      onClick={() => chooseVariable(v.id)}
                    >
                      <Icon size={16} />
                      {v.label}
                      <span>{v.unit}</span>
                    </button>
                  );
                })}
              </div>
            </>
          )}
          <section>
            {view === 'section' && (
              <>
                <Range
                  label="Section latitude"
                  value={sectionLatitude}
                  min={b.south}
                  max={b.north}
                  step={0.1}
                  unit="°"
                  onChange={setSectionLatitude}
                />
                <p className="field-note">
                  East–west cut. Profiles within 0.5° are projected onto the
                  section.
                </p>
              </>
            )}
            <Range
              label="Depth slice"
              value={depth}
              min={depths[0]}
              max={depths.at(-1)!}
              step={5}
              unit="m"
              onChange={setDepth}
            />
            <div className="range-labels">
              <span>{depths[0]} m</span>
              <span>{depths.at(-1)!.toLocaleString()} m</span>
            </div>
            {mode === 'scientist' && (
              <details className="advanced-controls">
                <summary>
                  Display settings <SlidersHorizontal size={15} />
                </summary>
                {view !== 'volume' && (
                  <p className="field-note">
                    Surface data is sampled at the selected depth. Choose Water
                    column for volumetric rendering and isosurfaces.
                  </p>
                )}
                <div className="field-label">Rendering</div>
                <Choice
                  label="Rendering mode"
                  value={renderMode}
                  onChange={(v) => {
                    setRenderMode(v as typeof renderMode);
                    setView('volume');
                  }}
                  options={[
                    { value: 'volume', label: 'Layered volume' },
                    { value: 'slice', label: 'Depth slice' },
                    { value: 'iso', label: 'Isosurface' },
                  ]}
                />
                {renderMode === 'iso' && (
                  <Range
                    label="Isovalue"
                    value={iso}
                    min={spec.min}
                    max={spec.max}
                    step={(spec.max - spec.min) / 100}
                    unit={spec.unit}
                    onChange={setIso}
                  />
                )}
                <Range
                  label="Vertical exaggeration"
                  value={exaggeration}
                  min={1}
                  max={30}
                  unit="×"
                  onChange={setExaggeration}
                />
                <Range
                  label="Layer opacity"
                  value={opacity * 100}
                  min={10}
                  max={100}
                  unit="%"
                  onChange={(v) => setOpacity(v / 100)}
                />
              </details>
            )}
            <label htmlFor="current-particles" className="toggle-label">
              Current particles
              <Switch
                id="current-particles"
                aria-label="Current particles"
                checked={currents && vectorAvailable}
                disabled={!vectorAvailable}
                onCheckedChange={setCurrents}
              />
            </label>
          </section>
          <section>
            <div className="section-title">
              <Radar size={16} />
              <span>Observations</span>
              <b>{visible.length}</b>
            </div>
            {KINDS.map((kind) => (
              <label
                htmlFor={`sensor-${kind}`}
                key={kind}
                className="toggle-label"
              >
                <span className={`sensor-dot ${kind.toLowerCase()}`} />
                {kind}
                <span className="sensor-count">
                  {data.observations.filter((o) => o.kind === kind).length}
                </span>
                <Switch
                  id={`sensor-${kind}`}
                  aria-label={`${kind} observations`}
                  checked={sensors.includes(kind)}
                  onCheckedChange={(checked) =>
                    setSensors((old) =>
                      checked ? [...old, kind] : old.filter((k) => k !== kind),
                    )
                  }
                />
              </label>
            ))}
          </section>
          {mode === 'scientist' && (
            <details className="color-settings">
              <summary className="section-title">
                <SlidersHorizontal size={16} />
                <span>Color scale</span>
              </summary>
              <Choice
                label="Color palette"
                value={palette}
                onChange={(v) => setPalette(v as Palette)}
                options={[
                  { value: 'thermal', label: 'Thermal' },
                  { value: 'ocean', label: 'Ocean' },
                  { value: 'viridis', label: 'Viridis' },
                ]}
              />
              <div
                className="mini-colorbar"
                style={{ background: paletteCSS(palette) }}
              />
              <ColorRange
                key={`${spec.id}:${min}:${max}`}
                min={min}
                max={max}
                log={log}
                onApply={(a, b) => {
                  setMin(a);
                  setMax(b);
                }}
              />
              <label htmlFor="logarithmic" className="toggle-label">
                Logarithmic
                <Switch
                  id="logarithmic"
                  aria-label="Logarithmic color scale"
                  checked={log}
                  onCheckedChange={(checked) => {
                    if (checked && min <= 0) {
                      setNotice(
                        'Set a positive colorbar minimum before enabling log scale.',
                      );
                      return;
                    }
                    setLog(checked);
                  }}
                />
              </label>
            </details>
          )}
          <button className="dataset-button" onClick={() => setAbout(true)}>
            <span className="status-dot" />
            <div>
              {data.synthetic ? 'Demo model' : 'Imported model'}
              <small>
                {data.grid
                  ? `${data.grid.latitude.length} × ${data.grid.longitude.length} grid`
                  : 'Procedural Indian Ocean fields'}
              </small>
            </div>
            <Info size={14} />
          </button>
        </aside>
        <section className="ocean-stage" aria-label="Ocean visualization">
          <OceanScene
            data={data}
            variable={spec.id}
            depth={depth}
            time={time}
            palette={palette}
            min={min}
            max={max}
            log={log}
            opacity={opacity}
            exaggeration={exaggeration}
            renderMode={renderMode}
            iso={iso}
            currents={currents}
            sensors={sensors}
            selected={selected}
            onSelect={selectInstrument}
            cameraReset={cameraReset}
            view={view}
            sectionLatitude={sectionLatitude}
            leftPanel={controlsOpen}
            rightPanel={inspectorOpen}
            focusRequest={focusRequest}
            zoomRequest={zoomRequest}
          />
          <div className="scene-heading">
            <p className="eyebrow">
              {data.grid ? 'MODEL DOMAIN' : 'REGION 01 / INDIAN OCEAN'}
            </p>
            <h1>
              {mode === 'explore'
                ? stories[story].title
                : view === 'section'
                  ? 'Through the water column'
                  : view === 'volume'
                    ? 'Beneath the surface'
                    : 'The ocean, connected.'}
            </h1>
            <p>
              {view === 'section'
                ? `${sectionLatitude.toFixed(1)}° latitude · ${spec.label}`
                : `${spec.label} · ${depth.toLocaleString()} m depth`}
            </p>
          </div>
          <div className="scene-tools">
            <button
              className="icon-button"
              aria-label="Zoom in"
              title="Zoom in"
              onClick={() =>
                setZoomRequest((v) => ({ direction: 1, serial: v.serial + 1 }))
              }
            >
              <Plus size={18} />
            </button>
            <button
              className="icon-button"
              aria-label="Zoom out"
              title="Zoom out"
              onClick={() =>
                setZoomRequest((v) => ({ direction: -1, serial: v.serial + 1 }))
              }
            >
              <Minus size={18} />
            </button>
            <button
              className="icon-button"
              aria-label="Reset camera"
              title="Fit model to view"
              onClick={() => setCameraReset((v) => v + 1)}
            >
              <RotateCcw size={16} />
            </button>
            {instrument && (
              <button
                className="icon-button"
                aria-label="Focus selected instrument"
                title="Focus selected instrument"
                onClick={() => setFocusRequest((v) => v + 1)}
              >
                <LocateFixed size={17} />
              </button>
            )}
          </div>
          <div className="view-caption">
            <span className="status-dot" />
            {view === 'globe'
              ? 'Earth reference view'
              : view === 'section'
                ? 'Latitude section'
                : view === 'map'
                  ? 'North-up reference view'
                  : `${exaggeration}× vertical exaggeration`}
          </div>
          <div className="floating-legend">
            <div>
              <strong>{spec.label}</strong>
              <span>
                {spec.unit} · {log ? 'log' : 'linear'}
              </span>
            </div>
            <div
              className="legend-gradient"
              style={{ background: paletteCSS(palette) }}
            />
            <div className="legend-ticks">
              <span>{min}</span>
              <span>
                {log && min > 0
                  ? Math.sqrt(min * max).toFixed(2)
                  : ((min + max) / 2).toFixed(1)}
              </span>
              <span>{max}</span>
            </div>
          </div>
          <div className="scene-footer">
            <span>
              {view === 'section'
                ? 'Scroll to zoom · Change latitude to move the cut'
                : 'Drag to orbit · Scroll to zoom'}
            </span>
            <small>
              Natural Earth ·{' '}
              {currents ? 'Accelerated current trails' : 'Geographic reference'}
            </small>
          </div>
          {!inspectorOpen && instrument && (
            <button
              className="selected-peek"
              onClick={() => {
                setInspectorOpen(true);
                if (window.innerWidth < 1100) setControlsOpen(false);
              }}
            >
              <span className={`sensor-dot ${instrument.kind.toLowerCase()}`} />
              <div>
                <small>SELECTED OBSERVATION</small>
                <strong>
                  {instrument.id.split('@')[0].replace('DEMO-', '')}
                </strong>
                <span>Inspect depth profile</span>
              </div>
              <ChevronRight size={17} />
            </button>
          )}
          {!data.grid && !data.synthetic && (
            <div className="scene-error">
              Observation-only dataset. Import a model grid to render the ocean
              field.
            </div>
          )}
        </section>
        <aside
          className={`panel analysis ${inspectorOpen ? '' : 'closed'}`}
          aria-label="Instrument inspector"
          inert={!inspectorOpen}
        >
          <div className="panel-heading">
            <Radar size={18} />
            <h2>
              {mode === 'scientist'
                ? 'Instrument inspector'
                : 'Ocean field notes'}
            </h2>
            <button
              className="panel-close"
              aria-label="Close inspector panel"
              onClick={() => setInspectorOpen(false)}
            >
              <X size={16} />
            </button>
          </div>
          {instrument ? (
            <>
              <div className="instrument-heading">
                <span
                  className={`sensor-dot ${instrument.kind.toLowerCase()}`}
                />
                <span className="eyebrow">
                  {instrument.kind.toUpperCase()} PROFILE
                </span>
                <span className="tiny-tag">
                  {instrument.source.toLowerCase().includes('synthetic')
                    ? 'DEMO'
                    : 'IMPORTED'}
                </span>
              </div>
              <h2 className="instrument-id">{instrument.id.split('@')[0]}</h2>
              <button
                className="focus-instrument"
                onClick={() => selectInstrument(null)}
                aria-label="Deselect instrument"
              >
                Deselect instrument
              </button>
              <p className="coordinates">
                {Math.abs(instrument.latitude).toFixed(2)}°
                {instrument.latitude < 0 ? 'S' : 'N'} <span>/</span>{' '}
                {Math.abs(instrument.longitude).toFixed(2)}°
                {instrument.longitude < 0 ? 'W' : 'E'}
              </p>
              <p className="timestamp">{dateLabel(instrument.time)}</p>
              <button
                className="focus-button"
                onClick={() => {
                  setFocusRequest((v) => v + 1);
                  if (view === 'section')
                    setSectionLatitude(
                      Math.min(b.north, Math.max(b.south, instrument.latitude)),
                    );
                }}
              >
                <LocateFixed size={14} />
                Focus in {view === 'globe' ? 'globe' : 'scene'}
              </button>
              <div className="profile-heading">
                <h3>{spec.label} profile</h3>
                <Download size={15} aria-hidden="true" />
              </div>
              <ProfileChart
                data={data}
                instrument={instrument}
                variable={spec}
                compare={compare}
              />
              <label
                htmlFor="model-comparison"
                className="toggle-label compare-label"
              >
                Compare with model
                <Switch
                  id="model-comparison"
                  aria-label="Compare with model"
                  checked={compare}
                  onCheckedChange={setCompare}
                />
              </label>
              {compare && comparison && (
                <>
                  <div className="metrics">
                    <div>
                      <span>RMSE</span>
                      <strong>
                        {comparison.rmse === null
                          ? '—'
                          : comparison.rmse.toFixed(3)}
                        <small>{spec.unit}</small>
                      </strong>
                    </div>
                    <div>
                      <span>Mean bias (obs − model)</span>
                      <strong>
                        {comparison.bias === null
                          ? '—'
                          : `${comparison.bias >= 0 ? '+' : ''}${comparison.bias.toFixed(3)}`}
                        <small>{spec.unit}</small>
                      </strong>
                    </div>
                  </div>
                  <p className="metric-note">
                    {comparison.count
                      ? `${comparison.count} matched depths · model sampled at profile time`
                      : 'No overlapping model values at this profile’s location, depth and time.'}
                  </p>
                  {data.synthetic && (
                    <p className="synthetic-note">
                      Comparison uses a synthetic model.
                    </p>
                  )}
                </>
              )}
              {mode === 'explore' &&
                comparison?.thermocline !== null &&
                comparison?.thermocline !== undefined && (
                  <div className="insight">
                    <BookOpen size={17} />
                    <p>
                      The strongest measured temperature decrease in this
                      profile occurs near <b>{comparison.thermocline} m</b>. A
                      rapid change with depth is called a thermocline.
                    </p>
                  </div>
                )}
              <button className="export-button" onClick={exportProfile}>
                <Download size={15} />
                Export profile comparison
              </button>
              <details className="profile-table">
                <summary>View numerical profile</summary>
                <div>
                  <table>
                    <thead>
                      <tr>
                        <th>m</th>
                        <th>Observed</th>
                        <th>Model</th>
                      </tr>
                    </thead>
                    <tbody>
                      {comparison?.points.map((p) => (
                        <tr key={p.depth}>
                          <td>{p.depth}</td>
                          <td>{p.observed?.toFixed(3) ?? '—'}</td>
                          <td>{p.model?.toFixed(3) ?? '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </details>
            </>
          ) : (
            <div className="empty-note">
              <Radar size={30} />
              <p>
                Select an instrument marker or import a profile to compare model
                predictions with observations.
              </p>
            </div>
          )}
          <section className="instrument-list">
            <div className="section-title">
              <span>Observation network</span>
              <b>{visible.length} visible</b>
            </div>
            {data.observations.map((o) => (
              <button
                key={o.id}
                className={o.id === selected ? 'selected' : ''}
                aria-pressed={o.id === selected}
                onClick={() => {
                  selectInstrument(o.id);
                  if (!sensors.includes(o.kind))
                    setSensors((s) => [...s, o.kind]);
                }}
              >
                <span className={`sensor-dot ${o.kind.toLowerCase()}`} />
                <span>
                  {o.id.split('@')[0]}
                  <small>
                    {!inRegion(o)
                      ? 'Outside model region'
                      : Date.parse(o.time) > Date.parse(time)
                        ? 'Later than scene time'
                        : `${o.points.at(-1)?.depth} m · ${o.kind}`}
                  </small>
                </span>
                <ChevronRight size={14} />
              </button>
            ))}
          </section>
        </aside>
      </div>
      <footer className="timeline">
        <button
          className="step-button"
          aria-label="Previous model time"
          disabled={timeIndex === 0}
          onClick={() => {
            setPlaying(false);
            setTimeIndex((i) => Math.max(0, i - 1));
          }}
        >
          <ChevronLeft size={17} />
        </button>
        <button
          className="play"
          aria-label={playing ? 'Pause time animation' : 'Play time animation'}
          onClick={() => setPlaying((p) => !p)}
          disabled={times.length < 2}
        >
          {playing ? <Pause size={18} /> : <Play size={18} />}
        </button>
        <button
          className="step-button"
          aria-label="Next model time"
          disabled={timeIndex === times.length - 1}
          onClick={() => {
            setPlaying(false);
            setTimeIndex((i) => Math.min(times.length - 1, i + 1));
          }}
        >
          <ChevronRight size={17} />
        </button>
        <div className="time-readout">
          <p className="eyebrow">
            {data.synthetic ? 'DEMO MODEL TIME' : 'MODEL TIME'}
          </p>
          <b>{dateLabel(time)}</b>
        </div>
        <div className="time-slider">
          <Slider
            aria-label="Model time step"
            value={[timeIndex]}
            min={0}
            max={Math.max(1, times.length - 1)}
            disabled={times.length < 2}
            step={1}
            onValueChange={(v) => setTimeIndex(Array.isArray(v) ? v[0] : v)}
          />
          <div className="range-labels">
            <span>{new Date(times[0]).toISOString().slice(0, 10)}</span>
            <span>{times.length} time steps</span>
            <span>{new Date(times.at(-1)!).toISOString().slice(0, 10)}</span>
          </div>
        </div>
        <Choice
          label="Animation speed"
          value={speed}
          onChange={setSpeed}
          options={['0.5', '1', '2', '4'].map((v) => ({
            value: v,
            label: `${v}×`,
          }))}
        />
      </footer>
      <Dialog open={importOpen} onOpenChange={setImportOpen}>
        <DialogContent className="data-dialog">
          <DialogTitle>Bring your ocean data</DialogTitle>
          <DialogDescription>
            Load model fields and observations into the same workspace. Files
            stay in this browser except NetCDF, which is sent to your configured
            Python service.
          </DialogDescription>
          <div className="import-options">
            <div>
              <b>Observations</b>
              <p>
                CSV, TSV or delimited text. Columns: id, kind, latitude,
                longitude, depth, time, plus temperature, salinity, speed or
                chlorophyll.
              </p>
              <a href="/sample-observations.csv" download>
                Download sample CSV
              </a>
            </div>
            <div>
              <b>Model fields</b>
              <p>
                NetCDF through the xarray service, or normalized HydroNexus
                JSON. Rectilinear latitude × longitude × depth × time grids.
              </p>
              <a href="/sample-model.nc" download>
                Sample NetCDF
              </a>
              <span> · </span>
              <a href="/sample-model.json" download>
                Sample model JSON
              </a>
            </div>
          </div>
          <input
            ref={fileRef}
            type="file"
            aria-label="Import ocean dataset"
            accept=".csv,.tsv,.txt,.json,.nc,.nc4"
            disabled={importing}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void importFile(file);
            }}
          />
          <p className="muted">
            Up to 25 MB. Importing observations replaces the current profile
            collection. Imported data is not saved after a reload.
          </p>
          {importing && <output>Reading and validating the dataset…</output>}
          {importError && (
            <p className="error-text" role="alert">
              {importError}
            </p>
          )}
          <button
            className="outline-button"
            disabled={importing}
            onClick={() => {
              loadDataset(DEMO);
              setImportOpen(false);
              setNotice('Restored the synthetic demonstration dataset.');
            }}
          >
            Restore demonstration dataset
          </button>
        </DialogContent>
      </Dialog>
      <Dialog open={about} onOpenChange={setAbout}>
        <DialogContent className="data-dialog">
          <DialogTitle>HydroNexus</DialogTitle>
          <DialogDescription>
            A browser-native workspace for numerical ocean models and instrument
            profiles.
          </DialogDescription>
          <p>
            <b>Current dataset:</b> {data.name}
          </p>
          <p>{data.source}</p>
          <p>
            {data.synthetic
              ? 'All default model fields and instrument profiles are synthetic, generated for demonstration. This is not an operational forecast and is not affiliated with INCOIS.'
              : 'Imported data has been structurally validated, not scientifically quality-controlled.'}
          </p>
          <p>
            Layered volume rendering uses transparent depth surfaces.
            Isosurfaces show the shallowest crossing per water column.
            Coastlines use Natural Earth via world-atlas; they are not
            navigation charts or EEZ boundaries.
          </p>
          <p>
            Profiles use multilinear model interpolation at the instrument
            timestamp without extrapolation. Grid missing values remain missing.
            Vertical depth and current motion are exaggerated for visibility.
          </p>
          <p>
            OGC WMS/WCS, OPeNDAP serving, live feeds, data assimilation and
            operational QC are future integrations.
          </p>
        </DialogContent>
      </Dialog>
    </main>
  );
}
