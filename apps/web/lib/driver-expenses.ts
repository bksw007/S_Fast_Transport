import { collection, deleteField, doc, getDoc, onSnapshot, query, runTransaction, serverTimestamp, where, type DocumentData, type Unsubscribe } from "firebase/firestore";
import { deleteObject, getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { jobHistoryMonth, type TransportJob } from "@s-fast-transport/shared";
import { db, storage } from "./firebase";
import { compressImageForUpload, isImageFile, MAX_SOURCE_IMAGE_BYTES } from "./image-upload";
import { hasApprovedAccess, isMainAdmin, type UserProfile } from "./transport-repository";

export type ExpenseStatus = "pending" | "approved" | "rejected" | "paid";
export type OtherExpenseCategory = "repair" | "equipment" | "wash" | "other";
export const otherExpenseCategories: { value: OtherExpenseCategory; label: string }[] = [
  { value: "repair", label: "ค่าซ่อมรถ" },
  { value: "equipment", label: "ค่าอุปกรณ์" },
  { value: "wash", label: "ค่าล้างรถ" },
  { value: "other", label: "อื่นๆ" }
];
export function expenseTitle(expense: Pick<DriverExpense, "expenseKind" | "category" | "workOrder">) {
  return expense.expenseKind === "other" ? otherExpenseCategories.find(item => item.value === expense.category)?.label || "ค่าใช้จ่ายอื่น" : `ใบงาน ${expense.workOrder}`;
}
export type DriverExpense = {
  id: string;
  jobId: string;
  workOrder: string;
  organizationId: string;
  driverUid: string;
  driverName: string;
  completedMonth: string;
  amount: number;
  note: string;
  receiptPaths: string[];
  status: ExpenseStatus;
  reviewNote: string;
  createdAt: string;
  updatedAt: string;
  expenseKind?: "other";
  category?: OtherExpenseCategory;
  expenseDate?: string;
  vehiclePlate?: string;
};

const claimId = (jobId: string, driverUid: string) => `${jobId}_${driverUid}`;

function asIso(value: unknown): string {
  if (value && typeof value === "object" && "toDate" in value && typeof value.toDate === "function") return value.toDate().toISOString();
  return "";
}

function fromDocument(id: string, data: DocumentData): DriverExpense {
  return {
    id,
    jobId: String(data.jobId ?? ""),
    workOrder: String(data.workOrder ?? ""),
    organizationId: String(data.organizationId ?? ""),
    driverUid: String(data.driverUid ?? ""),
    driverName: String(data.driverName ?? ""),
    completedMonth: String(data.completedMonth ?? ""),
    amount: Number(data.amount) || 0,
    note: String(data.note ?? ""),
    receiptPaths: Array.isArray(data.receiptPaths) ? data.receiptPaths.filter((path: unknown): path is string => typeof path === "string") : [],
    status: ["pending", "approved", "rejected", "paid"].includes(data.status) ? data.status : "pending",
    reviewNote: String(data.reviewNote ?? ""),
    createdAt: asIso(data.createdAt),
    updatedAt: asIso(data.updatedAt),
    expenseKind: data.expenseKind === "other" ? "other" : undefined,
    category: otherExpenseCategories.find(item => item.value === data.category)?.value,
    expenseDate: typeof data.expenseDate === "string" ? data.expenseDate : undefined,
    vehiclePlate: typeof data.vehiclePlate === "string" ? data.vehiclePlate : undefined
  };
}

function matchesExpenseVersion(data: DocumentData, expected: DriverExpense) {
  return data.status === expected.status
    && asIso(data.updatedAt) === expected.updatedAt
    && JSON.stringify(data.receiptPaths) === JSON.stringify(expected.receiptPaths);
}

export function subscribeDriverExpenses(actor: UserProfile, adminView: boolean, onChange: (items: DriverExpense[]) => void, onError: (message: string) => void): Unsubscribe {
  if (!hasApprovedAccess(actor)) throw new Error("ไม่มีสิทธิ์ดูค่าใช้จ่าย");
  const expenses = collection(db, "driver_expenses");
  const source = adminView
    ? isMainAdmin(actor) ? expenses : query(expenses, where("organizationId", "==", actor.organizationId || "__none__"))
    : query(expenses, where("driverUid", "==", actor.uid));
  return onSnapshot(source, snapshot => {
    onChange(snapshot.docs.map(item => fromDocument(item.id, item.data())).sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
  }, error => onError(error.message));
}

export async function submitDriverExpense(job: TransportJob, actor: UserProfile, amount: number, note: string, receipts: File[], keptReceiptPaths: string[] = [], existing?: DriverExpense) {
  const organizationId = job.organizationId || "main";
  if (!hasApprovedAccess(actor) || job.assignedDriverUid !== actor.uid || job.status !== "completed" || organizationId !== actor.organizationId) throw new Error("เลือกได้เฉพาะงานของคุณที่จบแล้ว");
  const roundedAmount = Math.round(amount * 100) / 100;
  if (!Number.isFinite(roundedAmount) || roundedAmount <= 0 || roundedAmount > 1_000_000) throw new Error("กรุณาระบุค่าใช้จ่ายระหว่าง 0.01 ถึง 1,000,000 บาท");
  if (receipts.length + keptReceiptPaths.length < 1 || receipts.length + keptReceiptPaths.length > 5) throw new Error("กรุณาแนบรูปบิล 1–5 รูป");
  if (note.trim().length > 500) throw new Error("รายละเอียดต้องไม่เกิน 500 ตัวอักษร");
  const expenseRef = doc(db, "driver_expenses", claimId(job.id, actor.uid));
  const saved = await getDoc(expenseRef);
  if (existing && (existing.id !== expenseRef.id || existing.driverUid !== actor.uid || existing.expenseKind === "other")) throw new Error("รายการนี้แก้ไขไม่ได้");
  if (saved.exists() !== Boolean(existing) || saved.exists() && existing && !matchesExpenseVersion(saved.data(), existing)) throw new Error("รายการมีการเปลี่ยนแปลง กรุณาโหลดใหม่");
  if (keptReceiptPaths.some(path => !existing?.receiptPaths.includes(path)) || new Set(keptReceiptPaths).size !== keptReceiptPaths.length) throw new Error("รูปบิลเดิมไม่ถูกต้อง");

  const uploadedPaths: string[] = [];
  try {
    for (const file of receipts) {
      if (!isImageFile(file) || file.size <= 0 || file.size > MAX_SOURCE_IMAGE_BYTES) throw new Error("รูปบิลต้องเป็น JPG, PNG หรือ WEBP และไม่เกิน 20 MB ต่อรูป");
      const prepared = await compressImageForUpload(file);
      const path = `driver_expenses/${job.id}/${actor.uid}/${crypto.randomUUID()}.${prepared.type === "image/jpeg" ? "jpg" : prepared.type === "image/png" ? "png" : "webp"}`;
      await uploadBytes(ref(storage, path), prepared, { contentType: prepared.type });
      uploadedPaths.push(path);
    }
    await runTransaction(db, async transaction => {
      const current = await transaction.get(expenseRef);
      if (current.exists() !== Boolean(existing) || current.exists() && existing && !matchesExpenseVersion(current.data(), existing)) throw new Error("รายการมีการเปลี่ยนแปลง กรุณาโหลดใหม่");
      const editable = {
        amount: roundedAmount,
        note: note.trim(),
        receiptPaths: [...keptReceiptPaths, ...uploadedPaths],
        status: "pending" as const,
        reviewNote: "",
        updatedAt: serverTimestamp(),
        reviewedByUid: deleteField(),
        reviewedByName: deleteField(),
        reviewedAt: deleteField()
      };
      if (current.exists()) transaction.update(expenseRef, editable);
      else transaction.set(expenseRef, {
        amount: roundedAmount, note: note.trim(), receiptPaths: uploadedPaths,
        status: "pending", reviewNote: "", updatedAt: serverTimestamp(),
        jobId: job.id,
        workOrder: job.workOrder,
        organizationId,
        driverUid: actor.uid,
        driverName: actor.fullName || actor.displayName,
        completedMonth: jobHistoryMonth(job),
        createdAt: serverTimestamp()
      });
    });
  } catch (error) {
    await Promise.allSettled(uploadedPaths.map(path => deleteObject(ref(storage, path))));
    throw error;
  }
  if (existing) await Promise.allSettled(existing.receiptPaths.filter(path => !keptReceiptPaths.includes(path)).map(path => deleteObject(ref(storage, path))));
}

export async function submitOtherDriverExpense(actor: UserProfile, category: OtherExpenseCategory, expenseDate: string, vehiclePlate: string, amount: number, note: string, receipts: File[], keptReceiptPaths: string[] = [], existing?: DriverExpense) {
  if (!hasApprovedAccess(actor) || actor.role === "customer" || !actor.organizationId) throw new Error("ไม่มีสิทธิ์แจ้งค่าใช้จ่าย");
  if (!otherExpenseCategories.some(item => item.value === category)) throw new Error("กรุณาเลือกประเภทค่าใช้จ่าย");
  const parsedDate = new Date(`${expenseDate}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(expenseDate) || Number.isNaN(parsedDate.valueOf()) || parsedDate.toISOString().slice(0, 10) !== expenseDate || expenseDate > new Date(Date.now() + 7 * 60 * 60 * 1000).toISOString().slice(0, 10)) throw new Error("กรุณาระบุวันที่ค่าใช้จ่ายที่ถูกต้อง");
  if (vehiclePlate.trim().length > 40) throw new Error("ทะเบียนรถต้องไม่เกิน 40 ตัวอักษร");
  const roundedAmount = Math.round(amount * 100) / 100;
  if (!Number.isFinite(roundedAmount) || roundedAmount <= 0 || roundedAmount > 1_000_000) throw new Error("กรุณาระบุค่าใช้จ่ายระหว่าง 0.01 ถึง 1,000,000 บาท");
  if (receipts.length + keptReceiptPaths.length < 1 || receipts.length + keptReceiptPaths.length > 5) throw new Error("กรุณาแนบรูปบิล 1–5 รูป");
  if (note.trim().length > 500) throw new Error("รายละเอียดต้องไม่เกิน 500 ตัวอักษร");
  const jobId = existing?.jobId || `other_${crypto.randomUUID()}`;
  if (existing && (existing.expenseKind !== "other" || existing.driverUid !== actor.uid || existing.id !== claimId(jobId, actor.uid))) throw new Error("รายการนี้แก้ไขไม่ได้");
  if (keptReceiptPaths.some(path => !existing?.receiptPaths.includes(path)) || new Set(keptReceiptPaths).size !== keptReceiptPaths.length) throw new Error("รูปบิลเดิมไม่ถูกต้อง");
  const expenseRef = doc(db, "driver_expenses", claimId(jobId, actor.uid));
  const uploadedPaths: string[] = [];
  try {
    for (const file of receipts) {
      if (!isImageFile(file) || file.size <= 0 || file.size > MAX_SOURCE_IMAGE_BYTES) throw new Error("รูปบิลต้องเป็น JPG, PNG หรือ WEBP และไม่เกิน 20 MB ต่อรูป");
      const prepared = await compressImageForUpload(file);
      const path = `driver_expenses/${jobId}/${actor.uid}/${crypto.randomUUID()}.${prepared.type === "image/jpeg" ? "jpg" : prepared.type === "image/png" ? "png" : "webp"}`;
      await uploadBytes(ref(storage, path), prepared, { contentType: prepared.type });
      uploadedPaths.push(path);
    }
    await runTransaction(db, async transaction => {
      const current = await transaction.get(expenseRef);
      if (current.exists() !== Boolean(existing) || current.exists() && existing && !matchesExpenseVersion(current.data(), existing)) throw new Error("รายการมีการเปลี่ยนแปลง กรุณาโหลดใหม่");
      const editable = { amount: roundedAmount, note: note.trim(), receiptPaths: [...keptReceiptPaths, ...uploadedPaths], status: "pending" as const, reviewNote: "", updatedAt: serverTimestamp(), category, expenseDate, vehiclePlate: vehiclePlate.trim(), completedMonth: expenseDate.slice(0, 7), reviewedByUid: deleteField(), reviewedByName: deleteField(), reviewedAt: deleteField() };
      if (current.exists()) transaction.update(expenseRef, editable);
      else transaction.set(expenseRef, {
        amount: roundedAmount, note: note.trim(), receiptPaths: uploadedPaths, status: "pending", reviewNote: "", updatedAt: serverTimestamp(), jobId, workOrder: "ค่าใช้จ่ายอื่น", organizationId: actor.organizationId,
        driverUid: actor.uid, driverName: actor.fullName || actor.displayName,
        completedMonth: expenseDate.slice(0, 7), expenseKind: "other", category,
        expenseDate, vehiclePlate: vehiclePlate.trim(), createdAt: serverTimestamp()
      });
    });
  } catch (error) {
    await Promise.allSettled(uploadedPaths.map(path => deleteObject(ref(storage, path))));
    throw error;
  }
  if (existing) await Promise.allSettled(existing.receiptPaths.filter(path => !keptReceiptPaths.includes(path)).map(path => deleteObject(ref(storage, path))));
}

export async function reviewDriverExpense(expense: DriverExpense, actor: UserProfile, status: "approved" | "rejected", reviewNote: string) {
  if (!hasApprovedAccess(actor) || !(isMainAdmin(actor) || actor.role === "subcontract_admin" && actor.organizationId === expense.organizationId)) throw new Error("ไม่มีสิทธิ์ตรวจค่าใช้จ่าย");
  if (reviewNote.trim().length > 500) throw new Error("หมายเหตุต้องไม่เกิน 500 ตัวอักษร");
  await runTransaction(db, async transaction => {
    const target = doc(db, "driver_expenses", expense.id);
    const current = await transaction.get(target);
    if (!current.exists()) throw new Error("ไม่พบรายการค่าใช้จ่าย");
    const previous = current.data().status;
    if (previous !== "pending") throw new Error("สถานะรายการเปลี่ยนแล้ว กรุณาโหลดใหม่");
    transaction.update(target, {
      status,
      reviewNote: reviewNote.trim(),
      reviewedByUid: actor.uid,
      reviewedByName: actor.fullName || actor.displayName,
      reviewedAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
  });
}

export async function getExpenseReceiptUrl(path: string) {
  return getDownloadURL(ref(storage, path));
}
