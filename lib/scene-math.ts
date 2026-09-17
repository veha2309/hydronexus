/** Geographic transforms shared by the globe, regional view and camera tests. */
export type OceanView = 'globe' | 'volume' | 'map' | 'section';
export function globePosition(
  latitude: number,
  longitude: number,
  radius = 8,
): [number, number, number] {
  const lat = (latitude * Math.PI) / 180,
    lon = (longitude * Math.PI) / 180;
  return [
    radius * Math.cos(lat) * Math.cos(lon),
    radius * Math.sin(lat),
    -radius * Math.cos(lat) * Math.sin(lon),
  ];
}
export function fittingDistance(
  radius: number,
  width: number,
  height: number,
  horizontalInset = 0,
  verticalInset = 0,
  fov = 40,
) {
  const vertical = Math.tan((fov * Math.PI) / 360);
  const horizontalAngle = Math.atan(
    (vertical * Math.max(160, width - horizontalInset)) / Math.max(1, height),
  );
  const verticalAngle = Math.atan(
    (vertical * Math.max(160, height - verticalInset)) / Math.max(1, height),
  );
  return (radius / Math.sin(Math.min(horizontalAngle, verticalAngle))) * 1.08;
}

/** Convert an observed magnitude into bounded scene-space relief. */
export function magnitudeRelief(
  variable: string,
  value: number | null,
  min: number,
  max: number,
) {
  if (
    value === null ||
    !Number.isFinite(value) ||
    !Number.isFinite(min) ||
    !Number.isFinite(max) ||
    max <= min
  )
    return 0;
  const normalized = Math.min(1, Math.max(0, (value - min) / (max - min)));
  if (variable === 'wave_height') return 0.025 + normalized * 0.5;
  if (variable === 'wind_speed') return 0.02 + normalized * 0.38;
  return 0;
}

/** Representative crest displacement from aggregate wave statistics (not phase-resolved). */
export function wavePhaseOffset(
  height: number | null,
  period: number | null,
  direction: number | null,
  x: number,
  z: number,
  seconds: number,
) {
  if (
    height === null ||
    period === null ||
    direction === null ||
    !Number.isFinite(height) ||
    !Number.isFinite(period) ||
    !Number.isFinite(direction) ||
    height <= 0 ||
    period <= 0
  )
    return 0;
  const travel = (((direction + 180) % 360) * Math.PI) / 180,
    along = x * Math.sin(travel) - z * Math.cos(travel),
    amplitude = Math.min(0.085, height * 0.018),
    spatialFrequency = 8 / Math.max(3, Math.min(24, period)),
    angularFrequency = (Math.PI * 2) / Math.max(2, period);
  return amplitude * Math.sin(along * spatialFrequency - seconds * angularFrequency);
}
