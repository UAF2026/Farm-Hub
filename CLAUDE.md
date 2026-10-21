# Farm Hub — notes for Claude

The farm management app for **M J Hunt & Son**, Upper Assendon Farm, Stonor (near Henley-on-Thames, Oxfordshire). Owner and only user: **James Hunt**. Mixed arable and Wagyu-cross beef, around 1,750 acres across several tenancies.

These are the handover notes from the earlier build chats, last checked against the code on 21 Oct 2026. The code is the source of truth. If anything here disagrees with it, trust the code and **update this file**.

**Keep Farm Hub separate from `assendon-wagyu-app`** (the customer-facing beef app, a different repo). Don't read, change or share code or data between them.

## How to work with James
- He farms for a living and isn't a developer. Keep it plain, direct and short, with no jargon walls. Give him a clear recommendation rather than a menu of options.
- **Commits go through GitHub Desktop, never Terminal.** When a change is ready, tell him: open GitHub Desktop → Farm-Hub repo → check the changed files → type a commit message → "Commit to main" → "Push origin". Vercel deploys automatically from `main`.
- Do the work yourself: edit files, run the dev server and check things. Don't hand him commands to type.
- He uses the Hub on his phone as well as his laptop, so check that layouts work at phone width.
- Ask him before saying a farm fact is final, especially vet, health or scheme facts. Old notes have been wrong before (for example, TB status).

## Stack and infrastructure
- **Live site:** https://farm-hub-omega.vercel.app (Vercel, auto-deploys from GitHub `UAF2026/Farm-Hub`, branch `main`).
  - `farm-hub-sand.vercel.app` is an old, dead domain. Never use it.
- **Framework:** Next.js 14 (App Router), React 18, TypeScript. No CSS framework: styles are in `app/globals.css`. No test suite. Check `package.json` for exact versions.
- **Code layout:**
  - `components/FarmHub.tsx`: the app shell. Loads and saves data, holds the list of sections (`Section` type), processes the daily briefing.
  - `components/Nav.tsx`: the tab bar (labels and order).
  - `components/sections/*.tsx`: one file per tab. Types in `lib/types.ts`.
  - `lib/`: Supabase load/save (`supabase.ts`), John Deere (`johnDeere.ts`, `jdSummaries.ts`, `jdAssurance.ts`), satellite NDVI (`satellite.ts`), Gatekeeper field/cropping data from May 2026 (`gatekeeperData.ts`).
  - `app/api/*`: server routes (see below).
  - `public/assurance-docs/`: the PDFs shown in the Assurance tab (policies, plans, certificates). `public/land-parcels.geojson` draws the Map tab.
- **Database:** Supabase (EU), project `rzitnuwfqabgqvznkzax`. RLS is on.
  - `farmdata`: **a single row, `id = 'farmhub_main'`, whose `data` jsonb column holds almost everything** (cattle, schemes, finance, croppingPlans, sprays, fertilisers, compliance checklist, farmBible, dailyBriefing, purchases, grainTrading, soil/sap tests, jdOperations, bixHall and more). Patch the keys you need inside that blob. Don't overwrite the whole row.
  - `farmdata_backups`: snapshots (`farmdata_id`, `data`, `created_at`). Take one before any big data change.
  - `field_boundaries`: 63 official RPA parcels, 500.97 ha. Used by the satellite NDVI code.
  - `satellite_ndvi`: has data (about 340 readings, Mar–Apr 2026) from the spring sync.
  - `brain_dump`: has a few entries; used by the Brain Dump tab via `/api/braindump`.
  - `field_yields`: exists but is empty and nothing in the code uses it yet.
- **How the app connects to Supabase:** the browser uses a Supabase URL and anon key that James enters once in the app's setup / Settings screen (saved in that browser's localStorage). The server routes use `SUPABASE_URL` and `SUPABASE_SERVICE_KEY` from Vercel environment variables.
- **Claude (Anthropic) API:** called **straight from the browser**, not from the server. James pastes his key into Settings and it's kept in that browser's localStorage (`uaf_anthropic_key`). It's not in Vercel env vars. Used by Finance (invoice photo scanning), Brain Dump (sorting notes) and the AI tab. Never print or commit a key.
- **Other connections** (all secrets in Vercel environment variables; see `.env.example` for the Supabase ones):
  - **John Deere Operations Center:** OAuth via `/api/jd/authorize` and `/api/jd/callback`; tokens saved in `data.jdAuth`. `/api/jd/sync-and-import` refreshes `data.jdOperations` and appends new spray/fertiliser records into `data.sprays` / `data.fertilisers` (never edits or removes existing ones; dedupes by `jdOpId`). Deere operation IDs aren't stable over time, so old records can lose their link. Field name matching lives in `data.jdFieldMap` (JD Ops tab → field reconcile).
  - **Gmail (Crop Advisors purchase orders):** `/api/purchases/*` reads PDF orders from Crop Advisors emails and stores them in `data.purchases`. Separate from the daily briefing.
  - **Copernicus / Sentinel-2:** satellite NDVI via `/api/satellite/sync`.
  - `/api/data`: lets outside tools (scheduled tasks) read the blob, merge keys into it, or append a record to one list. Protected by `API_SECRET` (the `x-api-secret` header).

## Gotchas learned the hard way
- **A browser tab with old data can undo edits made straight in Supabase.** When the Hub saves, it merges its whole local copy over the stored blob, key by key, and the local copy wins (except `jdAuth`, `jdOperations`, `jdSyncStatus`, and a newer `dailyBriefing`, which the server keeps). So if you patch the blob directly, tell James to reload the Hub on every device before editing anything there.
- **The cropping plan UI (`CroppingPlan.tsx`) reads `data.croppingPlans`** (an array of `{season, plans, lastUpdated}`), matched by `season`. Seasons currently in the data: `25/26`, `26/27`, `27/28`. It does **not** read `data.cropping`, which is legacy (it's still in the blob). Edits to the wrong key are invisible in the app.
- **Compliance templates:** `BEEF_CHECKLIST` / `ARABLE_CHECKLIST` in `components/sections/Compliance.tsx`. When adding checklist items, update the template as well as the live data, or a reload brings the old version back.
- **Old sample data in the compliance checklist.** Settings used to have a "Load sample compliance data" button that added made-up records. The button was removed on 21 Oct 2026. On the same day, the 46 sample checklist items James had never edited were deleted from `data.checklist` (backup: `farmdata_backups` id 7). Seven sample items that James had since updated with real answers were kept (vet health plan, biosecurity, visitor log, slurry, copper, first aid, Five Freedoms). If you see invented-looking details such as cert numbers F-2023-8741 or B-2024-14892, they come from that sample data.
- Field areas: **`field_boundaries` (RPA open data, 63 parcels, 500.97 ha) is authoritative.** The old `fields` array numbers in the blob are stale estimates (a copy from 28 Apr 2026 is kept in `_backup_fields_2026_04_28`).
- The satellite NDVI sync is parked for the off-season. Don't spend time on it until the autumn crops are established.

## App sections (as built)
The tab bar, in order (`components/Nav.tsx`):

Dashboard · Strategy (initiatives, farm bible goals) · Tasks · Livestock (cattle, imported from a CTS CSV) · Map (RPA parcels) · Crops · Soil (soil and sap tests) · Agronomy (agronomist visit recommendations) · Finance (VAT, invoice scanning) · Schemes (CS and SFI) · Grain (grain marketing and quality tests) · Satellite (NDVI) · Medicine · Machinery · Contracts (file `Utilities.tsx`: contracts, utilities, memberships) · Compliance (checklist, certificates, spray/fertiliser records, readiness %) · Assurance (audit-day list of documents, certs and checklist) · Farms (land block cards) · JD Ops (John Deere sync and field matching) · Links · Brain Dump · Diary · Bible (Farm Bible reference) · Field Records (spray/fertiliser records from John Deere with assurance red-flag checks) · Purchases (Crop Advisors orders and chemical/fertiliser stock) · Cropping Plan · Costings (gross margins, incl. Wildfarmed comparison) · AI (chat assistant) · Settings.

There's no Bix Hall screen yet: the `bixHall` data (proposal notes, rent, timeline, open questions) is only in the blob.

## The daily briefing (separate from this repo)
A scheduled "farm secretary" task runs each morning in Claude. It reads Gmail and writes `data.dailyBriefing` into the Supabase blob. On load, the Hub turns the briefing's action items into tasks and its invoices into finance entries, then marks it `processed: true`; it also shows on the Dashboard and Finance tabs. The instructions for that task are in `farm-secretary-daily-skill.md` in James's Farm Hub documents folder, not in this repo. If you change the shape of `dailyBriefing` (type in `lib/types.ts`), keep that task in step.

## Farm context that shapes features
(These are from James. Confirm with him before treating any as final.)
- **Land:** home AHT tenancy (Stonor), owned land (including Lewknor, 47 ha), Bix Hall (five separate agreements: grazing licence, cropping licence that's winter wheat only, Old Manor FBT, Bottom Hoggetts FBT, grain store licence), Hollandridge (Tom Dunn, handshake agreement), Grange & Shenley (Knowles CFA), Bellhatch and Bix Manor (rolling agreements).
- **Crops:** Group 1/2 milling wheat (Ultimatum, to Heygates), winter barley, Ahiflower, beans, plus a chia trial. Beans and cereals are milled on-farm for cattle rations. The code also has Wildfarmed wheat fields and Skyfall wheat on the Bix Hall FBT land (from the Gatekeeper data).
- **Cattle:** about 75 Wagyu-cross suckler cows, spring calving, around 60 finished a year, mostly sold via Dovecote/Waitrose at roughly £1/kg over deadweight.
- **Schemes (big money, time-critical):** CS 1255553 ends 31 Dec 2026; SFI 1 ends 31 Mar 2027; SFI 2 ends Nov 2027; SFI 3 ends Sep 2028. Moving to SFI26 plus a new CS Higher Tier (grassland). SBI 106227532.
- **People:** Harry (full-time, all arable operations), James's father (part-time tractor and feeding work), Charlie (son, at university, succession undecided).

## Roadmap and open ideas
- Cost of production per field and per crop (Harry is the only real wage cost; family labour is opportunity cost). The Costings tab is a start: gross margins with benchmark costs where real data is missing.
- Wagyu direct-sales tracker (restaurants, hotels, box scheme). Keep this inside Farm Hub's own data; the customer-facing app is separate.
- Supplier and contact directory.
- Bix Hall 10-year FBT proposal (data is in the `bixHall` key; no screen yet).
- Scheme income replacement tracking (SFI26 / CSHT).
- Yields: `field_yields` table is ready but empty.
- NDVI vs grain protein correlation (some spring 2026 NDVI data now exists; see also `Protein_Prediction_Analysis.xlsx` in the repo root).
