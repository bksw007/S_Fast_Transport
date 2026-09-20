import { addDoc, collection, doc, onSnapshot, serverTimestamp, updateDoc } from "firebase/firestore";
import { db } from "./firebase";
import { canManageOrganizationLists, type UserProfile } from "./transport-repository";

export type ContactDraft = { name: string; phone: string; company: string; location: string; notes: string };
export type SavedContact = ContactDraft & { id: string; active: boolean };
export const emptyContact: ContactDraft = { name: "", phone: "", company: "", location: "", notes: "" };
export function validateContact(draft: ContactDraft): ContactDraft {
  const clean = Object.fromEntries(Object.entries(emptyContact).map(([key]) => [key, String(draft[key as keyof ContactDraft] ?? "").trim()])) as ContactDraft;
  if (!clean.name || clean.name.length > 160) throw new Error("กรุณาระบุชื่อผู้ติดต่อ ไม่เกิน 160 ตัวอักษร");
  if (!/^[+\d()\s-]+$/.test(clean.phone) || clean.phone.replace(/\D/g, "").length < 7 || clean.phone.length > 40) throw new Error("กรุณาระบุเบอร์โทรให้ถูกต้อง");
  if (clean.company.length > 200 || clean.location.length > 200 || clean.notes.length > 500) throw new Error("บริษัทและสถานที่ต้องไม่เกิน 200 ตัวอักษร หมายเหตุไม่เกิน 500 ตัวอักษร");
  return clean;
}
export function subscribeContacts(orgId: string, onItems: (items: SavedContact[]) => void, onError: (message: string) => void) {
  return onSnapshot(collection(db, "organizations", orgId, "contacts"), snapshot => onItems(snapshot.docs.map(item => ({ ...emptyContact, ...item.data(), id: item.id } as SavedContact)).sort((a, b) => a.name.localeCompare(b.name, "th"))), error => onError(error.message));
}
export async function saveContact(draft: ContactDraft, id: string | undefined, actor: UserProfile) {
  const orgId = actor.organizationId ?? "main";
  if (!canManageOrganizationLists(actor, orgId)) throw new Error("ไม่มีสิทธิ์จัดการสมุดรายชื่อ");
  const data = { ...validateContact(draft), organizationId: orgId, updatedAt: serverTimestamp(), updatedBy: actor.uid };
  if (id) { await updateDoc(doc(db, "organizations", orgId, "contacts", id), data); return id; }
  return (await addDoc(collection(db, "organizations", orgId, "contacts"), { ...data, active: true, createdAt: serverTimestamp() })).id;
}
export async function setContactActive(id: string, active: boolean, actor: UserProfile) {
  const orgId = actor.organizationId ?? "main";
  if (!canManageOrganizationLists(actor, orgId)) throw new Error("ไม่มีสิทธิ์จัดการสมุดรายชื่อ");
  await updateDoc(doc(db, "organizations", orgId, "contacts", id), { active, updatedAt: serverTimestamp(), updatedBy: actor.uid });
}
