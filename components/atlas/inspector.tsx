'use client';
import { Download, LocateFixed, X, ArrowRight } from 'lucide-react';
import ProfileChart from '@/components/profile-chart';
import { Switch } from '@/components/ui/switch';
import { comparisonExplanation } from '@/lib/atlas';
import {
  compareProfile,
  dateLabel,
  boundsFor,
  type Dataset,
  type Instrument,
  type VariableSpec,
} from '@/lib/ocean';

export default function AtlasInspector({
  data,
  spec,
  instrument,
  comparison,
  compare,
  time,
  visibleCount,
  explain,
  onCompare,
  onSelect,
  onFocus,
  onExport,
  onClose,
}: {
  data: Dataset;
  spec: VariableSpec;
  instrument: Instrument | null;
  comparison: ReturnType<typeof compareProfile> | null;
  compare: boolean;
  time: string;
  visibleCount: number;
  explain: boolean;
  onCompare: (compare: boolean) => void;
  onSelect: (id: string | null) => void;
  onFocus: () => void;
  onExport: () => void;
  onClose: () => void;
}) {
  const b = boundsFor(data);
  return (
    <>
      <div className="panel-heading">
        <h2>{instrument ? 'Observation profile' : 'Observations'}</h2>
        <button
          className="icon-button"
          aria-label="Close inspector panel"
          onClick={onClose}
        >
          <X size={18} />
        </button>
      </div>
      {instrument ? (
        <>
          <div className="instrument-heading">
            <span className={`sensor-dot ${instrument.kind.toLowerCase()}`} />
            <span>{instrument.kind} profile</span>
            <button className="text-button" onClick={onFocus}>
              <LocateFixed size={15} />
              Locate
            </button>
          </div>
          <h3 className="instrument-id">{instrument.id.split('@')[0]}</h3>
          <div className="profile-heading">
            <h3>{spec.label} by depth</h3>
            <span>{spec.unit}</span>
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
              checked={compare}
              onCheckedChange={onCompare}
            />
          </label>
          <dl className="profile-metadata">
            <div>
              <dt>Position</dt>
              <dd>
                {Math.abs(instrument.latitude).toFixed(2)}°
                {instrument.latitude < 0 ? 'S' : 'N'} /{' '}
                {Math.abs(instrument.longitude).toFixed(2)}°
                {instrument.longitude < 0 ? 'W' : 'E'}
              </dd>
            </div>
            <div>
              <dt>Observed</dt>
              <dd>{dateLabel(instrument.time)}</dd>
            </div>
          </dl>
          {compare && comparison && (
            <>
              <p className="metric-note">
                {comparison.count
                  ? `${comparison.count} matched depths · sampled at observation time`
                  : 'No overlapping model values at this profile’s location, depth and time.'}
              </p>
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
                  <span>Bias · obs − model</span>
                  <strong>
                    {comparison.bias === null
                      ? '—'
                      : `${comparison.bias >= 0 ? '+' : ''}${comparison.bias.toFixed(3)}`}
                    <small>{spec.unit}</small>
                  </strong>
                </div>
              </div>
              {explain && (
                <div className="comparison-explanation">
                  <h4>Reading the comparison</h4>
                  <p>{comparisonExplanation(comparison, spec.unit)}</p>
                  <p>
                    These differences describe this demonstration, not forecast
                    accuracy.
                  </p>
                </div>
              )}
            </>
          )}
          <button className="export-button" onClick={onExport}>
            <Download size={16} />
            Export comparison CSV
          </button>
          <details className="profile-table">
            <summary>Numerical values</summary>
            <div>
              <table>
                <caption className="sr-only">
                  {spec.label} profile values in {spec.unit}
                </caption>
                <thead>
                  <tr>
                    <th scope="col">Depth (m)</th>
                    <th scope="col">Observed</th>
                    <th scope="col">Model</th>
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
          <button
            className="text-button deselect"
            onClick={() => onSelect(null)}
          >
            Deselect instrument
          </button>
        </>
      ) : (
        <p className="empty-note">
          Choose a marker on the map or a profile below to inspect its
          measurements.
        </p>
      )}
      <section className="instrument-list">
        <div className="section-title">
          <h3>Observation network</h3>
          <span>{visibleCount} visible</span>
        </div>
        {data.observations.length === 0 && (
          <p className="empty-note">
            No profiles in this dataset. Import an observation CSV to compare
            measurements.
          </p>
        )}
        {data.observations.map((o) => (
          <button
            key={o.id}
            className={o.id === instrument?.id ? 'selected' : ''}
            aria-pressed={o.id === instrument?.id}
            onClick={() => onSelect(o.id)}
          >
            <span className={`sensor-dot ${o.kind.toLowerCase()}`} />
            <span>
              {o.id.split('@')[0]}
              <small>
                {o.longitude < b.west ||
                o.longitude > b.east ||
                o.latitude < b.south ||
                o.latitude > b.north
                  ? 'Outside model region'
                  : Date.parse(o.time) > Date.parse(time)
                    ? 'Later than scene time'
                    : `${o.points.at(-1)?.depth ?? 0} m · ${o.kind}`}
              </small>
            </span>
            <ArrowRight size={15} />
          </button>
        ))}
      </section>
    </>
  );
}
