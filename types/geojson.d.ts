declare namespace GeoJSON {
  type Position = number[];
  type Geometry =
    | { type: 'Point'; coordinates: Position }
    | { type: 'LineString'; coordinates: Position[] }
    | { type: 'Polygon'; coordinates: Position[][] }
    | { type: 'MultiPoint'; coordinates: Position[] }
    | { type: 'MultiLineString'; coordinates: Position[][] }
    | { type: 'MultiPolygon'; coordinates: Position[][][] };
}
