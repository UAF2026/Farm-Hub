'use client';

import { useState, useEffect } from 'react';
import { FarmData, CloudConfig } from '@/lib/types';
import type { ChecklistItem } from '@/lib/types';

interface Props {
  db: FarmData;
  persist: (newDb: FarmData) => void;
  cfg: CloudConfig | null;
  lastSynced: string;
  onConnect: (url: string, key: string) => Promise<boolean>;
  onDisconnect: () => void;
  onSyncNow: () => void;
}

function uid() { return Math.random().toString(36).slice(2, 10) + Date.now().toString(36); }

function buildSampleData() {
  const sprays = [
    { id: uid(), date: '2025-10-08', field: 'Long Ground', crop: 'Winter Wheat', product: 'Liberator', batch: 'LB250847', dose: 0.6, doseUnit: 'l/ha', area: 9.8, totalProduct: 5.88, waterVolume: 150, operator: 'James Hunt', basisCertRef: 'BASIS-2024-JH', windSpeed: '3-4 mph', temperature: '12°C', harvestInterval: 0, reEntryInterval: 8, purpose: 'Herbicide', notes: 'Pre-emergence. Good soil moisture.' },
    { id: uid(), date: '2025-10-09', field: 'Home Piece', crop: 'Winter Wheat', product: 'Liberator', batch: 'LB250847', dose: 0.6, doseUnit: 'l/ha', area: 6.2, totalProduct: 3.72, waterVolume: 150, operator: 'James Hunt', basisCertRef: 'BASIS-2024-JH', windSpeed: '3-4 mph', temperature: '11°C', harvestInterval: 0, reEntryInterval: 8, purpose: 'Herbicide', notes: 'Tank mix with Avadex.' },
    { id: uid(), date: '2025-10-14', field: 'Stone Hill', crop: 'Winter Wheat', product: 'Octavian', batch: 'OC251102', dose: 0.6, doseUnit: 'l/ha', area: 8.9, totalProduct: 5.34, waterVolume: 150, operator: 'Charlie Hunt', basisCertRef: 'BASIS-2024-JH', windSpeed: '2-3 mph', temperature: '10°C', harvestInterval: 0, reEntryInterval: 8, purpose: 'Herbicide', notes: 'Pre-em on late drilled field.' },
    { id: uid(), date: '2025-10-06', field: 'Bix Field', crop: 'Winter OSR', product: 'Astrokerb', batch: 'AK250634', dose: 2.0, doseUnit: 'l/ha', area: 12.3, totalProduct: 24.6, waterVolume: 200, operator: 'James Hunt', basisCertRef: 'BASIS-2024-JH', windSpeed: '2-3 mph', temperature: '13°C', harvestInterval: 0, reEntryInterval: 12, purpose: 'Herbicide', notes: 'Cleavers and brome. OSR at 6-leaf.' },
    { id: uid(), date: '2025-10-06', field: 'Bix Field', crop: 'Winter OSR', product: 'Proline', batch: 'PR250921', dose: 0.46, doseUnit: 'l/ha', area: 12.3, totalProduct: 5.66, waterVolume: 200, operator: 'James Hunt', basisCertRef: 'BASIS-2024-JH', windSpeed: '2-3 mph', temperature: '13°C', harvestInterval: 56, reEntryInterval: 12, purpose: 'Fungicide', notes: 'Tank mix with Astrokerb. Phoma protection.' },
    { id: uid(), date: '2025-11-03', field: 'Maidensgrove', crop: 'Winter OSR', product: 'Hallmark Zeon', batch: 'HZ251244', dose: 0.075, doseUnit: 'l/ha', area: 7.6, totalProduct: 0.57, waterVolume: 200, operator: 'Charlie Hunt', basisCertRef: 'BASIS-2024-JH', windSpeed: '1-2 mph', temperature: '8°C', harvestInterval: 60, reEntryInterval: 24, purpose: 'Insecticide', notes: 'CSFB adults — threshold exceeded.' },
    { id: uid(), date: '2026-02-18', field: 'Long Ground', crop: 'Winter Wheat', product: 'Rhino', batch: 'RH260112', dose: 1.5, doseUnit: 'l/ha', area: 9.8, totalProduct: 14.7, waterVolume: 200, operator: 'James Hunt', basisCertRef: 'BASIS-2024-JH', windSpeed: '4-5 mph', temperature: '7°C', harvestInterval: 0, reEntryInterval: 12, purpose: 'Fungicide', notes: 'T0. High septoria risk after wet Feb.' },
    { id: uid(), date: '2026-04-07', field: 'Long Ground', crop: 'Winter Wheat', product: 'Librax', batch: 'LX260334', dose: 1.0, doseUnit: 'l/ha', area: 9.8, totalProduct: 9.8, waterVolume: 200, operator: 'James Hunt', basisCertRef: 'BASIS-2024-JH', windSpeed: '3-4 mph', temperature: '14°C', harvestInterval: 35, reEntryInterval: 12, purpose: 'Fungicide', notes: 'T1 at GS31.' },
    { id: uid(), date: '2026-04-07', field: 'Home Piece', crop: 'Winter Wheat', product: 'Librax', batch: 'LX260334', dose: 1.0, doseUnit: 'l/ha', area: 6.2, totalProduct: 6.2, waterVolume: 200, operator: 'James Hunt', basisCertRef: 'BASIS-2024-JH', windSpeed: '3-4 mph', temperature: '14°C', harvestInterval: 35, reEntryInterval: 12, purpose: 'Fungicide', notes: 'T1 at GS31.' },
    { id: uid(), date: '2026-04-08', field: 'Long Ground', crop: 'Winter Wheat', product: 'Canopy', batch: 'CN260287', dose: 0.5, doseUnit: 'l/ha', area: 9.8, totalProduct: 4.9, waterVolume: 100, operator: 'James Hunt', basisCertRef: 'BASIS-2024-JH', windSpeed: '2-3 mph', temperature: '15°C', harvestInterval: 0, reEntryInterval: 8, purpose: 'Growth regulator', notes: 'PGR at GS31.' },
    { id: uid(), date: '2026-05-12', field: 'Long Ground', crop: 'Winter Wheat', product: 'Ascra Xpro', batch: 'AX260478', dose: 1.0, doseUnit: 'l/ha', area: 9.8, totalProduct: 9.8, waterVolume: 200, operator: 'James Hunt', basisCertRef: 'BASIS-2024-JH', windSpeed: '3-5 mph', temperature: '17°C', harvestInterval: 35, reEntryInterval: 12, purpose: 'Fungicide', notes: 'T2 at GS39. Flag leaf.' },
    { id: uid(), date: '2026-05-12', field: 'Home Piece', crop: 'Winter Wheat', product: 'Ascra Xpro', batch: 'AX260478', dose: 1.0, doseUnit: 'l/ha', area: 6.2, totalProduct: 6.2, waterVolume: 200, operator: 'James Hunt', basisCertRef: 'BASIS-2024-JH', windSpeed: '3-5 mph', temperature: '17°C', harvestInterval: 35, reEntryInterval: 12, purpose: 'Fungicide', notes: 'T2 at GS39.' },
    { id: uid(), date: '2026-05-12', field: 'Home Piece', crop: 'Winter Wheat', product: 'Hallmark Zeon', batch: 'HZ260389', dose: 0.075, doseUnit: 'l/ha', area: 6.2, totalProduct: 0.47, waterVolume: 200, operator: 'James Hunt', basisCertRef: 'BASIS-2024-JH', windSpeed: '3-5 mph', temperature: '17°C', harvestInterval: 28, reEntryInterval: 24, purpose: 'Insecticide', notes: 'BYDV vector control.' },
    { id: uid(), date: '2026-06-03', field: 'Long Ground', crop: 'Winter Wheat', product: 'Prosaro', batch: 'PS260512', dose: 0.8, doseUnit: 'l/ha', area: 9.8, totalProduct: 7.84, waterVolume: 200, operator: 'James Hunt', basisCertRef: 'BASIS-2024-JH', windSpeed: '2-3 mph', temperature: '19°C', harvestInterval: 35, reEntryInterval: 12, purpose: 'Fungicide', notes: 'T3 ear wash at GS61. Wet May — fusarium risk.' },
  ];
  const fertilisers = [
    { id: uid(), date: '2025-09-12', field: 'Bix Field', crop: 'Winter OSR', product: 'Compound 16:16:16', type: 'Compound NPK', n: 16, p: 16, k: 16, s: 0, ratePerHa: 300, area: 12.3, totalApplied: 3690, operator: 'James Hunt', method: 'Spreader', soilTest: 'ADAS Jun 2024 — P Index 2, K Index 2', notes: 'Base dressing pre-drilling.' },
    { id: uid(), date: '2025-10-15', field: 'The Warren', crop: 'Permanent Grassland', product: 'Cattle slurry', type: 'Slurry', n: 0.4, p: 0.1, k: 0.5, s: 0, ratePerHa: 30000, area: 9.4, totalApplied: 282000, operator: 'Charlie Hunt', method: 'Dribble bar', soilTest: 'Soil test Oct 2023', notes: 'Post-grazing. 8m buffer from ditch observed.' },
    { id: uid(), date: '2026-01-22', field: 'Long Ground', crop: 'Winter Wheat', product: 'Ammonium Nitrate 34.5%', type: 'Ammonium nitrate', n: 34.5, p: 0, k: 0, s: 0, ratePerHa: 150, area: 9.8, totalApplied: 1470, operator: 'James Hunt', method: 'Spreader', soilTest: 'ADAS Jun 2024 — N min 45kg/ha', notes: 'First N split. NVZ compliant.' },
    { id: uid(), date: '2026-01-22', field: 'Home Piece', crop: 'Winter Wheat', product: 'Ammonium Nitrate 34.5%', type: 'Ammonium nitrate', n: 34.5, p: 0, k: 0, s: 0, ratePerHa: 150, area: 6.2, totalApplied: 930, operator: 'James Hunt', method: 'Spreader', soilTest: 'ADAS Jun 2024', notes: 'First N split.' },
    { id: uid(), date: '2026-01-23', field: 'Stone Hill', crop: 'Winter Wheat', product: 'Ammonium Nitrate 34.5%', type: 'Ammonium nitrate', n: 34.5, p: 0, k: 0, s: 0, ratePerHa: 180, area: 8.9, totalApplied: 1602, operator: 'James Hunt', method: 'Spreader', soilTest: 'ADAS Jun 2024', notes: 'Higher rate — lighter soil.' },
    { id: uid(), date: '2026-01-24', field: 'Lambridge', crop: 'Winter Barley', product: 'Ammonium Nitrate 34.5%', type: 'Ammonium nitrate', n: 34.5, p: 0, k: 0, s: 0, ratePerHa: 100, area: 7.6, totalApplied: 760, operator: 'Charlie Hunt', method: 'Spreader', soilTest: 'ADAS Jun 2024', notes: 'First N split on barley.' },
    { id: uid(), date: '2026-02-10', field: 'Bix Field', crop: 'Winter OSR', product: 'Ammonium Nitrate 34.5%', type: 'Ammonium nitrate', n: 34.5, p: 0, k: 0, s: 0, ratePerHa: 180, area: 12.3, totalApplied: 2214, operator: 'James Hunt', method: 'Spreader', soilTest: 'ADAS Jun 2024', notes: 'First N on OSR.' },
    { id: uid(), date: '2026-02-12', field: 'Long Ground', crop: 'Winter Wheat', product: 'YaraBela Extran NS 26+14', type: 'Straight N', n: 26, p: 0, k: 0, s: 14, ratePerHa: 80, area: 9.8, totalApplied: 784, operator: 'James Hunt', method: 'Spreader', soilTest: 'ADAS Jun 2024', notes: 'Sulphur top-up.' },
    { id: uid(), date: '2026-03-05', field: 'Long Ground', crop: 'Winter Wheat', product: 'Ammonium Nitrate 34.5%', type: 'Ammonium nitrate', n: 34.5, p: 0, k: 0, s: 0, ratePerHa: 150, area: 9.8, totalApplied: 1470, operator: 'James Hunt', method: 'Spreader', soilTest: 'ADAS Jun 2024', notes: 'Second N split.' },
    { id: uid(), date: '2026-03-05', field: 'Home Piece', crop: 'Winter Wheat', product: 'Ammonium Nitrate 34.5%', type: 'Ammonium nitrate', n: 34.5, p: 0, k: 0, s: 0, ratePerHa: 150, area: 6.2, totalApplied: 930, operator: 'James Hunt', method: 'Spreader', soilTest: 'ADAS Jun 2024', notes: 'Second N split.' },
    { id: uid(), date: '2026-03-08', field: 'Middle Ground', crop: 'Spring Barley', product: 'Ammonium Nitrate 34.5%', type: 'Ammonium nitrate', n: 34.5, p: 0, k: 0, s: 0, ratePerHa: 180, area: 10.1, totalApplied: 1818, operator: 'Charlie Hunt', method: 'Spreader', soilTest: 'ADAS Jun 2024', notes: 'Top dressing at GS12.' },
    { id: uid(), date: '2026-03-10', field: 'Lambridge', crop: 'Winter Barley', product: 'Ammonium Nitrate 34.5%', type: 'Ammonium nitrate', n: 34.5, p: 0, k: 0, s: 0, ratePerHa: 100, area: 7.6, totalApplied: 760, operator: 'Charlie Hunt', method: 'Spreader', soilTest: 'ADAS Jun 2024', notes: 'Second and final N split.' },
  ];
  const certificates = [
    { id: uid(), name: 'BASIS Certificate', category: 'Pesticide', holder: 'James Hunt', certNumber: 'B-2024-14892', issueDate: '2024-01-15', expiryDate: '2026-12-31', issuedBy: 'BASIS Registration Ltd', notes: 'Annual CPD required' },
    { id: uid(), name: 'FACTS Certificate', category: 'Pesticide', holder: 'James Hunt', certNumber: 'F-2023-8741', issueDate: '2023-03-01', expiryDate: '2026-02-28', issuedBy: 'BASIS Registration Ltd', notes: 'Nutrient management qualification' },
    { id: uid(), name: 'PA1 – Ground crop sprayer', category: 'Operator', holder: 'James Hunt', certNumber: 'PA1-JH-7823', issueDate: '2018-06-12', expiryDate: '', issuedBy: 'City & Guilds / NPTC', notes: 'No expiry' },
    { id: uid(), name: 'PA2 – Boom sprayer', category: 'Operator', holder: 'James Hunt', certNumber: 'PA2-JH-7824', issueDate: '2018-06-12', expiryDate: '', issuedBy: 'City & Guilds / NPTC', notes: 'No expiry' },
    { id: uid(), name: 'PA6 – Knapsack sprayer', category: 'Operator', holder: 'Charlie Hunt', certNumber: 'PA6-CH-9912', issueDate: '2023-09-04', expiryDate: '', issuedBy: 'City & Guilds / NPTC', notes: '' },
    { id: uid(), name: 'Pesticide store inspection', category: 'Pesticide', holder: 'Upper Assendon Farm', certNumber: 'PS-UAF-2024', issueDate: '2024-03-20', expiryDate: '2027-03-20', issuedBy: 'NFU Mutual / BASIS', notes: 'Next inspection 2027' },
    { id: uid(), name: 'Farm insurance (NFU)', category: 'Insurance', holder: 'M J Hunt & Son', certNumber: 'NFU-UAF-2025', issueDate: '2025-05-01', expiryDate: '2026-04-30', issuedBy: 'NFU Mutual', notes: 'Public liability £10m. Renewal May 2026.' },
    { id: uid(), name: 'SAI Global membership', category: 'Membership', holder: 'M J Hunt & Son', certNumber: 'SAI-UAF-4471', issueDate: '2024-07-01', expiryDate: '2026-06-30', issuedBy: 'SAI Global', notes: 'Annual inspection due summer 2026' },
    { id: uid(), name: 'Red Tractor membership', category: 'Membership', holder: 'M J Hunt & Son', certNumber: 'RT-UAF-88234', issueDate: '2025-04-01', expiryDate: '2026-03-31', issuedBy: 'Red Tractor', notes: 'Annual renewal — check April 2026' },
    { id: uid(), name: 'Spray equipment test certificate', category: 'Pesticide', holder: 'Bateman RB35 sprayer', certNumber: 'SET-2024-1102', issueDate: '2024-08-14', expiryDate: '2027-08-14', issuedBy: 'NSTS / BASIS', notes: '3-year cert. Next Aug 2027.' },
  ];
  const beefChecklist = [
    { section: 'Animal Welfare', item: 'Animals inspected daily and records maintained', status: 'Yes', notes: 'Daily cattle rounds recorded in farm diary' },
    { section: 'Animal Welfare', item: 'Five Freedoms policy in place and understood by staff', status: 'Yes', notes: '' },
    { section: 'Animal Welfare', item: 'Veterinary Health Plan (VHP) in place and reviewed annually', status: 'Yes', notes: 'HHP with Adelle Jenkins BVSc GPcertFAP MRCVS, Larkmead Vets. Reviewed July 2025.' },
    { section: 'Animal Welfare', item: 'Emergency vet contact details displayed', status: 'Yes', notes: 'Posted in cattle shed and farmhouse' },
    { section: 'Animal Welfare', item: 'Mortality records kept and disposal documented', status: 'Yes', notes: 'Knacker collection receipts retained' },
    { section: 'Animal ID & Movement', item: 'All cattle ear-tagged with official BCMS tags', status: 'Yes', notes: '219 head — all double-tagged' },
    { section: 'Animal ID & Movement', item: 'CPH number displayed at farm entrance', status: 'Yes', notes: 'CPH 33/227/0030' },
    { section: 'Animal ID & Movement', item: 'Movement documents (AMLs) retained for 3+ years', status: 'Yes', notes: 'Retained in farm office filing' },
    { section: 'Animal ID & Movement', item: 'Herd register up to date and accurate', status: 'Yes', notes: 'Updated in BCMS and Farm Hub' },
    { section: 'Animal ID & Movement', item: 'BCMS cattle tracing notifications up to date', status: 'Yes', notes: 'All births, deaths, movements notified within 3 days' },
    { section: 'Medicine & Vet', item: 'Medicine records kept for all treatments (7 year retention)', status: 'Yes', notes: 'Recorded in Farm Hub medicine log' },
    { section: 'Medicine & Vet', item: 'Withdrawal periods recorded and observed', status: 'Yes', notes: '' },
    { section: 'Medicine & Vet', item: 'Medicines stored correctly (fridge temps logged if applicable)', status: 'Yes', notes: 'Fridge log in cattle shed' },
    { section: 'Medicine & Vet', item: 'Prescription medicines only used under valid vet prescription', status: 'Yes', notes: 'Prescriptions filed with records' },
    { section: 'Medicine & Vet', item: 'Sharps disposal documented and compliant', status: 'Yes', notes: 'Sharpsafe box — collected by vet' },
    { section: 'Medicine & Vet', item: 'TB testing up to date (4-yearly or as directed by APHA)', status: 'Yes', notes: 'Officially Tuberculosis Free (OTF). Last test clear. CPH 33/227/0030.' },
    { section: 'Medicine & Vet', item: 'Copper toxicity risk managed', status: 'Action required', notes: 'Elevated liver copper levels recorded in cull cows. Vet advice: monitor mineralisation of silage/by-products and reduce CRYSTALYX/supplement containing copper.' },
    { section: 'Medicine & Vet', item: 'Vaccination programme in place per vet recommendation', status: 'Yes', notes: 'Leptospirosis (Leptavoid H) and BVD (Bovilis BVD) annually per Adelle Jenkins, Larkmead Vets.' },
    { section: 'Feed & Water', item: 'Feed records maintained (source, quantity, dates)', status: 'Yes', notes: 'Feed deliveries recorded' },
    { section: 'Feed & Water', item: 'Clean water available to all animals at all times', status: 'Yes', notes: 'Troughs checked daily' },
    { section: 'Feed & Water', item: 'Feed store clean and free from contamination risk', status: 'Yes', notes: '' },
    { section: 'Feed & Water', item: 'No prohibited substances (MBM) fed to cattle', status: 'Yes', notes: '' },
    { section: 'Housing & Facilities', item: 'Buildings structurally sound and maintained', status: 'Yes', notes: 'Annual structural check carried out' },
    { section: 'Housing & Facilities', item: 'Adequate space allowances per animal', status: 'Yes', notes: '' },
    { section: 'Housing & Facilities', item: 'Slurry/manure storage adequate and not overflowing', status: 'Action required', notes: 'New slurry store planned — current capacity tight in wet winters' },
    { section: 'Housing & Facilities', item: 'Loading facilities safe and fit for purpose', status: 'Yes', notes: 'Steel race and crush installed 2022' },
    { section: 'Biosecurity', item: 'Biosecurity plan documented', status: 'Yes', notes: 'Written plan updated Jan 2026' },
    { section: 'Biosecurity', item: 'Visitor records maintained', status: 'No', notes: 'Action: set up visitor log book at farm entrance' },
    { section: 'Biosecurity', item: 'Isolation facilities available for new/returning animals', status: 'Yes', notes: 'Isolation pen in cattle yard' },
  ].map(c => ({ id: 'beef_' + uid(), ...c, lastChecked: '2026-04-01' })) as ChecklistItem[];
  const arableChecklist = [
    { section: 'Pesticide Safety', item: 'BASIS-qualified person available for spray advice', status: 'Yes', notes: 'James Hunt holds BASIS cert B-2024-14892' },
    { section: 'Pesticide Safety', item: 'All spray operators hold valid PA1 and appropriate certificate', status: 'Yes', notes: 'James Hunt PA1+PA2. Charlie Hunt PA6.' },
    { section: 'Pesticide Safety', item: 'Spray equipment tested and calibrated (within 3 years)', status: 'Yes', notes: 'Bateman RB35 tested Aug 2024' },
    { section: 'Pesticide Safety', item: 'Pesticide store locked, ventilated, bunded', status: 'Yes', notes: 'Inspected March 2024' },
    { section: 'Pesticide Safety', item: 'COSHH assessments available for all products used', status: 'Yes', notes: 'COSHH folder in farm office. Updated each season.' },
    { section: 'Pesticide Safety', item: 'Personal protective equipment (PPE) available and maintained', status: 'Yes', notes: 'PPE replaced annually' },
    { section: 'Spray Records', item: 'Full spray records kept for all applications (7 year retention)', status: 'Yes', notes: '14 records for 2025/26 in Farm Hub' },
    { section: 'Spray Records', item: 'Records include: date, field, product, dose, operator, conditions', status: 'Yes', notes: '' },
    { section: 'Spray Records', item: 'Harvest intervals checked and recorded', status: 'Yes', notes: 'Checked against label before each application' },
    { section: 'Spray Records', item: 'Buffer zones observed and recorded', status: 'Yes', notes: '5m uncropped buffer beside watercourses' },
    { section: 'Fertiliser', item: 'FACTS-qualified person available for nutrient advice', status: 'Yes', notes: 'James Hunt holds FACTS cert F-2023-8741' },
    { section: 'Fertiliser', item: 'Nutrient Management Plan (NMP) in place', status: 'Yes', notes: 'NMP produced by ADAS Feb 2025' },
    { section: 'Fertiliser', item: 'Soil tests carried out (within 5 years)', status: 'Yes', notes: 'ADAS soil sampling Jun 2024' },
    { section: 'Fertiliser', item: 'Fertiliser records kept for all applications', status: 'Yes', notes: '12 records for 2025/26 in Farm Hub' },
    { section: 'Fertiliser', item: 'Closed periods for manure/slurry spreading observed', status: 'Yes', notes: 'NVZ rules followed' },
    { section: 'Fertiliser', item: 'Organic manure applications recorded with source and analysis', status: 'Yes', notes: 'Slurry applications recorded' },
    { section: 'Environment', item: 'Watercourse buffer zones observed (6m uncropped)', status: 'Yes', notes: 'All watercourses have 6m+ buffer. In SFI agreement.' },
    { section: 'Environment', item: 'SSSI obligations (if applicable) being met', status: 'N/A', notes: 'No SSSI on farm' },
    { section: 'Environment', item: 'Burning restrictions complied with', status: 'Yes', notes: 'No straw burning — all baled or incorporated' },
    { section: 'Environment', item: 'Hedgerow management compliant with regulations', status: 'Yes', notes: 'No cutting Mar-Jul. SFI hedge actions in place.' },
    { section: 'Traceability', item: 'Field records identify variety, seed lot and provenance', status: 'Yes', notes: 'Seed invoices retained' },
    { section: 'Traceability', item: 'Grain store records (in/out) maintained', status: 'Yes', notes: 'Grain store movement book maintained' },
    { section: 'Traceability', item: 'Grain sales documents retained', status: 'Yes', notes: 'All contracts and delivery notes filed' },
    { section: 'Training & Competence', item: 'All staff training records maintained', status: 'Yes', notes: 'Training records in farm office' },
    { section: 'Training & Competence', item: 'First aid provision adequate', status: 'Action required', notes: 'James first aid cert expired Feb 2026 — book refresher' },
    { section: 'Training & Competence', item: 'Risk assessments for key operations documented', status: 'Yes', notes: 'COSHH, machinery, working at height. Updated Jan 2026.' },
  ].map(c => ({ id: 'arable_' + uid(), ...c, lastChecked: '2026-04-01' })) as ChecklistItem[];
  return { sprays, fertilisers, certificates, checklist: [...beefChecklist, ...arableChecklist] };
}

export default function Settings({ cfg, lastSynced, onConnect, onDisconnect, onSyncNow, db, persist }: Props) {
  const [url, setUrl] = useState('');
  const [key, setKey] = useState('');
  const [loading, setLoading] = useState(false);
  const [apiKey, setApiKey] = useState('');
  const [showKey, setShowKey] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('uaf_anthropic_key') || '';
      setApiKey(saved);
    }
  }, []);

  async function handleConnect() {
    if (!url.trim() || !key.trim()) return alert('Enter both URL and key');
    setLoading(true);
    const success = await onConnect(url, key);
    setLoading(false);
    if (success) {
      setUrl('');
      setKey('');
    }
  }

  function saveApiKey() {
    localStorage.setItem('uaf_anthropic_key', apiKey);
    alert('API key saved locally');
  }

  function exportBackup() {
    const json = JSON.stringify(db, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `farm-hub-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
  }

  return (
    <>
      <div className="card">
        <div className="card-title">Cloud Sync</div>
        {cfg
          ? <>
            <div className="row-item">
              <div className="row-name">Connected</div>
              <span className="badge bg-green">Synced</span>
            </div>
            <div className="row-item">
              <div className="row-name">Database URL</div>
              <div className="row-sub" style={{ fontFamily: 'monospace', fontSize: 11, wordBreak: 'break-all' }}>{cfg.url}</div>
            </div>
            {lastSynced && (
              <div className="row-item">
                <div className="row-name">Last synced</div>
                <div className="row-sub">{lastSynced}</div>
              </div>
            )}
            <div style={{ display: 'flex', gap: 8, marginTop: '1rem' }}>
              <button className="btn-primary" onClick={onSyncNow}>Sync now</button>
              <button className="btn-cancel" onClick={onDisconnect}>Disconnect</button>
            </div>
          </>
          : <>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: '1rem' }}>
              Connect to Supabase for cloud sync and backup.
            </p>
            <div className="field-row">
              <label className="form-label">Supabase URL</label>
              <input type="text" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://..." />
            </div>
            <div className="field-row">
              <label className="form-label">API Key</label>
              <input type="password" value={key} onChange={(e) => setKey(e.target.value)} placeholder="Your key" />
            </div>
            <button className="btn-primary" onClick={handleConnect} disabled={loading}>
              {loading ? 'Connecting...' : 'Connect cloud sync'}
            </button>
          </>
        }
      </div>

      <div className="card">
        <div className="card-title">Anthropic API Key</div>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: '1rem' }}>
          Save your API key to use the farm assistant and scan invoices.
        </p>
        <div className="field-row">
          <label className="form-label">API Key</label>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              type={showKey ? 'text' : 'password'}
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="sk-ant-..."
              style={{ flex: 1 }}
            />
            <button
              onClick={() => setShowKey(!showKey)}
              style={{
                padding: '0.5rem 1rem',
                background: 'var(--bg-secondary)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius)',
                cursor: 'pointer'
              }}
            >
              {showKey ? 'Hide' : 'Show'}
            </button>
          </div>
        </div>
        <button className="btn-primary" onClick={saveApiKey} style={{ marginTop: '0.5rem' }}>
          Save API key
        </button>
      </div>

      <div className="card">
        <div className="card-title">Load Sample Data</div>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: '1rem' }}>
          Loads 2025/26 season spray &amp; fertiliser records, certificates, and SAI Global inspection checklists for Upper Assendon Farm. Adds to any existing data.
        </p>
        <button className="btn-primary" onClick={() => {
          if (!confirm('Load sample compliance data? This will add spray records, fertiliser records, certificates and checklists.')) return;
          const sample = buildSampleData();
          persist({
            ...db,
            sprays: [...(db.sprays || []), ...sample.sprays],
            fertilisers: [...(db.fertilisers || []), ...sample.fertilisers],
            certificates: [...(db.certificates || []), ...sample.certificates],
            checklist: [...(db.checklist || []), ...sample.checklist],
          });
          alert('Done! Go to Compliance to see your records.');
        }}>
          Load sample compliance data
        </button>
      </div>

      <div className="card">
        <div className="card-title">Backup & Export</div>
        <button className="btn-primary" onClick={exportBackup}>
          Download JSON backup
        </button>
        <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: '0.5rem' }}>
          Exports all data as JSON for manual backup or transfer.
        </p>
      </div>

      <div className="card">
        <div className="card-title">About</div>
        <div className="row-item">
          <div className="row-name">Farm Hub</div>
          <div className="row-sub">v2.0</div>
        </div>
        <div className="row-item">
          <div className="row-name">Farm</div>
          <div className="row-sub">M J Hunt & Son</div>
        </div>
        <div className="row-item">
          <div className="row-name">SBI</div>
          <div className="row-sub">106227532</div>
        </div>
      </div>
    </>
  );
}
