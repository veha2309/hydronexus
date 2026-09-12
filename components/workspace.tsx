'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import {
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  LocateFixed,
  Minus,
  Pause,
  Play,
  Plus,
  RotateCcw,
  X,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Slider } from '@/components/ui/slider';
import { AtlasHeader, AtlasShell } from './atlas/shell';
import AtlasControls from './atlas/controls';
import AtlasInspector from './atlas/inspector';
import GuidedInvestigation from './atlas/guided-investigation';
import { Choice } from './atlas/fields';
import {
  DEFAULT_DISPLAY,
  SENSOR_KINDS,
  investigationPreset,
  comparisonCSV,
  comparisonExplanation,
  type DisplaySettings,
} from '@/lib/atlas';
import {
  DEMO,
  boundsFor,
  compareProfile,
  dateLabel,
  depthsFor,
  paletteCSS,
  timesFor,
  type Dataset,
  type SensorKind,
} from '@/lib/ocean';
import { parseObservations, validateDataset } from '@/lib/ingestion';
import type { OceanView } from '@/lib/scene-math';
import {
  ATLAS_STORAGE_KEY,
  encodeAtlas,
  decodeAtlas,
} from '@/lib/atlas-storage';

const OceanScene = dynamic(() => import('./ocean-scene'), {
  ssr: false,
  loading: () => (
    <output className="scene-loading">Loading ocean geography…</output>
  ),
});

export default function Workspace() {
  const [data, setData] = useState<Dataset>(DEMO);
  const [variable, setVariable] = useState('temperature');
  const [depth, setDepth] = useState(100);
  const [view, setView] = useState<OceanView>('map');
  const [display, setDisplay] = useState<DisplaySettings>(DEFAULT_DISPLAY);
  const [timeIndex, setTimeIndex] = useState(0),
    [playing, setPlaying] = useState(false),
    [speed, setSpeed] = useState('1');
  const [sensors, setSensors] = useState<SensorKind[]>(SENSOR_KINDS);
  const [selected, setSelected] = useState<string | null>(null),
    [compare, setCompare] = useState(true);
  const [controlsOpen, setControlsOpen] = useState(true),
    [inspectorOpen, setInspectorOpen] = useState(false);
  const [sectionLatitude, setSectionLatitude] = useState(14.81);
  const [cameraReset, setCameraReset] = useState(0),
    [focusRequest, setFocusRequest] = useState(0);
  const [zoomRequest, setZoomRequest] = useState({ direction: 0, serial: 0 });
  const [guideStep, setGuideStep] = useState<number | null>(null);
  const [importOpen, setImportOpen] = useState(false),
    [importing, setImporting] = useState(false),
    [importError, setImportError] = useState('');
  const [about, setAbout] = useState(false),
    [notice, setNotice] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const guideTime = useRef(0);
  const spec =
    data.variables.find((v) => v.id === variable) ?? data.variables[0];
  const times = timesFor(data),
    time = times[Math.min(timeIndex, times.length - 1)],
    bounds = boundsFor(data);
  const instrument = data.observations.find((o) => o.id === selected) ?? null;
  const comparison = useMemo(
    () => (instrument ? compareProfile(data, instrument, spec.id) : null),
    [data, instrument, spec.id],
  );
  const vectorAvailable =
    (!data.grid && data.synthetic) ||
    Boolean(data.grid?.fields.u && data.grid?.fields.v);
  const visibleCount = data.observations.filter(
    (o) =>
      sensors.includes(o.kind) &&
      Date.parse(o.time) <= Date.parse(time) &&
      o.longitude >= bounds.west &&
      o.longitude <= bounds.east &&
      o.latitude >= bounds.south &&
      o.latitude <= bounds.north,
  ).length;
  const patchDisplay = (patch: Partial<DisplaySettings>) =>
    setDisplay((old) => ({ ...old, ...patch }));

  const [storageReady, setStorageReady] = useState(false);
  const storageWarned = useRef(false);
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      try {
        const raw = localStorage.getItem(ATLAS_STORAGE_KEY);
        const saved = raw ? decodeAtlas(raw) : null;
        if (saved) {
          setData(saved.data);
          setVariable(saved.variable);
          setDepth(saved.depth);
          setView(saved.view);
          setDisplay(saved.display);
          setTimeIndex(saved.timeIndex);
          setSpeed(saved.speed);
          setSensors(saved.sensors);
          setSelected(saved.selected);
          setCompare(saved.compare);
          setSectionLatitude(saved.sectionLatitude);
          setControlsOpen(saved.controlsOpen);
          setInspectorOpen(saved.inspectorOpen);
          setGuideStep(saved.guideStep);
          guideTime.current = saved.guideTime;
        }
      } catch {
        setNotice(
          'Browser storage is unavailable. Changes will last for this session only.',
        );
        storageWarned.current = true;
      }
      setStorageReady(true);
    });
    return () => cancelAnimationFrame(frame);
  }, []);
  useEffect(() => {
    if (!storageReady) return;
    const save = () => {
      try {
        localStorage.setItem(
          ATLAS_STORAGE_KEY,
          encodeAtlas({
            data,
            variable,
            depth,
            view,
            display,
            timeIndex,
            speed,
            sensors,
            selected,
            compare,
            sectionLatitude,
            controlsOpen,
            inspectorOpen,
            guideStep,
            guideTime: guideTime.current,
          }),
        );
      } catch {
        if (!storageWarned.current) {
          setNotice(
            'Browser storage is full or unavailable. This session works, but the latest changes cannot be saved. Large imported datasets may exceed local storage.',
          );
          storageWarned.current = true;
        }
      }
    };
    save();
  }, [
    storageReady,
    data,
    variable,
    depth,
    view,
    display,
    timeIndex,
    speed,
    sensors,
    selected,
    compare,
    sectionLatitude,
    controlsOpen,
    inspectorOpen,
    guideStep,
  ]);

  useEffect(() => {
    const compact = matchMedia('(max-width: 1099px)');
    const close = () => {
      if (compact.matches) {
        setControlsOpen(false);
        setInspectorOpen(false);
      }
    };
    const frame = requestAnimationFrame(close);
    compact.addEventListener('change', close);
    return () => {
      cancelAnimationFrame(frame);
      compact.removeEventListener('change', close);
    };
  }, []);
  useEffect(() => {
    if (!playing) return;
    const timer = setInterval(
      () => setTimeIndex((i) => (i + 1) % times.length),
      1200 / Number(speed),
    );
    return () => clearInterval(timer);
  }, [playing, speed, times.length]);
  useEffect(() => {
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !importOpen && !about) {
        setControlsOpen(false);
        setInspectorOpen(false);
        document
          .querySelector<HTMLButtonElement>('.view-actions button')
          ?.focus();
      }
    };
    window.addEventListener('keydown', escape);
    return () => window.removeEventListener('keydown', escape);
  }, [importOpen, about]);

  const closePanels = () => {
    setControlsOpen(false);
    setInspectorOpen(false);
  };
  const toggleControls = () => {
    setControlsOpen((v) => !v);
    if (window.innerWidth < 1100) setInspectorOpen(false);
  };
  const toggleInspector = () => {
    setInspectorOpen((v) => !v);
    if (window.innerWidth < 1100) setControlsOpen(false);
  };
  const selectInstrument = (id: string | null) => {
    setSelected(id);
    setInspectorOpen(id !== null);
    const observation = data.observations.find((o) => o.id === id);
    if (observation && !sensors.includes(observation.kind))
      setSensors((old) => [...old, observation.kind]);
    if (window.innerWidth < 1100) setControlsOpen(false);
  };
  const chooseVariable = (id: string) => {
    const v = data.variables.find((v) => v.id === id);
    if (!v) return;
    setVariable(id);
    patchDisplay({
      min: v.min,
      max: v.max,
      log: false,
      iso: (v.min + v.max) / 2,
      palette:
        id === 'temperature'
          ? 'thermal'
          : id === 'chlorophyll'
            ? 'viridis'
            : 'ocean',
    });
  };
  const loadDataset = (next: Dataset) => {
    setData(next);
    setGuideStep(null);
    const b = boundsFor(next),
      v = next.variables[0];
    setSectionLatitude((b.north + b.south) / 2);
    setVariable(v.id);
    setDisplay({
      ...DEFAULT_DISPLAY,
      min: v.min,
      max: v.max,
      iso: (v.min + v.max) / 2,
      palette: v.id === 'temperature' ? 'thermal' : 'ocean',
    });
    setDepth(depthsFor(next)[0]);
    setTimeIndex(0);
    setPlaying(false);
    setSelected(null);
    setInspectorOpen(false);
    setView('map');
    setSensors(SENSOR_KINDS);
    setCameraReset((i) => i + 1);
  };
  const applyGuideStep = (index: number) => {
    const preset = investigationPreset(index);
    setGuideStep(index);
    setView(preset.view);
    setDepth(preset.depth);
    setVariable(preset.variable);
    setSelected(preset.selected);
    setCompare(preset.compare);
    setInspectorOpen(preset.inspectorOpen);
    setControlsOpen(window.innerWidth >= 1100 && !preset.inspectorOpen);
    setTimeIndex(guideTime.current);
    setPlaying(false);
    setDisplay((previous) => ({
      ...DEFAULT_DISPLAY,
      enhancedLighting: previous.enhancedLighting,
      lightingStrength: previous.lightingStrength,
    }));
    setSensors(SENSOR_KINDS);
    setCameraReset((i) => i + 1);
    if (preset.selected) setFocusRequest((i) => i + 1);
  };
  const startInvestigation = () => {
    setData(DEMO);
    guideTime.current = 0;
    setNotice('');
    applyGuideStep(0);
  };
  const exportProfile = () => {
    if (!comparison) return;
    const url = URL.createObjectURL(
      new Blob([comparisonCSV(comparison)], { type: 'text/csv' }),
    );
    const link = document.createElement('a');
    link.href = url;
    link.download = `hydronexus-${spec.id}-comparison.csv`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
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
      setGuideStep(null);
      setImportOpen(false);
    } catch (e) {
      setImportError(e instanceof Error ? e.message : 'Import failed.');
    } finally {
      setImporting(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  return (
    <main
      className={`workspace ${display.enhancedLighting ? 'effects-on' : ''}`}
    >
      <AtlasHeader
        synthetic={data.synthetic}
        view={view}
        onView={setView}
        controlsOpen={controlsOpen}
        inspectorOpen={inspectorOpen}
        onControls={toggleControls}
        onInspector={toggleInspector}
        onImport={() => setImportOpen(true)}
        onAbout={() => setAbout(true)}
        onStart={startInvestigation}
        guided={guideStep !== null}
      />
      {notice && (
        <output className="notice">
          {notice}
          <button
            className="icon-button"
            aria-label="Dismiss notification"
            onClick={() => setNotice('')}
          >
            <X size={17} />
          </button>
        </output>
      )}
      {guideStep !== null && (
        <GuidedInvestigation
          finding={
            comparison
              ? comparisonExplanation(comparison, spec.unit)
              : undefined
          }
          step={guideStep}
          onStep={applyGuideStep}
          onRestart={startInvestigation}
          onExit={() => setGuideStep(null)}
        />
      )}
      <AtlasShell
        controlsOpen={controlsOpen}
        inspectorOpen={inspectorOpen}
        onClosePanels={closePanels}
        controls={
          <AtlasControls
            data={data}
            spec={spec}
            depth={depth}
            view={view}
            sectionLatitude={sectionLatitude}
            display={display}
            sensors={sensors}
            vectorAvailable={vectorAvailable}
            guided={guideStep !== null}
            onVariable={chooseVariable}
            onDepth={setDepth}
            onView={setView}
            onSectionLatitude={setSectionLatitude}
            onDisplay={patchDisplay}
            onSensors={setSensors}
            onClose={() => setControlsOpen(false)}
            onAbout={() => setAbout(true)}
            onStart={startInvestigation}
            onNotice={setNotice}
          />
        }
        inspector={
          <AtlasInspector
            data={data}
            spec={spec}
            instrument={instrument}
            comparison={comparison}
            compare={compare}
            time={time}
            visibleCount={visibleCount}
            explain={guideStep === 3}
            onCompare={setCompare}
            onSelect={selectInstrument}
            onFocus={() => {
              setFocusRequest((i) => i + 1);
              if (instrument && view === 'section')
                setSectionLatitude(
                  Math.min(
                    bounds.north,
                    Math.max(bounds.south, instrument.latitude),
                  ),
                );
            }}
            onExport={exportProfile}
            onClose={() => setInspectorOpen(false)}
          />
        }
      >
        <OceanScene
          data={data}
          variable={spec.id}
          depth={depth}
          time={time}
          {...display}
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
            {data === DEMO ? 'Indian Ocean' : data.name}
          </p>
          <h1>
            {spec.label}
            <span> / {depth.toLocaleString()} m</span>
          </h1>
          <p>
            {view === 'section'
              ? `Section at ${sectionLatitude.toFixed(1)}° latitude`
              : view === 'volume'
                ? 'Water column'
                : view === 'globe'
                  ? 'Global reference'
                  : 'Regional surface map'}
            <span className="scene-date"> · {dateLabel(time)}</span>
          </p>
        </div>
        <div className="scene-tools">
          {view === 'map' && (
            <span className="north-mark" title="North-up map">
              N ↑
            </span>
          )}
          <button
            className="icon-button"
            aria-label="Zoom in"
            onClick={() =>
              setZoomRequest((v) => ({ direction: 1, serial: v.serial + 1 }))
            }
          >
            <Plus size={18} />
          </button>
          <button
            className="icon-button"
            aria-label="Zoom out"
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
            onClick={() => setCameraReset((i) => i + 1)}
          >
            <RotateCcw size={17} />
          </button>
          {instrument && (
            <button
              className="icon-button"
              aria-label="Focus selected instrument"
              onClick={() => setFocusRequest((i) => i + 1)}
            >
              <LocateFixed size={17} />
            </button>
          )}
        </div>
        <div className="floating-legend">
          <div>
            <strong>{spec.label}</strong>
            <span>
              {spec.unit} · {display.log ? 'log' : 'linear'}
            </span>
          </div>
          <div
            className="legend-gradient"
            style={{ background: paletteCSS(display.palette) }}
          />
          <div className="legend-values">
            <span>{Number(display.min.toPrecision(4))}</span>
            <span>
              {(display.log
                ? Math.sqrt(display.min * display.max)
                : (display.min + display.max) / 2
              ).toFixed(1)}
            </span>
            <span>{Number(display.max.toPrecision(4))}</span>
          </div>
        </div>
        <div className="scene-footer">
          <span>
            {view === 'map'
              ? 'Drag to pan · Scroll to zoom'
              : view === 'section'
                ? 'Scroll to zoom · Drag to pan with right button'
                : 'Drag to orbit · Scroll to zoom'}
          </span>
          <span>
            {view === 'volume' || view === 'section'
              ? `${display.exaggeration}× vertical exaggeration`
              : 'Natural Earth coastline'}
          </span>
        </div>
        {!inspectorOpen && (
          <button className="observation-peek" onClick={toggleInspector}>
            <span>{visibleCount} profiles in view</span>
            <strong>
              {instrument ? 'Open selected profile' : 'Inspect observations'}
            </strong>
            <ArrowRight size={18} />
          </button>
        )}
        {!data.grid && !data.synthetic && (
          <div className="scene-error">
            This dataset contains observation profiles only. Import a model grid
            to display ocean fields. Profiles remain available in Observations.
          </div>
        )}
      </AtlasShell>
      <footer className="timeline">
        <div className="time-readout">
          <span>Model time</span>
          <b>{dateLabel(time)}</b>
        </div>
        <div className="playback">
          <button
            className="icon-button"
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
            aria-label={
              playing ? 'Pause time animation' : 'Play time animation'
            }
            disabled={times.length < 2}
            onClick={() => setPlaying((v) => !v)}
          >
            {playing ? <Pause size={17} /> : <Play size={17} />}
          </button>
          <button
            className="icon-button"
            aria-label="Next model time"
            disabled={timeIndex === times.length - 1}
            onClick={() => {
              setPlaying(false);
              setTimeIndex((i) => Math.min(times.length - 1, i + 1));
            }}
          >
            <ChevronRight size={17} />
          </button>
        </div>
        <div className="time-slider">
          <Slider
            aria-label="Model time step"
            value={[timeIndex]}
            min={0}
            max={Math.max(1, times.length - 1)}
            disabled={times.length < 2}
            step={1}
            onValueChange={(v) => {
              setPlaying(false);
              setTimeIndex(Array.isArray(v) ? v[0] : v);
            }}
          />
          <div className="range-labels">
            <span>{times[0].slice(0, 10)}</span>
            <span>{times.length} time steps</span>
            <span>{times.at(-1)!.slice(0, 10)}</span>
          </div>
        </div>
        <Choice
          label="Animation speed"
          value={speed}
          onChange={setSpeed}
          options={['0.5', '1', '2', '4'].map((value) => ({
            value,
            label: `${value}×`,
          }))}
        />
      </footer>
      <Dialog open={importOpen} onOpenChange={setImportOpen}>
        <DialogContent className="data-dialog">
          <DialogTitle>Import ocean data</DialogTitle>
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
          <DialogTitle>Dataset information</DialogTitle>
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
