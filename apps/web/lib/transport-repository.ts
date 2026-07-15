import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  type UpdateData,
  updateDoc,
  where,
  writeBatch,
  type DocumentData,
  type Unsubscribe
} from "firebase/firestore";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { db, storage } from "./firebase";
import { sampleJobs, statusLabels, type JobStatus, type TransportJob } from "@s-fast-transport/shared";

export type UserRole = "owner" | "admin" | "dispatcher" | "subcontract_admin" | "driver";
export type OrganizationType = "main" | "subcontract";
export type ApprovalStatus = "pending" | "approved" | "suspended";

export type UserProfile = {
  uid: string;
  email: string;
  displayName: string;
  role: UserRole;
  active: boolean;
  organizationId: string | null;
  organizationType: OrganizationType | null;
  organizationName: string;
  approvalStatus: ApprovalStatus;
};

export type UserAccessUpdate = Pick<
  UserProfile,
  "role" | "organizationId" | "organizationType" | "organizationName" | "approvalStatus" | "active"
>;

export type JobDraft = {
  customer: string;
  driverName: string;
  driverPhone: string;
  vehiclePlate: string;
  pickupLocation: string;
  deliveryLocation: string;
  eta: string;
};

const defaultLocation = {
  lat: 13.7563,
  lng: 100.5018,
  speed: 0,
  heading: 0,
  accuracy: 20,
  updatedAt: new Date().toISOString()
};

export function subscribeTodayJobs(
  profile: UserProfile,
  onJobs: (jobs: TransportJob[]) => void,
  onError: (message: string) => void
): Unsubscribe {
  const jobsRef = collection(db, "today_jobs");
  const jobsQuery = profile.role === "driver"
    ? query(jobsRef, where("assignedDriverUid", "==", profile.uid))
    : profile.role === "subcontract_admin" && profile.organizationId
      ? query(jobsRef, where("organizationId", "==", profile.organizationId))
      : jobsRef;

  return onSnapshot(
    jobsQuery,
    (snapshot) => {
      const jobs = snapshot.docs
        .map((jobDoc) => toTransportJob(jobDoc.id, jobDoc.data()))
        .sort((a, b) => b.id.localeCompare(a.id));
      onJobs(jobs);
    },
    (error) => {
      onError(error.message);
      onJobs([]);
    }
  );
}

export async function getUserProfile(uid: string): Promise<UserProfile | null> {
  const profileSnap = await getDoc(doc(db, "users", uid));
  if (!profileSnap.exists()) {
    return null;
  }

  const data = profileSnap.data();
  return {
    uid,
    email: data.email ?? "",
    displayName: data.displayName ?? data.email ?? "ผู้ใช้งาน",
    role: data.role ?? "driver",
    active: data.active ?? true,
    organizationId: data.organizationId ?? null,
    organizationType: data.organizationType ?? (data.role === "subcontract_admin" ? "subcontract" : "main"),
    organizationName: data.organizationName ?? "S Fast Transport",
    approvalStatus: data.approvalStatus ?? (data.active === false ? "pending" : "approved")
  };
}

export async function ensureAccessProfile(uid: string, email: string, displayName: string) {
  const profileRef = doc(db, "users", uid);
  const existing = await getDoc(profileRef);

  if (!existing.exists()) {
    await setDoc(profileRef, {
      email,
      displayName: displayName || email,
      role: "driver",
      active: false,
      approvalStatus: "pending",
      organizationId: null,
      organizationType: null,
      organizationName: "",
      authProvider: "google.com",
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
  }
}

export async function seedSampleJobs(actor: UserProfile) {
  await Promise.all(
    sampleJobs.map((job) =>
      setDoc(doc(db, "today_jobs", job.id), {
        ...job,
        assignedDriverUid: actor.uid,
        organizationId: actor.organizationId ?? "main",
        carrierName: actor.organizationName || "S Fast Transport",
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      })
    )
  );
}

export async function createJob(draft: JobDraft, actor: UserProfile) {
  const now = new Date().toISOString();
  const workOrder = `WO-${Date.now().toString().slice(-5)}`;

  await addDoc(collection(db, "today_jobs"), {
    ...draft,
    workOrder,
    assignedDriverUid: actor.uid,
    organizationId: actor.organizationId ?? "main",
    carrierName: actor.organizationName || "S Fast Transport",
    status: "assigned",
    trackingStatus: "not_started",
    trackingEnabled: false,
    lastUpdatedMinutes: 0,
    currentLocation: { ...defaultLocation, updatedAt: now },
    alerts: [],
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });
}

export async function updateJobStatus(job: TransportJob, status: JobStatus, actor: UserProfile) {
  const trackingEnabled = status !== "completed" && status !== "cancelled";

  await updateDoc(doc(db, "today_jobs", job.id), {
    status,
    trackingEnabled,
    trackingStatus: toTrackingStatus(status),
    currentLocation: {
      ...job.currentLocation,
      updatedAt: new Date().toISOString()
    },
    updatedAt: serverTimestamp()
  });

  await addDoc(collection(db, "job_events"), {
    jobId: job.id,
    type: status,
    message: `เปลี่ยนสถานะเป็น ${statusLabels[status]}`,
    actorUid: actor.uid,
    actorName: actor.displayName,
    organizationId: actor.organizationId ?? "main",
    lat: job.currentLocation.lat,
    lng: job.currentLocation.lng,
    timestamp: serverTimestamp(),
    metadata: { status }
  });

  await syncActiveShareLinks(job, status);
}

export async function uploadProof(job: TransportJob, file: File, actor: UserProfile) {
  const objectPath = `proof_of_delivery/${job.id}/${actor.uid}/${Date.now()}-${file.name}`;
  const storageRef = ref(storage, objectPath);
  const result = await uploadBytes(storageRef, file, { contentType: file.type });
  const downloadUrl = await getDownloadURL(result.ref);

  await addDoc(collection(db, "proof_of_delivery"), {
    jobId: job.id,
    uploadedByUid: actor.uid,
    uploadedByName: actor.displayName,
    organizationId: actor.organizationId ?? "main",
    fileName: file.name,
    storagePath: objectPath,
    downloadUrl,
    contentType: file.type,
    size: file.size,
    createdAt: serverTimestamp()
  });

  await addDoc(collection(db, "job_events"), {
    jobId: job.id,
    type: "proof_uploaded",
    message: `แนบหลักฐาน ${file.name}`,
    actorUid: actor.uid,
    actorName: actor.displayName,
    organizationId: actor.organizationId ?? "main",
    timestamp: serverTimestamp(),
    metadata: { storagePath: objectPath }
  });
}

export async function createTrackingShareLink(job: TransportJob, actor: UserProfile) {
  const token = crypto.randomUUID().replaceAll("-", "");
  const expiresAt = Timestamp.fromDate(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000));

  await setDoc(doc(db, "tracking_share_links", token), {
    jobId: job.id,
    organizationId: job.organizationId ?? actor.organizationId ?? "main",
    enabled: true,
    expiresAt,
    workOrder: job.workOrder,
    customerName: job.customer,
    statusLabel: statusLabels[job.status],
    pickupLocation: job.pickupLocation,
    deliveryLocation: job.deliveryLocation,
    vehicleLabel: job.vehiclePlate,
    carrierName: (job.carrierName ?? actor.organizationName) || "S Fast Transport",
    eta: job.eta,
    lastUpdatedAt: job.currentLocation.updatedAt,
    currentLocation: {
      lat: job.currentLocation.lat,
      lng: job.currentLocation.lng
    },
    createdByUid: actor.uid,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });

  return token;
}

async function syncActiveShareLinks(job: TransportJob, status: JobStatus) {
  const activeLinks = await getDocs(query(
    collection(db, "tracking_share_links"),
    where("jobId", "==", job.id),
    where("enabled", "==", true),
    where("expiresAt", ">", Timestamp.now())
  ));

  if (activeLinks.empty) return;

  const batch = writeBatch(db);
  activeLinks.docs.forEach((linkDoc) => batch.update(linkDoc.ref, {
    statusLabel: statusLabels[status],
    eta: job.eta,
    lastUpdatedAt: new Date().toISOString(),
    currentLocation: {
      lat: job.currentLocation.lat,
      lng: job.currentLocation.lng
    },
    updatedAt: serverTimestamp()
  }));
  await batch.commit();
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
    trackingEnabled: Boolean(data.trackingEnabled),
    eta: data.eta ?? "-",
    lastUpdatedMinutes: Number(data.lastUpdatedMinutes ?? 0),
    currentLocation: data.currentLocation ?? defaultLocation,
    alerts: Array.isArray(data.alerts) ? data.alerts : [],
    organizationId: data.organizationId ?? undefined,
    carrierName: data.carrierName ?? undefined
  };
}

export function isMainAdmin(profile: UserProfile) {
  return ["owner", "admin", "dispatcher"].includes(profile.role);
}

export function hasApprovedAccess(profile: UserProfile) {
  return profile.active && profile.approvalStatus === "approved";
}

export function subscribeUserProfiles(
  onUsers: (users: UserProfile[]) => void,
  onError: (message: string) => void
): Unsubscribe {
  return onSnapshot(
    collection(db, "users"),
    (snapshot) => {
      const users = snapshot.docs.map((userDoc) => {
        const data = userDoc.data();
        return {
          uid: userDoc.id,
          email: data.email ?? "",
          displayName: data.displayName ?? data.email ?? "ผู้ใช้งาน",
          role: data.role ?? "driver",
          active: data.active ?? true,
          organizationId: data.organizationId ?? null,
          organizationType: data.organizationType ?? null,
          organizationName: data.organizationName ?? "",
          approvalStatus: data.approvalStatus ?? (data.active === false ? "pending" : "approved")
        } as UserProfile;
      });
      onUsers(users.sort((a, b) => a.displayName.localeCompare(b.displayName, "th")));
    },
    (error) => onError(error.message)
  );
}

export async function updateUserAccess(
  uid: string,
  access: UserAccessUpdate,
  actor: UserProfile
) {
  if (!isMainAdmin(actor)) {
    throw new Error("เฉพาะแอดมินบริษัทหลักเท่านั้นที่จัดการสิทธิ์ได้");
  }

  await updateDoc(doc(db, "users", uid), {
    ...access,
    approvedByUid: actor.uid,
    approvedAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  } as UpdateData<DocumentData>);
}

function toTrackingStatus(status: JobStatus) {
  switch (status) {
    case "to_pickup":
      return "on_the_way_to_pickup";
    case "arrived_pickup":
      return "arrived_pickup";
    case "loading":
      return "loading";
    case "to_delivery":
      return "on_the_way_to_delivery";
    case "arrived_delivery":
      return "arrived_delivery";
    case "unloading":
    case "ready_to_close":
      return "unloading";
    case "completed":
      return "completed";
    default:
      return "not_started";
  }
}
