import {
  collection,
  doc,
  getDocs,
  query,
  serverTimestamp,
  Timestamp,
  updateDoc,
  where,
  writeBatch
} from "firebase/firestore";
import type { TransportJob } from "@s-fast-transport/shared";
import { db } from "./firebase";
import type { UserProfile } from "./transport-repository";

const ACTIVE_JOB_KEY = "sfast-pwa-active-tracking-job";
const HEARTBEAT_INTERVAL_MS = 5 * 60 * 1000;
const MIN_UPLOAD_INTERVAL_MS = 20 * 1000;

let activeWatchId: number | null = null;
let heartbeatId: number | null = null;
let activeJobId = "";
let lastUploadAt = 0;
let activeContext: { job: TransportJob; profile: UserProfile } | null = null;
let visibilityHandler: (() => void) | null = null;
let onlineHandler: (() => void) | null = null;

export async function requestTrackingPosition() {
  if (typeof navigator === "undefined" || !("geolocation" in navigator)) {
    throw new Error("โทรศัพท์หรือเบราว์เซอร์นี้ไม่รองรับการระบุตำแหน่ง");
  }

  return new Promise<GeolocationPosition>((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: true,
      timeout: 25_000,
      maximumAge: 10_000
    });
  }).catch((error: GeolocationPositionError) => {
    throw new Error(toLocationErrorMessage(error));
  });
}

export async function startPwaJobTracking(
  job: TransportJob,
  profile: UserProfile,
  initialPosition?: GeolocationPosition
) {
  stopPwaJobTracking(false);
  activeJobId = job.id;
  activeContext = { job, profile };
  window.localStorage.setItem(ACTIVE_JOB_KEY, job.id);

  if (initialPosition) await uploadPosition(job, profile, initialPosition, true);

  activeWatchId = navigator.geolocation.watchPosition(
    (position) => void uploadPosition(job, profile, position),
    () => undefined,
    { enableHighAccuracy: true, timeout: 30_000, maximumAge: 15_000 }
  );

  heartbeatId = window.setInterval(() => void captureHeartbeat(), HEARTBEAT_INTERVAL_MS);
  visibilityHandler = () => {
    if (document.visibilityState === "visible") void captureHeartbeat();
  };
  onlineHandler = () => void captureHeartbeat();
  document.addEventListener("visibilitychange", visibilityHandler);
  window.addEventListener("online", onlineHandler);
}

export async function resumePwaJobTrackingIfAllowed(job: TransportJob, profile: UserProfile) {
  if (activeJobId === job.id || window.localStorage.getItem(ACTIVE_JOB_KEY) !== job.id) return false;
  if (!job.trackingEnabled || ["completed", "cancelled"].includes(job.status)) return false;

  try {
    if (!("permissions" in navigator)) return false;
    const permission = await navigator.permissions.query({ name: "geolocation" });
    if (permission.state !== "granted") return false;
    const position = await requestTrackingPosition();
    await startPwaJobTracking(job, profile, position);
    return true;
  } catch {
    return false;
  }
}

export function stopPwaJobTracking(clearStoredJob = true) {
  if (activeWatchId !== null && typeof navigator !== "undefined" && "geolocation" in navigator) {
    navigator.geolocation.clearWatch(activeWatchId);
  }
  if (heartbeatId !== null && typeof window !== "undefined") window.clearInterval(heartbeatId);
  if (visibilityHandler && typeof document !== "undefined") {
    document.removeEventListener("visibilitychange", visibilityHandler);
  }
  if (onlineHandler && typeof window !== "undefined") window.removeEventListener("online", onlineHandler);
  activeWatchId = null;
  heartbeatId = null;
  activeJobId = "";
  activeContext = null;
  visibilityHandler = null;
  onlineHandler = null;
  if (clearStoredJob && typeof window !== "undefined") window.localStorage.removeItem(ACTIVE_JOB_KEY);
}

export function getStoredTrackingJobId() {
  return typeof window === "undefined" ? "" : window.localStorage.getItem(ACTIVE_JOB_KEY) ?? "";
}

async function captureHeartbeat() {
  if (!activeContext || document.visibilityState !== "visible") return;
  try {
    const position = await requestTrackingPosition();
    await uploadPosition(activeContext.job, activeContext.profile, position, true);
  } catch {
    // The server-side stale-location monitor will notify the driver if this continues.
  }
}

async function uploadPosition(
  job: TransportJob,
  profile: UserProfile,
  position: GeolocationPosition,
  force = false
) {
  const now = Date.now();
  if (!force && now - lastUploadAt < MIN_UPLOAD_INTERVAL_MS) return;
  lastUploadAt = now;

  const recordedAt = new Date(position.timestamp || now);
  const currentLocation = {
    lat: position.coords.latitude,
    lng: position.coords.longitude,
    speed: Math.max(0, Math.round((position.coords.speed ?? 0) * 3.6)),
    heading: normalizeHeading(position.coords.heading),
    accuracy: Math.max(0, position.coords.accuracy ?? 0),
    updatedAt: recordedAt.toISOString()
  };
  const pointId = `${recordedAt.getTime()}-${crypto.randomUUID().slice(0, 8)}`;
  const batch = writeBatch(db);

  batch.set(doc(db, "job_locations", job.id, "points", pointId), {
    driverUid: profile.uid,
    lat: currentLocation.lat,
    lng: currentLocation.lng,
    speed: currentLocation.speed,
    heading: currentLocation.heading,
    accuracy: currentLocation.accuracy,
    timestamp: Timestamp.fromDate(recordedAt),
    source: "gps"
  });
  batch.update(doc(db, "today_jobs", job.id), {
    currentLocation,
    updatedAt: serverTimestamp()
  });
  batch.set(doc(db, "driver_live_status", profile.uid), {
    organizationId: profile.organizationId ?? "main",
    activeJobId: job.id,
    currentLocation,
    trackingEnabled: true,
    updatedAt: serverTimestamp()
  }, { merge: true });
  await batch.commit();
  await syncCustomerTrackingLinks(job.id, currentLocation);
}

async function syncCustomerTrackingLinks(jobId: string, currentLocation: Record<string, unknown>) {
  const links = await getDocs(query(
    collection(db, "tracking_share_links"),
    where("jobId", "==", jobId),
    where("enabled", "==", true),
    where("expiresAt", ">", Timestamp.now())
  ));
  await Promise.all(links.docs.map((link) => updateDoc(link.ref, {
    currentLocation: { lat: currentLocation.lat, lng: currentLocation.lng },
    lastUpdatedAt: currentLocation.updatedAt,
    updatedAt: serverTimestamp()
  })));
}

function normalizeHeading(heading: number | null) {
  if (heading === null || !Number.isFinite(heading) || heading < 0) return 0;
  return Math.min(360, heading);
}

function toLocationErrorMessage(error: GeolocationPositionError) {
  if (error.code === error.PERMISSION_DENIED) {
    return "กรุณาอนุญาตตำแหน่งให้ S Fast Transport เพื่อเริ่มรับงาน";
  }
  if (error.code === error.POSITION_UNAVAILABLE) {
    return "โทรศัพท์หาตำแหน่งไม่ได้ กรุณาเปิด GPS แล้วลองอีกครั้ง";
  }
  return "ขอตำแหน่งไม่สำเร็จ กรุณาอยู่ในที่รับสัญญาณและลองอีกครั้ง";
}
