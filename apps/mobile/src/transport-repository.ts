import {
  addDoc,
  collection,
  doc,
  getDoc,
  onSnapshot,
  query,
  serverTimestamp,
  updateDoc,
  where,
  type DocumentData,
  type Unsubscribe
} from "firebase/firestore";
import {
  statusLabels,
  type JobStatus,
  type TrackingStatus,
  type TransportJob
} from "@s-fast-transport/shared";
import { db } from "./firebase";

export type MobileProfile = {
  uid: string;
  displayName: string;
  role: string;
  active: boolean;
  approvalStatus: string;
  organizationId: string | null;
};

const emptyLocation = {
  lat: 0,
  lng: 0,
  speed: 0,
  heading: 0,
  accuracy: 0,
  updatedAt: ""
};

export async function getMobileProfile(uid: string): Promise<MobileProfile | null> {
  const snapshot = await getDoc(doc(db, "users", uid));
  if (!snapshot.exists()) return null;
  const data = snapshot.data();
  return {
    uid,
    displayName: data.displayName ?? data.fullName ?? "พนักงานขับรถ",
    role: data.role ?? "driver",
    active: data.active === true,
    approvalStatus: data.approvalStatus ?? "pending",
    organizationId: data.organizationId ?? null
  };
}

export function subscribeDriverJobs(
  uid: string,
  onJobs: (jobs: TransportJob[]) => void,
  onError: (message: string) => void
): Unsubscribe {
  return onSnapshot(
    query(collection(db, "today_jobs"), where("assignedDriverUid", "==", uid)),
    (snapshot) => onJobs(
      snapshot.docs
        .map((jobDoc) => toTransportJob(jobDoc.id, jobDoc.data()))
        .sort((a, b) => b.id.localeCompare(a.id))
    ),
    (error) => onError(error.message)
  );
}

export async function updateDriverJobStatus(
  job: TransportJob,
  status: JobStatus,
  profile: MobileProfile
) {
  const now = new Date().toISOString();
  const trackingEnabled = !["completed", "cancelled"].includes(status);
  const patch: Record<string, unknown> = {
    status,
    trackingEnabled,
    trackingStatus: toTrackingStatus(status),
    updatedAt: serverTimestamp()
  };

  if (trackingEnabled && !job.trackingEnabled) patch.trackingStartedAt = serverTimestamp();
  if (!trackingEnabled) patch.trackingEndedAt = serverTimestamp();

  await updateDoc(doc(db, "today_jobs", job.id), patch);
  await addDoc(collection(db, "job_events"), {
    jobId: job.id,
    organizationId: job.organizationId ?? profile.organizationId ?? "main",
    type: status,
    message: `เปลี่ยนสถานะเป็น ${statusLabels[status]}`,
    actorUid: profile.uid,
    actorName: profile.displayName,
    lat: job.currentLocation.lat,
    lng: job.currentLocation.lng,
    timestamp: serverTimestamp(),
    metadata: { status, recordedAt: now, source: "driver_mobile" }
  });
}

export async function rollbackTrackingStart(jobId: string) {
  await updateDoc(doc(db, "today_jobs", jobId), {
    status: "assigned",
    trackingEnabled: false,
    trackingStatus: "not_started",
    trackingEndedAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });
}

function toTrackingStatus(status: JobStatus): TrackingStatus {
  const statusMap: Partial<Record<JobStatus, TrackingStatus>> = {
    assigned: "not_started",
    accepted: "on_the_way_to_pickup",
    to_pickup: "on_the_way_to_pickup",
    arrived_pickup: "arrived_pickup",
    loading: "loading",
    to_delivery: "on_the_way_to_delivery",
    arrived_delivery: "arrived_delivery",
    unloading: "unloading",
    ready_to_close: "unloading",
    completed: "completed"
  };
  return statusMap[status] ?? "not_started";
}

function toTransportJob(id: string, data: DocumentData): TransportJob {
  return {
    id,
    workOrder: data.workOrder ?? id,
    customer: data.customer ?? "-",
    driverName: data.driverName ?? "-",
    driverPhone: data.driverPhone ?? "-",
    vehiclePlate: data.vehiclePlate ?? "-",
    pickupLocation: data.pickupLocation ?? "-",
    deliveryLocation: data.deliveryLocation ?? "-",
    status: data.status ?? "assigned",
    trackingStatus: data.trackingStatus ?? "not_started",
    trackingEnabled: data.trackingEnabled === true,
    eta: data.eta ?? "-",
    lastUpdatedMinutes: Number(data.lastUpdatedMinutes ?? 0),
    currentLocation: data.currentLocation ?? emptyLocation,
    alerts: Array.isArray(data.alerts) ? data.alerts : [],
    organizationId: data.organizationId ?? undefined,
    carrierName: data.carrierName ?? undefined
  };
}
