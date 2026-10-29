import type { FarmData, Finance } from './types';
import { financeKey } from './secretary';
import { uid } from './utils';

// Bills logged from emails often arrived as £0 because the amount was only in
// the PDF. "Read amounts from the emails" (Finance tab) fetches each PDF via
// /api/finance/read-bill and files the result here.

/** Documents that came in like bills but aren't anything to pay. */
export const NOT_A_BILL = ['statement', 'remittance', 'order_confirmation', 'reminder'];
export const isNotABill = (f: Finance) => !!f.docType && NOT_A_BILL.includes(f.docType);

export const DOC_LABEL: Record<string, string> = {
  invoice: 'Invoice', credit_note: 'Credit note', statement: 'Statement', remittance: 'Remittance',
  order_confirmation: 'Order confirmation', reminder: 'Reminder', other: 'Other',
};

/** A bill with no amount that hasn't been tried yet. */
export const needsAmount = (f: Finance) =>
  !f.type.includes('Invoice') && !isNotABill(f) && !(f.gross || f.amount) && !f.readTried;

export interface ReadBill {
  found: boolean; docType?: string; invoiceNo?: string; invoiceDate?: string; dueDate?: string;
  net?: number | null; vat?: number | null; gross?: number | null; description?: string; fileName?: string; note?: string;
}

const isDate = (s?: string) => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);

/** Put what was read from the PDF onto the record, keeping My day snoozes attached. */
export function applyReadBill(db: FarmData, f: Finance, r: ReadBill, today: string): FarmData {
  const oldKey = financeKey(f);
  const next: Finance = { ...f, id: f.id || uid(), readTried: today };
  if (r.found) {
    next.docType = r.docType;
    next.readFrom = r.fileName;
    const credit = r.docType === 'credit_note' ? -1 : 1;
    if ((r.docType === 'invoice' || r.docType === 'credit_note' || r.docType === 'other') && typeof r.gross === 'number') {
      next.gross = Math.abs(r.gross) * credit;
      next.amount = next.gross;
      if (typeof r.net === 'number') next.net = Math.abs(r.net) * credit;
      if (typeof r.vat === 'number') next.vat = Math.abs(r.vat) * credit;
      if (typeof r.net === 'number' && typeof r.vat === 'number' && r.net) next.vatRate = r.vat === 0 ? '0%' : `${Math.round((r.vat / r.net) * 100)}%`;
    }
    if (!isDate(f.due) && isDate(r.dueDate)) next.due = r.dueDate!;
    if (!f.ref && r.invoiceNo) next.ref = r.invoiceNo;
    if (r.description && /amounts? in (the )?attached|open (the )?email|pdf/i.test(f.desc || '')) next.desc = r.description;
  }
  const newKey = financeKey(next);
  const sec = db.secretary;
  let secretary = sec;
  if (sec && oldKey !== newKey && (sec.snoozed[oldKey] || sec.dismissed[oldKey])) {
    const snoozed = { ...sec.snoozed }, dismissed = { ...sec.dismissed };
    if (snoozed[oldKey]) { snoozed[newKey] = snoozed[oldKey]; delete snoozed[oldKey]; }
    if (dismissed[oldKey]) { dismissed[newKey] = dismissed[oldKey]; delete dismissed[oldKey]; }
    secretary = { snoozed, dismissed };
  }
  return { ...db, secretary, finance: db.finance.map(x => (x === f ? next : x)) };
}
