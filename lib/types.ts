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
};

export interface CloudConfig {
  url: string;
  key: string;
}
