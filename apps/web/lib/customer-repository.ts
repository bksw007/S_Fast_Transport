import { collection, doc, onSnapshot, runTransaction, serverTimestamp, Timestamp, updateDoc } from "firebase/firestore";
import { db } from "./firebase";
import { isMainCompanyAdmin } from "./resource-repository";
import type { UserProfile } from "./transport-repository";

export type CustomerDraft = { name: string; contactName: string; phone: string; email: string; taxId: string; address: string; notes: string };
export type Customer = CustomerDraft & { id: string; active: boolean; aliases: string[] };
export type CustomerLink = { id: string; jobId: string; workOrder: string; customerName: string; enabled: boolean; expiresAt: number };
export const normalizeCustomerName = (value: string) => value.trim().replace(/\s+/g, " ").toLocaleLowerCase("th-TH");
function assertAccess(actor: UserProfile) {
  if (!isMainCompanyAdmin(actor)) throw new Error("เฉพาะผู้ดูแลบริษัทหลักเท่านั้นที่จัดการลูกค้าได้");
}
export function subscribeCustomers(onData: (items: Customer[]) => void, onError: (message: string) => void) {
  return onSnapshot(collection(db, "customers"), snapshot => onData(snapshot.docs.map(item => {
    const data = item.data();
    return { id: item.id, name: data.name ?? "", contactName: data.contactName ?? "", phone: data.phone ?? "", email: data.email ?? "", taxId: data.taxId ?? "", address: data.address ?? "", notes: data.notes ?? "", active: data.active !== false, aliases: data.aliases ?? [] };
  }).sort((a, b) => a.name.localeCompare(b.name, "th"))), error => onError(error.message));
}
export async function saveCustomer(draft: CustomerDraft, existing: Customer | null, actor: UserProfile) {
  assertAccess(actor);
  const clean = Object.fromEntries(Object.entries(draft).map(([key, value]) => [key, value.trim()])) as CustomerDraft;
  clean.name = clean.name.replace(/\s+/g, " ");
  if (!clean.name || clean.name.length > 200) throw new Error("กรุณากรอกชื่อลูกค้าไม่เกิน 200 ตัวอักษร");
  if (clean.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean.email)) throw new Error("อีเมลไม่ถูกต้อง");
  if (clean.taxId && !/^\d{13}$/.test(clean.taxId)) throw new Error("เลขประจำตัวผู้เสียภาษีต้องเป็นตัวเลข 13 หลัก");
  const ref = existing ? doc(db, "customers", existing.id) : doc(collection(db, "customers"));
  const normalized = normalizeCustomerName(clean.name);
  const nameRef = doc(db, "customer_names", encodeURIComponent(normalized));
  await runTransaction(db, async tx => {
    const nameSnapshot = await tx.get(nameRef);
    const current = await tx.get(ref);
    if (nameSnapshot.exists() && nameSnapshot.data().customerId !== ref.id) throw new Error("ชื่อลูกค้านี้มีอยู่แล้ว");
    const previous = current.data();
    const aliases = [...new Set([...(previous?.aliases ?? []), ...(previous?.name ? [previous.name] : []), clean.name])];
    tx.set(nameRef, { customerId: ref.id });
    tx.set(ref, { ...clean, aliases, active: previous?.active !== false, organizationId: "main", updatedAt: serverTimestamp(), updatedByUid: actor.uid, ...(!current.exists() ? { createdAt: serverTimestamp(), createdByUid: actor.uid } : {}) }, { merge: true });
    tx.set(doc(db, "organizations", "main", "list_options", `customer--${encodeURIComponent(normalized)}`), { organizationId: "main", field: "customer", value: clean.name, normalizedValue: normalized, createdByUid: actor.uid, updatedAt: serverTimestamp(), createdAt: serverTimestamp() }, { merge: true });
  });
}
export async function setCustomerActive(customer: Customer, active: boolean, actor: UserProfile) {
  assertAccess(actor);
  await updateDoc(doc(db, "customers", customer.id), { active, updatedAt: serverTimestamp(), updatedByUid: actor.uid });
}
export function subscribeCustomerLinks(onData: (items: CustomerLink[]) => void, onError: (message: string) => void) {
  return onSnapshot(collection(db, "tracking_share_links"), snapshot => onData(snapshot.docs.map(item => {
    const data = item.data();
    return { id: item.id, jobId: data.jobId, workOrder: data.workOrder, customerName: data.customerName, enabled: data.enabled === true, expiresAt: data.expiresAt?.toMillis() ?? 0 };
  }).sort((a, b) => b.expiresAt - a.expiresAt)), error => onError(error.message));
}
export async function updateCustomerLink(id: string, change: { enabled: boolean } | { expiresAt: Date }, actor: UserProfile) {
  assertAccess(actor);
  if ("expiresAt" in change && (!Number.isFinite(change.expiresAt.getTime()) || change.expiresAt.getTime() <= Date.now())) throw new Error("กรุณาเลือกวันหมดอายุในอนาคต");
  await updateDoc(doc(db, "tracking_share_links", id), { ...("expiresAt" in change ? { expiresAt: Timestamp.fromDate(change.expiresAt) } : change), updatedAt: serverTimestamp() });
}
