'use client';
import { useState } from 'react';
import { Slider } from '@/components/ui/slider';

export function Choice({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
}) {
  return (
    <select
      className="choice"
      aria-label={label}
      value={value}
      onChange={(e) => onChange(e.target.value)}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

export function Range({
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
  onChange: (value: number) => void;
}) {
  return (
    <div className="range-control">
      <div className="control-label">
        <span>{label}</span>
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
        disabled={min === max}
        onValueChange={(v) => onChange(Array.isArray(v) ? v[0] : v)}
      />
    </div>
  );
}

export function ColorRange({
  min,
  max,
  log,
  onApply,
}: {
  min: number;
  max: number;
  log: boolean;
  onApply: (min: number, max: number) => void;
}) {
  const [a, setA] = useState(String(min)),
    [b, setB] = useState(String(max));
  const [error, setError] = useState('');
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
          setError(
            'Minimum must be below maximum. Log scale requires a positive minimum.',
          );
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
        <button type="submit" className="text-button">
          Apply
        </button>
      </div>
      {error && (
        <p role="alert" className="error-text">
          {error}
        </p>
      )}
    </form>
  );
}
