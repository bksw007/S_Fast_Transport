import { collection, onSnapshot, query, where, type Unsubscribe } from "firebase/firestore";
import { getFunctions, httpsCallable } from "firebase/functions";
import type { JobPlace } from "@s-fast-transport/shared";
import { db, firebaseApp } from "./firebase";
import type { UserProfile } from "./transport-repository";

export type CustomerJobRequestStatus = "pending" | "accepted" | "rejected";

export type CustomerJobRequest = {
  id: string;
  customerId: string;
  customerName: string;
  requesterUid: string;
  requesterName: string;
  requesterEmail: string;
  recipientEmails: string[];
  companyEmail: string;
  pickupPlace: JobPlace;
  deliveryPlace: JobPlace;
  pickupDate: string;
  pickupTime: string;
  deliveryDate: string;
  deliveryTime: string;
  cargoType: string;
  vehicleType: string;
  notes: string;
  status: CustomerJobRequestStatus;
  rejectionReason?: string;
  jobId?: string;
  workOrder?: string;
  createdAt?: { toMillis(): number };
  decidedAt?: { toMillis(): number };
};

export type CustomerJobRequestDraft = Pick<CustomerJobRequest,
  "pickupPlace" | "deliveryPlace" | "pickupDate" | "pickupTime" | "deliveryDate" | "deliveryTime" | "cargoType" | "vehicleType" | "notes" | "recipientEmails"
>;

const functions = getFunctions(firebaseApp, "asia-southeast1");

function toRequest(id: string, data: Record<string, unknown>): CustomerJobRequest {
  return { ...data, id } as CustomerJobRequest;
}

export function subscribeCustomerJobRequests(profile: UserProfile, onItems: (items: CustomerJobRequest[]) => void, onError: (message: string) => void): Unsubscribe {
  const requests = collection(db, "customer_job_requests");
  const source = profile.role === "customer"
    ? query(requests, where("customerId", "==", profile.customerId || "__none__"))
    : requests;
  return onSnapshot(source, snapshot => {
    onItems(snapshot.docs.map(item => toRequest(item.id, item.data())).sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0)));
  }, error => onError(error.message));
}

export async function submitCustomerJobRequest(draft: CustomerJobRequestDraft): Promise<string> {
  const call = httpsCallable<CustomerJobRequestDraft, { id: string }>(functions, "submitCustomerJobRequest");
  return (await call(draft)).data.id;
}

export async function rejectCustomerJobRequest(id: string, reason: string): Promise<void> {
  const call = httpsCallable<{ id: string; reason: string }, { ok: boolean }>(functions, "rejectCustomerJobRequest");
  await call({ id, reason });
}
