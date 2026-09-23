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
  { id: "arrived_pickup", label: "เช็คอินที่จุดรับ", description: "ถ่ายรูปยืนยันเมื่อถึงจุดรับสินค้า", nextStatus: "arrived_pickup", icon: "camera", photoStage: "pickup" },
  { id: "loading", label: "เริ่มขนสินค้า", description: "ยืนยันหลังตรวจรับและพร้อมขึ้นสินค้า", nextStatus: "loading", icon: "cube" },
  { id: "to_delivery", label: "ออกจากจุดรับ", description: "ยืนยันเมื่อขึ้นสินค้าเสร็จและกำลังไปจุดส่ง", nextStatus: "to_delivery", icon: "navigate" },
  { id: "arrived_delivery", label: "เช็คอินที่จุดส่ง", description: "ถ่ายรูปยืนยันเมื่อถึงจุดส่งสินค้า", nextStatus: "arrived_delivery", icon: "camera", photoStage: "delivery" },
  { id: "ready_to_close", label: "ยืนยันส่งสินค้าแล้ว", description: "ตรวจสอบว่าส่งมอบสินค้าเรียบร้อย", nextStatus: "ready_to_close", icon: "checkmark-circle" },
  { id: "completed", label: "จบงาน", description: "ปิดงานและหยุดแชร์ตำแหน่ง", nextStatus: "completed", icon: "checkmark-circle" }
] as const;

const stepIndexByStatus: Partial<Record<JobStatus, number>> = {
  assigned: 0,
  accepted: 1,
  to_pickup: 1,
  arrived_pickup: 2,
  loading: 3,
  to_delivery: 4,
  arrived_delivery: 5,
  unloading: 5,
  ready_to_close: 6
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
