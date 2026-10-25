import { initializeApp } from "firebase-admin/app";
import { FieldValue, getFirestore, Timestamp } from "firebase-admin/firestore";
import { defineSecret } from "firebase-functions/params";
import { onDocumentCreated } from "firebase-functions/v2/firestore";
import { logger } from "firebase-functions";
import { randomUUID } from "node:crypto";

initializeApp();
const db = getFirestore();

const lineChannelAccessToken = defineSecret("LINE_CHANNEL_ACCESS_TOKEN");
const LINE_GROUP_ID = "Cad5367471fd1c5487eac65af79417742";
const SITE_URL = "https://sfasttransport.vercel.app";

const issueLabels: Record<string, string> = {
  accident: "อุบัติเหตุ", traffic: "จราจรติดขัด", heavy_rain: "ฝนตกหนัก",
  vehicle_breakdown: "รถเสีย", road_closed: "ถนนปิดหรือเส้นทางใช้ไม่ได้",
  contact_failed: "ติดต่อลูกค้าไม่ได้", loading_delay: "รอรับหรือส่งสินค้านาน",
  customer_absent: "ลูกค้าไม่อยู่ที่จุดนัดหมาย", signature_refused: "ลูกค้าปฏิเสธการเซ็นชื่อ",
  photo_unavailable: "ไม่สามารถถ่ายรูปสินค้าได้", goods_damaged: "สินค้าชำรุดหรือเสียหาย",
  other: "ปัญหาอื่น ๆ"
};

function lineText(value: unknown, limit = 160) {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  return text ? text.length > limit ? `${text.slice(0, limit - 1)}…` : text : "-";
}

function thaiDate(value: unknown) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value ?? ""));
  return match ? `${match[3]}/${match[2]}/${Number(match[1]) + 543}` : lineText(value, 30);
}

async function lineNotificationsEnabled() {
  const settings = await db.collection("organizations").doc("main").get();
  return settings.data()?.lineNotificationsEnabled !== false;
}

async function sendLineEventOnce(notificationId: string, message: string, recipient = LINE_GROUP_ID) {
  const notificationRef = db.collection("line_event_notifications").doc(notificationId);
  const notification = await db.runTransaction(async transaction => {
    const existing = await transaction.get(notificationRef);
    if (existing.exists) return existing.data() as { retryKey: string; status?: string; createdAt?: Timestamp };
    const created = { retryKey: randomUUID(), status: "pending", createdAt: FieldValue.serverTimestamp() };
    transaction.create(notificationRef, created);
    return created;
  });
  if (["sent", "failed", "expired", "disabled"].includes(notification.status ?? "")) return;
  if (notification.createdAt instanceof Timestamp && Date.now() - notification.createdAt.toMillis() > 23 * 60 * 60 * 1000) {
    logger.error("LINE event notification retry window expired", { notificationId });
    await notificationRef.update({ status: "expired", updatedAt: FieldValue.serverTimestamp() });
    return;
  }
  if (!(await lineNotificationsEnabled())) {
    await notificationRef.update({ status: "disabled", updatedAt: FieldValue.serverTimestamp() });
    return;
  }

  const response = await fetch("https://api.line.me/v2/bot/message/push", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${lineChannelAccessToken.value()}`,
      "Content-Type": "application/json",
      "X-Line-Retry-Key": notification.retryKey
    },
    body: JSON.stringify({ to: recipient, messages: [{ type: "text", text: message }] })
  });
  if (!response.ok && response.status !== 409) {
    logger.error("Failed to notify LINE group of event", { notificationId, status: response.status, errorBody: (await response.text()).slice(0, 500) });
    if (response.status >= 500 || response.status === 429) throw new Error(`LINE push failed: ${response.status}`);
    await notificationRef.update({ status: "failed", httpStatus: response.status, updatedAt: FieldValue.serverTimestamp() });
    return;
  }
  await notificationRef.update({ status: "sent", sentAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
}

export const notifyLineGroupOfDriverIssue = onDocumentCreated({
  document: "job_events/{eventId}", region: "asia-southeast1",
  secrets: [lineChannelAccessToken], retry: true
}, async event => {
  const issue = event.data?.data();
  if (issue?.type !== "driver_issue" || !issue.jobId) return;
  const job = (await db.collection("today_jobs").doc(String(issue.jobId)).get()).data();
  const metadata = issue.metadata ?? {};
  const message = [
    "🚨 คนขับแจ้งปัญหา · รอดำเนินการ",
    `ใบงาน: ${lineText(job?.workOrder)}`,
    `คนขับ: ${lineText(issue.actorName || job?.driverName)}`,
    `รถ: ${lineText(job?.vehiclePlate)}`,
    `ปัญหา: ${issueLabels[String(metadata.issueType)] || "ปัญหาอื่น ๆ"}`,
    `รายละเอียด: ${lineText(metadata.note, 200)}`,
    `รูปประกอบ: ${metadata.photoPath ? "มี" : "ไม่มี"}`,
    "",
    `เปิดระบบ: ${SITE_URL}/`,
    "เมนูแจ้งเตือน → จากคนขับ"
  ].join("\n");
  await sendLineEventOnce(`driver_issue_${event.params.eventId}`, message);
});

export const notifyLineGroupOfSubcontractAssignment = onDocumentCreated({
  document: "job_events/{eventId}", region: "asia-southeast1",
  secrets: [lineChannelAccessToken], retry: true
}, async event => {
  const change = event.data?.data();
  if (!change?.jobId || change.type !== "subcontract_assigned") return;
  const job = (await db.collection("today_jobs").doc(String(change.jobId)).get()).data();
  if (!job || job.originOrganizationId !== "main" || !job.organizationId || job.organizationId === "main" || !job.assignedDriverUid) return;
  const trackingUrl = typeof job.trackingShareToken === "string" && /^[a-f0-9]{32}$/i.test(job.trackingShareToken)
    ? `${SITE_URL}/track/${job.trackingShareToken}` : `${SITE_URL}/`;
  const message = [
    "🚚 บริษัทซับมอบหมายรถและคนขับแล้ว",
    `ใบงาน: ${lineText(job?.workOrder)}`,
    `บริษัท: ${lineText(job?.carrierName)}`,
    `ลูกค้า: ${lineText(job?.customer)}`,
    `รถ: ${lineText(job?.vehiclePlate)}`,
    `คนขับ: ${lineText(job?.driverName)}`,
    `วันที่รับสินค้า: ${thaiDate(job?.pickupDate)}`,
    `จุดรับ: ${lineText(job?.pickupLocation)}`,
    `จุดส่ง: ${lineText(job?.deliveryLocation)}`,
    `ติดตามสถานะ: ${trackingUrl}`
  ].join("\n");
  await sendLineEventOnce(`subcontract_group_${change.jobId}`, message);
  const organization = (await db.collection("organizations").doc(String(job.organizationId)).get()).data();
  const recipient = organization?.lineUserId;
  if (organization?.deleted !== true && typeof recipient === "string" && /^U[0-9a-f]{32}$/i.test(recipient)) {
    await sendLineEventOnce(`subcontract_contact_${change.jobId}`, message, recipient);
  }
});

export const notifyLineGroupOfCustomerRequest = onDocumentCreated({
  document: "customer_job_requests/{requestId}", region: "asia-southeast1",
  secrets: [lineChannelAccessToken], retry: true
}, async event => {
  const request = event.data?.data();
  if (!request || request.status !== "pending") return;
  const message = [
    "📦 คำขอแจ้งงานใหม่ · รอพิจารณา",
    `บริษัท: ${lineText(request.customerName)}`,
    `ผู้แจ้ง: ${lineText(request.requesterName)}`,
    `รับสินค้า: ${lineText(request.pickupPlace?.name)} · ${thaiDate(request.pickupDate)} ${lineText(request.pickupTime, 5)}`,
    `ผู้ติดต่อจุดรับ: ${lineText(request.pickupContact?.name)} · ${lineText(request.pickupContact?.phone)}`,
    `ส่งสินค้า: ${lineText(request.deliveryPlace?.name)} · ${thaiDate(request.deliveryDate)} ${lineText(request.deliveryTime, 5)}`,
    `ผู้ติดต่อจุดส่ง: ${lineText(request.deliveryContact?.name)} · ${lineText(request.deliveryContact?.phone)}`,
    `สินค้า: ${lineText(request.cargoType)}`,
    `รถที่ต้องการ: ${lineText(request.vehicleType)}`,
    `จำนวนรอบ: ${Number(request.tripCount) || 1}`,
    `รับสินค้ากลับ: ${request.returnGoods ? "ใช่" : "ไม่"}`,
    `หมายเหตุ: ${lineText(request.notes, 200)}`,
    "",
    `เปิดระบบ: ${SITE_URL}/`,
    "เมนูแจ้งเตือน → จากลูกค้า"
  ].join("\n");
  await sendLineEventOnce(`customer_request_${event.params.requestId}`, message);
});

export const notifyLineGroupOfNewJob = onDocumentCreated({
  document: "today_jobs/{jobId}",
  region: "asia-southeast1",
  secrets: [lineChannelAccessToken],
  retry: true
}, async (event) => {
  const job = event.data?.data();
  if (!job || !job.workOrder) return;
  if (job.originOrganizationId === "main" && job.organizationId && job.organizationId !== "main") return;

  const jobId = event.params.jobId;
  const notificationRef = db.collection("line_job_notifications").doc(jobId);
  const notification = await db.runTransaction(async (transaction) => {
    const existing = await transaction.get(notificationRef);
    if (existing.exists) return existing.data() as { token: string; retryKey: string; status?: string; createdAt?: Timestamp };
    const created = { token: typeof job.trackingShareToken === "string" && /^[a-f0-9]{32}$/i.test(job.trackingShareToken) ? job.trackingShareToken : randomUUID().replaceAll("-", ""), retryKey: randomUUID(), status: "pending", createdAt: FieldValue.serverTimestamp() };
    transaction.create(notificationRef, created);
    return created;
  });
  if (["sent", "disabled"].includes(notification.status ?? "")) return;
  if (notification.createdAt instanceof Timestamp && Date.now() - notification.createdAt.toMillis() > 23 * 60 * 60 * 1000) {
    logger.error("LINE notification retry window expired", { jobId });
    await notificationRef.update({ status: "expired", updatedAt: FieldValue.serverTimestamp() });
    return;
  }

  const organizationId = String(job.organizationId ?? "main");
  const organization = await db.collection("organizations").doc(organizationId).get();
  const days = Number(organization.data()?.trackingLinkDays);
  const trackingLinkDays = Number.isInteger(days) && days >= 1 && days <= 30 ? days : 7;
  const linkRef = db.collection("tracking_share_links").doc(notification.token);
  const savedLink = await linkRef.get();
  if (!savedLink.exists) {
    if (job.trackingShareToken) throw new Error(`Tracking link for job ${jobId} is missing`);
    await linkRef.create({
      jobId,
      organizationId,
      enabled: true,
      expiresAt: Timestamp.fromMillis(Date.now() + trackingLinkDays * 86_400_000),
      workOrder: job.workOrder,
      customerName: job.customer ?? "",
      statusLabel: "มอบหมายแล้ว",
      pickupLocation: job.pickupLocation ?? "",
      deliveryLocation: job.deliveryLocation ?? "",
      ...(job.pickupPlace ? { pickupPlace: job.pickupPlace } : {}),
      ...(job.deliveryPlace ? { deliveryPlace: job.deliveryPlace } : {}),
      vehicleLabel: job.vehiclePlate ?? "",
      carrierName: organization.data()?.name || job.carrierName || "S Fast Transport",
      eta: job.eta ?? "",
      lastUpdatedAt: job.currentLocation?.updatedAt ?? new Date().toISOString(),
      currentLocation: { lat: job.currentLocation?.lat ?? 0, lng: job.currentLocation?.lng ?? 0 },
      createdByUid: "system",
      source: "line_job_created",
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp()
    });
  } else if (savedLink.data()?.jobId !== jobId) {
    throw new Error(`Tracking link does not belong to job ${jobId}`);
  }

  if (!(await lineNotificationsEnabled())) {
    await notificationRef.update({ status: "disabled", updatedAt: FieldValue.serverTimestamp() });
    return;
  }

  const url = `${SITE_URL}/track/${notification.token}`;
  const message = `สร้างใบงาน ${String(job.workOrder)} แล้ว\nลูกค้า: ${String(job.customer ?? "-")}\nคนขับ: ${String(job.driverName ?? "-")}\nวันที่รับสินค้า: ${thaiDate(job.pickupDate)}\nจุดรับ: ${String(job.pickupLocation ?? "-")}\nจุดส่ง: ${String(job.deliveryLocation ?? "-")}\nติดตามสถานะ: ${url}`;
  const response = await fetch("https://api.line.me/v2/bot/message/push", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${lineChannelAccessToken.value()}`,
      "Content-Type": "application/json",
      "X-Line-Retry-Key": notification.retryKey
    },
    body: JSON.stringify({ to: LINE_GROUP_ID, messages: [{ type: "text", text: message }] })
  });
  if (!response.ok && response.status !== 409) {
    const errorBody = (await response.text()).slice(0, 500);
    logger.error("Failed to notify LINE group of new job", { jobId, status: response.status, errorBody });
    if (response.status >= 500 || response.status === 429) throw new Error(`LINE push failed: ${response.status}`);
    await notificationRef.update({ status: "failed", httpStatus: response.status, updatedAt: FieldValue.serverTimestamp() });
    return;
  }
  await notificationRef.update({ status: "sent", sentAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
});
