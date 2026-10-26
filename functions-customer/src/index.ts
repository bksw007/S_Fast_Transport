import { initializeApp } from "firebase-admin/app";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { onDocumentWritten } from "firebase-functions/v2/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import { createHash } from "node:crypto";
import * as nodemailer from "nodemailer";

initializeApp();
const db = getFirestore();
const gmailAddress = defineSecret("CUSTOMER_REQUEST_GMAIL_ADDRESS");
const gmailAppPassword = defineSecret("CUSTOMER_REQUEST_GMAIL_APP_PASSWORD");

type PlaceInput = { name?: unknown; googleName?: unknown; googlePlaceId?: unknown; lat?: unknown; lng?: unknown };
type CleanPlace = { name: string; googleName: string; googlePlaceId?: string; lat: number; lng: number; originalMapsUrl: string; navigationUrl: string };
type ContactInput = { name?: unknown; phone?: unknown };
type CleanContact = { name: string; phone: string };
type RequestInput = { pickupPlace?: PlaceInput; deliveryPlace?: PlaceInput; pickupContact?: ContactInput; deliveryContact?: ContactInput; pickupDate?: unknown; pickupTime?: unknown; deliveryDate?: unknown; deliveryTime?: unknown; cargoType?: unknown; vehicleType?: unknown; tripCount?: unknown; returnGoods?: unknown; notes?: unknown; recipientEmails?: unknown };

function cleanText(value: unknown, limit: number, label: string, required = true): string {
  const text = typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";
  if ((required && !text) || text.length > limit) throw new HttpsError("invalid-argument", `${label}ไม่ถูกต้อง`);
  return text;
}

function cleanPlace(value: PlaceInput | undefined, label: string): CleanPlace {
  const name = cleanText(value?.name, 160, `ชื่อ${label}`);
  const lat = Number(value?.lat);
  const lng = Number(value?.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180 || (lat === 0 && lng === 0)) {
    throw new HttpsError("invalid-argument", `พิกัด${label}ไม่ถูกต้อง`);
  }
  const googleName = cleanText(value?.googleName, 200, `ชื่อ Google ของ${label}`, false);
  const googlePlaceId = cleanText(value?.googlePlaceId, 300, `Place ID ของ${label}`, false);
  const url = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${lat},${lng}`)}${googlePlaceId ? `&query_place_id=${encodeURIComponent(googlePlaceId)}` : ""}`;
  return { name, googleName, ...(googlePlaceId ? { googlePlaceId } : {}), lat, lng, originalMapsUrl: url, navigationUrl: url };
}

function placeKey(place: CleanPlace): string {
  return createHash("sha256").update(place.googlePlaceId || `${place.lat.toFixed(5)},${place.lng.toFixed(5)}`).digest("hex").slice(0, 32);
}

function cleanContact(value: ContactInput | undefined, label: string): CleanContact {
  const name = cleanText(value?.name, 160, `ชื่อผู้ติดต่อ${label}`);
  const phone = cleanText(value?.phone, 20, `เบอร์โทรผู้ติดต่อ${label}`);
  if (!/^\+?[0-9\s()-]+$/.test(phone) || !/^\d{9,15}$/.test(phone.replace(/\D/g, ""))) {
    throw new HttpsError("invalid-argument", `เบอร์โทรผู้ติดต่อ${label}ไม่ถูกต้อง`);
  }
  return { name, phone };
}

function contactKey(contact: CleanContact): string {
  return createHash("sha256").update(`${contact.name.toLocaleLowerCase("th-TH")}:${contact.phone.replace(/\D/g, "")}`).digest("hex").slice(0, 32);
}

function cleanRecipients(raw: unknown, loginEmail: string): string[] {
  if (!Array.isArray(raw)) throw new HttpsError("invalid-argument", "กรุณาเลือกอีเมลผู้รับ");
  const emails = [...new Set(raw.map(value => String(value).trim().toLowerCase()))];
  const valid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emails.length || emails.length > (emails.includes(loginEmail.toLowerCase()) ? 3 : 2) || emails.some(value => value.length > 254 || !valid.test(value))) {
    throw new HttpsError("invalid-argument", "ระบุอีเมลผู้รับอย่างน้อย 1 และไม่เกิน 2 อีเมลเพิ่มเติม");
  }
  return emails;
}

export const submitCustomerJobRequest = onCall({ region: "asia-southeast1", secrets: [gmailAddress, gmailAppPassword] }, async request => {
  if (!request.auth) throw new HttpsError("unauthenticated", "กรุณาเข้าสู่ระบบ");
  if (!gmailAddress.value() || !gmailAppPassword.value()) throw new HttpsError("failed-precondition", "ระบบส่งอีเมลยังไม่พร้อมใช้งาน กรุณาติดต่อผู้ดูแล");
  const uid = request.auth.uid;
  const user = (await db.doc(`users/${uid}`).get()).data();
  if (!user || user.role !== "customer" || user.active !== true || user.approvalStatus !== "approved" || !user.customerId) {
    throw new HttpsError("permission-denied", "บัญชีนี้ไม่มีสิทธิ์แจ้งงาน");
  }
  const [customerDoc, companyDoc] = await Promise.all([
    db.doc(`customers/${user.customerId}`).get(), db.doc("organizations/main").get()
  ]);
  const customer = customerDoc.data();
  if (!customer || customer.active === false) throw new HttpsError("failed-precondition", "บริษัทลูกค้ายังไม่พร้อมใช้งาน");
  const companyEmail = cleanText(companyDoc.data()?.email, 254, "อีเมลบริษัทขนส่งหลัก", false);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(companyEmail)) throw new HttpsError("failed-precondition", "กรุณาให้แอดมินตั้งค่าอีเมลบริษัทขนส่งหลักก่อน");
  const data = request.data as RequestInput;
  const pickupPlace = cleanPlace(data?.pickupPlace, "จุดรับ");
  const deliveryPlace = cleanPlace(data?.deliveryPlace, "จุดส่ง");
  const pickupContact = cleanContact(data?.pickupContact, "จุดรับ");
  const deliveryContact = cleanContact(data?.deliveryContact, "จุดส่ง");
  const pickupDate = cleanText(data?.pickupDate, 10, "วันที่รับ");
  const deliveryDate = cleanText(data?.deliveryDate, 10, "วันที่ส่ง");
  const pickupTime = cleanText(data?.pickupTime, 5, "เวลารับ");
  const deliveryTime = cleanText(data?.deliveryTime, 5, "เวลาส่ง");
  if (![pickupDate, deliveryDate].every(value => /^\d{4}-\d{2}-\d{2}$/.test(value)) || ![pickupTime, deliveryTime].every(value => /^([01]\d|2[0-3]):[0-5]\d$/.test(value)) || `${deliveryDate}T${deliveryTime}` < `${pickupDate}T${pickupTime}`) {
    throw new HttpsError("invalid-argument", "วันและเวลาส่งต้องไม่ก่อนวันและเวลารับ");
  }
  const cargoType = cleanText(data?.cargoType, 160, "ประเภทสินค้า");
  const vehicleType = cleanText(data?.vehicleType, 160, "ประเภทรถ");
  const vehicleTypeId = `vehicle_type--${encodeURIComponent(vehicleType.replace(/\s+/g, " ").toLocaleLowerCase("th-TH"))}`;
  if (!(await db.doc(`organizations/main/list_options/${vehicleTypeId}`).get()).exists) {
    throw new HttpsError("invalid-argument", "กรุณาเลือกประเภทรถจากรายการของบริษัทขนส่งหลัก");
  }
  const notes = cleanText(data?.notes, 2000, "หมายเหตุ", false);
  const tripCount = Number(data?.tripCount);
  if (!Number.isInteger(tripCount) || tripCount < 1 || tripCount > 999) throw new HttpsError("invalid-argument", "จำนวนรอบไม่ถูกต้อง");
  if (typeof data?.returnGoods !== "boolean") throw new HttpsError("invalid-argument", "ตัวเลือกรับสินค้ากลับไม่ถูกต้อง");
  const returnGoods = data.returnGoods;
  const requesterEmail = cleanText(request.auth.token.email, 254, "อีเมลผู้แจ้ง").toLowerCase();
  const recipientEmails = cleanRecipients(data?.recipientEmails, requesterEmail);
  const customerName = cleanText(customer.name, 200, "ชื่อบริษัทลูกค้า");
  const placePairs = [pickupPlace, deliveryPlace].map(place => {
    const key = placeKey(place);
    return { place, customerRef: db.doc(`customers/${user.customerId}/locations/${key}`), mainRef: db.doc(`organizations/main/locations/${createHash("sha256").update(`${user.customerId}:${key}`).digest("hex").slice(0, 32)}`) };
  });
  const contactPairs = [pickupContact, deliveryContact].map(contact => ({ contact, ref: db.doc(`customers/${user.customerId}/contacts/${contactKey(contact)}`) }));
  const normalizedCargoType = cargoType.replace(/\s+/g, " ").toLocaleLowerCase("th-TH");
  const cargoTypeId = createHash("sha256").update(normalizedCargoType).digest("hex").slice(0, 32);
  const cargoTypeRef = db.doc(`customers/${user.customerId}/cargo_types/${cargoTypeId}`);
  const requestRef = db.collection("customer_job_requests").doc();
  await db.runTransaction(async tx => {
    const unique = [...new Map([...placePairs.flatMap(pair => [pair.customerRef, pair.mainRef]), ...contactPairs.map(pair => pair.ref), cargoTypeRef].map(ref => [ref.path, ref])).values()];
    const snapshots = await Promise.all(unique.map(ref => tx.get(ref)));
    const exists = new Map(snapshots.map((snapshot, index) => [unique[index].path, snapshot.exists]));
    const planned = new Set<string>();
    for (const pair of placePairs) {
      const common = { ...pair.place, notes: "", active: true, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() };
      if (!exists.get(pair.customerRef.path) && !planned.has(pair.customerRef.path)) { tx.create(pair.customerRef, { ...common, organizationId: user.customerId, customerId: user.customerId, sourceCustomerName: customerName, createdByUid: uid }); planned.add(pair.customerRef.path); }
      if (!exists.get(pair.mainRef.path) && !planned.has(pair.mainRef.path)) { tx.create(pair.mainRef, { ...common, organizationId: "main", sourceCustomerId: user.customerId, sourceCustomerName: customerName, createdByUid: uid }); planned.add(pair.mainRef.path); }
    }
    for (const pair of contactPairs) {
      if (!exists.get(pair.ref.path) && !planned.has(pair.ref.path)) {
        tx.create(pair.ref, { ...pair.contact, customerId: user.customerId, createdByUid: uid, createdAt: FieldValue.serverTimestamp() });
        planned.add(pair.ref.path);
      }
    }
    if (!exists.get(cargoTypeRef.path)) tx.create(cargoTypeRef, {
      customerId: user.customerId, value: cargoType, normalizedValue: normalizedCargoType,
      createdByUid: uid, createdAt: FieldValue.serverTimestamp()
    });
    tx.create(requestRef, {
      customerId: user.customerId, customerName, requesterUid: uid,
      requesterName: user.fullName || user.displayName || requesterEmail,
      requesterEmail, recipientEmails, companyEmail,
      pickupPlace: { ...pickupPlace, locationId: placePairs[0].mainRef.id }, pickupContact,
      deliveryPlace: { ...deliveryPlace, locationId: placePairs[1].mainRef.id }, deliveryContact,
      pickupDate, pickupTime, deliveryDate, deliveryTime, cargoType, vehicleType, tripCount, returnGoods, notes,
      status: "pending", createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp()
    });
  });
  return { id: requestRef.id };
});

export const rejectCustomerJobRequest = onCall({ region: "asia-southeast1" }, async request => {
  if (!request.auth) throw new HttpsError("unauthenticated", "กรุณาเข้าสู่ระบบ");
  const user = (await db.doc(`users/${request.auth.uid}`).get()).data();
  if (!user || user.active !== true || user.approvalStatus !== "approved" || user.organizationId !== "main" || !["owner", "admin", "dispatcher"].includes(user.role)) {
    throw new HttpsError("permission-denied", "เฉพาะผู้ดูแลบริษัทหลักเท่านั้นที่ปฏิเสธงานได้");
  }
  const id = cleanText(request.data?.id, 128, "รหัสคำขอ");
  if (!/^[A-Za-z0-9_-]+$/.test(id)) throw new HttpsError("invalid-argument", "รหัสคำขอไม่ถูกต้อง");
  const reason = cleanText(request.data?.reason, 500, "เหตุผลที่ไม่รับงาน");
  const ref = db.doc(`customer_job_requests/${id}`);
  await db.runTransaction(async tx => {
    const snapshot = await tx.get(ref);
    if (!snapshot.exists || snapshot.data()?.status !== "pending") throw new HttpsError("failed-precondition", "คำขอนี้ได้รับการพิจารณาแล้ว");
    tx.update(ref, { status: "rejected", rejectionReason: reason, decidedByUid: request.auth!.uid, decidedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
  });
  return { ok: true };
});

function escapeHtml(value: unknown): string {
  return String(value ?? "").replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character] || character);
}

export const emailCustomerJobRequest = onDocumentWritten({
  document: "customer_job_requests/{requestId}", region: "asia-southeast1", retry: true,
  secrets: [gmailAddress, gmailAppPassword]
}, async event => {
  const before = event.data?.before.data();
  const after = event.data?.after.data();
  if (!after || (before && before.status === after.status) || !["pending", "accepted", "rejected"].includes(after.status)) return;
  const status = String(after.status);
  const subject = status === "pending" ? `มีคำขอแจ้งงานใหม่ · ${after.customerName}` : status === "accepted" ? `รับงานแล้ว · ${after.workOrder}` : `ไม่รับงาน · ${after.customerName}`;
  const decision = status === "accepted" ? `รับงานแล้ว เลขที่ใบงาน ${after.workOrder}` : status === "rejected" ? `ไม่รับงาน: ${after.rejectionReason}` : "รอผู้ดูแลพิจารณา";
  const lines = [
    `บริษัทลูกค้า: ${after.customerName}`, `ผู้แจ้ง: ${after.requesterName}`,
    `จุดรับ: ${after.pickupPlace?.name} · ${after.pickupDate} ${after.pickupTime}`,
    `ผู้ติดต่อจุดรับ: ${after.pickupContact?.name || "—"} · ${after.pickupContact?.phone || "—"}`,
    `จุดส่ง: ${after.deliveryPlace?.name} · ${after.deliveryDate} ${after.deliveryTime}`,
    `ผู้ติดต่อจุดส่ง: ${after.deliveryContact?.name || "—"} · ${after.deliveryContact?.phone || "—"}`,
    `ประเภทสินค้า: ${after.cargoType}`, `ประเภทรถ: ${after.vehicleType}`,
    `จำนวนรอบ: ${after.tripCount || 1}`, `รับสินค้ากลับ: ${after.returnGoods ? "ใช่" : "ไม่"}`,
    `หมายเหตุ: ${after.notes || "ไม่มี"}`, `ผลการพิจารณา: ${decision}`
  ];
  const companyEmail = String(after.companyEmail || "").trim().toLowerCase();
  const recipients = [...new Set([...(Array.isArray(after.recipientEmails) ? after.recipientEmails : []), companyEmail].filter((value): value is string => typeof value === "string" && value.length > 0).map(value => value.toLowerCase()))];
  if (!recipients.length || !companyEmail) return;
  const sender = gmailAddress.value()?.trim();
  const password = gmailAppPassword.value()?.replace(/\s/g, "");
  if (!sender || !password) throw new Error("Customer request Gmail configuration is missing");
  const requestId = event.params.requestId;
  const transporter = nodemailer.createTransport({
    host: "smtp.gmail.com", port: 465, secure: true,
    auth: { user: sender, pass: password }
  });
  try {
    for (const recipient of recipients) {
      const key = createHash("sha256").update(`${requestId}:${status}:${recipient}`).digest("hex");
      const log = db.doc(`customer_request_email_delivery/${key}`);
      if ((await log.get()).data()?.sentAt) continue;
      const result = await transporter.sendMail({
        from: { name: "S Fast Transportation", address: sender },
        to: recipient,
        subject,
        text: lines.join("\n"),
        html: `<div style="font-family:sans-serif;line-height:1.7">${lines.map(line => `<p>${escapeHtml(line)}</p>`).join("")}</div>`
      });
      if (!result.accepted.some(address => address.toLowerCase() === recipient)) {
        throw new Error(`Gmail did not accept recipient ${recipient}`);
      }
      await log.set({ requestId, status, recipients: [recipient], providerId: result.messageId || "", sentAt: FieldValue.serverTimestamp() });
    }
  } finally {
    transporter.close();
  }
});

export const linkJobToCustomer = onDocumentWritten({
  document: "today_jobs/{jobId}",
  region: "asia-southeast1"
}, async event => {
  const before = event.data?.before.data();
  const after = event.data?.after.data();
  if (!after || after.customerId || (before && before.customer === after.customer)) return;
  const normalized = String(after.customer ?? "").trim().replace(/\s+/g, " ").toLocaleLowerCase("th-TH");
  if (!normalized) return;
  const indexed = await db.doc(`customer_names/${encodeURIComponent(normalized)}`).get();
  let customerId = indexed.exists ? String(indexed.data()?.customerId ?? "") : "";
  if (customerId) {
    const customer = await db.doc(`customers/${customerId}`).get();
    if (!customer.exists || customer.data()?.deletedAt) customerId = "";
  }
  if (!customerId) {
    const customers = await db.collection("customers").get();
    const matches = customers.docs.filter(item => {
      const data = item.data();
      return !data.deletedAt && [data.name, ...(Array.isArray(data.aliases) ? data.aliases : [])]
        .some(name => String(name ?? "").trim().replace(/\s+/g, " ").toLocaleLowerCase("th-TH") === normalized);
    });
    if (matches.length === 1) customerId = matches[0].id;
  }
  if (customerId) await event.data?.after.ref.update({ customerId });
});
