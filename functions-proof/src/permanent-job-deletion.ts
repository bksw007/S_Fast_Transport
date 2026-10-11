import { getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import { HttpsError, onCall } from "firebase-functions/v2/https";

const relatedCollections = ["tracking_share_links", "proof_of_delivery", "job_events", "notifications"] as const;

export const permanentlyDeleteCancelledJob = onCall({ region: "asia-southeast1", timeoutSeconds: 540, memory: "512MiB" }, async request => {
  const db = getFirestore();
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "กรุณาเข้าสู่ระบบ");
  const jobId = request.data?.jobId;
  const confirmation = request.data?.workOrder;
  if (typeof jobId !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(jobId) || typeof confirmation !== "string") {
    throw new HttpsError("invalid-argument", "ข้อมูลใบงานไม่ถูกต้อง");
  }

  const [userDoc, jobDoc] = await Promise.all([
    db.collection("users").doc(uid).get(),
    db.collection("today_jobs").doc(jobId).get()
  ]);
  const actor = userDoc.data();
  const job = jobDoc.data();
  if (!actor || actor.active !== true || actor.approvalStatus !== "approved") throw new HttpsError("permission-denied", "ไม่มีสิทธิ์ลบใบงาน");
  if (!job) throw new HttpsError("not-found", "ไม่พบใบงานนี้");
  const mainAdmin = ["owner", "admin", "dispatcher"].includes(String(actor.role));
  const subcontractAdmin = actor.role === "subcontract_admin" && actor.organizationId === job.organizationId;
  if (!mainAdmin && !subcontractAdmin) throw new HttpsError("permission-denied", "ไม่มีสิทธิ์ลบใบงานนี้");
  if (job.status !== "cancelled" || job.workOrder !== confirmation) throw new HttpsError("failed-precondition", "ใบงานไม่อยู่ในสถานะยกเลิก หรือเลขใบงานไม่ตรงกัน");

  // Remove files while the job still exists, so a storage failure leaves a retryable record.
  const [files] = await getStorage().bucket().getFiles({ prefix: `proof_of_delivery/${jobId}/` });
  for (let index = 0; index < files.length; index += 20) {
    await Promise.all(files.slice(index, index + 20).map(file => file.delete({ ignoreNotFound: true })));
  }

  const snapshots = await Promise.all(relatedCollections.map(name => db.collection(name).where("jobId", "==", jobId).get()));
  const liveStatuses = await db.collection("driver_live_status").where("activeJobId", "==", jobId).get();
  const refs = [...snapshots.flatMap(snapshot => snapshot.docs.map(doc => doc.ref)), ...liveStatuses.docs.map(doc => doc.ref)];
  const writer = db.bulkWriter();
  const deletions = refs.map(ref => writer.delete(ref));
  await writer.close();
  await Promise.all(deletions);

  await db.recursiveDelete(db.collection("job_locations").doc(jobId));
  const legacyJob = db.collection("jobs").doc(jobId);
  if ((await legacyJob.get()).exists) await db.recursiveDelete(legacyJob);
  await db.recursiveDelete(jobDoc.ref);
  return { deleted: true };
});
