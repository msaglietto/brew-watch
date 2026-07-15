# Brew Watch

Tracks new and updated [Homebrew](https://brew.sh/) formulae and casks, and shows them on a simple web page.

Live at [brew-watch.msaglietto.workers.dev](https://brew-watch.msaglietto.workers.dev/).

An hourly Cloudflare Workers cron job snapshots [formulae.brew.sh](https://formulae.brew.sh/) (formula.json and cask.json), diffs it against the last known state in D1, and records what's new or changed. The site renders a single timeline of those changes, with a "New" badge marking first-seen packages, filterable by kind (formula/cask) and change type (new/updated), grouped by day with keyset pagination.

## Stack

- [Astro](https://docs.astro.build) on the [Cloudflare adapter](https://docs.astro.build/en/guides/integrations-guide/cloudflare/)
- Cloudflare Workers (fetch handler + scheduled cron) via `worker/index.ts`
- Cloudflare D1 for storage, managed with `wrangler d1 migrations`

## Development

```bash
npm install
npm run dev
```

Apply migrations to the local D1 database before first run:

```bash
npm run db:migrate:local
```

## Scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Start the Astro dev server |
| `npm run build` | Build the site |
| `npm run preview` | Build and preview with `wrangler dev` |
| `npm run deploy` | Build and deploy to Cloudflare |
| `npm run db:migrate:local` | Apply D1 migrations locally |
| `npm run db:migrate:remote` | Apply D1 migrations to the remote database |

## How it works

- `worker/scheduled.ts` fetches the current formula/cask lists, compares each package's `version`/`revision` against the `packages` table, and writes rows to `packages` (upsert) and `changes` (new/updated events) in batches.
- The first run seeds `packages` without recording changes (so you don't get a wall of "new" entries for every existing package).
- `src/pages/index.astro` reads recent `changes` via `src/lib/db.ts`, rendering one unified timeline (new and updated merged) grouped by day with keyset pagination, marked with a "New" badge for first-seen packages and filterable by kind and change type via URL params.
