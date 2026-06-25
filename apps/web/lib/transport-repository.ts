import {
  addDoc,
  collection,
  doc,
  getDoc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  type DocumentData,
  type Unsubscribe
} from "firebase/firestore";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { db, storage } from "./firebase";
import { sampleJobs, statusLabels, type JobStatus, type TransportJob } from "@s-fast-transport/shared";

export type UserRole = "owner" | "admin" | "dispatcher" | "driver";

export type UserProfile = {
  uid: string;
  email: string;
  displayName: string;
  role: UserRole;
  active: boolean;
};

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
  const jobsQuery = profile.role === "driver" ? query(jobsRef, where("assignedDriverUid", "==", profile.uid)) : jobsRef;

  return onSnapshot(
    jobsQuery,
    (snapshot) => {
      const jobs = snapshot.docs
        .map((jobDoc) => toTransportJob(jobDoc.id, jobDoc.data()))
        .sort((a, b) => b.id.localeCompare(a.id));
      onJobs(jobs.length > 0 ? jobs : sampleJobs);
    },
    (error) => {
      onError(error.message);
      onJobs(sampleJobs);
    }
  );
}

export async function getUserProfile(uid: string): Promise<UserProfile | null> {
  const profileSnap = await getDoc(doc(db, "users", uid));
  if (!profileSnap.exists()) {
    return null;
  }

  return { uid, ...profileSnap.data() } as UserProfile;
}

export async function ensureDriverProfile(uid: string, email: string, displayName: string) {
  const profileRef = doc(db, "users", uid);
  const existing = await getDoc(profileRef);

  if (!existing.exists()) {
    await setDoc(profileRef, {
      email,
      displayName: displayName || email,
      role: "driver",
      active: true,
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
    lat: job.currentLocation.lat,
    lng: job.currentLocation.lng,
    timestamp: serverTimestamp(),
    metadata: { status }
  });
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
    timestamp: serverTimestamp(),
    metadata: { storagePath: objectPath }
  });
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
    alerts: Array.isArray(data.alerts) ? data.alerts : []
  };
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
