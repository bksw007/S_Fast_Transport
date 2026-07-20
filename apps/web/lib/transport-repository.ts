import {
  addDoc,
  collection,
  deleteDoc,
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
import { statusLabels, type JobStatus, type TransportJob } from "@s-fast-transport/shared";

export type UserRole = "owner" | "admin" | "dispatcher" | "subcontract_admin" | "driver";
export type OrganizationType = "main" | "subcontract";
export type ApprovalStatus = "pending" | "approved" | "suspended";

export type UserProfile = {
  uid: string;
  email: string;
  displayName: string;
  photoURL: string;
  role: UserRole;
  active: boolean;
  organizationId: string | null;
  organizationType: OrganizationType | null;
  organizationName: string;
  organizationLogoUrl: string;
  approvalStatus: ApprovalStatus;
  accessRequestName: string;
  accessRequestMessage: string;
  accessRequestSubmittedAt: string;
};

export type UserAccessUpdate = Pick<
  UserProfile,
  "role" | "organizationId" | "organizationType" | "organizationName" | "organizationLogoUrl" | "approvalStatus" | "active"
>;

export type JobDraft = {
  workOrder: string;
  customer: string;
  jobDate: string;
  cargoType: string;
  vehicleType: string;
  tripCount: string;
  driverName: string;
  driverPhone: string;
  vehiclePlate: string;
  assignedEmployee: string;
  pickupLocation: string;
  pickupDate: string;
  pickupTime: string;
  pickupContact: string;
  deliveryLocation: string;
  deliveryDate: string;
  deliveryTime: string;
  deliveryContact: string;
  eta: string;
  notes: string;
};

export type ListOptionField =
  | "customer"
  | "cargo_type"
  | "vehicle_type"
  | "location"
  | "contact"
  | "employee"
  | "driver"
  | "vehicle_plate";

export type ListOption = {
  id: string;
  field: ListOptionField;
  value: string;
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
    photoURL: data.photoURL ?? "",
    role: data.role ?? "driver",
    active: data.active ?? true,
    organizationId: data.organizationId ?? null,
    organizationType: data.organizationType ?? (data.role === "subcontract_admin" ? "subcontract" : "main"),
    organizationName: data.organizationName ?? "S Fast Transport",
    organizationLogoUrl: data.organizationLogoUrl ?? "",
    approvalStatus: data.approvalStatus ?? (data.active === false ? "pending" : "approved"),
    accessRequestName: data.accessRequestName ?? "",
    accessRequestMessage: data.accessRequestMessage ?? "",
    accessRequestSubmittedAt: timestampToIso(data.accessRequestSubmittedAt)
  };
}

export async function ensureAccessProfile(uid: string, email: string, displayName: string, photoURL: string) {
  const profileRef = doc(db, "users", uid);
  const existing = await getDoc(profileRef);
  const googleDisplayName = displayName || email;

  if (!existing.exists()) {
    await setDoc(profileRef, {
      email,
      displayName: googleDisplayName,
      photoURL,
      role: "driver",
      active: false,
      approvalStatus: "pending",
      organizationId: null,
      organizationType: null,
      organizationName: "",
      organizationLogoUrl: "",
      accessRequestName: "",
      accessRequestMessage: "",
      authProvider: "google.com",
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
    return;
  }

  const current = existing.data();
  const authProfile: Record<string, unknown> = {};
  if (googleDisplayName && current.displayName !== googleDisplayName) {
    authProfile.displayName = googleDisplayName;
  }
  if (photoURL && current.photoURL !== photoURL) {
    authProfile.photoURL = photoURL;
  }
  if (Object.keys(authProfile).length > 0) {
    await updateDoc(profileRef, {
      ...authProfile,
      updatedAt: serverTimestamp()
    });
  }
}

export async function submitAccessRequest(
  uid: string,
  accessRequestName: string,
  accessRequestMessage: string
) {
  const cleanName = accessRequestName.trim().replace(/\s+/g, " ");
  const cleanMessage = accessRequestMessage.trim().replace(/\s+/g, " ");
  if (cleanName.length < 2) throw new Error("กรุณากรอกชื่อ–สกุล");
  if (cleanName.length > 100) throw new Error("ชื่อ–สกุลต้องไม่เกิน 100 ตัวอักษร");
  if (cleanMessage.length > 500) throw new Error("ข้อความต้องไม่เกิน 500 ตัวอักษร");

  await updateDoc(doc(db, "users", uid), {
    accessRequestName: cleanName,
    accessRequestMessage: cleanMessage,
    accessRequestSubmittedAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });
}

export async function createJob(draft: JobDraft, actor: UserProfile) {
  const now = new Date().toISOString();
  const workOrder = draft.workOrder.trim() || `WO-${Date.now().toString().slice(-5)}`;

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

function listOptionsCollection(organizationId: string) {
  return collection(db, "organizations", organizationId, "list_options");
}

function normalizeListOption(value: string) {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase("th-TH");
}

function listOptionId(field: ListOptionField, value: string) {
  return `${field}--${encodeURIComponent(normalizeListOption(value))}`;
}

export function canManageOrganizationLists(
  actor: UserProfile,
  organizationId: string
) {
  const isMainCompanyAdmin = isMainAdmin(actor)
    && actor.organizationType === "main"
    && actor.organizationId === "main";
  const managesOwnTransportResources = actor.role === "subcontract_admin"
    && actor.organizationType === "subcontract"
    && actor.organizationId === organizationId;
  return isMainCompanyAdmin || managesOwnTransportResources;
}

function assertCanManageListOption(actor: UserProfile, organizationId: string) {
  if (!canManageOrganizationLists(actor, organizationId)) {
    throw new Error("คุณไม่มีสิทธิ์จัดการรายการหมวดนี้หรือข้อมูลของบริษัทอื่น");
  }
}

export function subscribeListOptions(
  organizationId: string,
  field: ListOptionField,
  onItems: (items: ListOption[]) => void,
  onError: (message: string) => void
): Unsubscribe {
  const optionsQuery = query(listOptionsCollection(organizationId), where("field", "==", field));

  return onSnapshot(
    optionsQuery,
    (snapshot) => {
      const items = snapshot.docs
        .map((itemDoc) => ({
          id: itemDoc.id,
          field,
          value: String(itemDoc.data().value ?? "")
        }))
        .filter((item) => item.value)
        .sort((a, b) => a.value.localeCompare(b.value, "th"));
      onItems(items);
    },
    (error) => onError(error.message)
  );
}

export async function createListOption(
  organizationId: string,
  field: ListOptionField,
  value: string,
  actor: UserProfile
) {
  assertCanManageListOption(actor, organizationId);
  const cleanValue = value.trim().replace(/\s+/g, " ");
  if (!cleanValue) throw new Error("กรุณากรอกรายการ");
  if (cleanValue.length > 160) throw new Error("รายการต้องไม่เกิน 160 ตัวอักษร");

  const optionRef = doc(listOptionsCollection(organizationId), listOptionId(field, cleanValue));
  if ((await getDoc(optionRef)).exists()) throw new Error("มีรายการนี้อยู่แล้ว");

  await setDoc(optionRef, {
    organizationId,
    field,
    value: cleanValue,
    normalizedValue: normalizeListOption(cleanValue),
    createdByUid: actor.uid,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });
}

export async function updateListOption(
  organizationId: string,
  item: ListOption,
  value: string,
  actor: UserProfile
) {
  assertCanManageListOption(actor, organizationId);
  const cleanValue = value.trim().replace(/\s+/g, " ");
  if (!cleanValue) throw new Error("กรุณากรอกรายการ");
  if (cleanValue.length > 160) throw new Error("รายการต้องไม่เกิน 160 ตัวอักษร");

  const currentRef = doc(listOptionsCollection(organizationId), item.id);
  const nextRef = doc(listOptionsCollection(organizationId), listOptionId(item.field, cleanValue));

  if (currentRef.path === nextRef.path) {
    await updateDoc(currentRef, {
      value: cleanValue,
      normalizedValue: normalizeListOption(cleanValue),
      updatedByUid: actor.uid,
      updatedAt: serverTimestamp()
    });
    return;
  }

  if ((await getDoc(nextRef)).exists()) throw new Error("มีรายการนี้อยู่แล้ว");
  const batch = writeBatch(db);
  batch.set(nextRef, {
    organizationId,
    field: item.field,
    value: cleanValue,
    normalizedValue: normalizeListOption(cleanValue),
    createdByUid: actor.uid,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });
  batch.delete(currentRef);
  await batch.commit();
}

export async function deleteListOption(
  organizationId: string,
  item: ListOption,
  actor: UserProfile
) {
  assertCanManageListOption(actor, organizationId);
  await deleteDoc(doc(listOptionsCollection(organizationId), item.id));
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
          photoURL: data.photoURL ?? "",
          role: data.role ?? "driver",
          active: data.active ?? true,
          organizationId: data.organizationId ?? null,
          organizationType: data.organizationType ?? null,
          organizationName: data.organizationName ?? "",
          organizationLogoUrl: data.organizationLogoUrl ?? "",
          approvalStatus: data.approvalStatus ?? (data.active === false ? "pending" : "approved"),
          accessRequestName: data.accessRequestName ?? "",
          accessRequestMessage: data.accessRequestMessage ?? "",
          accessRequestSubmittedAt: timestampToIso(data.accessRequestSubmittedAt)
        } as UserProfile;
      });
      onUsers(users.sort((a, b) => a.displayName.localeCompare(b.displayName, "th")));
    },
    (error) => onError(error.message)
  );
}

export function subscribePendingAccessRequestCount(
  onCount: (count: number) => void,
  onError: (message: string) => void
): Unsubscribe {
  return onSnapshot(
    query(collection(db, "users"), where("approvalStatus", "==", "pending")),
    (snapshot) => onCount(snapshot.docs.filter((item) => Boolean(item.data().accessRequestSubmittedAt)).length),
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

function timestampToIso(value: unknown) {
  if (value instanceof Timestamp) return value.toDate().toISOString();
  return typeof value === "string" ? value : "";
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
