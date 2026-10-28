# Lattice Analytics

A read-only analytics board that turns structured records managed in [Lattice](https://github.com/D-Arijit57/Lattice) into KPIs and charts, using only Lattice's Delivery API. Lattice owns the content model and the data; this app owns presentation and interpretation. They share an API contract, not an implementation.

It is a sibling of the Calendar consumer and uses the same pattern: a small Node server holds the API key and the browser only talks to that server.

## What it demonstrates

- A content type defined in Lattice (`Metric Record`) is consumed by an independent app with no access to Lattice's database or code.
- The consumer derives four KPIs, a time series, a category breakdown, a status distribution and a recent-records table from whatever the API returns.
- Loading, empty, error, partial-data and stale-data states, with the last good dataset kept when a refresh fails.

It is **not** real-time. It polls (default every 60 s) and has a manual Refresh button.

## How it talks to Lattice

```
Browser ──> GET /api/records ──> Node server ──> GET {LATTICE_API_BASE_URL}/delivery/content-types/<slug>/entries/
                                  (holds key)       Authorization: Bearer lat_…   (cursor-paginated, 50 per page)
```

- Endpoint and auth are Lattice's real Delivery API (verified against `api/delivery/` and run against a live local instance).
- The key is read from server environment variables only. No variable is `VITE_*`, and `npm run check:bundle` fails if a key (or anything key-shaped) is in `dist/`. Lattice's delivery routes have no CORS by design, so a server hop is required anyway.
- The server exposes one route, `GET /api/records[?fresh]`. Clients cannot choose the upstream URL or content type.
- Pagination: all pages are read (max 20 = newest 1,000 entries, flagged in the UI if truncated). Lattice's `next` URL is never followed; only its `cursor` is reused against the configured base URL. Duplicate ids across pages are dropped.
- Responses are cached 30 s on the server and concurrent requests share one upstream fetch, to stay far below Lattice's 60 requests/min per key.
- Errors are mapped to `unauthorized`, `not_found`, `rate_limited`, `unreachable`, `upstream`, `misconfigured` with generic messages; upstream bodies and secrets are never forwarded.

## Content type schema

Lattice field types are `string`, `number`, `boolean` and `date` (`YYYY-MM-DD`). There is **no datetime type**, so `recorded_at` is a `date` field, which Lattice validates.

| Field | Lattice type | Required | Meaning |
|---|---|---|---|
| `name` | string | yes | Metric or record name |
| `value` | number | yes | Numeric value |
| `recorded_at` | date | yes | Day of the record (read as UTC) |
| `category` | string | no | Grouping |
| `status` | string | no | e.g. `active`, `paused`, `completed` (lower-cased for grouping) |
| `target` | number | no | Shown in the table |
| `unit` | string | no | e.g. `views`. If records use more than one unit, sums are not shown |

Slug: `metric-record` (override with `LATTICE_METRIC_CONTENT_TYPE`). Field names can be remapped with `LATTICE_FIELD_MAP`. If a field is a `string` holding an ISO date-time, it is accepted only with an explicit offset (`Z` or `+05:30`); offset-less values are treated as invalid rather than guessed.

## Configuration

Server-side only (see `.env.example`):

| Variable | Default | Meaning |
|---|---|---|
| `LATTICE_API_BASE_URL` | – | Lattice API base including `/api` |
| `LATTICE_API_KEY` | – | Read-only key (`lat_…`) |
| `LATTICE_METRIC_CONTENT_TYPE` | `metric-record` | Content type slug |
| `LATTICE_FIELD_MAP` | – | JSON remapping roles `name, category, value, recordedAt, status, target, unit` |
| `ANALYTICS_DEMO_MODE` | off | `true` serves a built-in, labelled fixture; no key needed |
| `ANALYTICS_REFRESH_INTERVAL_SECONDS` | 60 (min 15) | Browser polling interval |
| `RECORDS_CACHE_TTL_SECONDS` | 30 | Server cache |
| `PORT` | 3004 | Node server (Vite dev server is 3003) |

Invalid configuration is reported all at once at startup, without echoing values.

## Run it

Requires Node 20+.

```bash
npm install
cp .env.example .env        # set LATTICE_API_BASE_URL and LATTICE_API_KEY
npm run dev                 # UI http://localhost:3003, API http://localhost:3004
# or production-style, one process:
npm run build && npm start  # http://localhost:3004
```

### Populate real data in a local Lattice

1. Start Lattice locally (`cd Lattice/backend && python manage.py runserver`).
2. Seed it through Lattice's public API (login cookies, never its database):
   ```bash
   SEED_EMAIL=you@example.com SEED_PASSWORD=... LATTICE_API_BASE_URL=http://localhost:8000/api npm run seed
   ```
   This signs up/logs in, creates an organization, the `metric-record` content type with the fields above, publishes a version, adds 57 entries (14 days × 4 channels plus one uncategorized record; some without status or target on purpose) and prints a read-only `LATTICE_API_KEY`. It refuses non-local URLs. Lattice has no update/delete, so re-running adds more entries.
3. Put the printed key in `.env` and start the app.

Manually: create the content type and fields in the Lattice UI, **publish a version**, add entries, then create a key under the organization's API keys.

### Explicit demo mode

`ANALYTICS_DEMO_MODE=true npm start` serves the same dataset from a fixture, with a banner and a "Demo data" status. It is a startup choice, never a reaction to an error: if Lattice fails in live mode you see the error (and any previously loaded data), not fake records.

### See an update appear

Add an entry in Lattice (e.g. `category: Events`, `value: 777`, today's date), then press Refresh (or wait for the next poll). The record count, KPIs, category bars and table update with no code change.

## How records become charts

All logic is pure and framework-free, in `shared/` (tests alongside):

- `normalize.ts`: Lattice entry → record. Only an unreadable entry is skipped; a bad field becomes `null` plus an issue code, shown in a "Data quality" notice.
- `analytics.ts`:
  - **Total records**: valid records loaded. **Total/Average value**: over records with a finite numeric value; unavailable (with the reason shown) if none exist or if units differ. **Active**: status `active`, out of records that have a status; unavailable if none have one.
  - **Time series**: daily sums per category (top 5 + "Other") for records with both a date and a value; days without records get no point, nothing is interpolated; needs ≥ 2 distinct days.
  - **Category breakdown**: sum of value (or record count when sums are unavailable); missing category → "Uncategorized".
  - **Status distribution**: statuses found in the data; if none exist, "Largest values" replaces it.
  - **Recent records**: newest first, undated last.

## Tests and checks

```bash
npm test               # vitest: normalization, analytics, Lattice client, config, service, handler, refresh logic, UI states
npm run lint           # tsc --noEmit
npm run build && npm run check:bundle   # production build, then scan dist/ for credentials
```

## Known limitations

- Dates are day-granular (Lattice has no datetime type) and bucketed in UTC.
- Entries cannot be edited or deleted in Lattice V1, so "update" in the demo means adding entries.
- Only the newest 1,000 entries are read; Lattice cannot filter entries server-side, so all aggregation happens in this app.
- One content type at a time; no picker.
- Charts are hand-drawn SVG (no chart library): hover/arrow-key inspection on the time series, native tooltips on bars.
- No Vercel/serverless packaging is included; it runs as one Node process.
- Hover/keyboard interaction and the 390 px phone layout were not exercised in a real interactive browser (see the verification notes in the hand-off); desktop and 500 px layouts were checked via headless screenshots.
