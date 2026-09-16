import { doc, serverTimestamp, setDoc } from "firebase/firestore";
import { db } from "./firebase";

const DEVICE_ID_KEY = "sfast-pwa-push-device-id";

export type PushSetupResult = {
  enabled: boolean;
  message: string;
};

export async function registerPwaServiceWorker() {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return null;
  return navigator.serviceWorker.register("/sw.js", { scope: "/" });
}

export async function subscribeToTrackingAlerts(
  recipientUid: string,
  organizationId: string | null
): Promise<PushSetupResult> {
  if (!("Notification" in window) || !("PushManager" in window)) {
    return {
      enabled: false,
      message: "อุปกรณ์นี้ไม่รองรับ Push Notification กรุณาเปิดแอปเพื่อตรวจตำแหน่งเป็นระยะ"
    };
  }

  const publicKey = process.env.NEXT_PUBLIC_WEB_PUSH_VAPID_PUBLIC_KEY;
  if (!publicKey) {
    return {
      enabled: false,
      message: "ระบบแจ้งเตือนยังไม่ได้ตั้งค่า VAPID แต่ยังแชร์ตำแหน่งขณะเปิดแอปได้"
    };
  }

  const permission = Notification.permission === "default"
    ? await Notification.requestPermission()
    : Notification.permission;
  if (permission !== "granted") {
    return {
      enabled: false,
      message: "ไม่ได้อนุญาตการแจ้งเตือน ระบบจะไม่สามารถเตือนเมื่อตำแหน่งขาดหาย"
    };
  }

  const registration = await registerPwaServiceWorker();
  if (!registration) {
    return { enabled: false, message: "ไม่สามารถเปิด Service Worker สำหรับการแจ้งเตือนได้" };
  }

  let subscription = await registration.pushManager.getSubscription();
  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey)
    });
  }

  const deviceId = getOrCreateDeviceId();
  const payload = subscription.toJSON();
  await setDoc(doc(db, "push_subscriptions", recipientUid, "devices", deviceId), {
    recipientUid,
    organizationId: organizationId ?? "main",
    endpoint: payload.endpoint,
    expirationTime: payload.expirationTime ?? null,
    keys: payload.keys ?? {},
    userAgent: navigator.userAgent.slice(0, 500),
    standalone: isStandalonePwa(),
    updatedAt: serverTimestamp()
  }, { merge: true });

  return { enabled: true, message: "เปิดการแจ้งเตือนเมื่อตำแหน่งขาดหายแล้ว" };
}

function isStandalonePwa() {
  const iosNavigator = navigator as Navigator & { standalone?: boolean };
  return window.matchMedia("(display-mode: standalone)").matches || iosNavigator.standalone === true;
}

function getOrCreateDeviceId() {
  const current = window.localStorage.getItem(DEVICE_ID_KEY);
  if (current) return current;
  const next = crypto.randomUUID();
  window.localStorage.setItem(DEVICE_ID_KEY, next);
  return next;
}

function urlBase64ToUint8Array(value: string) {
  const padding = "=".repeat((4 - (value.length % 4)) % 4);
  const base64 = (value + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(base64);
  return Uint8Array.from([...raw].map((character) => character.charCodeAt(0)));
}
