import {
  addDoc,
  collection,
  deleteField,
  doc,
  getDoc,
  onSnapshot,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  type DocumentData,
  type Unsubscribe
} from "firebase/firestore";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import {
  statusLabels,
  type JobStatus,
  type TrackingStatus,
  type TransportJob
} from "@s-fast-transport/shared";
import { db, storage } from "./firebase";

export type DriverIssueType = "accident" | "traffic" | "contact_failed";

const issueLabels: Record<DriverIssueType, string> = {
  accident: "อุบัติเหตุ",
  traffic: "จราจรติดขัด",
  contact_failed: "ติดต่อลูกค้าไม่ได้"
};

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

export async function ensureMobileProfile(
  uid: string,
  email: string,
  displayName: string,
  photoURL: string
) {
  const profileRef = doc(db, "users", uid);
  const existing = await getDoc(profileRef);
  if (existing.exists()) return;

  const safePhotoURL = /^https:\/\/(lh3\.googleusercontent\.com|firebasestorage\.googleapis\.com)\//.test(photoURL)
    ? photoURL
    : "";
  const requestName = displayName || email || "พนักงานขับรถ";

  await setDoc(profileRef, {
    email,
    displayName: requestName,
    photoURL: safePhotoURL,
    googlePhotoURL: safePhotoURL,
    profilePhotoPath: "",
    title: "",
    firstName: "",
    lastName: "",
    fullName: "",
    phone: "",
    licenseNumber: "",
    licenseType: "",
    licenseExpiry: "",
    idCardFrontPath: "",
    idCardFrontFileName: "",
    driverLicenseFrontPath: "",
    driverLicenseFrontFileName: "",
    role: "driver",
    active: false,
    approvalStatus: "pending",
    organizationId: null,
    organizationType: null,
    organizationName: "",
    organizationLogoUrl: "",
    accessRequestName: requestName,
    accessRequestMessage: "ขอใช้งานผ่านแอปคนขับ",
    accessRequestSubmittedAt: serverTimestamp(),
    authProvider: "google.com",
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });
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

  if (job.status === "problem") {
    patch.issuePreviousStatus = deleteField();
    patch.lastIssue = deleteField();
  }

  if (trackingEnabled && !job.trackingEnabled) patch.trackingStartedAt = serverTimestamp();
  if (!trackingEnabled) patch.trackingEndedAt = serverTimestamp();

  const jobRef = doc(db, "today_jobs", job.id);
  await runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(jobRef);
    if (!snapshot.exists()) throw new Error("ไม่พบใบงาน");
    transaction.update(jobRef, {
      ...patch,
      ...(status === "arrived_delivery" && !snapshot.data().arrivedDeliveryAt ? { arrivedDeliveryAt: serverTimestamp() } : {}),
      ...(status === "completed" && !snapshot.data().completedAt ? { completedAt: serverTimestamp() } : {})
    });
  });
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

export async function uploadDriverCheckInPhoto(
  job: TransportJob,
  profile: MobileProfile,
  stage: "pickup" | "delivery",
  uri: string
) {
  const response = await fetch(uri);
  if (!response.ok) throw new Error("ไม่สามารถอ่านรูปที่เลือกได้");
  const blob = await response.blob();
  if (!blob.size || blob.size > 1024 * 1024) throw new Error("รูปหลังบีบอัดต้องมีขนาดไม่เกิน 1 MB");
  const contentType = blob.type || "image/jpeg";
  if (!/^image\/(jpeg|png|webp)$/.test(contentType)) throw new Error("รองรับเฉพาะรูป JPG, PNG หรือ WEBP");

  const fileName = `${Date.now()}-${stage}-check-in.jpg`;
  const objectPath = `proof_of_delivery/${job.id}/${profile.uid}/${fileName}`;
  const result = await uploadBytes(ref(storage, objectPath), blob, { contentType });
  const downloadUrl = await getDownloadURL(result.ref);
  const stageLabel = stage === "pickup" ? "จุดรับ" : "จุดส่ง";

  await addDoc(collection(db, "proof_of_delivery"), {
    jobId: job.id,
    uploadedByUid: profile.uid,
    uploadedByName: profile.displayName,
    organizationId: job.organizationId ?? profile.organizationId ?? "main",
    fileName,
    storagePath: objectPath,
    downloadUrl,
    contentType,
    size: blob.size,
    checkInStage: stage,
    createdAt: serverTimestamp()
  });

  await addDoc(collection(db, "job_events"), {
    jobId: job.id,
    organizationId: job.organizationId ?? profile.organizationId ?? "main",
    type: "check_in_photo",
    message: `แนบรูปเช็คอิน${stageLabel}`,
    actorUid: profile.uid,
    actorName: profile.displayName,
    lat: job.currentLocation.lat,
    lng: job.currentLocation.lng,
    timestamp: serverTimestamp(),
    metadata: { stage, storagePath: objectPath, downloadUrl, source: "driver_mobile" }
  });

  return downloadUrl;
}

export async function reportDriverIssue(
  job: TransportJob,
  profile: MobileProfile,
  issueType: DriverIssueType,
  note: string
) {
  const cleanNote = note.trim().slice(0, 500);
  const jobRef = doc(db, "today_jobs", job.id);
  const eventRef = doc(collection(db, "job_events"));
  await runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(jobRef);
    if (!snapshot.exists()) throw new Error("ไม่พบใบงาน");
    const current = snapshot.data();
    const previousStatus = current.status === "problem"
      ? current.issuePreviousStatus ?? "assigned"
      : current.status;
    const issue = {
      type: issueType,
      note: cleanNote,
      reportedAt: new Date().toISOString()
    };
    const message = `${issueLabels[issueType]}${cleanNote ? `: ${cleanNote}` : ""}`;
    const alerts = Array.isArray(current.alerts) ? [...current.alerts, message].slice(-20) : [message];

    transaction.update(jobRef, {
      status: "problem",
      issuePreviousStatus: previousStatus,
      lastIssue: issue,
      alerts,
      updatedAt: serverTimestamp()
    });
    transaction.set(eventRef, {
      jobId: job.id,
      organizationId: job.organizationId ?? profile.organizationId ?? "main",
      type: "driver_issue",
      message,
      actorUid: profile.uid,
      actorName: profile.displayName,
      lat: job.currentLocation.lat,
      lng: job.currentLocation.lng,
      timestamp: serverTimestamp(),
      metadata: { issueType, note: cleanNote, previousStatus, source: "driver_mobile" }
    });
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
    pickupContact: String(data.pickupContact ?? ""),
    pickupContactPhone: String(data.pickupContactPhone ?? ""),
    pickupContactNotes: String(data.pickupContactNotes ?? ""),
    deliveryContact: String(data.deliveryContact ?? ""),
    deliveryContactPhone: String(data.deliveryContactPhone ?? ""),
    deliveryContactNotes: String(data.deliveryContactNotes ?? ""),

    deliveryLocation: data.deliveryLocation ?? "-",
    arrivedDeliveryAt: typeof data.arrivedDeliveryAt === "string" ? data.arrivedDeliveryAt : data.arrivedDeliveryAt?.toDate?.().toISOString(),
    completedAt: typeof data.completedAt === "string" ? data.completedAt : data.completedAt?.toDate?.().toISOString(),
    issuePreviousStatus: data.issuePreviousStatus,
    lastIssue: data.lastIssue,
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
