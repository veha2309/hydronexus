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
