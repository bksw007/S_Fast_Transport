import { doc, serverTimestamp, updateDoc } from "firebase/firestore";
import { getBlob, getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { db, storage } from "./firebase";

export const nameTitles = ["นาย", "นาง", "นางสาว"] as const;
export type NameTitle = (typeof nameTitles)[number];
export type PersonalDocumentKind = "id-card-front" | "driver-license-front";

export type PersonalProfileDraft = {
  title: NameTitle | "";
  firstName: string;
  lastName: string;
  phone: string;
  licenseNumber: string;
  licenseType: string;
  licenseExpiry: string;
};

export type PersonalProfileFiles = {
  photoURL?: string;
  profilePhotoPath?: string;
  idCardFrontPath?: string;
  idCardFrontFileName?: string;
  driverLicenseFrontPath?: string;
  driverLicenseFrontFileName?: string;
};

const imageTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
const documentTypes = new Set([...imageTypes, "application/pdf"]);

function cleanText(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

function safeObjectName(file: File) {
  const extension = file.name.split(".").pop()?.toLocaleLowerCase().replace(/[^a-z0-9]/g, "") || "bin";
  return `${Date.now()}-${crypto.randomUUID()}.${extension}`;
}

function validateFile(file: File, allowedTypes: Set<string>, maxBytes: number, label: string) {
  if (!allowedTypes.has(file.type)) throw new Error(`${label}รองรับเฉพาะ JPG, PNG, WEBP${allowedTypes.has("application/pdf") ? " หรือ PDF" : ""}`);
  if (file.size <= 0 || file.size > maxBytes) throw new Error(`${label}ต้องมีขนาดไม่เกิน ${Math.floor(maxBytes / 1024 / 1024)} MB`);
}

export async function uploadProfilePhoto(uid: string, file: File) {
  validateFile(file, imageTypes, 5 * 1024 * 1024, "รูปโปรไฟล์");
  const storagePath = `user_profiles/${uid}/profile/${safeObjectName(file)}`;
  const result = await uploadBytes(ref(storage, storagePath), file, { contentType: file.type });
  return { storagePath, photoURL: await getDownloadURL(result.ref) };
}

export async function uploadPersonalDocument(uid: string, kind: PersonalDocumentKind, file: File) {
  validateFile(file, documentTypes, 5 * 1024 * 1024, "เอกสาร");
  const storagePath = `user_documents/${uid}/${kind}/${safeObjectName(file)}`;
  await uploadBytes(ref(storage, storagePath), file, { contentType: file.type });
  return { storagePath, fileName: cleanText(file.name).slice(0, 120) };
}

export async function downloadPrivateDocument(storagePath: string, fileName: string) {
  if (!storagePath.startsWith("user_documents/")) throw new Error("ตำแหน่งเอกสารไม่ถูกต้อง");
  const blob = await getBlob(ref(storage, storagePath), 5 * 1024 * 1024);
  const objectURL = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = objectURL;
  link.download = cleanText(fileName) || "document";
  link.rel = "noopener";
  link.click();
  setTimeout(() => URL.revokeObjectURL(objectURL), 1_000);
}

export async function updateOwnProfile(uid: string, draft: PersonalProfileDraft, files: PersonalProfileFiles = {}) {
  const title = cleanText(draft.title);
  const firstName = cleanText(draft.firstName);
  const lastName = cleanText(draft.lastName);
  if (!nameTitles.includes(title as NameTitle)) throw new Error("กรุณาเลือกคำนำหน้าชื่อ");
  if (!firstName || firstName.length > 50) throw new Error("กรุณากรอกชื่อจริงไม่เกิน 50 ตัวอักษร");
  if (!lastName || lastName.length > 50) throw new Error("กรุณากรอกนามสกุลจริงไม่เกิน 50 ตัวอักษร");
  const fullName = `${title}${firstName} ${lastName}`;

  await updateDoc(doc(db, "users", uid), {
    title,
    firstName,
    lastName,
    fullName,
    displayName: fullName,
    phone: cleanText(draft.phone).slice(0, 30),
    licenseNumber: cleanText(draft.licenseNumber).slice(0, 50),
    licenseType: cleanText(draft.licenseType).slice(0, 30),
    licenseExpiry: draft.licenseExpiry,
    ...files,
    updatedAt: serverTimestamp()
  });
}
