import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  runTransaction,
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
import { loadCompanySettings } from "./settings-repository";
import { compressImageForUpload, isImageFile, MAX_SOURCE_IMAGE_BYTES, MAX_STORED_IMAGE_BYTES } from "./image-upload";
import { statusLabels, type JobPlace, type JobStatus, type TransportJob } from "@s-fast-transport/shared";

export type UserRole = "owner" | "admin" | "dispatcher" | "subcontract_admin" | "driver";
export type OrganizationType = "main" | "subcontract";
export type ApprovalStatus = "pending" | "approved" | "suspended";

export type UserProfile = {
  uid: string;
  email: string;
  displayName: string;
  photoURL: string;
  profilePhotoPath: string;
  title: string;
  firstName: string;
  lastName: string;
  fullName: string;
  phone: string;
  licenseNumber: string;
  licenseType: string;
  licenseExpiry: string;
  idCardFrontPath: string;
  idCardFrontFileName: string;
  driverLicenseFrontPath: string;
  driverLicenseFrontFileName: string;
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
  driverId: string;
  pickupLocation: string;
  pickupPlace?: JobPlace;
  pickupDate: string;
  pickupTime: string;
  pickupContact: string;
  pickupContactId: string;
  pickupContactPhone: string;
  pickupContactNotes: string;
  deliveryLocation: string;
  deliveryPlace?: JobPlace;
  deliveryDate: string;
  deliveryTime: string;
  deliveryContact: string;
  deliveryContactId: string;
  deliveryContactPhone: string;
  deliveryContactNotes: string;
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

export function formatJobDateKey(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "";
  return `${value("year")}${value("month")}${value("day")}`;
}

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
        .filter((jobDoc) => !jobDoc.data().deletedAt)
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
    profilePhotoPath: data.profilePhotoPath ?? "",
    title: data.title ?? "",
    firstName: data.firstName ?? "",
    lastName: data.lastName ?? "",
    fullName: data.fullName ?? data.accessRequestName ?? "",
    phone: data.phone ?? "",
    licenseNumber: data.licenseNumber ?? "",
    licenseType: data.licenseType ?? "",
    licenseExpiry: data.licenseExpiry ?? "",
    idCardFrontPath: data.idCardFrontPath ?? "",
    idCardFrontFileName: data.idCardFrontFileName ?? "",
    driverLicenseFrontPath: data.driverLicenseFrontPath ?? "",
    driverLicenseFrontFileName: data.driverLicenseFrontFileName ?? "",
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
      googlePhotoURL: photoURL,
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
  const canSyncGoogleProfile = current.approvalStatus !== "pending" || !current.accessRequestSubmittedAt;
  if (canSyncGoogleProfile && !current.fullName && googleDisplayName && current.displayName !== googleDisplayName) {
    authProfile.displayName = googleDisplayName;
  }
  if (canSyncGoogleProfile && !current.profilePhotoPath && photoURL && current.photoURL !== photoURL) {
    authProfile.photoURL = photoURL;
    authProfile.googlePhotoURL = photoURL;
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
  title: string,
  firstName: string,
  lastName: string,
  accessRequestMessage: string
) {
  const cleanTitle = title.trim();
  const cleanFirstName = firstName.trim().replace(/\s+/g, " ");
  const cleanLastName = lastName.trim().replace(/\s+/g, " ");
  if (!["นาย", "นาง", "นางสาว"].includes(cleanTitle)) throw new Error("กรุณาเลือกคำนำหน้าชื่อ");
  if (!cleanFirstName || cleanFirstName.length > 50) throw new Error("กรุณากรอกชื่อจริงไม่เกิน 50 ตัวอักษร");
  if (!cleanLastName || cleanLastName.length > 50) throw new Error("กรุณากรอกนามสกุลจริงไม่เกิน 50 ตัวอักษร");
  const cleanName = `${cleanTitle}${cleanFirstName} ${cleanLastName}`;
  const cleanMessage = accessRequestMessage.trim().replace(/\s+/g, " ");
  if (!cleanMessage) throw new Error("กรุณาระบุบริษัทต้นสังกัดในข้อความถึงแอดมิน");
  if (cleanMessage.length > 500) throw new Error("ข้อความต้องไม่เกิน 500 ตัวอักษร");

  await runTransaction(db, async (transaction) => {
    const profileRef = doc(db, "users", uid);
    const snapshot = await transaction.get(profileRef);
    if (!snapshot.exists()) throw new Error("ไม่พบโปรไฟล์ผู้ใช้งาน");
    if (snapshot.data().accessRequestSubmittedAt) throw new Error("ส่งข้อมูลให้แอดมินแล้ว กรุณารอการอนุมัติ");
    transaction.update(profileRef, {
      title: cleanTitle,
      firstName: cleanFirstName,
      lastName: cleanLastName,
      fullName: cleanName,
      displayName: cleanName,
      accessRequestName: cleanName,
      accessRequestMessage: cleanMessage,
      accessRequestSubmittedAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
  });
}

export async function createJob(draft: JobDraft, actor: UserProfile) {
  const now = new Date().toISOString();
  const dateKey = formatJobDateKey(new Date(now));
  const organizationId = actor.organizationId ?? "main";
  const companySettings = await loadCompanySettings(organizationId);
  if (!draft.driverId) throw new Error("กรุณาเลือกพนักงานขับรถจากรถและคนขับ");
  const driverSnapshot = await getDoc(doc(db, "drivers", draft.driverId));
  if (!driverSnapshot.exists()) throw new Error("ไม่พบข้อมูลคนขับ กรุณาเลือกใหม่");
  const driver = driverSnapshot.data();
  if (driver.organizationId !== organizationId || driver.status === "inactive") throw new Error("คนขับไม่พร้อมใช้งานหรือไม่ได้อยู่ในบริษัทนี้");
  if (!driver.userUid) throw new Error("คนขับยังไม่เชื่อมบัญชีแอป กรุณาเชื่อมบัญชีในเมนูรถและคนขับก่อน");
  const userSnapshot = await getDoc(doc(db, "users", driver.userUid));
  const assignedUser = userSnapshot.data();
  if (!assignedUser || assignedUser.role !== "driver" || assignedUser.active !== true || assignedUser.approvalStatus !== "approved" || assignedUser.organizationId !== organizationId) {
    throw new Error("บัญชีแอปของคนขับยังไม่พร้อมรับงาน กรุณาตรวจสอบในเมนูรถและคนขับ");
  }

  for (const side of ["pickup", "delivery"] as const) {
    const name = draft[`${side}Contact`] || "";
    const phone = draft[`${side}ContactPhone`] || "";
    if ((name || phone) && (!name.trim() || !/^[+\d()\s-]+$/.test(phone) || phone.replace(/\D/g, "").length < 7 || phone.length > 40)) {
      throw new Error(`กรุณาระบุชื่อและเบอร์โทรผู้ติดต่อ${side === "pickup" ? "จุดรับ" : "จุดส่ง"}ให้ครบถ้วน`);
    }
  }
  const { pickupPlace, deliveryPlace, ...jobFields } = draft;
  const jobRef = doc(collection(db, "today_jobs"));
  const counterRef = doc(db, "job_counters", dateKey);
  const workOrder = await runTransaction(db, async (transaction) => {
    const counterSnapshot = await transaction.get(counterRef);
    const currentSequence = counterSnapshot.exists() && Number.isInteger(counterSnapshot.data().lastSequence)
      ? counterSnapshot.data().lastSequence
      : 0;
    const nextSequence = currentSequence + 1;
    const nextWorkOrder = `JN-${dateKey}${String(nextSequence).padStart(3, "0")}`;
    transaction.set(counterRef, {
      dateKey,
      lastSequence: nextSequence,
      updatedAt: serverTimestamp()
    });
    transaction.set(jobRef, {
      ...jobFields,
      ...(pickupPlace ? { pickupPlace } : {}),
      ...(deliveryPlace ? { deliveryPlace } : {}),
      workOrder: nextWorkOrder,
      assignedDriverUid: driver.userUid,
      driverName: assignedUser.fullName || driver.name,
      driverPhone: assignedUser.phone || driver.phone || "",
      organizationId,
      carrierName: companySettings.name || actor.organizationName || "S Fast Transport",
      status: "assigned",
      trackingStatus: "not_started",
      trackingEnabled: false,
      lastUpdatedMinutes: 0,
      currentLocation: { ...defaultLocation, updatedAt: now },
      alerts: [],
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
    return nextWorkOrder;
  });
  return workOrder;
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

  const jobRef = doc(db, "today_jobs", job.id);
  await runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(jobRef);
    if (!snapshot.exists()) throw new Error("ไม่พบใบงาน");
    const existing = snapshot.data();
    transaction.update(jobRef, {
      status,
      ...(status === "arrived_delivery" && !existing.arrivedDeliveryAt ? { arrivedDeliveryAt: serverTimestamp() } : {}),
      ...(status === "completed" && !existing.completedAt ? { completedAt: serverTimestamp() } : {}),
      trackingEnabled,
      trackingStatus: toTrackingStatus(status),
      currentLocation: { ...job.currentLocation, updatedAt: new Date().toISOString() },
      updatedAt: serverTimestamp()
    });
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
  const isPdf = file.type === "application/pdf";
  if (!isPdf && !isImageFile(file)) throw new Error("หลักฐานรองรับเฉพาะรูปภาพหรือ PDF");
  const sourceLimit = isPdf ? 10 * 1024 * 1024 : MAX_SOURCE_IMAGE_BYTES;
  if (file.size <= 0 || file.size > sourceLimit) throw new Error(`ไฟล์ต้นฉบับต้องมีขนาดไม่เกิน ${sourceLimit / 1024 / 1024} MB`);
  const uploadFile = isPdf ? file : await compressImageForUpload(file);
  if (!isPdf && uploadFile.size > MAX_STORED_IMAGE_BYTES) throw new Error("รูปที่บีบอัดแล้วต้องมีขนาดไม่เกิน 1 MB");
  const objectPath = `proof_of_delivery/${job.id}/${actor.uid}/${Date.now()}-${uploadFile.name}`;
  const storageRef = ref(storage, objectPath);
  const result = await uploadBytes(storageRef, uploadFile, { contentType: uploadFile.type });
  const downloadUrl = await getDownloadURL(result.ref);

  await addDoc(collection(db, "proof_of_delivery"), {
    jobId: job.id,
    uploadedByUid: actor.uid,
    uploadedByName: actor.displayName,
    organizationId: actor.organizationId ?? "main",
    fileName: uploadFile.name,
    storagePath: objectPath,
    downloadUrl,
    contentType: uploadFile.type,
    size: uploadFile.size,
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

export async function createTrackingShareLink(job: TransportJob, actor: UserProfile, expiry?: Date) {
  const companySettings = await loadCompanySettings(job.organizationId ?? actor.organizationId ?? "main");
  expiry = expiry ?? new Date(Date.now() + companySettings.trackingLinkDays * 86400000);
  if (!Number.isFinite(expiry.getTime()) || expiry.getTime() <= Date.now()) throw new Error("กรุณาเลือกวันหมดอายุในอนาคต");
  const token = crypto.randomUUID().replaceAll("-", "");
  const expiresAt = Timestamp.fromDate(expiry);

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
    ...(job.pickupPlace ? { pickupPlace: job.pickupPlace } : {}),
    ...(job.deliveryPlace ? { deliveryPlace: job.deliveryPlace } : {}),
    vehicleLabel: job.vehiclePlate,
    carrierName: companySettings.name || job.carrierName || actor.organizationName || "S Fast Transport",
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
  const currentLocation = data.currentLocation ?? defaultLocation;
  const locationUpdatedAt = Date.parse(String(currentLocation.updatedAt ?? ""));
  const calculatedMinutes = Number.isFinite(locationUpdatedAt)
    ? Math.max(0, Math.floor((Date.now() - locationUpdatedAt) / 60_000))
    : Number(data.lastUpdatedMinutes ?? 0);
  return {
    id,
    workOrder: data.workOrder ?? id,
    customer: data.customer ?? "-",
    driverName: data.driverName ?? "-",
    driverPhone: data.driverPhone ?? "-",
    vehiclePlate: data.vehiclePlate ?? "-",
    pickupLocation: data.pickupLocation ?? "-",
    deliveryLocation: data.deliveryLocation ?? "-",
    pickupPlace: toJobPlace(data.pickupPlace),
    pickupContact: String(data.pickupContact ?? ""),
    pickupContactId: String(data.pickupContactId ?? ""),
    pickupContactPhone: String(data.pickupContactPhone ?? ""),
    pickupContactNotes: String(data.pickupContactNotes ?? ""),

    deliveryPlace: toJobPlace(data.deliveryPlace),
    deliveryContact: String(data.deliveryContact ?? ""),
    deliveryContactId: String(data.deliveryContactId ?? ""),
    deliveryContactPhone: String(data.deliveryContactPhone ?? ""),
    deliveryContactNotes: String(data.deliveryContactNotes ?? ""),

    routeDistanceMeters: Number(data.routeDistanceMeters) > 0 ? Number(data.routeDistanceMeters) : undefined,
    routeDistanceFingerprint: typeof data.routeDistanceFingerprint === "string" ? data.routeDistanceFingerprint : undefined,
    routeDistanceProvider: data.routeDistanceProvider === "google_routes" ? "google_routes" : undefined,
    routeDistanceCalculatedAt: timestampToIso(data.routeDistanceCalculatedAt),

    status: data.status ?? "assigned",
    trackingStatus: data.trackingStatus ?? "not_started",
    trackingEnabled: Boolean(data.trackingEnabled),
    eta: data.eta ?? "-",
    lastUpdatedMinutes: calculatedMinutes,
    currentLocation,
    alerts: Array.isArray(data.alerts) ? data.alerts : [],
    organizationId: data.organizationId ?? undefined,
    cargoType: data.cargoType ?? undefined,
    vehicleType: data.vehicleType ?? undefined,
    driverId: data.driverId ?? undefined,
    jobDate: data.jobDate ?? undefined,
    pickupDate: data.pickupDate ?? undefined,
    pickupTime: data.pickupTime ?? undefined,
    deliveryDate: data.deliveryDate ?? undefined,
    deliveryTime: data.deliveryTime ?? undefined,
    arrivedDeliveryAt: timestampToIso(data.arrivedDeliveryAt),
    completedAt: timestampToIso(data.completedAt),
    assignedDriverUid: data.assignedDriverUid ?? undefined,
    tripCount: Number(data.tripCount) || 1,
    notes: data.notes ?? "",
    carrierName: data.carrierName ?? undefined
  };
}

function toJobPlace(value: unknown): JobPlace | undefined {
  if (!value || typeof value !== "object") return undefined;
  const data = value as Record<string, unknown>;
  const lat = Number(data.lat);
  const lng = Number(data.lng);
  const name = String(data.name ?? "");
  const originalMapsUrl = String(data.originalMapsUrl ?? "");
  const navigationUrl = String(data.navigationUrl ?? "");
  if (!name || !navigationUrl || !Number.isFinite(lat) || !Number.isFinite(lng)) return undefined;
  return {
    ...(data.locationId ? { locationId: String(data.locationId) } : {}),
    name,
    ...(data.googleName ? { googleName: String(data.googleName) } : {}),
    originalMapsUrl,
    navigationUrl,
    lat,
    lng,
    ...(data.googlePlaceId ? { googlePlaceId: String(data.googlePlaceId) } : {})
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
          profilePhotoPath: data.profilePhotoPath ?? "",
          title: data.title ?? "",
          firstName: data.firstName ?? "",
          lastName: data.lastName ?? "",
          fullName: data.fullName ?? data.accessRequestName ?? "",
          phone: data.phone ?? "",
          licenseNumber: data.licenseNumber ?? "",
          licenseType: data.licenseType ?? "",
          licenseExpiry: data.licenseExpiry ?? "",
          idCardFrontPath: data.idCardFrontPath ?? "",
          idCardFrontFileName: data.idCardFrontFileName ?? "",
          driverLicenseFrontPath: data.driverLicenseFrontPath ?? "",
          driverLicenseFrontFileName: data.driverLicenseFrontFileName ?? "",
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

export function subscribeOrganizationUserProfiles(
  organizationId: string,
  onUsers: (users: UserProfile[]) => void,
  onError: (message: string) => void
): Unsubscribe {
  return onSnapshot(
    query(collection(db, "users"), where("organizationId", "==", organizationId)),
    (snapshot) => {
      const users = snapshot.docs.map((userDoc) => {
        const data = userDoc.data();
        return {
          uid: userDoc.id,
          email: data.email ?? "",
          displayName: data.displayName ?? data.email ?? "ผู้ใช้งาน",
          photoURL: data.photoURL ?? "",
          profilePhotoPath: data.profilePhotoPath ?? "",
          title: data.title ?? "",
          firstName: data.firstName ?? "",
          lastName: data.lastName ?? "",
          fullName: data.fullName ?? data.accessRequestName ?? "",
          phone: data.phone ?? "",
          licenseNumber: data.licenseNumber ?? "",
          licenseType: data.licenseType ?? "",
          licenseExpiry: data.licenseExpiry ?? "",
          idCardFrontPath: data.idCardFrontPath ?? "",
          idCardFrontFileName: data.idCardFrontFileName ?? "",
          driverLicenseFrontPath: data.driverLicenseFrontPath ?? "",
          driverLicenseFrontFileName: data.driverLicenseFrontFileName ?? "",
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
      onUsers(users.filter((user) => user.active).sort((a, b) => (a.fullName || a.displayName).localeCompare(b.fullName || b.displayName, "th")));
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

  const userRef = doc(db, "users", uid);
  const userSnapshot = await getDoc(userRef);
  if (!userSnapshot.exists()) throw new Error("ไม่พบบัญชีผู้ใช้งาน");
  const userData = userSnapshot.data();
  const batch = writeBatch(db);
  batch.update(userRef, {
    ...access,
    approvedByUid: actor.uid,
    approvedAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  } as UpdateData<DocumentData>);

  if (access.role === "driver" && access.active && access.approvalStatus === "approved" && access.organizationId) {
    const linkedDrivers = await getDocs(query(collection(db, "drivers"), where("userUid", "==", uid)));
    const driverRef = linkedDrivers.docs[0]?.ref ?? doc(db, "drivers", `user--${uid}`);
    const isNewDriver = linkedDrivers.empty;
    const driverName = userData.fullName || userData.accessRequestName || userData.displayName || userData.email || "ผู้ใช้งาน";
    batch.set(driverRef, {
      organizationId: access.organizationId,
      userUid: uid,
      name: driverName,
      phone: userData.phone ?? "",
      email: userData.email ?? "",
      licenseNumber: userData.licenseNumber ?? "",
      licenseType: userData.licenseType ?? "",
      licenseExpiry: userData.licenseExpiry ?? "",
      ...(isNewDriver ? { assignedVehicleId: "", status: "available", createdByUid: actor.uid, createdAt: serverTimestamp() } : {}),
      updatedByUid: actor.uid,
      updatedAt: serverTimestamp()
    }, { merge: true });

    const normalizedName = driverName.trim().replace(/\s+/g, " ").toLocaleLowerCase("th-TH");
    batch.set(doc(db, "organizations", access.organizationId, "list_options", `driver--${encodeURIComponent(normalizedName)}`), {
      organizationId: access.organizationId,
      field: "driver",
      value: driverName,
      normalizedValue: normalizedName,
      createdByUid: actor.uid,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    }, { merge: true });
  }

  await batch.commit();
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
