import type { TransportJob } from "@s-fast-transport/shared";

export type DeliveryResult = "on_time" | "late" | "overdue" | "pending" | "unknown" | "cancelled";
export const deliveryLabels: Record<DeliveryResult, string> = {
  on_time: "ถึงตรงเวลา", late: "ถึงล่าช้า", overdue: "เลยกำหนดส่ง", pending: "ยังไม่ถึงกำหนด", unknown: "ประเมินไม่ได้", cancelled: "ยกเลิก"
};
export function bangkokDate(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}
export function deliveryDeadline(job: Pick<TransportJob, "deliveryDate" | "deliveryTime">) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(job.deliveryDate ?? "") || (job.deliveryTime && !/^([01]\d|2[0-3]):[0-5]\d$/.test(job.deliveryTime))) return null;
  const time = Date.parse(`${job.deliveryDate}T${job.deliveryTime ? `${job.deliveryTime}:00` : "23:59:59.999"}+07:00`);
  return Number.isFinite(time) && bangkokDate(new Date(time)) === job.deliveryDate ? time : null;
}
export function deliveryResult(job: Pick<TransportJob, "status" | "deliveryDate" | "deliveryTime" | "arrivedDeliveryAt">, now: number): DeliveryResult {
  if (job.status === "cancelled") return "cancelled";
  const deadline = deliveryDeadline(job);
  if (deadline === null) return "unknown";
  const actual = Date.parse(job.arrivedDeliveryAt ?? "");
  if (Number.isFinite(actual)) return actual <= deadline ? "on_time" : "late";
  // A completion or GPS update is not evidence of the delivery arrival time.
  if (["arrived_delivery", "unloading", "ready_to_close", "completed"].includes(job.status)) return "unknown";
  return now > deadline ? "overdue" : "pending";
}
export function summarizeJobs(jobs: TransportJob[], now: number) {
  const counts = { total: jobs.length, completed: 0, cancelled: 0, onTime: 0, late: 0, overdue: 0, unknown: 0, trips: 0 };
  for (const job of jobs) {
    if (job.status === "completed") counts.completed++;
    if (job.status === "cancelled") counts.cancelled++;
    const result = deliveryResult(job, now);
    if (result === "on_time") counts.onTime++;
    if (result === "late") counts.late++;
    if (result === "overdue") counts.overdue++;
    if (result === "unknown") counts.unknown++;
    if (job.status !== "cancelled") counts.trips += Number.isFinite(job.tripCount) && job.tripCount! > 0 ? job.tripCount! : 1;
  }
  const evaluated = counts.onTime + counts.late;
  return { ...counts, active: counts.total - counts.completed - counts.cancelled, evaluated, onTimeRate: evaluated ? Math.round(counts.onTime / evaluated * 1000) / 10 : null };
}
export type ReportFilters = { start: string; end: string; organization: string; customer: string; search: string; status: string };
export const reportCompanyKey = (job: Pick<TransportJob, "carrierOrganizationId" | "historical" | "carrierName" | "organizationId">) =>
  job.carrierOrganizationId || (job.historical ? job.carrierName : job.organizationId) || "unknown";
export function filterReportJobs(jobs: TransportJob[], filters: ReportFilters, now: number) {
  const term = filters.search.trim().toLocaleLowerCase("th");
  return jobs.filter(job => {
    if ((filters.start || filters.end) && !job.pickupDate) return false;
    if (filters.start && job.pickupDate! < filters.start || filters.end && job.pickupDate! > filters.end) return false;
    if (filters.organization && reportCompanyKey(job) !== filters.organization) return false;
    if (filters.customer && job.customer !== filters.customer) return false;
    if (filters.status === "delayed" && !["late", "overdue"].includes(deliveryResult(job, now))) return false;
    if (filters.status && filters.status !== "delayed" && job.status !== filters.status) return false;
    return !term || [job.workOrder, job.customer, job.driverName, job.vehiclePlate, job.pickupLocation, job.deliveryLocation].some(value => value.toLocaleLowerCase("th").includes(term));
  }).sort((a, b) => (b.pickupDate || "").localeCompare(a.pickupDate || "") || a.workOrder.localeCompare(b.workOrder, "th"));
}
export type GroupBy = "vehicle" | "driver" | "company" | "customer";
export function groupReportJobs(jobs: TransportJob[], groupBy: GroupBy, now: number) {
  const groups = new Map<string, { label: string; company: string; jobs: TransportJob[] }>();
  for (const job of jobs) {
    const company = job.carrierName || job.organizationId || "ไม่ระบุบริษัท";
    const waiting = job.status === "pending_subcontract" || job.status === "subcontract_accepted";
    const label = groupBy === "vehicle" ? waiting ? "ยังไม่มอบหมายรถ" : job.vehiclePlate : groupBy === "driver" ? waiting ? "ยังไม่มอบหมายคนขับ" : job.driverName : groupBy === "company" ? company : job.customer;
    const identity = groupBy === "driver" ? waiting ? "unassigned" : job.driverId ? `driver:${job.driverId}` : job.assignedDriverUid ? `user:${job.assignedDriverUid}` : `name:${job.driverName}` : groupBy === "company" ? reportCompanyKey(job) : label;
    const key = JSON.stringify([groupBy === "customer" ? "" : reportCompanyKey(job), identity]);
    const group = groups.get(key) || { label, company: groupBy === "customer" ? "ทุกบริษัทที่เลือก" : company, jobs: [] };
    group.jobs.push(job);
    groups.set(key, group);
  }
  return [...groups.entries()].map(([key, group]) => ({ key, label: group.label, company: group.company, ...summarizeJobs(group.jobs, now) })).sort((a, b) => b.total - a.total || a.label.localeCompare(b.label, "th"));
}
