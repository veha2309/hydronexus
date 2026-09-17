# HydroNexus

A browser-native ocean situation and research platform for the INCOIS/SIH problem statement. The public root presents a simplified situation view. The advanced workspace is available only at a manually entered, password-protected Research Lab route.

**Prototype, not an operational forecast.** Default fields, instruments and sample files are explicitly synthetic. The private Research Lab can request bounded INCOIS Argo profiles through its server-side adapter, but HydroNexus is not affiliated with INCOIS and this integration is not an official warning product.

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

Create the private Research Lab password and session secrets before starting the frontend:

```powershell
npm run research:hash-password
```

Copy the printed Argon2id hash into `.env.local` as `HYDRONEXUS_RESEARCH_PASSWORD_HASH`. Also set a random `HYDRONEXUS_SESSION_SECRET` of at least 32 characters and use the same long random `HYDRONEXUS_SERVICE_TOKEN` in the frontend and Python service environments. `HYDRONEXUS_REDIS_URL` is required in production; development uses a process-local limiter when Redis is absent.

Restart `npm run dev` after creating `.env.local`. The data service's interactive API docs are at http://127.0.0.1:8000/docs. The Research Lab is intentionally not linked from the public application; enter `/research-lab` manually.

## Main workflow

1. Select temperature, salinity, current speed or chlorophyll.
2. The atlas opens on the regional surface map. Use the View selector for globe, water column, map and east-west depth section. Drag the map to pan; other 3D views support orbiting. Move the depth slider and animate model time.
3. Expand Display for layered volume, depth slice and isosurface rendering, opacity, palette, min/max, log scale, vertical exaggeration and current particles. Section latitude moves the cut; profiles within 0.5° are projected onto it.
4. Click an Argo, Glider, CTD or BGC marker, or choose one from the keyboard-accessible observation list.
5. Inspect the vertical profile, model comparison, RMSE and bias. Export the numerical comparison as CSV.
6. Start the guided investigation: Locate at 100 m → Descend to 500 m → Inspect the first Argo profile → Compare observations with the model. Next/Back restore each step's preset at the same model time. Exit preserves the current scene. Restart restores the bundled dataset and starts again; successful model or observation imports exit the guide. The calculated explanation and CSV use the same comparison values as the chart.
7. Import a model JSON/NetCDF, then its observation CSV. Model import replaces the dataset; CSV import replaces only the profiles.
8. In the private import dialog, **Load latest Argo profiles** requests a bounded 14-day Indian Ocean window from INCOIS ERDDAP. Raw and QC-normalized artifacts are stored by content hash in `HYDRONEXUS_DATA_DIR`.
9. **Load latest HYCOM forecast** discovers the current RSMC cycle and reads only the requested geographic subset through OPeNDAP. The roughly 10 GB source NetCDF remains on INCOIS infrastructure; HydroNexus retains a raw source manifest and the bounded processed product.
10. **Load latest WW3 forecast** discovers the current RSMC WaveWatch III cycle and loads a bounded surface subset containing significant wave height, peak period, mean direction and derived wind speed. Missing ocean cells remain missing and are rendered with a subdued wireframe instead of being silently filled.
11. **Load combined ocean workspace** sends one bounding-box request to the private Python service. HYCOM and WW3 are discovered and processed concurrently, retained as independent provenance-preserving layers, and returned together. The browser receives only the bounded, subsampled products and can switch layers without downloading either full source file again.

If INCOIS is unavailable, the adapter serves the most recent successfully validated QC artifact with an explicit stale-source warning. If no valid artifact exists, it returns a specific upstream-unavailable error and never substitutes demonstration data.

The workspace uses a continuous dark surface with unframed controls, a muted blue/copper temperature palette, and a sequential steel-blue ocean palette. Display → **Enhanced lighting** is off by default. Opting in enables adjustable directional/rim lighting, procedural surface waves and highlights on the globe, map and water-column views, and subtle panel entrance motion. Wave motion can be stopped independently, and Wave speed adjusts its pace. The water effect uses the coastline mask and does not displace model samples or change comparisons. Reduced-motion preferences freeze the procedural water animation and disable panel motion. Turning the option off removes and disposes the effect layer; a reload starts with it off again.

## Architecture

- **Next.js App Router + React + TypeScript**: public Situation View, private Research Lab, encrypted owner sessions, CSRF checks and separated public/research REST endpoints. `components/atlas/` separates the research shell, layers, inspector, fields and guided investigation.
- **Three.js + OrbitControls**: geographic globe, regional 3D water column, map and depth-section presets, actual Natural Earth land geometry, instrument markers/trajectories, transparent depth meshes, and accelerated current trails. Camera transitions respect reduced-motion preferences.
- **Shared `lib/ocean.ts` contract**: variables, time/depth metadata, interpolation, profile comparison and palettes. SVG chart uses the same numerical values as exported CSV.
- **Python + xarray + NumPy + netCDF4 + FastAPI**: bounded NetCDF ingestion plus INCOIS ERDDAP Argo, RSMC HYCOM and RSMC WW3 adapters. `backend/registry.json` maps CF standard names and variable aliases.
- **Server-owned collection and slicing**: `POST /v1/workspace/subset` accepts selected sources, west/south/east/north bounds, variable IDs, UTC time bounds, depth bounds, and maximum time/depth counts. Values are selected and decimated without interpolation. Raw references and processed layers are cached independently; the Next.js application accesses this service only through its authenticated same-origin research route.
- **Papa Parse**: browser-side CSV/TSV/text observation parsing with validation.

No database is required for this prototype. Imported visualization state is held in browser memory and is lost after reload. Python uploads use temporary files that are deleted after conversion. Live Argo responses are retained as immutable content-addressed raw and QC JSON artifacts under `HYDRONEXUS_DATA_DIR`; production object storage is still pending.

## Data contracts and scientific behavior

See [docs/data-contract.md](docs/data-contract.md) for JSON shape and text columns. Working synthetic fixtures are in `public/sample-model.nc`, `public/sample-model.json` and `public/sample-observations.csv`.

```powershell
# Convert/subset a large local model without uploading it
.venv/Scripts/python.exe backend/convert.py model.nc model.json --bbox 65 0 100 28
```

- Flattened model fields are ordered **time â†’ depth â†’ latitude â†’ longitude**, longitude fastest.
- Depth is metres positive down; time is explicit UTC ISO; longitude is normalized to âˆ’180â€¦180.
- The parser sorts coordinates, translates selected units, decodes CF time/fill values, and subsamples to at most 48 Ã— 56 Ã— 20 Ã— 12 coordinates. Final value budget is three million scalar values.
- Only common-grid, rectilinear, Gregorian 4D model variables are supported. Curvilinear, pressure-level, ensemble and staggered grids require explicit preprocessing. The live Argo adapter is separate from the gridded NetCDF converter.
- Comparison uses multilinear interpolation in latitude, longitude, depth and time, evaluated at **each profile point and the observation timestamp**, not the currently displayed model time. No extrapolation; a missing contributing corner yields no sample.
- RMSE = sqrt(mean((observation âˆ’ model)Â²)); bias = mean(observation âˆ’ model). Missing pairs are excluded and the matched-depth count is displayed. These measures do not imply forecast skill on the synthetic demo.
- Isosurface mode renders the **shallowest crossing in each water column**, with linear depth interpolation. It is not general marching-cubes extraction of disconnected or folded surfaces.
- Volume mode uses transparent sampled horizontal surfaces, not ray-marched continuous volume rendering. No bathymetry is bundled; the geographic land mask is not a seabed mask.
- The map is a regional equirectangular projection. Vertical exaggeration is a display factor, and particle motion is accelerated; neither should be used as a physical scale measurement.
- Synthetic profiles share a fixed timestamp; moving the model timeline intentionally does not fabricate new measurements.
- The Argo adapter prefers adjusted values with provider QC flags 1 or 2, never gap-fills rejected measurements, attaches lineage/uncertainty fields, and derives depth from pressure with the UNESCO 1983 approximation. These rules and uncertainty values still require oceanographer review before operational use.

## REST endpoints

The Next.js endpoints expose **the synthetic demo only** and are stateless:

- `GET /api/variables`
- `GET /api/dataset` â€” metadata and observation profiles
- `GET /api/slice?variable=temperature&depth=100&time=2026-09-07T00:00:00Z`
- `GET /api/profile?id=DEMO-ARGO-01&variable=temperature`

The optional Python service provides `GET /health`, `GET /v1/sources`, `GET /v1/argo/profiles`, `GET /v1/hycom/latest`, and `POST /ingest` (multipart NetCDF file, maximum 25 MB). The browser never calls it directly: authenticated `/api/research/*` handlers forward bounded requests using `HYDRONEXUS_SERVICE_TOKEN`. Run the service on a private network or loopback and set `HYDRONEXUS_ALLOWED_ORIGINS` to the deployed frontend's exact origins.

## Deploy to your Vercel account

The frontend is configured in `vercel.json` as an explicit frontend-only Next.js service named `hydronexus`. The service declaration prevents Vercel from automatically including the separate Python backend. No Sites/Cloudflare runtime is used.

```powershell
npm run build
npx vercel login
npx vercel --prod
```

Deploy the scientific Python service separately on infrastructure suited to NetCDF processing, or preprocess model files locally and use JSON imports. **The Vercel frontend does not deploy the Python service.** Configure its private URL as the server-only `HYDRONEXUS_DATA_API_URL`; never expose it through a `NEXT_PUBLIC_` variable.

## Validation

```powershell
npm test
npm run typecheck
npm run lint
npm run build
.venv/Scripts/python.exe -m unittest backend.test_convert backend.test_api backend.test_argo backend.test_hycom backend.test_ww3 -v
```

The tests cover 4D interpolation, exact boundaries, no extrapolation, missing data, RMSE/bias, vector magnitude, CSV grouping and rejection, grid shapes, colors, Kelvin conversion, axis sorting, unit rejection and a real NetCDF-to-HTTP-JSON roundtrip. Lint excludes the generated third-party UI catalog and scaffold hook; application code is checked. The slider primitive has one accessibility fix to forward its label to the actual range input.

## Requirements and next milestones

See [docs/requirements.md](docs/requirements.md) for implemented scope and explicit gaps. The next substantive milestone is a small, licensed real ocean model subset with matching quality-controlled instrument profiles, followed by tiled/chunked data delivery and operational validation. OGC WMS/WCS and OPeNDAP are **not implemented or claimed as compliant**.

## Data attribution

Coastlines: [Natural Earth](https://www.naturalearthdata.com/about/terms-of-use/), public-domain 1:110m geometry distributed through [world-atlas](https://github.com/topojson/world-atlas). Country boundaries are only geographic context; this application does not display official EEZ boundaries and is not suitable for navigation.
