import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";
import { db } from "./firebase";
import type { UserProfile } from "./transport-repository";

export type CompanySettings = { name: string; taxId: string; address: string; contactName: string; phone: string; email: string; logoUrl: string; trackingLinkDays: number };
export const defaultCompanySettings: CompanySettings = { name: "", taxId: "", address: "", contactName: "", phone: "", email: "", logoUrl: "", trackingLinkDays: 7 };
export const canEditCompanySettings = (actor: UserProfile) => actor.active && actor.approvalStatus === "approved" && actor.organizationId === "main" && ["owner", "admin", "dispatcher"].includes(actor.role);
export async function loadCompanySettings(organizationId: string): Promise<CompanySettings> {
  const snapshot = await getDoc(doc(db, "organizations", organizationId));
  const data = snapshot.data() || {};
  return { ...defaultCompanySettings, ...Object.fromEntries(Object.keys(defaultCompanySettings).filter(key => typeof data[key] === "string").map(key => [key, data[key]])), trackingLinkDays: Number.isInteger(data.trackingLinkDays) && data.trackingLinkDays >= 1 && data.trackingLinkDays <= 30 ? data.trackingLinkDays : 7 };
}
export function validateCompanySettings(draft: CompanySettings): CompanySettings {
  const result = { ...draft };
  for (const key of ["name", "taxId", "address", "contactName", "phone", "email", "logoUrl"] as const) result[key] = draft[key].trim();
  if (!result.name || result.name.length > 150) throw new Error("กรุณาระบุชื่อบริษัทไม่เกิน 150 ตัวอักษร");
  if (result.taxId && !/^\d{13}$/.test(result.taxId)) throw new Error("เลขประจำตัวผู้เสียภาษีต้องเป็นตัวเลข 13 หลัก");
  if (result.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(result.email)) throw new Error("รูปแบบอีเมลไม่ถูกต้อง");
  if (result.logoUrl) { let url; try { url = new URL(result.logoUrl); } catch { throw new Error("ลิงก์โลโก้ไม่ถูกต้อง"); } if (url.protocol !== "https:") throw new Error("ลิงก์โลโก้ต้องขึ้นต้นด้วย https://"); }
  if (!Number.isInteger(result.trackingLinkDays) || result.trackingLinkDays < 1 || result.trackingLinkDays > 30) throw new Error("อายุลิงก์ต้องอยู่ระหว่าง 1–30 วัน");
  if (result.address.length > 1000 || result.contactName.length > 150 || result.phone.length > 40 || result.email.length > 254 || result.logoUrl.length > 2000) throw new Error("ข้อมูลยาวเกินกำหนด");
  return result;
}
export async function saveCompanySettings(draft: CompanySettings, actor: UserProfile) {
  if (!canEditCompanySettings(actor)) throw new Error("เฉพาะผู้ดูแลบริษัทหลักเท่านั้นที่แก้ไขตั้งค่าบริษัทได้");
  const clean = validateCompanySettings(draft);
  await setDoc(doc(db, "organizations", "main"), { ...clean, updatedByUid: actor.uid, updatedAt: serverTimestamp() }, { merge: true });
  return clean;
}
