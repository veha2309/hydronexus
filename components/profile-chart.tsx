'use client';
/* oxlint-disable jsx-a11y/prefer-tag-over-role -- SVG charts need role=img to expose one accessible graphic. */
import {
  compareProfile,
  type Dataset,
  type Instrument,
  type VariableSpec,
} from '@/lib/ocean';
export default function ProfileChart({
  data,
  instrument,
  variable,
  compare,
}: {
  data: Dataset;
  instrument: Instrument;
  variable: VariableSpec;
  compare: boolean;
}) {
  const { points } = compareProfile(data, instrument, variable.id);
  const values = points
    .flatMap((p) => [p.observed, ...(compare ? [p.model] : [])])
    .filter((v): v is number => v !== null && Number.isFinite(v));
  if (!values.length)
    return (
      <p className="empty-note">
        No {variable.label.toLowerCase()} measurements in this profile.
      </p>
    );
  const lo = Math.min(...values),
    hi = Math.max(...values),
    pad = Math.max((hi - lo) * 0.1, 0.05),
    min = lo - pad,
    max = hi + pad,
    maxDepth = Math.max(1, ...points.map((p) => p.depth));
  const x = (v: number) => 46 + ((v - min) / (max - min)) * 205,
    y = (d: number) => 35 + (d / maxDepth) * 210;
  const path = (key: 'model' | 'observed') => {
    let pen = false;
    return points
      .map((p) => {
        const value = p[key];
        if (value === null) {
          pen = false;
          return '';
        }
        const command = pen ? 'L' : 'M';
        pen = true;
        return `${command}${x(value).toFixed(2)},${y(p.depth).toFixed(2)}`;
      })
      .join(' ');
  };
  // SVG has no native image semantics; role=img makes the chart a single accessible graphic.
  return (
    <>
      <svg
        className="profile-chart"
        viewBox="0 0 278 280"
        role="img"
        aria-label={`${variable.label} versus depth for ${instrument.id}. Observations in ochre with dashed lines${compare ? ', model in blue with a solid line' : ''}. Values available in the profile table.`}
      >
        {Array.from({ length: 5 }, (_, i) => {
          const d = (i * maxDepth) / 4;
          return (
            <g key={i}>
              <line
                x1="46"
                x2="251"
                y1={y(d)}
                y2={y(d)}
                stroke="#293944"
                strokeDasharray="3 4"
              />
              <text x="37" y={y(d) + 4} textAnchor="end">
                {Math.round(d)}
              </text>
            </g>
          );
        })}
        {[0, 1, 2, 3].map((i) => {
          const v = min + ((max - min) * i) / 3;
          return (
            <text key={i} x={x(v)} y="265" textAnchor="middle">
              {v.toFixed(1)}
            </text>
          );
        })}
        <text x="46" y="16">
          Depth (m)
        </text>
        <text x="251" y="16" textAnchor="end">
          {variable.unit}
        </text>
        {compare && (
          <path
            d={path('model')}
            fill="none"
            stroke="#8eafc5"
            strokeWidth="2"
          />
        )}
        <path
          d={path('observed')}
          fill="none"
          stroke="#dba780"
          strokeWidth="2"
          strokeDasharray="5 3"
        />
        {points
          .filter((p) => p.observed !== null)
          .map((p) => (
            <circle
              key={p.depth}
              cx={x(p.observed!)}
              cy={y(p.depth)}
              r="2.8"
              fill="#dba780"
            />
          ))}
      </svg>
      <div className="chart-legend">
        <span>
          <i className="observed" />
          Observation
        </span>
        {compare && (
          <span>
            <i />
            Model
          </span>
        )}
      </div>
    </>
  );
}
