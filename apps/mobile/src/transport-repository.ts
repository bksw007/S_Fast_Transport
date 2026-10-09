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
  type DriverIssueType,
  type JobStatus,
  type StopProof,
  type TrackingStatus,
  type TransportJob
} from "@s-fast-transport/shared";
import { db, storage } from "./firebase";
import { signatureViewBox } from "./signature-paths";

export type { DriverIssueType } from "@s-fast-transport/shared";

const issueLabels: Record<DriverIssueType, string> = {
  accident: "อุบัติเหตุ",
  traffic: "จราจรติดขัด",
  heavy_rain: "ฝนตกหนัก",
  vehicle_breakdown: "รถเสีย",
  road_closed: "ถนนปิดหรือเส้นทางใช้ไม่ได้",
  contact_failed: "ติดต่อลูกค้าไม่ได้",
  loading_delay: "รอรับหรือส่งสินค้านาน",
  other: "ปัญหาอื่น ๆ"
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
  profile: MobileProfile,
  proof?: StopProof
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
  }

  if (trackingEnabled && !job.trackingEnabled) patch.trackingStartedAt = serverTimestamp();
  if (!trackingEnabled) patch.trackingEndedAt = serverTimestamp();

  const jobRef = doc(db, "today_jobs", job.id);
  await runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(jobRef);
    if (!snapshot.exists()) throw new Error("ไม่พบใบงาน");
    const current = snapshot.data();
    const effectiveStatus = current.status === "problem" ? current.issuePreviousStatus : current.status;
    const stage = status === "to_delivery" ? "pickup" : status === "ready_to_close" ? "delivery" : null;
    if (stage) {
      const saved = proof ?? current[`${stage}Proof`];
      if (!saved || !Array.isArray(saved.photoPaths) || saved.photoPaths.length < 2 || !saved.signaturePath || !saved.signerName) throw new Error("กรุณาแนบรูปสินค้าอย่างน้อย 2 รูปและลายเซ็นก่อนดำเนินการต่อ");
      if (stage === "pickup" && !["arrived_pickup", "loading"].includes(effectiveStatus)) throw new Error("ยังไม่ถึงขั้นตอนยืนยันจุดรับ");
      if (stage === "delivery" && !["arrived_delivery", "unloading"].includes(effectiveStatus)) throw new Error("ยังไม่ถึงขั้นตอนยืนยันจุดส่ง");
    }
    if (status === "completed" && !current.deliveryProof) throw new Error("กรุณายืนยันหลักฐานที่จุดส่งก่อนจบงาน");
    transaction.update(jobRef, {
      ...patch,
      ...(stage && proof ? { [`${stage}Proof`]: proof } : {}),
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

export async function uploadDriverStopProof(job: TransportJob, profile: MobileProfile, stage: "pickup" | "delivery", uris: string[], signaturePaths: string[], signerName: string): Promise<StopProof> {
  if (uris.length < 2 || !signaturePaths.some(path => (path.match(/ L /g)?.length ?? 0) >= 2) || !signerName.trim()) throw new Error("ต้องมีรูปอย่างน้อย 2 รูป ชื่อผู้เซ็น และลายเซ็น");
  if (signaturePaths.some(path => !/^[ML0-9 .-]+$/.test(path))) throw new Error("ลายเซ็นไม่ถูกต้อง");
  const photoPaths: string[] = [];
  for (const [index, uri] of uris.entries()) {
    const response = await fetch(uri);
    if (!response.ok) throw new Error("อ่านรูปสินค้าไม่สำเร็จ");
    const blob = await response.blob();
    if (!blob.size || blob.size > 1024 * 1024) throw new Error("รูปหลังบีบอัดต้องไม่เกิน 1 MB");
    const path = `proof_of_delivery/${job.id}/${profile.uid}/${Date.now()}-${stage}-${index}.jpg`;
    const result = await uploadBytes(ref(storage, path), blob, { contentType: "image/jpeg" });
    const downloadUrl = await getDownloadURL(result.ref);
    await addDoc(collection(db, "proof_of_delivery"), { jobId: job.id, organizationId: job.organizationId ?? profile.organizationId ?? "main", uploadedByUid: profile.uid, uploadedByName: profile.displayName, fileName: `${stage}-photo-${index + 1}.jpg`, storagePath: path, downloadUrl, contentType: "image/jpeg", size: blob.size, proofStage: stage, proofKind: "photo", createdAt: serverTimestamp() });
    photoPaths.push(path);
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="300" viewBox="${signatureViewBox(signaturePaths)}"><rect width="300" height="500" fill="white"/>${signaturePaths.map(path => `<path d="${path}" fill="none" stroke="#102235" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`).join("")}</svg>`;
  const signature = Uint8Array.from(svg, character => character.charCodeAt(0));
  if (signature.byteLength > 1024 * 1024) throw new Error("ลายเซ็นมีขนาดเกิน 1 MB");
  const signaturePath = `proof_of_delivery/${job.id}/${profile.uid}/${Date.now()}-${stage}-signature.svg`;
  const result = await uploadBytes(ref(storage, signaturePath), signature, { contentType: "image/svg+xml" });
  const downloadUrl = await getDownloadURL(result.ref);
  await addDoc(collection(db, "proof_of_delivery"), { jobId: job.id, organizationId: job.organizationId ?? profile.organizationId ?? "main", uploadedByUid: profile.uid, uploadedByName: profile.displayName, fileName: `${stage}-signature.svg`, storagePath: signaturePath, downloadUrl, contentType: "image/svg+xml", size: signature.byteLength, proofStage: stage, proofKind: "signature", signerName: signerName.trim(), createdAt: serverTimestamp() });
  return { photoPaths, signaturePath, signerName: signerName.trim(), signedAt: new Date().toISOString() };
}

export async function reportDriverIssue(
  job: TransportJob,
  profile: MobileProfile,
  issueType: DriverIssueType,
  note: string
) {
  const cleanNote = note.trim().slice(0, 500);
  if (issueType === "other" && !cleanNote) throw new Error("กรุณาระบุรายละเอียดของปัญหาอื่น ๆ");
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
    pickupProof: data.pickupProof,
    deliveryProof: data.deliveryProof,
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
