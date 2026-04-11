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
  notes: string;
  parcel?: string;
}

export interface Finance {
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
  renewalDate: string;
  annualCost: number;
  notes: string;
  status: string;
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
