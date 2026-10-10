import { initializeApp } from "firebase-admin/app";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import { logger } from "firebase-functions";
import { onDocumentCreated } from "firebase-functions/v2/firestore";

initializeApp();

const db = getFirestore();

export const removeReplacedProofPhoto = onDocumentCreated({
  document: "job_events/{eventId}",
  region: "asia-southeast1",
  retry: true
}, async event => {
  const record = event.data;
  const data = record?.data();
  if (!record || data?.type !== "proof_photo_replaced" || data.cleanupAt) return;
  const jobId = String(data.jobId ?? "");
  const stage = data.metadata?.stage;
  const previousPath = data.metadata?.previousPath;
  const replacementPath = data.metadata?.path;
  if (!jobId || !["pickup", "delivery"].includes(stage)
    || typeof previousPath !== "string" || typeof replacementPath !== "string"
    || previousPath === replacementPath
    || !previousPath.startsWith(`proof_of_delivery/${jobId}/`)
    || !replacementPath.startsWith(`proof_of_delivery/${jobId}/`)) {
    logger.error("Invalid proof photo replacement event", { eventId: record.id });
    return;
  }

  const job = await db.collection("today_jobs").doc(jobId).get();
  if (!job.exists) return;
  const currentPaths = [
    ...(job.data()?.pickupProof?.photoPaths ?? []),
    ...(job.data()?.deliveryProof?.photoPaths ?? [])
  ];
  if (currentPaths.includes(previousPath)) {
    logger.warn("Proof photo is still in use; cleanup deferred", { jobId, previousPath });
    return;
  }

  const [oldRecords, revisionRecords] = await Promise.all([
    db.collection("proof_of_delivery").where("storagePath", "==", previousPath).get(),
    db.collection("proof_of_delivery").where("storagePath", "==", replacementPath).get()
  ]);
  const validRevision = revisionRecords.docs.some(doc => {
    const proof = doc.data();
    return proof.jobId === jobId && proof.proofStage === stage
      && proof.proofKind === "photo_revision" && proof.replacesPath === previousPath;
  });
  if (!validRevision || oldRecords.docs.some(doc => {
    const proof = doc.data();
    return proof.jobId !== jobId || proof.proofStage !== stage || !["photo", "photo_revision"].includes(proof.proofKind);
  })) {
    logger.error("Proof photo cleanup failed validation", { jobId, previousPath, eventId: record.id });
    return;
  }

  await getStorage().bucket().file(previousPath).delete({ ignoreNotFound: true });
  const batch = db.batch();
  oldRecords.docs.forEach(doc => batch.delete(doc.ref));
  batch.update(record.ref, { cleanupAt: FieldValue.serverTimestamp() });
  await batch.commit();
});
