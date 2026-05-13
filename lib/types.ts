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
  sapTests?: SapTest[];
  soilTests?: SoilTestResult[];
  agronomyVisits?: AgronomyVisit[];
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
  nitrate?: number;       // ppm
  ammonium?: number;      // ppm
  potassium?: number;     // ppm
  calcium?: number;       // ppm
  magnesium?: number;     // ppm
  sodium?: number;        // ppm
  chloride?: number;      // ppm
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

export interface DailyBriefing {
  date: string;           // YYYY-MM-DD
  generatedAt: string;    // ISO timestamp
  emailsReviewed: number;
  actionItems: BriefingAction[];
  invoices: BriefingInvoice[];
  information: BriefingInfo[];
  calendarEvents: string[];
  processed?: boolean;    // true once action items & invoices have been added to tasks/finance
}
