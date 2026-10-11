import { initializeApp } from "firebase-admin/app";
import { FieldValue, getFirestore, Timestamp } from "firebase-admin/firestore";
import { defineSecret, defineString } from "firebase-functions/params";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { logger } from "firebase-functions";
import webPush from "web-push";

initializeApp();

const db = getFirestore();
const vapidPublicKey = defineSecret("WEB_PUSH_VAPID_PUBLIC_KEY");
const vapidPrivateKey = defineSecret("WEB_PUSH_VAPID_PRIVATE_KEY");
const vapidSubject = defineString("WEB_PUSH_VAPID_SUBJECT", {
  default: "mailto:admin@sfasttransport.com"
});
const STALE_AFTER_MS = 20 * 60 * 1000;
const REPEAT_AFTER_MS = 60 * 60 * 1000;
const STALE_ALERT_TEXT = "ตำแหน่งไม่อัปเดตเกิน 20 นาที";

type StoredSubscription = {
  endpoint?: string;
  expirationTime?: number | null;
  keys?: { p256dh?: string; auth?: string };
};

export const monitorStaleDriverLocations = onSchedule({
  schedule: "every 5 minutes",
  region: "asia-southeast1",
  timeZone: "Asia/Bangkok",
  secrets: [vapidPublicKey, vapidPrivateKey],
  retryCount: 1
}, async () => {
  webPush.setVapidDetails(vapidSubject.value(), vapidPublicKey.value(), vapidPrivateKey.value());
  const snapshot = await db.collection("today_jobs").where("trackingEnabled", "==", true).get();
  const now = Date.now();

  const results = await Promise.allSettled(snapshot.docs.map(async (jobDoc) => {
    const job = jobDoc.data();
    if (["completed", "cancelled"].includes(String(job.status))) return;

    const lastLocationAt = parseLocationTime(job.currentLocation?.updatedAt);
    const stale = !lastLocationAt || now - lastLocationAt >= STALE_AFTER_MS;
    const previousAlert = job.locationAlert as { active?: boolean; lastNotifiedAt?: Timestamp } | undefined;
    const alerts = Array.isArray(job.alerts) ? job.alerts.filter((alert) => alert !== STALE_ALERT_TEXT) : [];

    if (!stale) {
      if (previousAlert?.active) {
        await jobDoc.ref.update({
          alerts,
          locationAlert: {
            active: false,
            recoveredAt: FieldValue.serverTimestamp(),
            lastLocationAt: new Date(lastLocationAt).toISOString()
          }
        });
      }
      return;
    }

    const lastNotifiedAt = previousAlert?.lastNotifiedAt?.toMillis?.() ?? 0;
    const shouldNotify = !previousAlert?.active || now - lastNotifiedAt >= REPEAT_AFTER_MS;
    await jobDoc.ref.update({
      alerts: [...alerts, STALE_ALERT_TEXT],
      locationAlert: {
        active: true,
        staleSince: new Date(lastLocationAt || now - STALE_AFTER_MS).toISOString(),
        lastNotifiedAt: shouldNotify ? FieldValue.serverTimestamp() : previousAlert?.lastNotifiedAt ?? null
      }
    });
    if (!shouldNotify || !job.assignedDriverUid) return;

    const body = `ใบงาน ${job.workOrder ?? jobDoc.id} ไม่มีตำแหน่งใหม่เกิน 20 นาที กรุณาเปิดแอปเพื่ออัปเดต GPS`;
    await Promise.all([
      sendTrackingPush(String(job.assignedDriverUid), {
        title: "กรุณาเปิด S Fast Transport",
        body,
        tag: `stale-location-${jobDoc.id}`,
        url: `/?job=${encodeURIComponent(jobDoc.id)}&resumeTracking=1`
      }),
      db.collection("notifications").add({
        type: "stale_location",
        recipientUid: job.assignedDriverUid,
        organizationId: job.organizationId ?? "main",
        jobId: jobDoc.id,
        title: "ตำแหน่งคนขับขาดหาย",
        message: body,
        read: false,
        createdAt: FieldValue.serverTimestamp()
      })
    ]);
  }));
  results.forEach((result, index) => {
    if (result.status === "rejected") {
      logger.error("Failed to monitor stale driver location", {
        jobId: snapshot.docs[index]?.id,
        error: result.reason
      });
    }
  });
});

async function sendTrackingPush(recipientUid: string, payload: Record<string, string>) {
  const devices = await db.collection("push_subscriptions").doc(recipientUid).collection("devices").get();
  await Promise.all(devices.docs.map(async (device) => {
    const data = device.data() as StoredSubscription;
    if (!data.endpoint || !data.keys?.p256dh || !data.keys.auth) return;
    try {
      await webPush.sendNotification({
        endpoint: data.endpoint,
        expirationTime: data.expirationTime ?? null,
        keys: { p256dh: data.keys.p256dh, auth: data.keys.auth }
      }, JSON.stringify(payload), { TTL: 30 * 60, urgency: "high" });
    } catch (error) {
      const statusCode = (error as { statusCode?: number }).statusCode;
      if (statusCode === 404 || statusCode === 410) await device.ref.delete();
      else logger.error("Failed to send driver web push", { recipientUid, deviceId: device.id, error });
    }
  }));
}

function parseLocationTime(value: unknown) {
  if (typeof value !== "string") return 0;
  const time = Date.parse(value);
  return Number.isFinite(time) ? time : 0;
}
