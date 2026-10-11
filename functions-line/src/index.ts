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

export const notifyLineGroupOfNewJob = onDocumentCreated({
  document: "today_jobs/{jobId}",
  region: "asia-southeast1",
  secrets: [lineChannelAccessToken],
  retry: true
}, async (event) => {
  const job = event.data?.data();
  if (!job || !job.workOrder) return;

  const jobId = event.params.jobId;
  const notificationRef = db.collection("line_job_notifications").doc(jobId);
  const notification = await db.runTransaction(async (transaction) => {
    const existing = await transaction.get(notificationRef);
    if (existing.exists) return existing.data() as { token: string; retryKey: string; status?: string; createdAt?: Timestamp };
    const created = { token: typeof job.trackingShareToken === "string" && /^[a-f0-9]{32}$/i.test(job.trackingShareToken) ? job.trackingShareToken : randomUUID().replaceAll("-", ""), retryKey: randomUUID(), status: "pending", createdAt: FieldValue.serverTimestamp() };
    transaction.create(notificationRef, created);
    return created;
  });
  if (notification.status === "sent") return;
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

  const url = `${SITE_URL}/track/${notification.token}`;
  const message = `สร้างใบงาน ${String(job.workOrder)} แล้ว\nลูกค้า: ${String(job.customer ?? "-")}\nคนขับ: ${String(job.driverName ?? "-")}\nจุดรับ: ${String(job.pickupLocation ?? "-")}\nจุดส่ง: ${String(job.deliveryLocation ?? "-")}\nติดตามสถานะ: ${url}`;
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
