import type { JobStatus, TransportJob } from "@s-fast-transport/shared";

export type DriverStep = {
  id: string;
  label: string;
  description: string;
  nextStatus: JobStatus;
  icon: "navigate" | "location" | "camera" | "cube" | "checkmark-circle";
  photoStage?: "pickup" | "delivery";
};

export const driverSteps: readonly DriverStep[] = [
  { id: "start_tracking", label: "เริ่มเดินทางไปรับสินค้า", description: "เปิดแชร์ตำแหน่งและเริ่มงานนี้", nextStatus: "accepted", icon: "navigate" },
  { id: "arrived_pickup", label: "ถึงจุดรับสินค้า", description: "เมื่อถึงจุดรับ ให้กดยืนยัน แล้วถ่ายรูปสินค้าและขอลายเซ็น", nextStatus: "arrived_pickup", icon: "location" },
  { id: "to_delivery", label: "ยืนยันรับสินค้าและไปจุดส่ง", description: "ถ่ายรูปสินค้าอย่างน้อย 2 รูป แล้วให้ผู้ส่งเซ็นชื่อ", nextStatus: "to_delivery", icon: "camera", photoStage: "pickup" },
  { id: "arrived_delivery", label: "ถึงจุดส่งสินค้า", description: "เมื่อถึงจุดส่ง ให้กดยืนยัน แล้วถ่ายรูปสินค้าและขอลายเซ็น", nextStatus: "arrived_delivery", icon: "location" },
  { id: "ready_to_close", label: "ยืนยันส่งสินค้า", description: "ถ่ายรูปสินค้าอย่างน้อย 2 รูป แล้วให้ผู้รับเซ็นชื่อ", nextStatus: "ready_to_close", icon: "camera", photoStage: "delivery" },
  { id: "completed", label: "จบงาน", description: "ปิดงานและหยุดแชร์ตำแหน่ง", nextStatus: "completed", icon: "checkmark-circle" }
] as const;

const stepIndexByStatus: Partial<Record<JobStatus, number>> = {
  assigned: 0,
  accepted: 1,
  to_pickup: 1,
  arrived_pickup: 2,
  loading: 2,
  to_delivery: 3,
  arrived_delivery: 4,
  unloading: 4,
  ready_to_close: 5
};

export function effectiveDriverStatus(job: Pick<TransportJob, "status" | "issuePreviousStatus">): JobStatus {
  return job.status === "problem" && job.issuePreviousStatus ? job.issuePreviousStatus : job.status;
}

export function currentDriverStep(job: Pick<TransportJob, "status" | "issuePreviousStatus">): DriverStep | null {
  const index = stepIndexByStatus[effectiveDriverStatus(job)];
  return typeof index === "number" ? driverSteps[index] : null;
}

export function driverProgress(job: Pick<TransportJob, "status" | "issuePreviousStatus">) {
  const step = currentDriverStep(job);
  if (!step) return driverSteps.length;
  return driverSteps.findIndex((candidate) => candidate.id === step.id);
}
