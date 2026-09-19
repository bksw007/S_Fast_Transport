import { browserLocalPersistence, getAuth, setPersistence } from "firebase/auth";
import { firebaseApp } from "./firebase";

export const auth = getAuth(firebaseApp);

let authPersistencePromise: Promise<void> | null = null;

export function ensureLocalAuthPersistence() {
  if (!authPersistencePromise) {
    authPersistencePromise = setPersistence(auth, browserLocalPersistence);
  }

  return authPersistencePromise;
}
