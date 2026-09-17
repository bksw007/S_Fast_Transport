import {
  addDoc,
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  type DocumentData,
  type Unsubscribe
} from "firebase/firestore";
import type { JobPlace } from "@s-fast-transport/shared";
import { db } from "./firebase";
import { canManageOrganizationLists, type UserProfile } from "./transport-repository";

export type SavedLocation = JobPlace & {
  id: string;
  organizationId: string;
  notes: string;
  active: boolean;
};

export type LocationDraft = Omit<SavedLocation, "id" | "organizationId" | "active">;

function locationsCollection(organizationId: string) {
  return collection(db, "organizations", organizationId, "locations");
}

function cleanText(value: string, maximum: number) {
  const clean = value.trim().replace(/\s+/g, " ");
  if (clean.length > maximum) throw new Error(`ข้อมูลต้องไม่เกิน ${maximum} ตัวอักษร`);
  return clean;
}

function validateDraft(draft: LocationDraft) {
  const name = cleanText(draft.name, 160);
  if (!name) throw new Error("กรุณาตั้งชื่อสถานที่");
  if (!Number.isFinite(draft.lat) || Math.abs(draft.lat) > 90 || !Number.isFinite(draft.lng) || Math.abs(draft.lng) > 180) {
    throw new Error("พิกัดสถานที่ไม่ถูกต้อง");
  }
  for (const url of [draft.originalMapsUrl, draft.navigationUrl]) {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:") throw new Error("ลิงก์แผนที่ต้องเป็น HTTPS");
  }
  return {
    name,
    googleName: cleanText(draft.googleName || "", 200),
    originalMapsUrl: draft.originalMapsUrl,
    navigationUrl: draft.navigationUrl,
    lat: draft.lat,
    lng: draft.lng,
    ...(draft.googlePlaceId ? { googlePlaceId: cleanText(draft.googlePlaceId, 300) } : {}),
    notes: cleanText(draft.notes || "", 500)
  };
}

function toSavedLocation(id: string, data: DocumentData): SavedLocation {
  return {
    id,
    organizationId: String(data.organizationId ?? ""),
    name: String(data.name ?? "สถานที่"),
    googleName: data.googleName ? String(data.googleName) : undefined,
    originalMapsUrl: String(data.originalMapsUrl ?? ""),
    navigationUrl: String(data.navigationUrl ?? data.originalMapsUrl ?? ""),
    lat: Number(data.lat),
    lng: Number(data.lng),
    googlePlaceId: data.googlePlaceId ? String(data.googlePlaceId) : undefined,
    notes: String(data.notes ?? ""),
    active: data.active !== false
  };
}

export function subscribeSavedLocations(
  organizationId: string,
  onItems: (items: SavedLocation[]) => void,
  onError: (message: string) => void
): Unsubscribe {
  return onSnapshot(
    query(locationsCollection(organizationId), orderBy("name")),
    (snapshot) => onItems(snapshot.docs.map((item) => toSavedLocation(item.id, item.data()))),
    (error) => onError(error.message)
  );
}

function assertCanManage(actor: UserProfile, organizationId: string) {
  if (!canManageOrganizationLists(actor, organizationId)) throw new Error("คุณไม่มีสิทธิ์จัดการสถานที่ของบริษัทนี้");
}

export async function createSavedLocation(organizationId: string, draft: LocationDraft, actor: UserProfile) {
  assertCanManage(actor, organizationId);
  const clean = validateDraft(draft);
  const created = await addDoc(locationsCollection(organizationId), {
    ...clean,
    organizationId,
    active: true,
    createdByUid: actor.uid,
    updatedByUid: actor.uid,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });
  return created.id;
}

export async function updateSavedLocation(organizationId: string, id: string, draft: LocationDraft, actor: UserProfile) {
  assertCanManage(actor, organizationId);
  await updateDoc(doc(db, "organizations", organizationId, "locations", id), {
    ...validateDraft(draft),
    updatedByUid: actor.uid,
    updatedAt: serverTimestamp()
  });
}

export async function setSavedLocationActive(organizationId: string, id: string, active: boolean, actor: UserProfile) {
  assertCanManage(actor, organizationId);
  await updateDoc(doc(db, "organizations", organizationId, "locations", id), {
    active,
    updatedByUid: actor.uid,
    updatedAt: serverTimestamp()
  });
}

export function savedLocationToJobPlace(location: SavedLocation): JobPlace {
  const { id, name, googleName, originalMapsUrl, navigationUrl, lat, lng, googlePlaceId } = location;
  return {
    locationId: id,
    name,
    ...(googleName ? { googleName } : {}),
    originalMapsUrl,
    navigationUrl,
    lat,
    lng,
    ...(googlePlaceId ? { googlePlaceId } : {})
  };
}

export function selectSavedLocation(id: string, locations: SavedLocation[]) {
  const location = locations.find((item) => item.id === id && item.active);
  return location ? { name: location.name, place: savedLocationToJobPlace(location) } : null;
}
