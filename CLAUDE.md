# Farm Hub — notes for Claude

The farm management app for **M J Hunt & Son**, Upper Assendon Farm, Stonor (near Henley-on-Thames, Oxfordshire). Owner and only user: **James Hunt**. Mixed arable and Wagyu-cross beef, around 1,750 acres across several tenancies.

These are the handover notes from the earlier build chats, last checked against the code on 21 Oct 2026. The code is the source of truth. If anything here disagrees with it, trust the code and **update this file**.

**Keep Farm Hub separate from `assendon-wagyu-app`** (the customer-facing beef app, a different repo). Don't read, change or share code or data between them.

## What the Hub is for (James's vision, 21 Oct 2026)
Judge every feature against these. The aim is to be well ahead of other farms in how the business is run, using AI wherever it helps, including in ways James hasn't thought of. So suggest ideas, don't just wait to be asked.
1. **Morning workplan.** Opening the laptop gives a plan for the day and week, built from history plus what's coming in: emails to answer, bills to pay, inspections to prepare for, scheme claims to submit, renewals to compare (e.g. insurance), and the routine jobs that get forgotten (invoice the straw, book the mill and mix, order next week's sprays). It organises the day-to-day chaos.
2. **Knowledge that builds over time.** It holds the farm's past and present and keeps learning, so in a few years it knows the farm better than James does. It should be able to make suggestions like "today is the best day to drill wheat, based on 10 years of your yields" or "don't plant that area, it never yields".
3. **Run over by a bus.** Everything needed to keep the business running should be in the Hub, ready for the next person to pick up.
4. **One roof.** A single place for the whole farm business.

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
  - `lib/`: Supabase load/save (`supabase.ts`), John Deere (`johnDeere.ts`, `jdSummaries.ts`, `jdAssurance.ts`), satellite NDVI (`satellite.ts`), Gatekeeper field/cropping data from May 2026 (`gatekeeperData.ts`), master field list helpers (`fields.ts`), weather (`weather.ts`).
  - `app/api/*`: server routes (see below).
  - `public/assurance-docs/`: the PDFs shown in the Assurance tab (policies, plans, certificates). `public/land-parcels.geojson` draws the Map tab.
- **Database:** Supabase (EU), project `rzitnuwfqabgqvznkzax`. RLS is on.
  - `farmdata`: **a single row, `id = 'farmhub_main'`, whose `data` jsonb column holds almost everything** (cattle, schemes, finance, croppingPlans, sprays, fertilisers, compliance checklist, farmBible, dailyBriefing, purchases, grainTrading, soil/sap tests, jdOperations, bixHall and more). Patch the keys you need inside that blob. Don't overwrite the whole row.
  - `farmdata_backups`: snapshots (`farmdata_id`, `data`, `created_at`). Take one before any big data change.
  - `field_boundaries`: 63 official RPA parcels, 500.97 ha. Used by the satellite NDVI code. Only land on our own SBI: fields the landlord claims (Bix Hall, Grange) aren't in it.
  - `satellite_ndvi`: has data (about 340 readings, Mar–Apr 2026) from the spring sync.
  - `brain_dump`: has a few entries; used by the Brain Dump tab via `/api/braindump`.
  - `field_yields`: one row per field + harvest year + crop (`field_id` → `data.fieldRegister[].id`), with yield, tonnes, moisture and protein. Read and written through `/api/yields`. Harvest 2026 yields copied in from the 25/26 cropping plan on 21 Oct 2026.
  - `weather_daily`: one row per day of farm weather from Open-Meteo (ERA5), from 2000 onwards. Written by `/api/weather/sync`, which Vercel cron runs every morning (`vercel.json`). Anyone with the anon key can read it; only the service key can write.
- **How the app connects to Supabase:** the browser uses a Supabase URL and anon key that James enters once in the app's setup / Settings screen (saved in that browser's localStorage). The server routes use `SUPABASE_URL` and `SUPABASE_SERVICE_KEY` from Vercel environment variables.
- **Running it locally:** `.env.local` (gitignored) holds the Supabase URL and the *anon* key, so server routes on this computer can only do what the anon key allows. `.claude/launch.json` starts `npm run dev` on port 3000. To test with real data without touching it, open the app, choose "Use on this device only", then load a copy of the blob from `/api/data` into localStorage key `uaf_v4`. Edits then stay in that browser.
- **Claude (Anthropic) API:** called **straight from the browser**, not from the server. James pastes his key into Settings and it's kept in that browser's localStorage (`uaf_anthropic_key`). It's not in Vercel env vars. Used by Finance (invoice photo scanning), Brain Dump (sorting notes) and the AI tab. Never print or commit a key.
- **Other connections** (all secrets in Vercel environment variables; see `.env.example` for the Supabase ones):
  - **John Deere Operations Center:** OAuth via `/api/jd/authorize` and `/api/jd/callback`; tokens saved in `data.jdAuth`. `/api/jd/sync-and-import` refreshes `data.jdOperations` and appends new spray/fertiliser records into `data.sprays` / `data.fertilisers` (never edits or removes existing ones; dedupes by `jdOpId`, and by JD field + day + kind because Deere re-numbers operation IDs). Field matching uses each master-list field's `jdNames` (see Gotchas).
  - **Gmail (Crop Advisors purchase orders):** `/api/purchases/*` reads PDF orders from Crop Advisors emails and stores them in `data.purchases`. Separate from the daily briefing.
  - **Copernicus / Sentinel-2:** satellite NDVI via `/api/satellite/sync`.
  - `/api/data`: lets outside tools (scheduled tasks) read the blob, merge keys into it, or append a record to one list. Protected by `API_SECRET` (the `x-api-secret` header).

## Gotchas learned the hard way
- **Until 21 Oct 2026, Vercel's `SUPABASE_SERVICE_KEY` held a public key, not the secret one.** Server routes only worked because the anon key can write to every table. It now holds the `sb_secret_…` key. If a server route ever gets "violates row-level security policy", check this env var first.
- **A browser tab with old data can undo edits made straight in Supabase.** When the Hub saves, it merges its whole local copy over the stored blob, key by key, and the local copy wins (except `jdAuth`, `jdOperations`, `jdSyncStatus`, and a newer `dailyBriefing`, which the server keeps). So if you patch the blob directly, tell James to reload the Hub on every device before editing anything there.
- **The cropping plan UI (`CroppingPlan.tsx`) reads `data.croppingPlans`** (an array of `{season, plans, lastUpdated}`), matched by `season`. Seasons currently in the data: `25/26`, `26/27`, `27/28`. It does **not** read `data.cropping`, which is legacy (it's still in the blob). Edits to the wrong key are invisible in the app.
- **Compliance templates:** `BEEF_CHECKLIST` / `ARABLE_CHECKLIST` in `components/sections/Compliance.tsx`. When adding checklist items, update the template as well as the live data, or a reload brings the old version back.
- **Old sample data in the compliance checklist.** Settings used to have a "Load sample compliance data" button that added made-up records. The button was removed on 21 Oct 2026. On the same day, the 46 sample checklist items James had never edited were deleted from `data.checklist` (backup: `farmdata_backups` id 7). Seven sample items that James had since updated with real answers were kept (vet health plan, biosecurity, visitor log, slurry, copper, first aid, Five Freedoms). If you see invented-looking details such as cert numbers F-2023-8741 or B-2024-14892, they come from that sample data.
- **Fields: use the master field list, `data.fieldRegister`** (type `MasterField`, Fields tab, helpers in `lib/fields.ts`). It has one entry per field and links the RPA parcels, the Gatekeeper codes (`GK-…`, also used as `croppingPlans[].plans[].fieldParcel`) and the John Deere field names for that field. Areas come from RPA where the field is on our SBI, otherwise from Gatekeeper. It was built on 21 Oct 2026; entries with `linksChecked: false` were matched by name or area and James still needs to check them. Never change an entry's `id` once yields point at it.
  - Map, Soil, Satellite (UI and `/api/satellite/sync`), John Deere import (tab and `/api/jd/sync-and-import`), Cropping Plan rows, Dashboard, Farm Bible and Ask AI all read the master list (via `lib/fields.ts`: `findFieldByName`, `findFieldByParcel`, `currentCrop`, `recordsForField`, `jdMatchInputs`). They fall back to the old list only if `fieldRegister` is missing.
  - The older `data.fields` array (Gatekeeper estimates; a copy from 28 Apr 2026 is in `_backup_fields_2026_04_28`) is now only used by the Old field list tab (`Crops.tsx`). `data.jdFieldMap` is now only used for its `__IGNORE__` entries (John Deere names that are contract work for other people).
  - Records (sprays, fertilisers, soil tests, field notes) keep whatever field name they were saved under. They're matched to a field at display time by name, other names, Gatekeeper/John Deere names or parcel number (ignoring case, spaces, a leading 'The' and a trailing 'Field').
  - John Deere import matches jobs to fields only through each field's linked `jdNames`, so no guessing. Because Deere re-numbers operation IDs, `buildAssuranceImport` also treats a job as already imported when a record of the same kind for the same JD field and day exists (product names aren't compared: they're often corrected by hand).
  - Field pages open from `#fields/<id>`. The Map links to them.
  - Fields on a landlord's SBI (Bix Hall) keep the landlord's parcel numbers in `rpaParcels` and their agreement names in `otherNames` (e.g. Sale Field = 'Home' on the cropping licence).
  - John Deere "harvest" jobs include grass cuts, and a season can have several drillings (forage mixes, turnips, re-drills). None of the John Deere jobs so far carry a combine yield.
- The satellite NDVI sync is parked for the off-season. Don't spend time on it until the autumn crops are established.

## App sections (as built)
The menu has six sections (`GROUPS` in `components/Nav.tsx`); each one's tabs show on a second row. Settings is the gear in the header. The open tab is kept in the address (`#fields`, `#finance`…), so refresh and Back keep your place.

- **Today:** My day (`MyDay.tsx`, the landing page: the farm secretary's ranked list, see below) · Farm year (`FarmYear.tsx`, recurring reminders) · Dashboard (briefing, 7-day forecast, alerts) · Weather · Tasks · Diary · Brain Dump · Ask AI
- **Fields & crops:** Fields (master field list, history, yields) · Cropping Plan · Map (RPA parcels) · Agronomy recs (Luke's Gatekeeper recommendations) · Spray & fert records (`FieldRecords.tsx`, from John Deere, with assurance checks) · John Deere (`JohnDeere.tsx`, sync and field matching) · Soil (soil and sap tests) · Satellite (NDVI) · Old field list (`Crops.tsx`, the legacy `data.fields`)
- **Livestock:** Cattle (`Livestock.tsx`, imported from a CTS CSV) · Medicine
- **Money:** Finance (VAT, invoice scanning) · Costings (gross margins, incl. Wildfarmed comparison) · Grain sales (`GrainTrading.tsx`) · Purchases (Crop Advisors orders and stock) · Schemes (CS and SFI)
- **Compliance:** Compliance (checklist, certificates, spray/fertiliser records, readiness %) · Audit day (`Assurance.tsx`, documents for inspections)
- **The business:** Strategy · Farm Bible · Land (`Farms.tsx`, land block cards) · Contracts (`Utilities.tsx`) · Machinery · Links

There's no Bix Hall screen yet: the `bixHall` data (proposal notes, rent, timeline, open questions) is only in the blob.

## My day (the farm secretary)
`lib/secretary.ts` pulls every dated thing into one list: open tasks, outstanding bills and invoices (no due date → 30 days after the bill date), certificate expiries, contract renewals, machinery services, agreement end dates and scheme deadlines. Each source has a look-ahead window. `MyDay.tsx` shows it as Overdue / Today / This week / Coming up, with one-tap Done / Paid / Snooze / Not needed, a one-at-a-time Catch-up mode, and a quick-add box that creates a task.
- **Farm year** (`FarmYear.tsx`, `data.obligations`, type `Obligation`): the secretary's diary of things that come round every month or year. On 27 Oct 2026 Claude seeded 51 suggestions (status `suggested`) from the agreements, contracts, schemes, VAT number and the standard farm calendar; James ticks Yes / Edit / No. Confirmed ones (status `confirmed`, `startsOn` = the day kept, so no back-filled overdue) put a reminder on My day `leadDays` before each date; ticking it off clears that one occurrence (`secretary.dismissed['obl:<id>:<date>']`). Uncertain seeds say so in their notes (VAT quarter months, Stonor rent days, TB test interval).
- **My jobs** (on My day): James's own running list, like a paper list. The add box takes one job or a whole pasted list (one job per line; bullets, numbers and tick boxes are stripped) and reads dates from plain words ("Friday", "tomorrow", "next week", "14 March", "in 2 weeks", "by 14/3") via `lib/quickparse.ts`. No date found and none picked = an undated task (`date: ''`, category 'My jobs'), shown in the My jobs card; giving it a date moves it into the day plan.
- The Hub can be added to a phone home screen (`app/manifest.ts`, icons in `public/`), opening on My day.
- Form styling: inputs are only styled inside `.modal-box` or `.hub-form`. New pages put `hub-form` on their cards; older tabs style their own inputs inline.
- Done and Paid change the real record (task `done`, finance `status: 'Paid'` + `paidDate`). Snooze and Not needed are stored in `data.secretary` (`snoozed` / `dismissed`, keyed per item), so original dates stay true. A renewal or expiry key includes its date, so it comes back when the date is updated.
- Plan agreed with James on 26 Oct 2026, in order: (1) My day ✅; (2) a 15-minute catch-up with James to clear the backlog ✅ (27 Oct: 41 bills marked paid, £70,780); (3) ✅ Farm year, the "secretary's diary" of recurring obligations (VAT quarters, claim deadlines, NVZ closed periods, Red Tractor, TB tests, insurance, meter readings, rent/licence days, MOTs), pre-filled by Claude, ticked by James; (4) "Tell the Hub": type or dictate a reminder and AI files it with the right date; (5) an AI-written morning plan and Monday weekly review with suggestions; (6) lock the site down (login) before it becomes the main tool.
- Accounts are on **Telus Business Cloud (Farmplan)**. Linking it so paid bills tick themselves off is a later idea.
- James wants reminders for himself only for now (no handing jobs to Harry etc.).

## The daily briefing (separate from this repo)
A scheduled "farm secretary" task runs each morning in Claude. It reads Gmail and writes `data.dailyBriefing` into the Supabase blob. On load, the Hub turns the briefing's action items into tasks and its invoices into finance entries, then marks it `processed: true`; it also shows on the Dashboard and Finance tabs. The instructions for that task are in `farm-secretary-daily-skill.md` in James's Farm Hub documents folder, not in this repo. If you change the shape of `dailyBriefing` (type in `lib/types.ts`), keep that task in step.

## Farm context that shapes features
(These are from James. Confirm with him before treating any as final.)
- **Land:** home AHT tenancy (Stonor), owned land (including Lewknor, 47 ha), Bix Hall (five separate agreements: grazing licence for 11 permanent grass fields, cropping licence that's winter wheat only on 9 fields, Old Manor FBT (the field called Bix Manor), Bottom Hoggetts FBT (0.2 ha yard and building), grain store licence; the old Bix Hall contract farming agreement ended 1 Oct 2025; Wanscombe Bank is the Warmscombe Hill FBT). Details and dates are in `data.farmBible.agreements`, Hollandridge (Tom Dunn, handshake agreement), Grange & Shenley (Knowles CFA), Bellhatch and Bix Manor (rolling agreements).
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
- Fill in yields for earlier harvests (only harvest 2026 is in so far).
- NDVI vs grain protein correlation (some spring 2026 NDVI data now exists; see also `Protein_Prediction_Analysis.xlsx` in the repo root).
