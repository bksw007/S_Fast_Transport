import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Location from "expo-location";
import * as TaskManager from "expo-task-manager";
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
import { auth, db } from "./firebase";

export const LOCATION_TASK_NAME = "s-fast-active-job-location";
const ACTIVE_SESSION_KEY = "@s-fast/active-tracking-session";
const PENDING_POINTS_KEY = "@s-fast/pending-location-points";
const MAX_PENDING_POINTS = 500;

export type TrackingSession = {
  jobId: string;
  driverUid: string;
  organizationId: string;
  workOrder: string;
};

type StoredPoint = {
  id: string;
  jobId: string;
  driverUid: string;
  organizationId: string;
  lat: number;
  lng: number;
  speed: number;
  heading: number;
  accuracy: number;
  recordedAt: string;
  source: "gps" | "background" | "offline_sync";
};

if (!TaskManager.isTaskDefined(LOCATION_TASK_NAME)) {
  TaskManager.defineTask<{ locations: Location.LocationObject[] }>(
    LOCATION_TASK_NAME,
    async ({ data, error }) => {
      if (error || !data?.locations?.length) return;
      const session = await getActiveTrackingSession();
      if (!session) {
        await stopTrackingTaskIfRunning();
        return;
      }

      for (const location of data.locations) {
        const point = toStoredPoint(session, location, "background");
        try {
          await uploadPoint(point);
        } catch {
          await enqueuePoint(point);
        }
      }
    }
  );
}

export async function startJobTracking(session: TrackingSession) {
  const servicesEnabled = await Location.hasServicesEnabledAsync();
  if (!servicesEnabled) throw new Error("กรุณาเปิดบริการตำแหน่ง (GPS) ในโทรศัพท์");

  const foreground = await Location.requestForegroundPermissionsAsync();
  if (foreground.status !== Location.PermissionStatus.GRANTED) {
    throw new Error("ต้องอนุญาตตำแหน่งแบบแม่นยำเพื่อเริ่มติดตามงาน");
  }

  const background = await Location.requestBackgroundPermissionsAsync();
  if (background.status !== Location.PermissionStatus.GRANTED) {
    throw new Error("ต้องเลือกอนุญาตตำแหน่งตลอดเวลา เพื่อให้ติดตามต่อเมื่อเปิด Google Maps");
  }

  await AsyncStorage.setItem(ACTIVE_SESSION_KEY, JSON.stringify(session));
  const firstLocation = await Location.getCurrentPositionAsync({
    accuracy: Location.Accuracy.High
  });
  const firstPoint = toStoredPoint(session, firstLocation, "gps");
  try {
    await uploadPoint(firstPoint);
  } catch {
    await enqueuePoint(firstPoint);
  }

  const alreadyRunning = await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK_NAME);
  if (!alreadyRunning) {
    await Location.startLocationUpdatesAsync(LOCATION_TASK_NAME, {
      accuracy: Location.Accuracy.High,
      activityType: Location.ActivityType.AutomotiveNavigation,
      distanceInterval: 25,
      timeInterval: 20_000,
      deferredUpdatesDistance: 50,
      deferredUpdatesInterval: 30_000,
      pausesUpdatesAutomatically: false,
      showsBackgroundLocationIndicator: true,
      foregroundService: {
        notificationTitle: "S Fast Transport กำลังติดตามงาน",
        notificationBody: `กำลังแชร์ตำแหน่งสำหรับ ${session.workOrder}`,
        notificationColor: "#4c5960",
        killServiceOnDestroy: false
      }
    });
  }

  await flushPendingPoints();
}

export async function stopJobTracking() {
  await stopTrackingTaskIfRunning();
  await AsyncStorage.removeItem(ACTIVE_SESSION_KEY);
  await flushPendingPoints();
}

export async function getActiveTrackingSession(): Promise<TrackingSession | null> {
  const value = await AsyncStorage.getItem(ACTIVE_SESSION_KEY);
  if (!value) return null;
  try {
    return JSON.parse(value) as TrackingSession;
  } catch {
    await AsyncStorage.removeItem(ACTIVE_SESSION_KEY);
    return null;
  }
}

export async function flushPendingPoints() {
  const pending = await readPendingPoints();
  if (!pending.length) return;
  const remaining: StoredPoint[] = [];
  for (const point of pending) {
    try {
      await uploadPoint({ ...point, source: "offline_sync" });
    } catch {
      remaining.push(point);
    }
  }
  await AsyncStorage.setItem(PENDING_POINTS_KEY, JSON.stringify(remaining.slice(-MAX_PENDING_POINTS)));
}

async function stopTrackingTaskIfRunning() {
  if (await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK_NAME)) {
    await Location.stopLocationUpdatesAsync(LOCATION_TASK_NAME);
  }
}

function toStoredPoint(
  session: TrackingSession,
  location: Location.LocationObject,
  source: StoredPoint["source"]
): StoredPoint {
  const recordedAt = new Date(location.timestamp).toISOString();
  return {
    id: `${Math.round(location.timestamp)}-${Math.random().toString(36).slice(2, 9)}`,
    jobId: session.jobId,
    driverUid: session.driverUid,
    organizationId: session.organizationId,
    lat: location.coords.latitude,
    lng: location.coords.longitude,
    speed: Math.max(0, Math.round((location.coords.speed ?? 0) * 3.6)),
    heading: Math.max(0, location.coords.heading ?? 0),
    accuracy: Math.max(0, location.coords.accuracy ?? 0),
    recordedAt,
    source
  };
}

async function uploadPoint(point: StoredPoint) {
  await auth.authStateReady();
  if (!auth.currentUser || auth.currentUser.uid !== point.driverUid) {
    throw new Error("เซสชันคนขับหมดอายุ");
  }

  const currentLocation = {
    lat: point.lat,
    lng: point.lng,
    speed: point.speed,
    heading: point.heading,
    accuracy: point.accuracy,
    updatedAt: point.recordedAt
  };
  const batch = writeBatch(db);
  batch.set(doc(db, "job_locations", point.jobId, "points", point.id), {
    driverUid: point.driverUid,
    lat: point.lat,
    lng: point.lng,
    speed: point.speed,
    heading: point.heading,
    accuracy: point.accuracy,
    timestamp: Timestamp.fromDate(new Date(point.recordedAt)),
    source: point.source
  });
  batch.update(doc(db, "today_jobs", point.jobId), {
    currentLocation,
    updatedAt: serverTimestamp()
  });
  batch.set(doc(db, "driver_live_status", point.driverUid), {
    organizationId: point.organizationId,
    activeJobId: point.jobId,
    currentLocation,
    trackingEnabled: true,
    updatedAt: serverTimestamp()
  }, { merge: true });
  await batch.commit();
  await syncCustomerLinks(point.jobId, currentLocation);
}

async function syncCustomerLinks(jobId: string, currentLocation: Record<string, unknown>) {
  const links = await getDocs(query(
    collection(db, "tracking_share_links"),
    where("jobId", "==", jobId),
    where("enabled", "==", true),
    where("expiresAt", ">", Timestamp.now())
  ));
  if (links.empty) return;

  const batch = writeBatch(db);
  links.docs.forEach((link) => batch.update(link.ref, {
    currentLocation: {
      lat: currentLocation.lat,
      lng: currentLocation.lng
    },
    lastUpdatedAt: currentLocation.updatedAt,
    updatedAt: serverTimestamp()
  }));
  await batch.commit();
}

async function enqueuePoint(point: StoredPoint) {
  const pending = await readPendingPoints();
  pending.push(point);
  await AsyncStorage.setItem(PENDING_POINTS_KEY, JSON.stringify(pending.slice(-MAX_PENDING_POINTS)));
}

async function readPendingPoints(): Promise<StoredPoint[]> {
  const value = await AsyncStorage.getItem(PENDING_POINTS_KEY);
  if (!value) return [];
  try {
    const points = JSON.parse(value);
    return Array.isArray(points) ? points : [];
  } catch {
    return [];
  }
}
