import type { TransportJob } from "@s-fast-transport/shared";

export const bangkokDateKey = (date = new Date()) => new Date(date.getTime() + 7 * 60 * 60 * 1000).toISOString().slice(0, 10);

function relativeSchedule(date?: string, time?: string, today = bangkokDateKey()) {
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return "ยังไม่ระบุ";
  const targetDay = Date.parse(`${date}T00:00:00Z`);
  if (!Number.isFinite(targetDay)) return "ยังไม่ระบุ";
  const days = (targetDay - Date.parse(`${today}T00:00:00Z`)) / 86400000;
  const hasTime = Boolean(time && /^([01]\d|2[0-3]):[0-5]\d$/.test(time));
  const day = days === 0 ? "วันนี้" : days === 1 ? "พรุ่งนี้" : days === -1 ? "เมื่อวาน" : days > 1 && !hasTime ? `อีก ${days} วัน` : new Date(`${date}T12:00:00+07:00`).toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Bangkok" });
  return hasTime ? `${day} ${time}` : day;
}

export function nextStopSchedule(job: TransportJob, today = bangkokDateKey()) {
  const status = job.status === "problem" ? job.issuePreviousStatus || "assigned" : job.status;
  const route = job.returnTrip && job.activeLeg === 2 ? job.returnTrip : job;
  const pickup = ["pending_subcontract", "subcontract_accepted", "assigned", "accepted", "to_pickup", "arrived_pickup", "loading"].includes(status);
  return { label: pickup ? "รับสินค้า" : "ส่งสินค้า", value: relativeSchedule(pickup ? route.pickupDate : route.deliveryDate, pickup ? route.pickupTime : route.deliveryTime, today) };
}

export function driverJobCardTone(job: TransportJob, today = bangkokDateKey()): "active" | "today" | "upcoming" {
  if (job.status !== "assigned") return "active";
  return (job.pickupDate || job.jobDate) === today ? "today" : "upcoming";
}
