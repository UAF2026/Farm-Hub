export interface Task {
  id: string;
  name: string;
  date: string;
  priority: 'High' | 'Medium' | 'Low';
  category: string;
  repeat: string;
  notes: string;
  done: boolean;
  doneDate: string | null;
  briefingDate?: string;  // set when auto-created from daily briefing
}

export interface Cattle {
  tag: string;
  type: string;
  breed: string;
  dob: string;
  notes: string;
  source?: string;
}

export interface Field {
  name: string;
  area: number;
  status: string;
  crop: string;
  variety?: string;
  notes: string;
  parcel?: string;   // RPA parcel ID e.g. "5509"
  sheetId?: string;  // RPA sheet e.g. "SU7288"
}

export interface Finance {
  id?: string;            // optional unique id (used for briefing-created entries)
  type: string;
  status: string;
  supplier: string;
  desc: string;
  category: string;
  date: string;
  net: number;
  vat: number;
  gross: number;
  vatRate: string;
  due: string;
  ref: string;
  amount: number;
  briefingDate?: string;  // set when auto-created from daily briefing
}

export interface Scheme {
  name: string;
  date: string;
  priority: string;
  notes: string;
}

export interface Activity {
  msg: string;
  time: string;
}

export interface MedicineRecord {
  id: string;
  date: string;
  animal: string;
  product: string;
  batch: string;
  dose: string;
  route: string;
  withdrawalMeat: number;
  withdrawalMilk: number;
  vet: string;
  notes: string;
}

export interface MachineryRecord {
  id: string;
  machine: string;
  serviceType: string;
  date: string;
  hours: string;
  description: string;
  cost: number;
  supplier: string;
  nextServiceDate: string;
  notes: string;
}

export interface Utility {
  id: string;
  name: string;
  provider: string;
  accountRef: string;
  startDate: string;
  renewalDate: string;       // when current contract ends / next renewal kicks in
  annualCost: number;
  notes: string;
  status: string;
  // Extended fields for full contracts register (all optional so older
  // entries remain valid).
  category?: string;          // Electricity | Water | Phone | Broadband | Insurance | …
  monthlyCost?: number;       // calculated from annualCost when not set explicitly
  contactName?: string;
  contactPhone?: string;
  contactEmail?: string;
  noticePeriodDays?: number;  // days notice required to cancel — important for auto-renewing contracts
  paymentMethod?: string;     // 'Direct Debit' | 'BACS' | 'Card' | 'Invoice'
}

export interface SprayRecord {
  id: string;
  date: string;
  field: string;
  crop: string;
  product: string;
  batch: string;
  dose: number;
  doseUnit: string;
  area: number;
  totalProduct: number;
  waterVolume: number;
  operator: string;
  basisCertRef: string;
  windSpeed: string;
  temperature: string;
  harvestInterval: number;
  reEntryInterval: number;
  purpose: string;
  notes: string;
  source?: string;     // 'jd' for JD-imported records
  jdOpId?: string;     // John Deere operation ID (for dedupe on re-import)
}

export interface FertiliserRecord {
  id: string;
  date: string;
  field: string;
  crop: string;
  product: string;
  type: string;
  n: number;
  p: number;
  k: number;
  s: number;
  ratePerHa: number;
  area: number;
  totalApplied: number;
  operator: string;
  method: string;
  soilTest: string;
  notes: string;
  source?: string;     // 'jd' for JD-imported records
  jdOpId?: string;     // John Deere operation ID (for dedupe on re-import)
}

export interface Certificate {
  id: string;
  name: string;
  holder: string;
  certNumber: string;
  issueDate: string;
  expiryDate: string;
  issuedBy: string;
  category: string;
  notes: string;
}

export interface ChecklistItem {
  id: string;
  section: string;
  item: string;
  status: 'Yes' | 'No' | 'N/A' | 'Action required';
  notes: string;
  lastChecked: string;
}

/* ─── John Deere Operations Center ─────────────────────────────────────── */
export interface JdOperationProduct {
  name: string;
  type: string;          // FERTILIZER | CHEMICAL | SEED
  tankMix?: boolean;
}

export interface JdOperationMeasurements {
  // Filled by /api/jd/sync-measurements. Optional throughout because not every
  // op has every field (a swathing harvest has no yield, an old op might
  // pre-date measurement recording, etc.).
  area?: number;            // ha covered by the operation
  totalApplied?: number;    // total kg or t (sprays/fert: kg, harvest: t)
  totalUnit?: string;       // 'kg' | 't' | 'l' …
  ratePerHa?: number;       // average kg/ha or t/ha
  rateUnit?: string;        // 'kg/ha' | 'l/ha' | 't/ha'
  targetRatePerHa?: number; // what was set vs what was actually applied
  averageSpeedKmh?: number;
  tillageDepthCm?: number;
  yieldTPerHa?: number;     // harvest only (combine)
  fetchedAt?: string;       // ISO timestamp of last measurement fetch
}

export interface JdOperation {
  id: string;
  type: string;          // seeding | harvest | application | tillage
  fieldId: string;
  fieldName: string;
  startDate: string;
  endDate?: string;
  cropSeason?: string;
  cropName?: string;     // e.g. "WHEAT_EURO_WTR"
  varieties?: string[];
  products?: JdOperationProduct[];
  tillageType?: string;
  machineVin?: string;
  machineType?: string;
  measurements?: JdOperationMeasurements;
}

export interface JdSyncStatus {
  syncedAt: string;
  fieldsTouched: number;
  operationsTotal: number;
  since: string;         // ISO date — operations from this date onwards
}

/* ─── Grain Trading ─────────────────────────────────────────────────────── */

export type GrainCropYear = '2024/25' | '2025/26' | '2026/27' | '2027/28';
export type GrainContractStatus = 'open' | 'delivered' | 'invoiced' | 'paid' | 'cancelled';
export type GrainContractType = 'spot' | 'forward' | 'pool' | 'tender';

export interface GrainContract {
  id: string;
  cropYear: GrainCropYear;
  crop: string;               // 'Winter Wheat' | 'Feed Wheat' | 'Milling Wheat'
  variety?: string;
  buyer: string;              // e.g. 'Heygates', 'Openfield', 'Cofco'
  contractType: GrainContractType;
  tonnes: number;
  pricePerTonne: number;      // £/t
  basis?: string;             // e.g. 'ex-farm', 'delivered'
  contractRef?: string;
  contractDate?: string;      // ISO date signed
  deliveryFrom?: string;      // ISO date
  deliveryTo?: string;        // ISO date
  deliveredTonnes?: number;   // filled in as deliveries happen
  status: GrainContractStatus;
  notes?: string;
}

export interface GrainPosition {
  cropYear: GrainCropYear;
  crop: string;
  estimatedTotalTonnes: number;   // expected harvest or in-store
  contracts: GrainContract[];
}

export interface GrainTradingData {
  positions: GrainPosition[];
  lastMarketFetch?: string;       // ISO timestamp of last price update
  marketPrices?: GrainMarketPrice[];
}

export interface GrainMarketPrice {
  contract: string;    // e.g. 'Nov-26', 'May-27'
  pricePerTonne: number;
  fetchedAt: string;   // ISO timestamp
  source?: string;
}

/* ─── JD Field → Hub Field lookup table ────────────────────────────────── */
export interface JdFieldMapEntry {
  jdName: string;       // exact string from JdOperation.fieldName
  hubParcel: string;    // Hub field parcel ID (e.g. "5083", "BIX-Soundess")
  confirmed: boolean;   // false = auto-suggested, true = James confirmed it
}

/* ─── Invoice Settings (used for customer-facing invoice generation) ───────── */
export interface InvoiceSettings {
  businessName: string;      // e.g. 'M J Hunt & Son'
  address: string;           // multi-line, use \n
  vatNumber: string;         // e.g. 'GB 123 4567 89'
  bankName: string;          // e.g. 'Barclays'
  accountName: string;       // e.g. 'M J Hunt & Son'
  sortCode: string;          // e.g. '20-00-00'
  accountNumber: string;     // e.g. '12345678'
  paymentTerms: string;      // e.g. '30 days from invoice date'
  invoicePrefix: string;     // e.g. 'UAF' → UAF-001, UAF-002…
  nextInvoiceNumber: number; // auto-increments on each invoice created
}

/* ─── Farm Bible ─────────────────────────────────────────────────────────── */

/** Overview facts about the farm itself */
export interface FarmOverview {
  history: string;              // narrative history — 4th gen, 1750s farmhouse, etc.
  totalAreaHa: number;          // total area including tenanted land
  ownedAreaHa: number;
  tenantedAreaHa: number;
  enterprises: string;          // comma-separated: Arable, Wagyu, Breeding cattle, etc.
  farmType: string;             // e.g. "Mixed arable and beef"
  sbi: string;                  // 106227532
  vatRegistered: boolean;
  vatNumber: string;
  notes: string;
}

/** Key person associated with the farm */
export interface FarmPerson {
  id: string;
  name: string;
  role: string;                 // e.g. "Farm Manager", "Agronomist", "Accountant"
  company?: string;
  phone?: string;
  email?: string;
  notes: string;                // what they do, when to call them, quirks
}

/** An enterprise (arable, Wagyu, breeding cattle, etc.) with its own economics */
export interface FarmEnterprise {
  id: string;
  name: string;                 // e.g. "Winter wheat", "Wagyu beef", "Breeding cattle"
  type: 'Arable' | 'Livestock' | 'Diversification' | 'Environmental';
  targetMargin: number;         // £/ha or £/head
  targetMarginUnit: 'per_ha' | 'per_head' | 'per_year';
  fixedCostPerHa?: number;      // machinery, labour, overhead allocation
  variableCostPerHa?: number;   // seed, fert, spray, contract
  averageYield?: number;        // t/ha (arable) or kg/head (livestock)
  yieldUnit?: string;           // 't/ha' | 'kg/head' | 'head/year'
  averagePrice?: number;        // £/t or £/head
  notes: string;
}

/** A farm agreement, contract or obligation */
export interface FarmAgreement {
  id: string;
  name: string;                 // e.g. "CS Higher Tier 1255553", "Kepak Wagyu contract"
  type: 'Scheme' | 'Sales contract' | 'Tenancy' | 'Supply' | 'Other';
  counterparty: string;         // RPA, Kepak, Wildfarmed, Lord Alvingham etc.
  reference?: string;           // agreement number / contract ref
  startDate?: string;           // ISO date
  endDate?: string;             // ISO date — RED FLAG if within 12 months
  annualValue?: number;         // £/yr income or cost (negative = cost)
  keyObligations: string;       // what must be done / not done
  keyRisks: string;             // what happens if breached / not renewed
  contactName?: string;
  contactEmail?: string;
  contactPhone?: string;
  notes: string;
}

/** A field-level knowledge note — enriches the Field record with institutional memory */
export interface FieldNote {
  id: string;
  fieldName: string;            // must match Field.name or Field.parcel
  soilType: string;             // e.g. "Chalk over clay", "Brashy chalk"
  drainage: 'Good' | 'Average' | 'Poor' | 'Very poor';
  knownIssues: string;          // compaction, wet corner, pylons, watercourse, etc.
  historicalYield: string;      // e.g. "Wheat 8.5–9.5 t/ha, barley 7 t/ha"
  bestCrops: string;            // what works well here and why
  avoidCrops: string;           // what doesn't work well and why
  accessNotes: string;          // trailer width, steep, muddy gate etc.
  csOptions?: string;           // CS/SFI options on this field if any
  notes: string;
}

/** A recorded farm decision with rationale — the learning log */
export interface FarmDecision {
  id: string;
  date: string;                 // ISO date
  season?: string;              // e.g. "2025/26"
  category: 'Cropping' | 'Livestock' | 'Financial' | 'Capital' | 'Land' | 'Scheme' | 'Other';
  title: string;                // one-line summary
  decision: string;             // what was decided
  rationale: string;            // why — the institutional memory
  outcome?: string;             // filled in later: what actually happened
  tags?: string[];              // e.g. ['wheat', 'Lodge Farm', 'drought']
}

/** The full Farm Bible knowledge store */
export interface FarmBible {
  overview?: FarmOverview;
  people: FarmPerson[];
  enterprises: FarmEnterprise[];
  agreements: FarmAgreement[];
  fieldNotes: FieldNote[];
  decisions: FarmDecision[];
  lastUpdated?: string;         // ISO timestamp
}

export interface FarmData {
  cattle: Cattle[];
  fields: Field[];
  finance: Finance[];
  schemes: Scheme[];
  activity: Activity[];
  tasks: Task[];
  medicine: MedicineRecord[];
  machinery: MachineryRecord[];
  utilities: Utility[];
  sprays: SprayRecord[];
  fertilisers: FertiliserRecord[];
  certificates: Certificate[];
  checklist: ChecklistItem[];
  dailyBriefing?: DailyBriefing;
  jdOperations?: JdOperation[];
  jdSyncStatus?: JdSyncStatus;
  jdFieldMap?: JdFieldMapEntry[];   // JD field name → Hub parcel ID lookup table
  sapTests?: SapTest[];
  soilTests?: SoilTestResult[];
  agronomyVisits?: AgronomyVisit[];
  grainTrading?: GrainTradingData;
  invoiceSettings?: InvoiceSettings;
  farmBible?: FarmBible;
  purchases?: PurchaseOrder[];
  purchasesSyncStatus?: { syncedAt: string; ordersFound: number; };
}

/* ─── Crop Advisors Purchases ─────────────────────────────────────────────── */

export interface PurchaseProduct {
  name: string;
  quantity: number;
  unit: string;        // Tonnes | Litres | Kg
  bagSize: string;
  pricePerUnit: number;
  priceUnit: string;   // Per Tonne | Per Litre | Per Kg
  totalValue: number;
}

export interface PurchaseOrder {
  id: string;
  ref: string;         // F604892 | C602650 | S604823
  type: 'Fertiliser' | 'Chemical' | 'Seed' | 'Other';
  date: string;
  paymentDue: string;
  supplier: string;
  products: PurchaseProduct[];
  totalValue: number;
  cancelled?: boolean;
  source?: string;     // PDF filename
}

/* ─── Agronomy (Gatekeeper / Luke Cotton recommendations) ──────────────────── */

export interface AgronomyProduct {
  name: string;             // e.g. "Jessico One"
  mappNo?: string;          // e.g. "20475"
  activeIngredients?: string; // e.g. "Fenpicoxamid 5.00%"
  ratePerHa: number;        // e.g. 1.0
  unit: string;             // "L" | "g" | "kg" | "ml"
  totalRequired?: number;
  lerap?: string;           // e.g. "50 *" or "B"
  expiryDate?: string;
}

export interface AgronomyJobField {
  name: string;
  areaHa: number;
  crop: string;
  variety?: string;
  growthStage?: string;
  // Post-application tracking
  appliedDate?: string;     // ISO date when actually sprayed
  appliedByJdOpId?: string; // linked JD operation ID
  status?: 'pending' | 'applied' | 'overdue' | 'skipped';
}

export interface AgronomyJob {
  id: string;               // uid
  jobNumber: number;        // 1, 2, 3…
  reason: string;           // e.g. "T2 fungicide"
  comment?: string;         // Luke's instructions
  totalAreaHa: number;
  fields: AgronomyJobField[];
  products: AgronomyProduct[];
  waterVolume?: number;     // L/ha
  earliestDate?: string;
  latestDate?: string;
  earliestGrowthStage?: string;
  latestGrowthStage?: string;
  sprayQuality?: string;
}

export interface AgronomyVisit {
  id: string;               // e.g. "00012"
  reportNo: string;         // e.g. "00012"
  issueDate: string;        // ISO YYYY-MM-DD
  advisor: string;          // "Luke Cotton"
  basisFacts?: string;      // "R/E4927/ICM, FE/2916"
  notes?: string;           // free text from email body
  jobs: AgronomyJob[];
  source: 'gatekeeper' | 'manual';
}

/* ─── Soil Health (lab tests: Nutriscope, SOYL, independent) ───────────── */
export interface SoilTestResult {
  id: string;
  date: string;
  field: string;
  source: 'Nutriscope' | 'SOYL' | 'Independent' | 'Other';
  lab?: string;
  depth?: string;
  ph?: number;
  phosphorus?: number;
  phosphorusIndex?: string;
  potassium?: number;
  potassiumIndex?: string;
  magnesium?: number;
  magnesiumIndex?: string;
  organicMatter?: number;
  organicCarbon?: number;
  nitrogen?: number;
  sulphur?: number;
  boron?: number;
  manganese?: number;
  zinc?: number;
  copper?: number;
  soilType?: string;
  texture?: string;
  bulkDensity?: number;
  notes?: string;
  recommendation?: string;
  soylZone?: string;
  vrNRate?: number;
  vrPRate?: number;
  vrKRate?: number;
}

/* ─── Plant Health / Sap Tests (NutriScope) ────────────────────────────── */
export interface SapTestReadings {
  brixNew?: number;       // %
  brixOld?: number;       // %
  ph?: number;
  ec?: number;            // mS/cm
  nitrate?: number;       // ppm (NO3-N)
  ammonium?: number;      // ppm
  potassium?: number;     // ppm
  calcium?: number;       // ppm
  magnesium?: number;     // ppm
  sodium?: number;        // ppm
  chloride?: number;      // ppm
  // Extended Nutriscope / Senseen sap test minerals
  nitrogen?: number;      // ppm — Azote Total (total N)
  phosphorus?: number;    // ppm — Phosphore
  sulphur?: number;       // ppm — Soufre
  copper?: number;        // ppm — Cuivre
  molybdenum?: number;    // ppm — Molybdène
  iron?: number;          // ppm — Fer
  silica?: number;        // ppm — Silice
  zinc?: number;          // ppm — Zinc
  boron?: number;         // ppm — Bore
  manganese?: number;     // ppm — Manganèse
}

export interface SapTest {
  id: string;
  date: string;
  field: string;
  crop: string;
  variety?: string;
  growthStage?: string;
  leaf: 'new' | 'old' | 'both';
  readings: SapTestReadings;
  weather?: string;
  notes?: string;
  recommendation?: string;
  source?: string;
  contractContext?: string;   // e.g. 'Wildfarmed'
}

export const emptyDb: FarmData = {
  cattle: [],
  fields: [],
  finance: [],
  schemes: [],
  activity: [],
  tasks: [],
  medicine: [],
  machinery: [],
  utilities: [],
  sprays: [],
  fertilisers: [],
  certificates: [],
  checklist: [],
};

export interface CloudConfig {
  url: string;
  key: string;
}

/* ─── Daily Briefing (written by farm-secretary scheduled task) ─────────── */
export interface BriefingAction {
  from: string;
  subject: string;
  detail: string;
  deadline?: string;
}

export interface BriefingInvoice {
  supplier: string;
  ref: string;
  amount: string;       // human-readable e.g. "£1,234.56" or "See PDF"
  due: string;
  notes: string;
  // Enriched fields written by the v2 farm-secretary-daily skill. Each is
  // optional so older briefings remain readable.
  net?: number;          // numeric £, exclusive of VAT
  vat?: number;          // numeric £, the VAT amount
  gross?: number;        // numeric £, total payable
  vatRate?: string;      // e.g. "20%", "0%", "Mixed"
  category?: string;     // e.g. "Agronomy", "Fuel", "Vet", "Insurance"
  invoiceDate?: string;  // ISO YYYY-MM-DD, the date on the invoice
  paymentMethod?: string;// "BACS", "Direct Debit", "Card", etc.
}

export interface BriefingInfo {
  from: string;
  subject: string;
  detail: string;
}

export interface BriefingGrainPrice {
  contract: string;       // e.g. 'Nov-26', 'May-26 (old crop)', 'Jul-26 (harvest)'
  pricePerTonne: number;  // £/t
  source?: string;        // e.g. 'Openfield', 'ADM', 'ICE'
}

export interface DailyBriefing {
  date: string;           // YYYY-MM-DD
  generatedAt: string;    // ISO timestamp
  emailsReviewed: number;
  actionItems: BriefingAction[];
  invoices: BriefingInvoice[];
  information: BriefingInfo[];
  calendarEvents: string[];
  grainPrices?: BriefingGrainPrice[];  // extracted from Openfield/ADM price reports
  processed?: boolean;    // true once action items & invoices have been added to tasks/finance
}
