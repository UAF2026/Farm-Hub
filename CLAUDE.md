# Farm Hub — notes for Claude

The farm management app for **M J Hunt & Son**, Upper Assendon Farm, Stonor (near Henley-on-Thames, Oxfordshire). Owner and only user: **James Hunt**. Mixed arable and Wagyu-cross beef, around 1,750 acres across several tenancies.

These are the handover notes from the earlier build chats. The code is the source of truth. If anything here disagrees with it, trust the code and **update this file**.

## How to work with James
- He farms for a living and isn't a developer. Keep it plain, direct and short, with no jargon walls. Give him a clear recommendation rather than a menu of options.
- **Commits go through GitHub Desktop, never Terminal.** When a change is ready, tell him: open GitHub Desktop → Farm-Hub repo → check the changed files → type a commit message → "Commit to main" → "Push origin". Vercel deploys automatically from `main`.
- Do the work yourself: edit files, run the dev server and check things. Don't hand him commands to type.
- He uses the Hub on his phone as well as his laptop, so check that layouts work at phone width.
- Ask him before saying a farm fact is final, especially vet, health or scheme facts. Old notes have been wrong before (for example, TB status).

## Stack and infrastructure
- **Live site:** https://farm-hub-omega.vercel.app (Vercel, auto-deploys from GitHub `UAF2026/Farm-Hub`, branch `main`).
  - `farm-hub-sand.vercel.app` is an old, dead domain. Never use it.
- **Framework:** Next.js rebuild of the original single-file v1 (Apr 2026). Sections live in `components/sections/*.tsx` and types in `lib/types.ts`. Check `package.json` for current versions.
- **Database:** Supabase (EU), project `rzitnuwfqabgqvznkzax`. RLS is on for every table.
  - `farmdata`: **a single row, `id = 'farmhub_main'`, whose `data` jsonb column holds almost everything** (livestock, schemes, finance, cropping plans, compliance, farmBible, dailyBriefing and more). Patch the keys you need inside that blob. Don't overwrite the whole row.
  - `farmdata_backups`: snapshots. Take one before any big data change.
  - `field_boundaries`: 63 official RPA parcels (see below).
  - `satellite_ndvi`, `field_yields`, `brain_dump`: exist but are currently empty.
- **Anthropic API** is used inside the app (invoice scanning and similar). The key lives in environment variables. Never print or commit it.
- **John Deere Operations Center** integration feeds spray and fertiliser records (`jdAuth` / `jdOperations`). Deere operation IDs aren't stable over time, so old records can lose their link.

## Gotchas learned the hard way
- **The cropping plan UI (`CroppingPlan.tsx`) reads `data.croppingPlans`** (an array of `{season, plans, lastUpdated}`), matched by `season` such as `'26/27'`. It does **not** read `data.cropping`, which is legacy. Edits to the wrong key are invisible in the app.
- **Compliance templates:** `BEEF_CHECKLIST` / `ARABLE_CHECKLIST` in `components/sections/Compliance.tsx`. When adding checklist items, update the template as well as the live data, or a reload brings the old version back.
- Field areas: **`field_boundaries` (RPA open data, 63 parcels, 500.97 ha) is authoritative.** The old `fields` array numbers in the blob are stale estimates.
- The Monday satellite NDVI sync is parked for the off-season. Don't spend time on it until the autumn crops are established.

## App sections (as built)
Dashboard · Livestock (cattle from CTS CSV) · Schemes (CS and SFI) · Finance (VAT, invoice scanning) · Crops/Fields and Cropping Plan · Farms (land block cards) · Compliance (Red Tractor checklist, certificates, spray/fertiliser records, readiness %) · Medicine · Machinery · Utilities · Daily Briefing panel.

## The daily briefing (separate from this repo)
A scheduled "farm secretary" task runs each morning in Claude. It reads Gmail and writes `data.dailyBriefing` into the Supabase blob, and the Hub displays it. The instructions for that task are in `farm-secretary-daily-skill.md` in James's Farm Hub documents folder, not in this repo. If you change the shape of `dailyBriefing`, keep that task in step.

## Farm context that shapes features
- **Land:** home AHT tenancy (Stonor), owned land (including Lewknor, 47 ha), Bix Hall (five separate agreements: grazing licence, cropping licence that's winter wheat only, Old Manor FBT, Bottom Hoggetts FBT, grain store licence), Hollandridge (Tom Dunn, handshake agreement), Grange & Shenley (Knowles CFA), Bellhatch and Bix Manor (rolling agreements).
- **Crops:** Group 1/2 milling wheat (Ultimatum, to Heygates), winter barley, Ahiflower, beans, plus a chia trial. Beans and cereals are milled on-farm for cattle rations.
- **Cattle:** about 75 Wagyu-cross suckler cows, spring calving, around 60 finished a year, mostly sold via Dovecote/Waitrose at roughly £1/kg over deadweight.
- **Schemes (big money, time-critical):** CS 1255553 ends 31 Dec 2026; SFI 1 ends 31 Mar 2027; SFI 2 ends Nov 2027; SFI 3 ends Sep 2028. Moving to SFI26 plus a new CS Higher Tier (grassland). SBI 106227532.
- **People:** Harry (full-time, all arable operations), James's father (part-time tractor and feeding work), Charlie (son, at university, succession undecided).

## Roadmap and open ideas
- Cost of production per field and per crop (Harry is the only real wage cost; family labour is opportunity cost).
- Wagyu direct-sales tracker (restaurants, hotels, box scheme).
- Supplier and contact directory.
- Bix Hall 10-year FBT proposal (data scaffold in `bixHall` key).
- Scheme income replacement tracking (SFI26 / CSHT).
- NDVI vs grain protein correlation, once NDVI data exists.
