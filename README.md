# ReJenga — Community Device Parts Reuse and Matching

Prototype for the MKU / Thika pilot. Community members list old phones and the parts they can give away; people who need a repair post a request; ReJenga suggests compatible parts using a catalogue of compatibility rules; a technician physically checks a reserved part before handover.

ReJenga does **not** handle payments, transport, storage, repairs, warranties or GPS tracking. Locations are approximate areas only. AI photo results are suggestions, marked unverified, and can never confirm a part works or is safe.

## Roles

| Role | Can do |
| --- | --- |
| Community (donor and recipient) | List phones and parts, request parts, reserve a match, record the handover |
| Technician | Inspect reserved parts: accept, reject, or block as unsafe |
| Administrator | Approve accounts, manage models, part types, areas and compatibility rules, remove listings, view reports |

## How matching works

1. Only parts covered by an **active compatibility rule** (donor model → recipient model → part type) are considered.
2. Parts that are reserved, handed over or withdrawn, on closed listings, rejected, or **blocked as unsafe** are excluded. Unsafe parts never come back.
3. Technician-checked parts rank first, then the nearest approximate area.
4. Each suggestion shows why it matches and what is still unverified (donor claims, AI suggestions).
5. Reserving re-checks availability inside a database transaction with row locks, so a part can't be reserved twice. Reservations expire after `RESERVATION_DAYS` and the part is released.

Batteries reported as swollen, leaking, punctured, hot or burnt can't be listed, and technicians block them if found.

## Run it locally

Requirements: Node 22 (see `.nvmrc`) and PostgreSQL 14+.

```sh
cp .env.example .env
# Either start PostgreSQL with Docker…
docker compose up -d db
# …or create the database in an existing PostgreSQL:
#   createuser -P rejenga   (password: rejenga)
#   createdb -O rejenga rejenga
npm install
npm run db:migrate
npm run db:seed
npm run dev          # http://localhost:3000
```

Demo accounts (password `rejenga123`, or `SEED_PASSWORD` if set when seeding):

| Email | Role |
| --- | --- |
| admin@rejenga.local | Administrator |
| tech@rejenga.local | Technician |
| donor@rejenga.local, kevin@rejenga.local | Community (donors) |
| recipient@rejenga.local | Community (has an open screen request) |
| pending@rejenga.local | Technician awaiting approval |

The demo cross-model compatibility rules in the seed are examples only and are labelled as such; replace them with verified sources before real use.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Development server on port 3000 |
| `npm run build && npm start` | Production build and server |
| `npm run typecheck` | TypeScript check |
| `npm test` | Unit and database tests (needs a `rejenga_test` database owned by `rejenga`, or set `TEST_DATABASE_URL`; it is wiped on each run) |
| `npm run db:generate` | Generate a migration after changing `src/server/db/schema.ts` |
| `npm run db:migrate` / `db:seed` / `db:reset` | Apply migrations, load demo data, or wipe and reload |
| `npm run ai:train` | Train linear probes on CLIP embeddings from `ai-data/` |
| `npm run ai:eval -- damage` | Report accuracy, low-confidence rate and confusion matrix |

## AI photo check

Each uploaded listing photo is classified for **phone model** and **visible damage** with [CLIP](https://huggingface.co/Xenova/clip-vit-base-patch32), running locally through Transformers.js (the model, about 350 MB, downloads into `models/` on first use). Without training data it uses zero-shot prompts. Once you collect labelled photos (see `ai-data/README.md`), `npm run ai:train` fits a small linear classifier on the CLIP embeddings and the app uses it automatically.

Results below `AI_LOW_CONFIDENCE` are flagged for manual review. Set `AI_ENABLED=false` on offline machines.

## Project layout

```
src/routes/            pages (index.tsx is the landing page; _app/* need sign-in)
src/fns/               server functions called by pages
src/server/db/         Drizzle schema and connection
src/server/matching.ts compatibility filtering and ranking (pure, unit-tested)
src/server/workflow.ts reservations, inspections, outcomes, expiry (transactional)
src/server/ai/         CLIP classifier and linear probe training
scripts/               migrate, seed, reset, AI train/eval
tests/                 Vitest suites
```
