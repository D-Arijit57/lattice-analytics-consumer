# Showing this board with real Lattice data

An entry is one row of data: click "New entry" in Lattice, fill the 7 fields, save. Make the 13 entries below.

## 1. In Lattice

1. Create the content type `Metric Record` (slug `metric-record`) with fields `name` (string), `value` (number), `recorded_at` (date), `category` (string), `status` (string), `target` (number), `unit` (string). Only the first three are required.
2. **Publish a version** of the content type.
3. Create these entries. On every entry, `unit` is `views` and `name` is `<category> page views`.

| # | name | value | recorded_at | category | status | target |
|---|---|---|---|---|---|---|
| 1 | Docs page views | 4200 | 2026-10-26 | Docs | completed | 4500 |
| 2 | Docs page views | 4350 | 2026-10-27 | Docs | completed | 4500 |
| 3 | Docs page views | 4600 | 2026-10-28 | Docs | active | 4500 |
| 4 | Docs page views | 4800 | 2026-10-29 | Docs | active | 4500 |
| 5 | Blog page views | 2600 | 2026-10-26 | Blog | completed | 3000 |
| 6 | Blog page views | 2500 | 2026-10-27 | Blog | completed | 3000 |
| 7 | Blog page views | 2900 | 2026-10-28 | Blog | active | 3000 |
| 8 | Blog page views | 3100 | 2026-10-29 | Blog | active | 3000 |
| 9 | Social page views | 900 | 2026-10-26 | Social | completed | 1200 |
| 10 | Social page views | 850 | 2026-10-27 | Social | paused | 1200 |
| 11 | Social page views | 1000 | 2026-10-28 | Social | paused | 1200 |
| 12 | Social page views | 1100 | 2026-10-29 | Social | active | 1200 |
| 13 | Unattributed referral traffic | 380 | 2026-10-28 | *(empty)* | active | *(empty)* |

4. Create a read-only API key (`lat_…`) under the organization's API keys.

## 2. In this app

In `.env`:

```
LATTICE_API_BASE_URL=https://lattice-five-orcin.vercel.app/api
LATTICE_API_KEY=lat_...
```

`ANALYTICS_DEMO_MODE` must be unset. Run `npm run dev` and open http://localhost:3003.

Expected: 13 records, total value 38,380, three lines on the chart, an "Uncategorized" row.

## 3. Live walkthrough

1. Add `Events page views`, value `777`, category `Events`, today's date, unit `views`. Press Refresh (the server caches for 30 s). A new category appears.
2. Add `Newsletter signups`, value `120`, unit `signups`. Totals become unavailable because the units differ.

## Optional: let the script create everything

```bash
SEED_ALLOW_REMOTE=true SEED_DATASET=showcase SEED_EMAIL=you@example.com SEED_PASSWORD=... \
LATTICE_API_BASE_URL=https://lattice-five-orcin.vercel.app/api npm run seed
```

This creates a larger 24-entry set and prints the API key. Lattice has no delete, so running it again adds duplicates.
