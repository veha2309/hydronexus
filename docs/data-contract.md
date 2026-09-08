# HydroNexus data contract

## Observations

CSV or tab-separated text, with headers:

```csv
id,kind,latitude,longitude,depth,time,temperature,salinity,speed,chlorophyll
PROFILE-01,Argo,14.81,86.42,0,2026-09-07T00:00:00Z,29.2,34.5,0.3,0.4
PROFILE-01,Argo,14.81,86.42,100,2026-09-07T00:00:00Z,23.1,34.7,0.2,0.1
```

Required: `id`, `kind`, `latitude`, `longitude`, `depth`, `time`, and at least one supported variable. Kinds are exactly `Argo`, `Glider`, `CTD`, `BGC`. Latitude/longitude are decimal degrees. Depth is metres positive down. Timestamps must include a timezone. Temperature is Celsius, salinity PSU, speed m/s, chlorophyll mg/m³. The text parser assumes these canonical units; it does not infer or convert them.

Each instrument + timestamp forms a separate profile. Depth points are sorted; duplicate depths, blank coordinates, non-finite values and invalid dates are rejected. Point coordinates may vary (e.g. glider path). Repeated ascent/descent cycles must use separate profile IDs or timestamps, rather than duplicate depths within one profile. Up to 500 profiles, 5,000 points per profile and 50,000 rows per upload.

## Model JSON

The complete reference is `lib/ocean.ts`. Use the Python converter to produce model JSON rather than manually flattening arrays.

```json
{
  "name": "Small ocean subset",
  "source": "Dataset DOI or provenance",
  "synthetic": false,
  "variables": [
    {"id":"temperature","label":"Temperature","unit":"°C","standardName":"sea_water_temperature","min":2,"max":32}
  ],
  "grid": {
    "latitude": [10, 20],
    "longitude": [80, 90],
    "depth": [0, 100],
    "time": ["2026-09-07T00:00:00Z"],
    "fields": {"temperature":[28,29,27,28,22,23,21,22]}
  },
  "observations": []
}
```

All coordinates increase strictly. At least two latitudes, longitudes and depths, and one time. Values are flattened in `[time][depth][latitude][longitude]` order. Use JSON `null` for missing model values. A missing contributing corner prevents interpolation; values are not filled implicitly. Rectilinear regional data is supported, not antimeridian-spanning or polar datasets.

Optional fields `u` and `v` supply eastward/northward current velocity in m/s on the same grid; a registered `speed` variable can be derived from them. Additional registered scalar fields work with the existing surface renderer and profile chart.

An observation JSON object contains `id`, `kind`, `latitude`, `longitude`, `time`, `source`, and `points`. Each point has `depth`, optional `latitude`/`longitude`, and `values` keyed by variable IDs. No client persistence is implied by importing a dataset.
