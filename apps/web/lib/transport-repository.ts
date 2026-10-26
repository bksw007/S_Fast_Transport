import {
  addDoc,
  collection,
  deleteField,
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
import { getDownloadURL, ref, uploadBytes, uploadBytesResumable } from "firebase/storage";
import { db, storage } from "./firebase";
import { loadCompanySettings } from "./settings-repository";
import { resolveCustomerId } from "./customer-repository";
import { compressImageForUpload, isImageFile, MAX_SOURCE_IMAGE_BYTES, MAX_STORED_IMAGE_BYTES } from "./image-upload";
import { coordinateFingerprint } from "./google-routes-distance";
import { requestJobRoadDistance } from "./job-road-distance-client";
import { statusLabels, type DriverIssueType, type JobPlace, type JobStatus, type ReturnTrip, type StopProof, type TransportJob } from "@s-fast-transport/shared";
import { validateReturnTrip } from "./return-trip";

export type UserRole = "owner" | "admin" | "dispatcher" | "subcontract_admin" | "driver" | "customer";
export type OrganizationType = "main" | "subcontract";
export type ApprovalStatus = "pending" | "approved" | "suspended";
export type { DriverIssueType } from "@s-fast-transport/shared";

const driverIssueLabels: Record<DriverIssueType, string> = {
  accident: "อุบัติเหตุ",
  traffic: "จราจรติดขัด",
  heavy_rain: "ฝนตกหนัก",
  vehicle_breakdown: "รถเสีย",
  road_closed: "ถนนปิดหรือเส้นทางใช้ไม่ได้",
  contact_failed: "ติดต่อลูกค้าไม่ได้",
  loading_delay: "รอรับหรือส่งสินค้านาน",
  customer_absent: "ลูกค้าไม่อยู่ที่จุดนัดหมาย",
  signature_refused: "ลูกค้าปฏิเสธการเซ็นชื่อ",
  photo_unavailable: "ไม่สามารถถ่ายรูปสินค้าได้",
  goods_damaged: "สินค้าชำรุดหรือเสียหาย",
  other: "ปัญหาอื่น ๆ"
};

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
  customerId: string | null;
  approvalStatus: ApprovalStatus;
  accessRequestName: string;
  accessRequestMessage: string;
  accessRequestSubmittedAt: string;
};

export type UserAccessUpdate = Pick<
  UserProfile,
  "role" | "organizationId" | "organizationType" | "organizationName" | "organizationLogoUrl" | "customerId" | "approvalStatus" | "active"
>;

export type JobDraft = {
  sourceRequestId?: string;
  submissionId?: string;
  assignedOrganizationId?: string;
  workOrder: string;
  customer: string;
  jobDate: string;
  cargoType: string;
  vehicleType: string;
  tripCount: string;
  returnTrip?: ReturnTrip;
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

export type CreatedJob = { workOrder: string; trackingToken: string };

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

type CurrentDriverIdentity = { fullName: string; phone: string; photoURL: string };

export function resolveCurrentDriverIdentities(
  jobs: TransportJob[],
  identities: ReadonlyMap<string, CurrentDriverIdentity>
) {
  return jobs.map((job) => {
    const identity = job.assignedDriverUid ? identities.get(job.assignedDriverUid) : undefined;
    if (!identity) return job;
    return {
      ...job,
      driverName: identity.fullName || job.driverName,
      driverPhone: identity.phone || job.driverPhone,
      driverPhotoUrl: identity.photoURL || job.driverPhotoUrl
    };
  });
}

export function currentDriverIdentity(data: DocumentData): CurrentDriverIdentity {
  const title = String(data.title ?? "").trim();
  const firstName = String(data.firstName ?? "").trim();
  const lastName = String(data.lastName ?? "").trim();
  const composedName = [title && firstName ? `${title}${firstName}` : firstName, lastName].filter(Boolean).join(" ");
  const profilePhotoPath = String(data.profilePhotoPath ?? "").trim();
  const uploadedPhotoURL = profilePhotoPath ? String(data.photoURL ?? "").trim() : "";
  const googlePhotoURL = String(data.googlePhotoURL || (!profilePhotoPath ? data.photoURL : "") || "").trim();
  const photoURL = [uploadedPhotoURL, googlePhotoURL].find((value) => value.startsWith("https://")) ?? "";
  return {
    fullName: String(data.fullName || data.accessRequestName || composedName || "").trim(),
    phone: String(data.phone ?? "").trim(),
    photoURL
  };
}

export function subscribeTodayJobs(
  profile: UserProfile,
  onJobs: (jobs: TransportJob[]) => void,
  onError: (message: string) => void,
  onDeletedJobs?: (jobs: TransportJob[]) => void
): Unsubscribe {
  const jobsRef = collection(db, "today_jobs");
  const jobsQuery = profile.role === "driver"
    ? query(jobsRef, where("assignedDriverUid", "==", profile.uid))
    : profile.role === "customer"
      ? query(jobsRef, where("customerId", "==", profile.customerId || "__unassigned__"))
    : profile.role === "subcontract_admin" && profile.organizationId
      ? query(jobsRef, where("organizationId", "==", profile.organizationId))
      : jobsRef;
  let currentJobs: TransportJob[] = [];
  let identities = new Map<string, CurrentDriverIdentity>();
  let jobsReady = false;
  let identitiesReady = false;

  function emitJobs() {
    if (!jobsReady || !identitiesReady) return;
    onJobs(resolveCurrentDriverIdentities(currentJobs, identities));
  }

  function receiveProfiles(profileDocs: Array<{ id: string; data: () => DocumentData }>) {
    identities = new Map(profileDocs.map((profileDoc) => [profileDoc.id, currentDriverIdentity(profileDoc.data())]));
    identitiesReady = true;
    emitJobs();
  }

  function emitSavedJobIdentity() {
    identitiesReady = true;
    emitJobs();
  }

  const stopProfiles = profile.role === "customer"
    ? (emitSavedJobIdentity(), () => {})
    : profile.role === "driver"
    ? onSnapshot(
      doc(db, "users", profile.uid),
      (snapshot) => receiveProfiles(snapshot.exists() ? [{ id: snapshot.id, data: () => snapshot.data() }] : []),
      emitSavedJobIdentity
    )
    : onSnapshot(
      profile.role === "subcontract_admin" && profile.organizationId
        ? query(collection(db, "users"), where("organizationId", "==", profile.organizationId))
        : collection(db, "users"),
      (snapshot) => receiveProfiles(snapshot.docs),
      emitSavedJobIdentity
    );

  const stopJobs = onSnapshot(
    jobsQuery,
    (snapshot) => {
      const visibleDocs = snapshot.docs.filter((jobDoc) => !jobDoc.data().deletedAt);
      currentJobs = visibleDocs
        .map((jobDoc) => toTransportJob(jobDoc.id, jobDoc.data()))
        .sort((a, b) => b.id.localeCompare(a.id));
      if (profile.role !== "driver" && profile.role !== "customer") onDeletedJobs?.(snapshot.docs
        .filter((jobDoc) => Boolean(jobDoc.data().deletedAt))
        .map((jobDoc) => toTransportJob(jobDoc.id, jobDoc.data()))
        .sort((a, b) => b.id.localeCompare(a.id)));
      jobsReady = true;
      emitJobs();
    },
    (error) => {
      onError(error.message);
      onJobs([]);
    }
  );

  return () => {
    stopProfiles();
    stopJobs();
  };
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
    organizationType: data.organizationType ?? (data.role === "customer" ? null : data.role === "subcontract_admin" ? "subcontract" : "main"),
    organizationName: data.organizationName ?? "S Fast Transport",
    organizationLogoUrl: data.organizationLogoUrl ?? "",
    customerId: data.customerId ?? null,
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
      customerId: null,
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
  if (!isMainAdmin(actor) || actor.organizationId !== "main" || !hasApprovedAccess(actor)) throw new Error("เฉพาะบริษัทหลักเท่านั้นที่สร้างใบงานได้");
  const now = new Date().toISOString();
  const dateKey = formatJobDateKey(new Date(now));
  const organizationId = draft.assignedOrganizationId || "main";
  const subcontract = organizationId !== "main";
  const companySettings = await loadCompanySettings("main");
  let carrierName = companySettings.name || actor.organizationName || "S Fast Transport";
  if (subcontract) {
    const company = (await getDoc(doc(db, "organizations", organizationId))).data();
    if (company?.type !== "subcontract" || company.active !== true || company.deleted === true) throw new Error("บริษัทซับไม่พร้อมรับงาน");
    carrierName = String(company.name || organizationId);
    if (draft.driverId || draft.vehiclePlate) throw new Error("งานของบริษัทซับต้องให้บริษัทซับมอบหมายรถและคนขับ");
  }
  let driver: DocumentData | undefined;
  let assignedUser: DocumentData | undefined;
  if (!subcontract) {
    if (!draft.driverId) throw new Error("กรุณาเลือกพนักงานขับรถจากรถและคนขับ");
    const driverSnapshot = await getDoc(doc(db, "drivers", draft.driverId));
    if (!driverSnapshot.exists()) throw new Error("ไม่พบข้อมูลคนขับ กรุณาเลือกใหม่");
    driver = driverSnapshot.data();
    if (driver.organizationId !== organizationId || driver.status === "inactive") throw new Error("คนขับไม่พร้อมใช้งานหรือไม่ได้อยู่ในบริษัทนี้");
    if (!driver.userUid) throw new Error("คนขับยังไม่เชื่อมบัญชีแอป กรุณาเชื่อมบัญชีในเมนูรถและคนขับก่อน");
    const userSnapshot = await getDoc(doc(db, "users", driver.userUid));
    assignedUser = userSnapshot.data();
    if (!assignedUser || !canReceiveDriverJobs(assignedUser as UserProfile, organizationId)) throw new Error("บัญชีแอปของคนขับยังไม่พร้อมรับงาน กรุณาตรวจสอบในเมนูรถและคนขับ");
  }

  for (const side of ["pickup", "delivery"] as const) {
    const name = draft[`${side}Contact`] || "";
    const phone = draft[`${side}ContactPhone`] || "";
    if ((name || phone) && (!name.trim() || !/^[+\d()\s-]+$/.test(phone) || phone.replace(/\D/g, "").length < 7 || phone.length > 40)) {
      throw new Error(`กรุณาระบุชื่อและเบอร์โทรผู้ติดต่อ${side === "pickup" ? "จุดรับ" : "จุดส่ง"}ให้ครบถ้วน`);
    }
  }
  const customerId = !draft.sourceRequestId ? await resolveCustomerId(draft.customer, actor) : null;
  const { pickupPlace, deliveryPlace, returnTrip, submissionId, ...jobFields } = draft;
  delete jobFields.assignedOrganizationId;
  const checkedReturnTrip = validateReturnTrip(returnTrip, draft.deliveryDate, draft.deliveryTime);
  const jobRef = submissionId ? doc(db, "today_jobs", submissionId) : doc(collection(db, "today_jobs"));
  const trackingToken = crypto.randomUUID().replaceAll("-", "");
  const trackingLinkRef = doc(db, "tracking_share_links", trackingToken);
  const trackingExpiresAt = Timestamp.fromDate(new Date(Date.now() + companySettings.trackingLinkDays * 86400000));
  const counterRef = doc(db, "job_counters", dateKey);
  const requestRef = draft.sourceRequestId ? doc(db, "customer_job_requests", draft.sourceRequestId) : null;
  const result = await runTransaction(db, async (transaction) => {
    const existingJob = await transaction.get(jobRef);
    if (existingJob.exists()) {
      const existing = existingJob.data();
      if (!submissionId || existing.createdByUid !== actor.uid || existing.organizationId !== organizationId || existing.submissionId !== submissionId) {
        throw new Error("ไม่สามารถใช้รายการบันทึกนี้ซ้ำได้ กรุณาเริ่มสร้างใบงานใหม่");
      }
      return { workOrder: existing.workOrder as string, trackingToken: existing.trackingShareToken as string, created: false };
    }
    const counterSnapshot = await transaction.get(counterRef);
    const requestSnapshot = requestRef ? await transaction.get(requestRef) : null;
    const source = requestSnapshot?.data();
    if (requestRef && (!isMainAdmin(actor) || !source || source.status !== "pending" || source.customerName !== draft.customer)) {
      throw new Error("คำขอแจ้งงานนี้ไม่พร้อมรับงานแล้ว กรุณากลับไปตรวจสอบรายการแจ้งเตือน");
    }
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
      ...(submissionId ? { submissionId } : {}),
      createdByUid: actor.uid,
      ...((source?.customerId || customerId) ? { customerId: source?.customerId || customerId } : {}),
      ...(pickupPlace ? { pickupPlace } : {}),
      ...(deliveryPlace ? { deliveryPlace } : {}),
      ...(checkedReturnTrip ? { returnTrip: checkedReturnTrip, activeLeg: 1 } : {}),
      workOrder: nextWorkOrder,
      ...(subcontract ? { driverId: "", driverName: "", driverPhone: "", vehiclePlate: "" } : {
        assignedDriverUid: driver!.userUid,
        driverName: assignedUser!.fullName || driver!.name,
        driverPhone: assignedUser!.phone || driver!.phone || ""
      }),
      organizationId,
      originOrganizationId: "main",
      trackingShareToken: trackingToken,
      carrierName,
      status: subcontract ? "pending_subcontract" : "assigned",
      trackingStatus: "not_started",
      trackingEnabled: false,
      lastUpdatedMinutes: 0,
      currentLocation: { ...defaultLocation, updatedAt: now },
      alerts: [],
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
    transaction.set(trackingLinkRef, {
      jobId: jobRef.id,
      organizationId,
      enabled: true,
      expiresAt: trackingExpiresAt,
      workOrder: nextWorkOrder,
      customerName: draft.customer,
      statusLabel: statusLabels[subcontract ? "pending_subcontract" : "assigned"],
      pickupLocation: draft.pickupLocation,
      deliveryLocation: draft.deliveryLocation,
      ...(pickupPlace ? { pickupPlace } : {}),
      ...(deliveryPlace ? { deliveryPlace } : {}),
      vehicleLabel: subcontract ? "ยังไม่มอบหมาย" : draft.vehiclePlate,
      carrierName,
      eta: draft.eta,
      lastUpdatedAt: now,
      currentLocation: { lat: defaultLocation.lat, lng: defaultLocation.lng },
      createdByUid: actor.uid,
      source: "job_created",
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
    if (requestRef) transaction.update(requestRef, { status: "accepted", jobId: jobRef.id, workOrder: nextWorkOrder, decidedByUid: actor.uid, decidedAt: serverTimestamp() });
    return { workOrder: nextWorkOrder, trackingToken, created: true };
  });
  const fingerprint = coordinateFingerprint(pickupPlace, deliveryPlace);
  if (result.created && fingerprint && pickupPlace && deliveryPlace) {
    try {
      const distanceMeters = await requestJobRoadDistance(jobRef.id, pickupPlace, deliveryPlace);
      await saveJobRouteDistance(jobRef.id, distanceMeters, fingerprint, actor);
    } catch {
      // The job is already saved; its details screen can retry the distance calculation later.
    }
  }
  return { workOrder: result.workOrder, trackingToken: result.trackingToken } satisfies CreatedJob;
}

export async function acceptSubcontractJob(jobId: string, actor: UserProfile) {
  if (!hasApprovedAccess(actor) || actor.role !== "subcontract_admin" || !actor.organizationId) throw new Error("ไม่มีสิทธิ์รับงานนี้");
  const jobRef = doc(db, "today_jobs", jobId);
  const eventRef = doc(collection(db, "job_events"));
  await runTransaction(db, async transaction => {
    const snapshot = await transaction.get(jobRef);
    if (!snapshot.exists()) throw new Error("ไม่พบใบงาน");
    const job = snapshot.data();
    if (job.originOrganizationId !== "main" || job.organizationId !== actor.organizationId || job.status !== "pending_subcontract" || job.deletedAt) throw new Error("งานนี้ไม่พร้อมให้รับแล้ว");
    const linkRef = job.trackingShareToken ? doc(db, "tracking_share_links", job.trackingShareToken) : null;
    const link = linkRef ? await transaction.get(linkRef) : null;
    transaction.update(jobRef, { status: "subcontract_accepted", acceptedByUid: actor.uid, acceptedAt: serverTimestamp(), updatedAt: serverTimestamp() });
    if (linkRef && link?.exists()) transaction.update(linkRef, { statusLabel: statusLabels.subcontract_accepted, updatedAt: serverTimestamp() });
    transaction.set(eventRef, { jobId, organizationId: actor.organizationId, type: "subcontract_accepted", message: "บริษัทซับรับงานแล้ว", actorUid: actor.uid, actorName: actor.displayName, timestamp: serverTimestamp() });
  });
}

export async function assignSubcontractJob(jobId: string, driverId: string, vehicleId: string, actor: UserProfile) {
  if (!hasApprovedAccess(actor) || actor.role !== "subcontract_admin" || !actor.organizationId) throw new Error("ไม่มีสิทธิ์มอบหมายงานนี้");
  const organizationId = actor.organizationId;
  if (!driverId || !vehicleId) throw new Error("กรุณาเลือกรถและคนขับ");
  const jobRef = doc(db, "today_jobs", jobId);
  const driverRef = doc(db, "drivers", driverId);
  const vehicleRef = doc(db, "vehicles", vehicleId);
  const eventRef = doc(collection(db, "job_events"));
  await runTransaction(db, async transaction => {
    const [jobSnapshot, driverSnapshot, vehicleSnapshot] = await Promise.all([transaction.get(jobRef), transaction.get(driverRef), transaction.get(vehicleRef)]);
    if (!jobSnapshot.exists() || !driverSnapshot.exists() || !vehicleSnapshot.exists()) throw new Error("ไม่พบใบงาน รถ หรือคนขับ");
    const job = jobSnapshot.data();
    const driver = driverSnapshot.data();
    const vehicle = vehicleSnapshot.data();
    if (job.originOrganizationId !== "main" || job.organizationId !== actor.organizationId || job.status !== "subcontract_accepted" || job.deletedAt) throw new Error("งานนี้ไม่พร้อมมอบหมายแล้ว");
    if (driver.organizationId !== actor.organizationId || !["available", "assigned"].includes(driver.status) || !driver.userUid) throw new Error("คนขับไม่พร้อมใช้งานหรือไม่ได้อยู่ในบริษัทนี้");
    if (vehicle.organizationId !== actor.organizationId || !["available", "assigned"].includes(vehicle.status)) throw new Error("รถไม่พร้อมใช้งานหรือไม่ได้อยู่ในบริษัทนี้");
    if (driver.assignedVehicleId && driver.assignedVehicleId !== vehicleId) throw new Error("รถที่เลือกไม่ตรงกับรถประจำของคนขับ");
    const userSnapshot = await transaction.get(doc(db, "users", driver.userUid));
    const user = userSnapshot.data();
    if (!user || !canReceiveDriverJobs(user as UserProfile, organizationId)) throw new Error("บัญชีคนขับยังไม่พร้อมรับงาน");
    const linkRef = job.trackingShareToken ? doc(db, "tracking_share_links", job.trackingShareToken) : null;
    const link = linkRef ? await transaction.get(linkRef) : null;
    const vehiclePlate = String(vehicle.plate || "");
    if (!vehiclePlate) throw new Error("รถที่เลือกไม่มีทะเบียนรถ");
    transaction.update(jobRef, { status: "assigned", driverId, vehicleId, vehiclePlate, assignedDriverUid: driver.userUid, driverName: user.fullName || driver.name, driverPhone: user.phone || driver.phone || "", updatedAt: serverTimestamp() });
    if (linkRef && link?.exists()) transaction.update(linkRef, { statusLabel: statusLabels.assigned, vehicleLabel: vehiclePlate, updatedAt: serverTimestamp() });
    transaction.set(eventRef, { jobId, organizationId: actor.organizationId, type: "subcontract_assigned", message: `มอบหมายรถ ${vehiclePlate} และคนขับ ${user.fullName || driver.name}`, actorUid: actor.uid, actorName: actor.displayName, timestamp: serverTimestamp() });
  });
}

export async function saveJobRouteDistance(jobId: string, distanceMeters: number, fingerprint: string, actor: UserProfile) {
  if (!hasApprovedAccess(actor)) throw new Error("ไม่มีสิทธิ์แก้ไขงาน");
  if (!Number.isFinite(distanceMeters) || distanceMeters <= 0 || distanceMeters > 10_000_000) throw new Error("ระยะทางไม่ถูกต้อง");
  const jobRef = doc(db, "today_jobs", jobId);
  await runTransaction(db, async transaction => {
    const snapshot = await transaction.get(jobRef);
    if (!snapshot.exists()) throw new Error("ไม่พบใบงาน");
    const current = snapshot.data();
    if (!isMainAdmin(actor) && !(actor.role === "subcontract_admin" && actor.organizationId === current.organizationId)) throw new Error("ไม่มีสิทธิ์แก้ไขงานนี้");
    if (coordinateFingerprint(current.pickupPlace, current.deliveryPlace) !== fingerprint) throw new Error("พิกัดใบงานมีการเปลี่ยนแปลง");
    transaction.update(jobRef, {
      routeDistanceMeters: Math.round(distanceMeters),
      routeDistanceFingerprint: fingerprint,
      routeDistanceProvider: "google_routes",
      routeDistanceCalculatedAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
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

export function subscribeCustomerCargoTypes(
  customerId: string,
  onItems: (items: ListOption[]) => void,
  onError: (message: string) => void
): Unsubscribe {
  return onSnapshot(
    collection(db, "customers", customerId, "cargo_types"),
    (snapshot) => onItems(snapshot.docs.map((itemDoc) => ({
      id: itemDoc.id,
      field: "cargo_type" as const,
      value: String(itemDoc.data().value ?? "")
    })).filter((item) => item.value).sort((a, b) => a.value.localeCompare(b.value, "th"))),
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
  if (field === "customer" && organizationId === "main") await resolveCustomerId(cleanValue, actor);

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

export async function updateJobStatus(job: TransportJob, status: JobStatus, actor: UserProfile, proof?: StopProof) {
  const trackingEnabled = status !== "completed" && status !== "cancelled";
  const startingReturnEvent = status === "to_pickup" && Boolean(job.returnTrip) && job.activeLeg !== 2;

  const jobRef = doc(db, "today_jobs", job.id);
  await runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(jobRef);
    if (!snapshot.exists()) throw new Error("ไม่พบใบงาน");
    const existing = snapshot.data();
    const effectiveStatus = existing.status === "problem" ? existing.issuePreviousStatus : existing.status;
    const currentLeg = existing.returnTrip && existing.activeLeg === 2 ? 2 : 1;
    const startingReturn = status === "to_pickup" && effectiveStatus === "ready_to_close" && Boolean(existing.returnTrip) && currentLeg === 1;
    if (status === "to_pickup" && !startingReturn && existing.returnTrip) throw new Error("ยังไม่สามารถเริ่มขากลับได้");
    const stage = status === "to_delivery" ? "pickup" : status === "ready_to_close" ? "delivery" : null;
    if (stage) {
      const proofField = currentLeg === 2 ? `return${stage === "pickup" ? "Pickup" : "Delivery"}Proof` : `${stage}Proof`;
      const saved = proof ?? existing[proofField];
      if (!saved || !Array.isArray(saved.photoPaths) || saved.photoPaths.length < 1 || !saved.signaturePath || !saved.signerName) throw new Error("กรุณาแนบรูปสินค้าอย่างน้อย 1 รูปและลายเซ็นก่อนดำเนินการต่อ");
      if (stage === "pickup" && !["arrived_pickup", "loading"].includes(effectiveStatus)) throw new Error("ยังไม่ถึงขั้นตอนยืนยันจุดรับ");
      if (stage === "delivery" && !["arrived_delivery", "unloading"].includes(effectiveStatus)) throw new Error("ยังไม่ถึงขั้นตอนยืนยันจุดส่ง");
    }
    if (status === "completed" && (effectiveStatus !== "ready_to_close" && effectiveStatus !== "completed" || !existing.pickupProof || !existing.deliveryProof || (existing.returnTrip && (currentLeg !== 2 || !existing.returnPickupProof || !existing.returnDeliveryProof)))) throw new Error("กรุณายืนยันหลักฐานรับและส่งสินค้าทั้งสองเที่ยวก่อนจบงาน");
    transaction.update(jobRef, {
      status,
      ...(startingReturn ? { activeLeg: 2 } : {}),
      ...(stage && proof ? { [currentLeg === 2 ? `return${stage === "pickup" ? "Pickup" : "Delivery"}Proof` : `${stage}Proof`]: proof } : {}),
      ...(status === "arrived_delivery" && currentLeg === 1 && !existing.arrivedDeliveryAt ? { arrivedDeliveryAt: serverTimestamp() } : {}),
      ...(status === "arrived_delivery" && currentLeg === 2 && !existing.returnArrivedDeliveryAt ? { returnArrivedDeliveryAt: serverTimestamp() } : {}),
      ...(status === "completed" && !existing.completedAt ? { completedAt: serverTimestamp() } : {}),
      trackingEnabled,
      trackingStatus: toTrackingStatus(status),
      currentLocation: { ...job.currentLocation, updatedAt: new Date().toISOString() },
      ...(existing.status === "problem" ? { issuePreviousStatus: deleteField() } : {}),
      updatedAt: serverTimestamp()
    });
  });

  await addDoc(collection(db, "job_events"), {
    jobId: job.id,
    type: status,
    message: `${job.returnTrip ? (startingReturnEvent || job.activeLeg === 2 ? "ขากลับ · " : "ขาไป · ") : ""}เปลี่ยนสถานะเป็น ${statusLabels[status]}`,
    actorUid: actor.uid,
    actorName: actor.displayName,
    organizationId: actor.organizationId ?? "main",
    lat: job.currentLocation.lat,
    lng: job.currentLocation.lng,
    timestamp: serverTimestamp(),
    metadata: { status, leg: startingReturnEvent ? 2 : job.activeLeg === 2 ? 2 : 1 }
  });

  await syncActiveShareLinks(job, status);
}

type ProofUploadPhase = "upload" | "download_url";

async function proofUploadError(job: TransportJob, stage: string, actor: UserProfile, phase: ProofUploadPhase, assetKind: "photo" | "signature", assetIndex: number, assetBytes: number, transferredBytes: number, error: unknown): Promise<Error> {
  const storageError = error && typeof error === "object" ? error as { code?: unknown; status?: unknown; serverResponse?: unknown } : {};
  const code = typeof storageError.code === "string" && /^storage\/[a-z-]+$/.test(storageError.code) ? storageError.code : "unknown";
  const status = typeof storageError.status === "number" && Number.isInteger(storageError.status) ? storageError.status : 0;
  let serverCode = 0;
  let serverReason = "unknown";
  if (typeof storageError.serverResponse === "string") {
    try {
      const response = JSON.parse(storageError.serverResponse) as { error?: { code?: unknown; status?: unknown; message?: unknown } };
      if (typeof response.error?.code === "number") serverCode = response.error.code;
      if (typeof response.error?.status === "string" && /^[A-Z_]{1,40}$/.test(response.error.status)) serverReason = response.error.status;
      const message = typeof response.error?.message === "string" ? response.error.message.toLowerCase() : "";
      if (serverReason === "unknown") serverReason = /billing account.*(absent|disabled|closed)/.test(message) ? "BILLING_ACCOUNT" : /spark|no-cost pricing plan/.test(message) ? "PLAN_REQUIRED" : /quota|limit/.test(message) ? "QUOTA" : "unknown";
    } catch { /* The response can be HTML; never store its raw contents. */ }
  }
  const eventRef = doc(collection(db, "job_events"));
  const diagnosticCode = eventRef.id.slice(-8).toUpperCase();
  const record = setDoc(eventRef, {
    jobId: job.id,
    type: "proof_upload_failed",
    message: `อัปโหลดหลักฐานไม่สำเร็จ · ${stage} · ${code} · HTTP ${status || "?"} · รหัส ${diagnosticCode}`,
    actorUid: actor.uid,
    actorName: actor.displayName,
    organizationId: job.organizationId ?? actor.organizationId ?? "main",
    timestamp: serverTimestamp(),
    metadata: { diagnosticCode, stage, phase, assetKind, assetIndex, assetBytes, transferredBytes, code, httpStatus: status, serverCode, serverReason, online: typeof navigator !== "undefined" ? navigator.onLine : true }
  }).then(() => true, () => false);
  const recorded = await Promise.race([record, new Promise<boolean>(resolve => window.setTimeout(() => resolve(false), 3000))]);
  const detail = status ? `HTTP ${status}` : code;
  return new Error(`อัปโหลดหลักฐานไม่สำเร็จ (${detail}, รหัสตรวจสอบ ${diagnosticCode})${recorded ? "" : " กรุณาแจ้งรหัสนี้ให้แอดมิน"}`);
}

export async function uploadStopProof(job: TransportJob, stage: "pickup" | "delivery" | "returnPickup" | "returnDelivery", photos: File[], signature: Blob, signerName: string, actor: UserProfile, onProgress?: (percent: number, detail: string) => void): Promise<StopProof> {
  if (photos.length < 1 || !signerName.trim() || !signature.size) throw new Error("ต้องมีรูปอย่างน้อย 1 รูป ชื่อผู้เซ็น และลายเซ็น");
  if (signature.size > MAX_STORED_IMAGE_BYTES) throw new Error("ลายเซ็นมีขนาดเกิน 1 MB");
  onProgress?.(0, "กำลังเตรียมรูปหลักฐาน");
  const preparedPhotos: File[] = [];
  for (const [index, file] of photos.entries()) {
    if (!isImageFile(file) || file.size > MAX_SOURCE_IMAGE_BYTES) throw new Error("รูปสินค้าไม่ถูกต้องหรือมีขนาดเกินกำหนด");
    preparedPhotos.push(await compressImageForUpload(file));
    onProgress?.(Math.round((index + 1) / photos.length * 10), `เตรียมรูปสินค้า ${index + 1}/${photos.length} แล้ว`);
  }
  const uploadId = crypto.randomUUID();
  const assets = [...preparedPhotos.map((file, index) => {
    const extension = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
    return { file, path: `proof_of_delivery/${job.id}/${actor.uid}/${uploadId}-${stage}-${index}.${extension}`, name: `${stage}-photo-${index + 1}.${extension}`, kind: "photo" as const };
  }), { file: signature, path: `proof_of_delivery/${job.id}/${actor.uid}/${uploadId}-${stage}-signature.png`, name: `${stage}-signature.png`, kind: "signature" as const }];
  const uploadedBytes = assets.map(() => 0);
  const totalBytes = assets.reduce((sum, asset) => sum + asset.file.size, 0);
  let lastPercent = 10;
  const reportUpload = () => {
    const percent = Math.min(85, 10 + Math.floor(uploadedBytes.reduce((sum, bytes) => sum + bytes, 0) / totalBytes * 75));
    if (percent > lastPercent) {
      lastPercent = percent;
      onProgress?.(percent, "กำลังอัปโหลดรูปและลายเซ็น");
    }
  };
  for (const [index, asset] of assets.entries()) {
    onProgress?.(lastPercent, asset.kind === "signature" ? "กำลังอัปโหลดลายเซ็น" : `กำลังอัปโหลดรูปสินค้า ${index + 1}/${photos.length}`);
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        await uploadBytes(ref(storage, asset.path), asset.file, { contentType: asset.file.type || "image/png" });
        break;
      } catch (error) {
        const code = error && typeof error === "object" && "code" in error ? error.code : undefined;
        if (attempt === 2 || (code !== "storage/unknown" && code !== "storage/retry-limit-exceeded")) {
          throw await proofUploadError(job, stage, actor, "upload", asset.kind, index, asset.file.size, uploadedBytes[index], error);
        }
        await new Promise(resolve => window.setTimeout(resolve, 500 * (attempt + 1)));
      }
    }
    uploadedBytes[index] = asset.file.size;
    reportUpload();
  }
  onProgress?.(85, "อัปโหลดครบแล้ว กำลังลงทะเบียนหลักฐาน");
  const downloadUrls: string[] = [];
  for (const [index, asset] of assets.entries()) {
    try { downloadUrls.push(await getDownloadURL(ref(storage, asset.path))); }
    catch (error) { throw await proofUploadError(job, stage, actor, "download_url", asset.kind, index, asset.file.size, uploadedBytes[index], error); }
  }
  onProgress?.(90, "กำลังบันทึกข้อมูลหลักฐาน");
  const batch = writeBatch(db);
  assets.forEach((asset, index) => batch.set(doc(collection(db, "proof_of_delivery")), {
    jobId: job.id,
    organizationId: job.organizationId ?? actor.organizationId ?? "main",
    uploadedByUid: actor.uid,
    uploadedByName: actor.displayName,
    fileName: asset.name,
    storagePath: asset.path,
    downloadUrl: downloadUrls[index],
    contentType: asset.file.type || "image/png",
    size: asset.file.size,
    proofStage: stage,
    proofKind: asset.kind,
    ...(asset.kind === "signature" ? { signerName: signerName.trim() } : {}),
    createdAt: serverTimestamp()
  }));
  await batch.commit();
  onProgress?.(95, "หลักฐานครบแล้ว กำลังยืนยันขั้นตอนงาน");
  const photoPaths = assets.slice(0, -1).map(asset => asset.path);
  const signaturePath = assets[assets.length - 1].path;
  return { photoPaths, signaturePath, signerName: signerName.trim(), signedAt: new Date().toISOString() };
}

export async function addHandoverDocumentPhotos(job: TransportJob, actor: UserProfile, photos: File[], onProgress?: (percent: number, detail: string) => void): Promise<void> {
  if (job.assignedDriverUid !== actor.uid || !["ready_to_close", "completed"].includes(job.status === "problem" ? job.issuePreviousStatus ?? "problem" : job.status)) throw new Error("เพิ่มเอกสารนำส่งได้เฉพาะงานของคุณที่พร้อมจบหรือจบแล้ว");
  if (!photos.length || photos.length > 10 || (job.handoverDocumentPhotoPaths?.length ?? 0) + photos.length > 10) throw new Error("แนบเอกสารนำส่งได้รวมไม่เกิน 10 รูป");
  const uploadId = crypto.randomUUID();
  const assets: Array<{ path: string; file: File; url: string }> = [];
  for (const [index, source] of photos.entries()) {
    if (!isImageFile(source) || source.size <= 0 || source.size > MAX_SOURCE_IMAGE_BYTES) throw new Error("เอกสารนำส่งต้องเป็นรูปภาพที่มีขนาดไม่เกิน 20 MB ต่อรูป");
    const file = await compressImageForUpload(source);
    const extension = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
    const path = `proof_of_delivery/${job.id}/${actor.uid}/${uploadId}-handover-${index}.${extension}`;
    onProgress?.(Math.round(index / photos.length * 85), `กำลังอัปโหลดเอกสารนำส่ง ${index + 1}/${photos.length}`);
    const task = uploadBytesResumable(ref(storage, path), file, { contentType: file.type });
    await new Promise<void>((resolve, reject) => {
      let stalled = false;
      let lastBytes = 0;
      let timeout = window.setTimeout(() => { stalled = true; task.cancel(); }, 60_000);
      const clearTimer = () => window.clearTimeout(timeout);
      task.on("state_changed", snapshot => {
        onProgress?.(Math.round((index + snapshot.bytesTransferred / file.size) / photos.length * 85), `กำลังอัปโหลดเอกสารนำส่ง ${index + 1}/${photos.length}`);
        if (snapshot.bytesTransferred > lastBytes) {
          lastBytes = snapshot.bytesTransferred;
          clearTimer();
          timeout = window.setTimeout(() => { stalled = true; task.cancel(); }, 60_000);
        }
      }, error => { clearTimer(); reject(stalled ? new Error("อัปโหลดเอกสารหยุดค้าง กรุณาตรวจอินเทอร์เน็ตแล้วลองอีกครั้ง") : error); }, () => { clearTimer(); resolve(); });
    });
    assets.push({ path, file, url: await getDownloadURL(ref(storage, path)) });
  }
  onProgress?.(90, "กำลังบันทึกรายการเอกสารนำส่ง");
  const jobRef = doc(db, "today_jobs", job.id);
  await runTransaction(db, async transaction => {
    const snapshot = await transaction.get(jobRef);
    const current = snapshot.data();
    if (!current || current.assignedDriverUid !== actor.uid || !["ready_to_close", "completed"].includes(current.status === "problem" ? current.issuePreviousStatus : current.status)) throw new Error("สถานะใบงานเปลี่ยนไป กรุณาเปิดงานอีกครั้ง");
    const existing = Array.isArray(current.handoverDocumentPhotoPaths) ? current.handoverDocumentPhotoPaths as string[] : [];
    if (existing.length + assets.length > 10) throw new Error("เอกสารนำส่งครบ 10 รูปแล้ว กรุณาเปิดงานอีกครั้ง");
    transaction.update(jobRef, { handoverDocumentPhotoPaths: [...existing, ...assets.map(asset => asset.path)], updatedAt: serverTimestamp() });
    for (const [index, asset] of assets.entries()) transaction.set(doc(collection(db, "proof_of_delivery")), {
      jobId: job.id,
      organizationId: job.organizationId ?? actor.organizationId ?? "main",
      uploadedByUid: actor.uid,
      uploadedByName: actor.displayName,
      fileName: `handover-${index + 1}.${asset.file.type === "image/png" ? "png" : asset.file.type === "image/webp" ? "webp" : "jpg"}`,
      storagePath: asset.path,
      downloadUrl: asset.url,
      contentType: asset.file.type,
      size: asset.file.size,
      proofStage: "handover",
      proofKind: "photo",
      createdAt: serverTimestamp()
    });
  });
  onProgress?.(100, "บันทึกเอกสารนำส่งแล้ว");
}

export async function replaceStopProofPhoto(job: TransportJob, stage: "pickup" | "delivery" | "returnPickup" | "returnDelivery", index: number, file: File, actor: UserProfile) {
  const proof = job[`${stage}Proof`];
  const previousPath = proof?.photoPaths[index];
  if (!previousPath || !Number.isInteger(index) || index < 0) throw new Error("ไม่พบรูปที่ต้องการเปลี่ยน");
  if (!isImageFile(file) || file.size > MAX_SOURCE_IMAGE_BYTES) throw new Error("กรุณาเลือกรูปภาพที่มีขนาดไม่เกินกำหนด");
  const compressed = await compressImageForUpload(file);
  const extension = compressed.type === "image/png" ? "png" : compressed.type === "image/webp" ? "webp" : "jpg";
  const path = `proof_of_delivery/${job.id}/${actor.uid}/${Date.now()}-${crypto.randomUUID()}-${stage}-revision.${extension}`;
  const result = await uploadBytes(ref(storage, path), compressed, { contentType: compressed.type });
  const downloadUrl = await getDownloadURL(result.ref);
  const jobRef = doc(db, "today_jobs", job.id);
  const proofRef = doc(collection(db, "proof_of_delivery"));
  const eventRef = doc(collection(db, "job_events"));
  await runTransaction(db, async transaction => {
    const snapshot = await transaction.get(jobRef);
    if (!snapshot.exists()) throw new Error("ไม่พบใบงาน");
    const data = snapshot.data();
    if (data.assignedDriverUid !== actor.uid || data.status === "cancelled") throw new Error("ไม่สามารถแก้ไขรูปของงานนี้ได้");
    const current = data[`${stage}Proof`] as StopProof | undefined;
    if (current?.photoPaths[index] !== previousPath) throw new Error("รูปนี้ถูกเปลี่ยนไปแล้ว กรุณาโหลดหน้าใหม่");
    const photoPaths = [...current.photoPaths];
    photoPaths[index] = path;
    transaction.update(jobRef, { [`${stage}Proof`]: { ...current, photoPaths }, updatedAt: serverTimestamp() });
    transaction.set(proofRef, { jobId: job.id, organizationId: job.organizationId ?? actor.organizationId ?? "main", uploadedByUid: actor.uid, uploadedByName: actor.displayName, fileName: `${stage}-photo-${index + 1}-revision.${extension}`, storagePath: path, downloadUrl, contentType: compressed.type, size: compressed.size, proofStage: stage, proofKind: "photo_revision", replacesPath: previousPath, photoIndex: index, createdAt: serverTimestamp() });
    transaction.set(eventRef, { jobId: job.id, type: "proof_photo_replaced", message: `คนขับเปลี่ยนรูปหลักฐาน${stage.startsWith("return") ? "ขากลับ" : "ขาไป"}${stage.toLowerCase().includes("pickup") ? "จุดรับ" : "จุดส่ง"} รูปที่ ${index + 1}`, actorUid: actor.uid, actorName: actor.displayName, organizationId: job.organizationId ?? actor.organizationId ?? "main", timestamp: serverTimestamp(), metadata: { stage, index, previousPath, path, source: "driver_web" } });
  });
}

export async function reportDriverIssue(
  job: TransportJob,
  issueType: DriverIssueType,
  note: string,
  actor: UserProfile,
  photo?: { storagePath: string; downloadUrl: string }
) {
  const cleanNote = note.trim().slice(0, 500);
  if (issueType === "other" && !cleanNote) throw new Error("กรุณาระบุรายละเอียดของปัญหาอื่น ๆ");
  const jobRef = doc(db, "today_jobs", job.id);
  const eventRef = doc(collection(db, "job_events"));
  await runTransaction(db, async transaction => {
    const snapshot = await transaction.get(jobRef);
    if (!snapshot.exists()) throw new Error("ไม่พบใบงาน");
    const existing = snapshot.data();
    const previousStatus = existing.status === "problem"
      ? existing.issuePreviousStatus ?? "assigned"
      : existing.status;
    const message = `${driverIssueLabels[issueType]}${cleanNote ? `: ${cleanNote}` : ""}`;
    const alerts = Array.isArray(existing.alerts) ? [...existing.alerts, message].slice(-20) : [message];
    const lastIssue = { type: issueType, note: cleanNote, reportedAt: new Date().toISOString(), ...(photo ? { photoPath: photo.storagePath, photoUrl: photo.downloadUrl } : {}) };

    transaction.update(jobRef, {
      status: "problem",
      issuePreviousStatus: previousStatus,
      lastIssue,
      alerts,
      updatedAt: serverTimestamp()
    });
    transaction.set(eventRef, {
      jobId: job.id,
      type: "driver_issue",
      message,
      actorUid: actor.uid,
      actorName: actor.displayName,
      organizationId: job.organizationId ?? actor.organizationId ?? "main",
      lat: job.currentLocation.lat,
      lng: job.currentLocation.lng,
      timestamp: serverTimestamp(),
      metadata: { issueType, note: cleanNote, previousStatus, source: "driver_web", ...(photo ? { photoPath: photo.storagePath } : {}) }
    });
  });
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
  return { storagePath: objectPath, downloadUrl };
}

export async function createTrackingShareLink(job: TransportJob, actor: UserProfile, expiry?: Date) {
  if (!expiry) {
    const automaticLinks = await getDocs(query(
      collection(db, "tracking_share_links"),
      where("jobId", "==", job.id)
    ));
    const activeLink = automaticLinks.docs.find(link => link.data().organizationId === (job.organizationId ?? actor.organizationId ?? "main")
      && ["line_job_created", "job_created"].includes(link.data().source)
      && link.data().enabled === true
      && (link.data().expiresAt?.toMillis?.() ?? 0) > Date.now());
    if (activeLink) return activeLink.id;
  }
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
    where("jobId", "==", job.id)
  ));

  if (activeLinks.empty) return;

  const batch = writeBatch(db);
  activeLinks.docs.filter(linkDoc => linkDoc.data().enabled === true && (linkDoc.data().expiresAt?.toMillis?.() ?? 0) > Date.now()).forEach((linkDoc) => batch.update(linkDoc.ref, {
    statusLabel: job.returnTrip ? `${status === "to_pickup" || job.activeLeg === 2 ? "ขากลับ" : "ขาไป"} · ${statusLabels[status]}` : statusLabels[status],
    eta: job.returnTrip && (status === "to_pickup" || job.activeLeg === 2) ? `${job.returnTrip.deliveryDate} ${job.returnTrip.deliveryTime}` : job.eta,
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
    historical: data.historical === true,
    recordedAt: timestampToIso(data.createdAt),
    historicalEvidence: data.historicalEvidence ?? undefined,
    customer: data.customer ?? "-",
    customerId: data.customerId ?? undefined,
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
    originOrganizationId: data.originOrganizationId ?? undefined,
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
    cancelledAt: timestampToIso(data.cancelledAt ?? data.deletedAt),
    issuePreviousStatus: data.issuePreviousStatus ?? undefined,
    lastIssue: data.lastIssue ?? undefined,
    pickupProof: data.pickupProof ?? undefined,
    deliveryProof: data.deliveryProof ?? undefined,
    returnTrip: data.returnTrip ?? undefined,
    activeLeg: data.activeLeg === 2 ? 2 : 1,
    returnPickupProof: data.returnPickupProof ?? undefined,
    returnDeliveryProof: data.returnDeliveryProof ?? undefined,
    handoverDocumentPhotoPaths: Array.isArray(data.handoverDocumentPhotoPaths) ? data.handoverDocumentPhotoPaths.filter((path: unknown): path is string => typeof path === "string") : undefined,
    returnArrivedDeliveryAt: timestampToIso(data.returnArrivedDeliveryAt),
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

export function canReceiveDriverJobs(profile: Pick<UserProfile, "role" | "active" | "approvalStatus" | "organizationId">, organizationId: string) {
  return ["driver", "owner", "admin", "dispatcher", "subcontract_admin"].includes(profile.role)
    && profile.active && profile.approvalStatus === "approved" && profile.organizationId === organizationId;
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
          customerId: data.customerId ?? null,
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
          customerId: data.customerId ?? null,
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
