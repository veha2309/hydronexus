"""Bounded CF-aware rectilinear NetCDF -> HydroNexus JSON conversion.

Usage: python backend/convert.py input.nc output.json --bbox 65 0 100 28
Add variable entries to registry.json without changing the rendering code.
"""
from __future__ import annotations
import argparse
import json
import math
from pathlib import Path
import numpy as np
import xarray as xr

REGISTRY = json.loads(Path(__file__).with_name('registry.json').read_text(encoding='utf-8'))
ALIASES = {'latitude': ('latitude', 'lat'), 'longitude': ('longitude', 'lon'), 'depth': ('depth', 'deptht', 'lev', 'level'), 'time': ('time',)}
STANDARD = {'latitude': 'latitude', 'longitude': 'longitude', 'depth': 'depth', 'time': 'time'}
LIMITS = {'latitude': 48, 'longitude': 56, 'depth': 20, 'time': 12}

def normalize(ds: xr.Dataset, name: str, bbox=None) -> dict:
    rename = {}
    for canonical, aliases in ALIASES.items():
        candidates = [key for key in ds.coords if key.lower() in aliases or ds[key].attrs.get('standard_name') == STANDARD[canonical]]
        if not candidates:
            raise ValueError(f'Missing {canonical} coordinate. Four-dimensional rectilinear model grids are required.')
        key = candidates[0]
        if ds[key].ndim != 1 or ds[key].dims != (key,):
            raise ValueError(f'{key} must be a one-dimensional dimension coordinate. Regrid curvilinear or staggered data before import.')
        if key != canonical:
            rename[key] = canonical
    ds = ds.rename(rename)
    if not np.issubdtype(ds.time.dtype, np.datetime64):
        raise ValueError('Time must decode to Gregorian datetime64 via CF units/calendar. Unsupported calendars must be converted explicitly.')
    depth_units = str(ds.depth.attrs.get('units', 'm')).lower().strip()
    if depth_units not in ('m', 'meter', 'meters', 'metre', 'metres', 'km'):
        raise ValueError('Depth must use metres or kilometres, not pressure coordinates. Convert pressure to depth before import.')
    depths = ds.depth.values.astype(float) * (1000 if depth_units == 'km' else 1)
    if ds.depth.attrs.get('positive', 'down').lower() == 'up':
        depths = -depths
    if not np.all(np.isfinite(depths)) or np.any(depths < 0):
        raise ValueError('Depth must be finite, positive down and non-negative.')
    ds = ds.assign_coords(depth=depths)
    ds = ds.assign_coords(longitude=((ds.longitude.astype(float) + 180) % 360) - 180)
    for key in ALIASES:
        ds = ds.sortby(key)
        values = ds[key].values
        if len(values) == 0 or len(np.unique(values)) != len(values):
            raise ValueError(f'{key} must contain unique coordinate values.')
        if key != 'time' and not np.all(np.isfinite(values)):
            raise ValueError(f'{key} contains non-finite coordinates.')
        if key == 'time' and np.any(np.isnat(values)):
            raise ValueError('Time contains missing dates.')
    if bbox is not None:
        west, south, east, north = bbox
        if not (-180 <= west < east <= 180 and -85 <= south < north <= 85):
            raise ValueError('bbox must be west south east north, without crossing the antimeridian.')
        ds = ds.sel(longitude=slice(west, east), latitude=slice(south, north))
    if any(ds.sizes[key] < 2 for key in ('latitude', 'longitude', 'depth')) or ds.sizes['time'] < 1:
        raise ValueError('The selected region needs at least 2 latitudes, longitudes and depths, and 1 time.')
    if float(ds.latitude.min()) < -85 or float(ds.latitude.max()) > 85:
        raise ValueError('Polar grids beyond 85 degrees are not supported by this regional renderer.')
    ds = ds.isel({
        key: slice(0, None, max(1, math.ceil(ds.sizes[key] / limit)))
        for key, limit in LIMITS.items()
    })
    dimensions = ('time', 'depth', 'latitude', 'longitude')
    fields, variables = {}, []
    for identifier, spec in REGISTRY.items():
        candidates = [key for key in ds.data_vars if key.lower() in spec['aliases'] or ds[key].attrs.get('standard_name') == spec['standardName']]
        if not candidates:
            continue
        array = ds[candidates[0]]
        extra = set(array.dims) - set(dimensions)
        for dim in extra:
            if array.sizes[dim] != 1:
                raise ValueError(f'{candidates[0]} has unsupported dimension {dim}; choose one ensemble/member first.')
            array = array.isel({dim: 0}, drop=True)
        if set(array.dims) != set(dimensions):
            raise ValueError(f'{candidates[0]} needs time/depth/latitude/longitude dimensions on a common grid.')
        values = array.transpose(*dimensions).values.astype(float)
        units = str(array.attrs.get('units', '')).lower().replace(' ', '')
        if identifier == 'temperature':
            if units in ('k', 'kelvin'):
                values -= 273.15
            elif units not in ('degc', 'degree_celsius', 'degrees_celsius', 'celsius', '°c', 'c'):
                raise ValueError('Temperature units must explicitly be Celsius or Kelvin.')
        elif identifier in ('u', 'v'):
            if units in ('cm/s', 'cms-1', 'cms^-1'):
                values /= 100
            elif units not in ('m/s', 'ms-1', 'ms^-1', 'm.s-1'):
                raise ValueError('Velocity units must explicitly be m/s or cm/s.')
        elif identifier == 'chlorophyll':
            if units in ('kg/m3', 'kgm-3', 'kgm^-3'):
                values *= 1e6
            elif units not in ('mg/m3', 'mgm-3', 'mgm^-3', 'mg/m³'):
                raise ValueError('Chlorophyll units must explicitly be kg/m3 or mg/m3.')
        elif identifier == 'salinity' and units not in ('psu', '1', '1e-3', '0.001', 'g/kg', 'gkg-1', 'ppt'):
            raise ValueError('Salinity units must be practical salinity units or g/kg; normalize other conventions explicitly.')
        flat = values.ravel()
        fields[identifier] = [float(v) if np.isfinite(v) else None for v in flat]
        finite = flat[np.isfinite(flat)]
        if finite.size == 0:
            raise ValueError(f'{candidates[0]} has no valid values in the selected region.')
        lo, hi = float(finite.min()), float(finite.max())
        if lo == hi:
            hi = lo + 1
        if identifier not in ('u', 'v'):
            variables.append({key: spec[key] for key in ('label', 'unit', 'standardName')} | {'id': identifier, 'min': lo, 'max': hi})
    if 'u' in fields and 'v' in fields:
        velocities = [float(np.hypot(u, v)) for u, v in zip(fields['u'], fields['v']) if u is not None and v is not None]
        variables.append({'id':'speed','label':'Current speed','unit':'m/s','standardName':'sea_water_speed','min':0,'max':max(velocities, default=1) or 1})
    if not variables:
        raise ValueError('No recognized 3D model variables. Add aliases to backend/registry.json.')
    if sum(len(v) for v in fields.values()) > 3_000_000:
        raise ValueError('Too many values after subsetting. Reduce LIMITS in the converter.')
    grid = {key: ds[key].values.astype(float).tolist() for key in ('latitude', 'longitude', 'depth')}
    grid['time'] = [str(np.datetime_as_string(t, unit='s')) + 'Z' for t in ds.time.values]
    grid['fields'] = fields
    synthetic = bool(ds.attrs.get('hydronexus_synthetic') == 1)
    return {'name':name, 'source':f'{"Synthetic demonstration" if synthetic else "Imported CF-aware"} NetCDF: {name}; subsampled, no operational QC performed', 'synthetic':synthetic, 'variables':variables, 'grid':grid, 'observations':[]}

def convert(path: str | Path, bbox=None) -> dict:
    with xr.open_dataset(path, decode_cf=True) as ds:
        return normalize(ds, Path(path).name, bbox)

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('input', type=Path)
    parser.add_argument('output', type=Path)
    parser.add_argument('--bbox', type=float, nargs=4, metavar=('WEST','SOUTH','EAST','NORTH'))
    args = parser.parse_args()
    result = convert(args.input, args.bbox)
    args.output.write_text(json.dumps(result, allow_nan=False, separators=(',', ':')), encoding='utf-8')
    print(f"Converted {result['name']}: {len(result['variables'])} variables, {len(result['grid']['time'])} times -> {args.output}")

