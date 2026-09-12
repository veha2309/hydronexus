# HydroNexus

A browser-native 3D ocean workspace for the INCOIS/SIH problem statement. Explore numerical fields across depth and time, overlay instrument profiles, and compare observations with the model at the same coordinates and timestamp.

**Prototype, not an operational forecast.** Default fields, instruments and sample files are explicitly synthetic. There is no INCOIS affiliation, live observation feed or real forecast model bundled with the project.

## Run locally

Node.js 22.13+ (tested with 25.8), Python 3.11+ for optional NetCDF ingestion (tested with 3.14).

```powershell
npm ci
npm run dev
```

Open http://127.0.0.1:3000. The browser demo and CSV/JSON imports work without Python, accounts, API keys or external map services. The coastline asset is bundled.

To enable NetCDF uploads on your machine:

```powershell
python -m venv .venv
.venv/Scripts/python.exe -m pip install -r backend/requirements-lock.txt
Copy-Item .env.example .env.local
.venv/Scripts/python.exe -m uvicorn backend.main:app --host 127.0.0.1 --port 8000
```

Restart `npm run dev` after creating `.env.local`. The data service's interactive API docs are at http://127.0.0.1:8000/docs.

## Main workflow

1. Select temperature, salinity, current speed or chlorophyll.
2. The atlas opens on the regional surface map. Use the View selector for globe, water column, map and east-west depth section. Drag the map to pan; other 3D views support orbiting. Move the depth slider and animate model time.
3. Expand Display for layered volume, depth slice and isosurface rendering, opacity, palette, min/max, log scale, vertical exaggeration and current particles. Section latitude moves the cut; profiles within 0.5° are projected onto it.
4. Click an Argo, Glider, CTD or BGC marker, or choose one from the keyboard-accessible observation list.
5. Inspect the vertical profile, model comparison, RMSE and bias. Export the numerical comparison as CSV.
6. Start the guided investigation: Locate at 100 m → Descend to 500 m → Inspect the first Argo profile → Compare observations with the model. Next/Back restore each step's preset at the same model time. Exit preserves the current scene. Restart restores the bundled dataset and starts again; successful model or observation imports exit the guide. The calculated explanation and CSV use the same comparison values as the chart.
7. Import a model JSON/NetCDF, then its observation CSV. Model import replaces the dataset; CSV import replaces only the profiles.

The workspace uses a continuous dark surface with unframed controls, a muted blue/copper temperature palette, and a sequential steel-blue ocean palette. Display → **Enhanced lighting** is off by default. Opting in enables adjustable directional/rim lighting, procedural surface waves and highlights on the globe, map and water-column views, and subtle panel entrance motion. Wave motion can be stopped independently, and Wave speed adjusts its pace. The water effect uses the coastline mask and does not displace model samples or change comparisons. Reduced-motion preferences freeze the procedural water animation and disable panel motion. Turning the option off removes and disposes the effect layer; a reload starts with it off again.

## Architecture

- **Next.js App Router + React + TypeScript**: interface and lightweight demo REST endpoints; standard Vercel deployment. `components/atlas/` separates the shell, layers, inspector, fields and guided investigation; `lib/atlas.ts` defines typed scene presets and comparison presentation. A single workspace selection state drives the chart and scene. Narrow screens show one dismissible tool sheet at a time; Escape closes sheets.
- **Three.js + OrbitControls**: geographic globe, regional 3D water column, map and depth-section presets, actual Natural Earth land geometry, instrument markers/trajectories, transparent depth meshes, and accelerated current trails. Camera transitions respect reduced-motion preferences.
- **Shared `lib/ocean.ts` contract**: variables, time/depth metadata, interpolation, profile comparison and palettes. SVG chart uses the same numerical values as exported CSV.
- **Python + xarray + NumPy + netCDF4 + FastAPI**: bounded NetCDF ingestion. `backend/registry.json` maps CF standard names and variable aliases.
- **Papa Parse**: browser-side CSV/TSV/text observation parsing with validation.

No database is required for this prototype. Imported data is held in browser memory and is lost after reload. Python uploads use temporary files that are deleted after conversion.

## Data contracts and scientific behavior

See [docs/data-contract.md](docs/data-contract.md) for JSON shape and text columns. Working synthetic fixtures are in `public/sample-model.nc`, `public/sample-model.json` and `public/sample-observations.csv`.

```powershell
# Convert/subset a large local model without uploading it
.venv/Scripts/python.exe backend/convert.py model.nc model.json --bbox 65 0 100 28
```

- Flattened model fields are ordered **time â†’ depth â†’ latitude â†’ longitude**, longitude fastest.
- Depth is metres positive down; time is explicit UTC ISO; longitude is normalized to âˆ’180â€¦180.
- The parser sorts coordinates, translates selected units, decodes CF time/fill values, and subsamples to at most 48 Ã— 56 Ã— 20 Ã— 12 coordinates. Final value budget is three million scalar values.
- Only common-grid, rectilinear, Gregorian 4D model variables are supported. Curvilinear, pressure-level, ensemble and staggered grids require explicit preprocessing. Argo profile NetCDF requires a separate observation adapter; use CSV for now.
- Comparison uses multilinear interpolation in latitude, longitude, depth and time, evaluated at **each profile point and the observation timestamp**, not the currently displayed model time. No extrapolation; a missing contributing corner yields no sample.
- RMSE = sqrt(mean((observation âˆ’ model)Â²)); bias = mean(observation âˆ’ model). Missing pairs are excluded and the matched-depth count is displayed. These measures do not imply forecast skill on the synthetic demo.
- Isosurface mode renders the **shallowest crossing in each water column**, with linear depth interpolation. It is not general marching-cubes extraction of disconnected or folded surfaces.
- Volume mode uses transparent sampled horizontal surfaces, not ray-marched continuous volume rendering. No bathymetry is bundled; the geographic land mask is not a seabed mask.
- The map is a regional equirectangular projection. Vertical exaggeration is a display factor, and particle motion is accelerated; neither should be used as a physical scale measurement.
- Synthetic profiles share a fixed timestamp; moving the model timeline intentionally does not fabricate new measurements.
- Operational QC, uncertainty, pressure-to-depth conversion, salinity conventions, spatial/time matching tolerances and instrumentation calibration require oceanographer review before real use.

## REST endpoints

The Next.js endpoints expose **the synthetic demo only** and are stateless:

- `GET /api/variables`
- `GET /api/dataset` â€” metadata and observation profiles
- `GET /api/slice?variable=temperature&depth=100&time=2026-09-07T00:00:00Z`
- `GET /api/profile?id=DEMO-ARGO-01&variable=temperature`

The optional Python service provides `GET /health` and `POST /ingest` (multipart NetCDF file, maximum 25 MB). It runs on loopback locally. Before exposing it publicly, add authentication, request/concurrency limits and a bounded job queue. CORS is an origin policy, not authentication. Set `HYDRONEXUS_ALLOWED_ORIGINS` to the deployed frontend's exact origins.

## Deploy to your Vercel account

The frontend is configured in `vercel.json` as an explicit frontend-only Next.js service named `hydronexus`. The service declaration prevents Vercel from automatically including the separate Python backend. No Sites/Cloudflare runtime is used.

```powershell
npm run build
npx vercel login
npx vercel --prod
```

Deploy the scientific Python service separately on infrastructure suited to NetCDF processing, or preprocess model files locally and use JSON imports. **The Vercel frontend does not deploy the Python service.** On Vercel, leave `NEXT_PUBLIC_DATA_API_URL` unset until an HTTPS service is available, then set it to that service and redeploy. Never point a hosted frontend at your loopback address.

## Validation

```powershell
npm test
npm run typecheck
npm run lint
npm run build
.venv/Scripts/python.exe -m unittest backend.test_convert backend.test_api -v
```

The tests cover 4D interpolation, exact boundaries, no extrapolation, missing data, RMSE/bias, vector magnitude, CSV grouping and rejection, grid shapes, colors, Kelvin conversion, axis sorting, unit rejection and a real NetCDF-to-HTTP-JSON roundtrip. Lint excludes the generated third-party UI catalog and scaffold hook; application code is checked. The slider primitive has one accessibility fix to forward its label to the actual range input.

## Requirements and next milestones

See [docs/requirements.md](docs/requirements.md) for implemented scope and explicit gaps. The next substantive milestone is a small, licensed real ocean model subset with matching quality-controlled instrument profiles, followed by tiled/chunked data delivery and operational validation. OGC WMS/WCS and OPeNDAP are **not implemented or claimed as compliant**.

## Data attribution

Coastlines: [Natural Earth](https://www.naturalearthdata.com/about/terms-of-use/), public-domain 1:110m geometry distributed through [world-atlas](https://github.com/topojson/world-atlas). Country boundaries are only geographic context; this application does not display official EEZ boundaries and is not suitable for navigation.
