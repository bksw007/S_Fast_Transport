import { getFirestore, type DocumentData } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import { onRequest } from "firebase-functions/v2/https";
import { logger } from "firebase-functions";

const tokenPattern = /^[a-f0-9]{32}$/;
const storageBucket = "fir-fast-transport.firebasestorage.app";

function value(input: unknown): string {
  return typeof input === "string" ? input : "";
}

function proofSummary(proof: unknown) {
  const data = proof && typeof proof === "object" ? proof as DocumentData : {};
  return {
    photoCount: Array.isArray(data.photoPaths) ? Math.min(data.photoPaths.length, 50) : 0,
    hasSignature: Boolean(value(data.signaturePath)),
    signerName: value(data.signerName),
    signedAt: value(data.signedAt)
  };
}

function selectedAsset(job: DocumentData, kind: string, stage: string, index: number): string {
  if (kind === "issue") return value(job.lastIssue?.photoPath);
  if (stage === "handover" && kind === "photo" && Number.isInteger(index) && index >= 0 && index < 10) {
    return value(job.handoverDocumentPhotoPaths?.[index]);
  }
  if (!["pickup", "delivery", "returnPickup", "returnDelivery"].includes(stage)) return "";
  const proof = job[`${stage}Proof`];
  if (kind === "signature") return value(proof?.signaturePath);
  if (kind === "photo" && Number.isInteger(index) && index >= 0 && index < 50) {
    return value(proof?.photoPaths?.[index]);
  }
  return "";
}

export const publicTrackingAccess = onRequest({ region: "asia-southeast1", cors: true, invoker: "public" }, async (request, response) => {
  response.set("Cache-Control", "no-store");
  response.set("Referrer-Policy", "no-referrer");
  response.set("X-Content-Type-Options", "nosniff");
  if (request.method !== "GET") { response.status(405).send("Method not allowed"); return; }

  const token = value(request.query.token);
  if (!tokenPattern.test(token)) { response.status(404).send("Not found"); return; }

  try {
    const db = getFirestore();
    const link = await db.collection("tracking_share_links").doc(token).get();
    const share = link.data();
    if (!share?.enabled || (share.expiresAt?.toMillis?.() ?? 0) <= Date.now()) {
      response.status(404).send("Link unavailable");
      return;
    }
    const jobId = value(share.jobId);
    if (!jobId) { response.status(404).send("Job unavailable"); return; }
    const jobSnapshot = await db.collection("today_jobs").doc(jobId).get();
    const job = jobSnapshot.data();
    if (!job || value(job.organizationId || "main") !== value(share.organizationId || "main")) {
      response.status(404).send("Job unavailable");
      return;
    }

    if (request.query.kind) {
      const path = selectedAsset(job, value(request.query.kind), value(request.query.stage), Number(request.query.index));
      if (!path.startsWith(`proof_of_delivery/${jobId}/`)) { response.status(404).send("Asset unavailable"); return; }
      const file = getStorage().bucket(storageBucket).file(path);
      const [metadata] = await file.getMetadata();
      const contentType = metadata.contentType || "";
      if (!["image/jpeg", "image/png", "image/webp", "image/svg+xml"].includes(contentType)) {
        response.status(415).send("Unsupported asset");
        return;
      }
      response.set("Content-Type", contentType);
      response.set("Content-Security-Policy", "default-src 'none'; sandbox");
      file.createReadStream().on("error", error => {
        logger.error("Unable to read public tracking proof", { jobId, error });
        if (!response.headersSent) response.status(404).end();
        else response.destroy();
      }).pipe(response);
      return;
    }

    const issue = job.lastIssue && typeof job.lastIssue === "object" ? job.lastIssue as DocumentData : null;
    response.json({
      workOrder: value(job.workOrder),
      status: value(job.status),
      customer: value(job.customer),
      carrierName: value(job.carrierName || share.carrierName),
      jobDate: value(job.jobDate),
      cargoType: value(job.cargoType),
      tripCount: Number(job.tripCount) || 1,
      driverName: value(job.driverName),
      driverPhone: value(job.driverPhone),
      vehiclePlate: value(job.vehiclePlate),
      vehicleType: value(job.vehicleType),
      routeDistanceMeters: Number(job.routeDistanceMeters) > 0 ? Number(job.routeDistanceMeters) : null,
      pickupLocation: value(job.pickupLocation),
      pickupDate: value(job.pickupDate),
      pickupTime: value(job.pickupTime),
      deliveryLocation: value(job.deliveryLocation),
      deliveryDate: value(job.deliveryDate),
      deliveryTime: value(job.deliveryTime),
      returnTrip: job.returnTrip ? {
        pickupLocation: value(job.returnTrip.pickupLocation),
        pickupDate: value(job.returnTrip.pickupDate), pickupTime: value(job.returnTrip.pickupTime),
        deliveryLocation: value(job.returnTrip.deliveryLocation),
        deliveryDate: value(job.returnTrip.deliveryDate), deliveryTime: value(job.returnTrip.deliveryTime)
      } : null,
      activeLeg: job.activeLeg === 2 ? 2 : 1,
      eta: value(job.eta),
      arrivedDeliveryAt: job.arrivedDeliveryAt?.toDate?.()?.toISOString?.() ?? value(job.arrivedDeliveryAt),
      completedAt: job.completedAt?.toDate?.()?.toISOString?.() ?? value(job.completedAt),
      pickupProof: proofSummary(job.pickupProof),
      deliveryProof: proofSummary(job.deliveryProof),
      returnPickupProof: proofSummary(job.returnPickupProof),
      returnDeliveryProof: proofSummary(job.returnDeliveryProof),
      handoverDocumentPhotoCount: Array.isArray(job.handoverDocumentPhotoPaths) ? Math.min(job.handoverDocumentPhotoPaths.length, 10) : 0,
      returnArrivedDeliveryAt: job.returnArrivedDeliveryAt?.toDate?.()?.toISOString?.() ?? value(job.returnArrivedDeliveryAt),
      issue: issue ? {
        type: value(issue.type),
        note: value(issue.note),
        reportedAt: value(issue.reportedAt),
        resolvedAt: value(issue.resolvedAt),
        resolutionNote: value(issue.resolutionNote),
        hasPhoto: Boolean(value(issue.photoPath))
      } : null
    });
  } catch (error) {
    logger.error("Unable to serve public tracking", { error });
    if (!response.headersSent) response.status(500).send("Tracking unavailable");
  }
});
