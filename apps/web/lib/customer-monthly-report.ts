import { jobHistoryMonth, type TransportJob } from "@s-fast-transport/shared";

export function customerMonthlyJobs(jobs: TransportJob[], customerId: string, month: string): TransportJob[] {
  if (!customerId || !month) return [];
  return jobs.filter(job => job.customerId === customerId && job.status === "completed" && jobHistoryMonth(job) === month)
    .sort((a, b) => (b.completedAt || b.pickupDate || "").localeCompare(a.completedAt || a.pickupDate || "") || b.workOrder.localeCompare(a.workOrder, "th"));
}

function csvCell(value: unknown) {
  const raw = String(value ?? "");
  // Prevent spreadsheet applications from evaluating customer-entered text as a formula.
  const safe = /^[\s]*[=+\-@]/.test(raw) ? `'${raw}` : raw;
  return /[",\r\n]/.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe;
}

export function customerMonthlyCsv(jobs: TransportJob[], customerId: string, month: string) {
  const headers = ["เลขที่ใบงาน", "วันที่รับสินค้า", "เวลารับสินค้า", "จุดรับสินค้า", "วันที่ส่งสินค้า", "เวลาส่งสินค้า", "จุดส่งสินค้า", "ประเภทรถ", "ทะเบียนรถ", "ประเภทสินค้า", "วันที่เสร็จงาน"];
  const rows = customerMonthlyJobs(jobs, customerId, month).map(job => [
    job.workOrder, job.pickupDate, job.pickupTime, job.pickupLocation, job.deliveryDate, job.deliveryTime,
    job.deliveryLocation, job.vehicleType, job.vehiclePlate, job.cargoType, job.completedAt
  ]);
  return `\uFEFF${[headers, ...rows].map(row => row.map(csvCell).join(",")).join("\r\n")}\r\n`;
}
