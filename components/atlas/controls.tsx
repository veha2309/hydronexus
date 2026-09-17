'use client';
import { ArrowRight, SlidersHorizontal, X, Info } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { Choice, Range, ColorRange } from './fields';
import { SENSOR_KINDS, type DisplaySettings } from '@/lib/atlas';
import {
  DEMO,
  boundsFor,
  depthsFor,
  paletteCSS,
  type Dataset,
  type SensorKind,
  type VariableSpec,
} from '@/lib/ocean';
import type { OceanView } from '@/lib/scene-math';

export default function AtlasControls({
  data,
  spec,
  depth,
  view,
  sectionLatitude,
  display,
  sensors,
  vectorAvailable,
  guided,
  onVariable,
  onDepth,
  onView,
  onSectionLatitude,
  onDisplay,
  onSensors,
  onClose,
  onAbout,
  onStart,
  onNotice,
}: {
  data: Dataset;
  spec: VariableSpec;
  depth: number;
  view: OceanView;
  sectionLatitude: number;
  display: DisplaySettings;
  sensors: SensorKind[];
  vectorAvailable: boolean;
  guided: boolean;
  onVariable: (id: string) => void;
  onDepth: (depth: number) => void;
  onView: (view: OceanView) => void;
  onSectionLatitude: (latitude: number) => void;
  onDisplay: (patch: Partial<DisplaySettings>) => void;
  onSensors: (sensors: SensorKind[]) => void;
  onClose: () => void;
  onAbout: () => void;
  onStart: () => void;
  onNotice: (message: string) => void;
}) {
  const depths = depthsFor(data),
    bounds = boundsFor(data);
  return (
    <>
      <div className="panel-heading">
        <h2>Ocean layers</h2>
        <button
          className="icon-button"
          aria-label="Close layers panel"
          onClick={onClose}
        >
          <X size={18} />
        </button>
      </div>
      <section className="variable-section">
        <h3>Variable</h3>
        <div className="variable-list">
          {data.variables.map((v, i) => (
            <button
              key={v.id}
              className={`layer ${v.id === spec.id ? 'active' : ''}`}
              aria-pressed={v.id === spec.id}
              onClick={() => onVariable(v.id)}
            >
              <span className="variable-number">
                {String(i + 1).padStart(2, '0')}
              </span>
              {v.label}
              <span className="unit">{v.unit}</span>
            </button>
          ))}
        </div>
      </section>
      <section>
        {depths.length > 1 ? (
          <Range
            label="Depth slice"
            value={depth}
            min={depths[0]}
            max={depths.at(-1)!}
            step={1}
            unit="m"
            onChange={onDepth}
          />
        ) : (
          <div className="field-label">
            <span>Depth slice</span>
            <span>{depths[0]} m · surface product</span>
          </div>
        )}
        <div className="range-labels">
          <span>Surface · {depths[0]} m</span>
          <span>{depths.at(-1)!.toLocaleString()} m</span>
        </div>
        {view === 'section' && (
          <>
            <Range
              label="Section latitude"
              value={sectionLatitude}
              min={bounds.south}
              max={bounds.north}
              step={0.1}
              unit="°"
              onChange={onSectionLatitude}
            />
            <p className="field-note">
              East–west cut. Profiles within 0.5° are projected onto the
              section.
            </p>
          </>
        )}
      </section>
      {!guided && (
        <div className="investigation-entry">
          <span className="eyebrow">A closer look · 3–5 min</span>
          <h3>What changes below the surface?</h3>
          <p>
            Follow temperature from the map to an Argo profile, then compare it
            with the model.
          </p>
          <button className="text-button" onClick={onStart}>
            Start investigation
            <ArrowRight size={17} />
          </button>
          {data !== DEMO && (
            <small>Uses the bundled demonstration dataset.</small>
          )}
        </div>
      )}
      <details className="advanced-controls">
        <summary>
          Display
          <SlidersHorizontal size={16} />
        </summary>
        <div className="field-label">Rendering</div>
        <label
          className="toggle-label lighting-toggle"
          htmlFor="enhanced-lighting"
        >
          Enhanced lighting
          <Switch
            id="enhanced-lighting"
            checked={display.enhancedLighting}
            onCheckedChange={(enhancedLighting) =>
              onDisplay({ enhancedLighting })
            }
          />
        </label>
        {display.enhancedLighting && (
          <>
            <Range
              label="Lighting strength"
              value={display.lightingStrength * 100}
              min={10}
              max={100}
              unit="%"
              onChange={(strength) =>
                onDisplay({ lightingStrength: strength / 100 })
              }
            />
            <p className="field-note">
              Soft directional lighting adds depth to the geography. Enable
              Current particles below to see the modeled flow direction.
            </p>
          </>
        )}
        <Choice
          label="Rendering mode"
          value={display.renderMode}
          onChange={(value) => {
            onDisplay({ renderMode: value as DisplaySettings['renderMode'] });
            onView('volume');
          }}
          options={[
            { value: 'volume', label: 'Layered volume' },
            { value: 'slice', label: 'Depth slice' },
            { value: 'iso', label: 'Isosurface' },
          ]}
        />
        <p className="field-note" id="rendering-note">
          Rendering modes apply to the water-column view.
        </p>
        {display.renderMode === 'iso' && (
          <Range
            label="Isovalue"
            value={display.iso}
            min={spec.min}
            max={spec.max}
            step={(spec.max - spec.min) / 100}
            unit={spec.unit}
            onChange={(iso) => onDisplay({ iso })}
          />
        )}
        <Range
          label="Vertical exaggeration"
          value={display.exaggeration}
          min={1}
          max={30}
          unit="×"
          onChange={(exaggeration) => onDisplay({ exaggeration })}
        />
        <Range
          label="Layer opacity"
          value={display.opacity * 100}
          min={10}
          max={100}
          unit="%"
          onChange={(opacity) => onDisplay({ opacity: opacity / 100 })}
        />
        <div className="field-label">Color palette</div>
        <Choice
          label="Color palette"
          value={display.palette}
          onChange={(palette) =>
            onDisplay({ palette: palette as DisplaySettings['palette'] })
          }
          options={['thermal', 'ocean', 'viridis'].map((value) => ({
            value,
            label: value[0].toUpperCase() + value.slice(1),
          }))}
        />
        <div
          className="mini-colorbar"
          style={{ background: paletteCSS(display.palette) }}
        />
        <ColorRange
          key={`${spec.id}:${display.min}:${display.max}`}
          min={display.min}
          max={display.max}
          log={display.log}
          onApply={(min, max) => onDisplay({ min, max })}
        />
        <label className="toggle-label" htmlFor="logarithmic">
          Logarithmic scale
          <Switch
            id="logarithmic"
            checked={display.log}
            onCheckedChange={(log) => {
              if (log && display.min <= 0) {
                onNotice(
                  'Set a positive colorbar minimum before enabling log scale.',
                );
                return;
              }
              onDisplay({ log });
            }}
          />
        </label>
        <label className="toggle-label" htmlFor="current-particles">
          Current particles
          <Switch
            id="current-particles"
            checked={display.currents && vectorAvailable}
            disabled={!vectorAvailable}
            onCheckedChange={(currents) => onDisplay({ currents })}
          />
        </label>
        {!vectorAvailable && (
          <p className="field-note">
            This dataset has no eastward/northward current vectors.
          </p>
        )}
      </details>
      <details className="observation-filters">
        <summary>
          Observation layers<span>{data.observations.length}</span>
        </summary>
        {SENSOR_KINDS.map((kind) => (
          <label className="toggle-label" htmlFor={`sensor-${kind}`} key={kind}>
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
                onSensors(
                  checked
                    ? [...sensors, kind]
                    : sensors.filter((k) => k !== kind),
                )
              }
            />
          </label>
        ))}
      </details>
      <button className="dataset-button" onClick={onAbout}>
        <Info size={17} />
        <span>
          Dataset information
          <small>
            {data.grid
              ? `${data.grid.latitude.length} × ${data.grid.longitude.length} grid`
              : 'Indian Ocean demonstration'}
          </small>
        </span>
        <ArrowRight size={16} />
      </button>
    </>
  );
}

