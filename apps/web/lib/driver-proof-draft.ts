export type DriverProofDraft = {
  photos: (File | null)[];
  signerName: string;
  signature: Blob | null;
};

const DATABASE_NAME = "sfast-driver-proof-drafts";
const STORE_NAME = "drafts";
const pendingWrites = new Map<string, Promise<void>>();
let databasePromise: Promise<IDBDatabase> | null = null;

function database() {
  if (!databasePromise) {
    databasePromise = new Promise<IDBDatabase>((resolve, reject) => {
      if (typeof indexedDB === "undefined") {
        reject(new Error("อุปกรณ์นี้ไม่รองรับการบันทึกแบบร่างในเครื่อง"));
        return;
      }
      const request = indexedDB.open(DATABASE_NAME, 1);
      request.onupgradeneeded = () => request.result.createObjectStore(STORE_NAME);
      request.onblocked = () => reject(new Error("ที่เก็บแบบร่างถูกใช้งานอยู่ กรุณาปิดหน้าแอปอื่น"));
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error("เปิดที่เก็บแบบร่างไม่ได้"));
    }).catch(error => {
      databasePromise = null;
      throw error;
    });
  }
  return databasePromise;
}

function queueWrite(key: string, action: () => Promise<void>) {
  const previous = pendingWrites.get(key) ?? Promise.resolve();
  const next = previous.catch(() => undefined).then(action);
  pendingWrites.set(key, next);
  void next.finally(() => {
    if (pendingWrites.get(key) === next) pendingWrites.delete(key);
  }).catch(() => undefined);
  return next;
}

export async function loadDriverProofDraft(key: string): Promise<DriverProofDraft | null> {
  await pendingWrites.get(key)?.catch(() => undefined);
  const db = await database();
  return new Promise((resolve, reject) => {
    const request = db.transaction(STORE_NAME, "readonly").objectStore(STORE_NAME).get(key);
    request.onsuccess = () => resolve(request.result ?? null);
    request.onerror = () => reject(request.error ?? new Error("อ่านแบบร่างไม่ได้"));
  });
}

export function saveDriverProofDraft(key: string, draft: DriverProofDraft) {
  return queueWrite(key, async () => {
    const db = await database();
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, "readwrite");
      transaction.objectStore(STORE_NAME).put(draft, key);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error("บันทึกแบบร่างไม่ได้"));
      transaction.onabort = () => reject(transaction.error ?? new Error("บันทึกแบบร่างไม่ได้"));
    });
  });
}

export function deleteDriverProofDraft(key: string) {
  return queueWrite(key, async () => {
    const db = await database();
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, "readwrite");
      transaction.objectStore(STORE_NAME).delete(key);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error("ลบแบบร่างไม่ได้"));
      transaction.onabort = () => reject(transaction.error ?? new Error("ลบแบบร่างไม่ได้"));
    });
  });
}
