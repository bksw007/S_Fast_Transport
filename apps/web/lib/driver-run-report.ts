import { jobHistoryDate, jobHistoryMonth, type TransportJob } from "@s-fast-transport/shared";
import type { DriverExpense } from "./driver-expenses";

export type DriverRunReportRow = { job: TransportJob; expense?: DriverExpense };

export function driverRunReportRows(jobs: TransportJob[], expenses: DriverExpense[], driverUid: string, month: string, vehicleType: string): DriverRunReportRow[] {
  const expensesByJob = new Map(expenses.filter(expense => expense.driverUid === driverUid).map(expense => [expense.jobId, expense]));
  return jobs.filter(job => job.status === "completed" && job.assignedDriverUid === driverUid
    && (!month || jobHistoryMonth(job) === month)
    && (!vehicleType || (job.vehicleType?.trim() || "ไม่ระบุประเภทรถ") === vehicleType))
    .map(job => ({ job, expense: expensesByJob.get(job.id) }))
    .sort((a, b) => (jobHistoryDate(b.job) || "").localeCompare(jobHistoryDate(a.job) || "") || b.job.workOrder.localeCompare(a.job.workOrder, "th"));
}

export function driverRunReportSummary(rows: DriverRunReportRow[]) {
  return rows.reduce((summary, { expense }) => {
    summary.jobs++;
    if (expense) {
      summary.claimed += expense.amount;
      if (expense.status === "approved" || expense.status === "paid") summary.approved += expense.amount;
      if (expense.status === "pending") summary.pending += expense.amount;
    }
    return summary;
  }, { jobs: 0, claimed: 0, approved: 0, pending: 0 });
}

export function driverRunExpenseLabel(expense?: DriverExpense) {
  if (!expense) return "ยังไม่แจ้งค่าใช้จ่าย";
  if (expense.status === "approved" || expense.status === "paid") return "อนุมัติแล้ว";
  return expense.status === "rejected" ? "ไม่อนุมัติ" : "รอตรวจสอบ";
}

const escapeHtml = (value: unknown) => String(value ?? "").replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!);
const money = new Intl.NumberFormat("th-TH", { style: "currency", currency: "THB" });
export function driverRunDate(value?: string) {
  if (!value || !Number.isFinite(Date.parse(value))) return "ไม่ระบุวันเวลา";
  return new Date(value).toLocaleString("th-TH", { timeZone: "Asia/Bangkok", dateStyle: "medium", timeStyle: "short" });
}

export function driverRunReportHtml(rows: DriverRunReportRow[], driverName: string, monthLabel: string, vehicleType: string, createdAt = new Date()) {
  const summary = driverRunReportSummary(rows);
  const details = rows.map(({ job, expense }, index) => `<tr><td data-label="ลำดับ">${index + 1}</td><td data-label="จบงาน">${escapeHtml(driverRunDate(jobHistoryDate(job)))}</td><td data-label="ใบงาน">${escapeHtml(job.workOrder)}</td><td data-label="งาน"><strong>${escapeHtml(job.customer)}</strong><small>${escapeHtml(job.pickupLocation)} → ${escapeHtml(job.deliveryLocation)}</small></td><td data-label="รถ">${escapeHtml(job.vehicleType?.trim() || "ไม่ระบุประเภทรถ")}<small>${escapeHtml(job.vehiclePlate || "ไม่ระบุทะเบียน")}</small></td><td data-label="ค่าใช้จ่าย">${expense ? escapeHtml(money.format(expense.amount)) : "—"}</td><td data-label="สถานะ">${escapeHtml(driverRunExpenseLabel(expense))}</td></tr>`).join("");
  return `<!doctype html><html lang="th"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>รายงานงานวิ่ง ${escapeHtml(monthLabel)}</title><style>
    *{box-sizing:border-box}body{margin:0;padding:22px;color:#203431;background:#f4f6f2;font-family:"Noto Sans Thai",Tahoma,sans-serif;font-size:12px}.toolbar{display:flex;justify-content:space-between;align-items:center;gap:12px;max-width:1100px;margin:0 auto 16px}.toolbar button{border:0;border-radius:8px;background:#264b49;color:#fff;padding:10px 16px;font:inherit;cursor:pointer}.sheet{max-width:1100px;margin:auto;padding:28px;background:#fff;border:1px solid #dce5df;border-radius:14px}.head{display:flex;justify-content:space-between;gap:20px;padding-bottom:18px;border-bottom:3px solid #264b49}.head small{color:#866b47;letter-spacing:.12em;font-weight:700}.head h1{margin:6px 0 3px;font-size:24px}.head p{margin:0;color:#667872}.meta{text-align:right;color:#667872}.filters{display:flex;gap:16px;flex-wrap:wrap;margin:18px 0;padding:12px 15px;background:#f1f5f1;border-radius:8px}.metrics{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin:16px 0 23px}.metrics div{border:1px solid #dce5df;border-radius:8px;padding:12px}.metrics span,.metrics strong{display:block}.metrics span{color:#667872}.metrics strong{margin-top:5px;font-size:17px}table{width:100%;border-collapse:collapse}th,td{padding:9px 8px;border-bottom:1px solid #dce5df;text-align:left;vertical-align:top;overflow-wrap:break-word;word-break:normal}th{background:#eaf0eb;color:#31534e}td small{display:block;margin-top:3px;color:#667872}tr{break-inside:avoid}thead{display:table-header-group}.footnote{margin-top:16px;color:#667872;font-size:11px}@page{size:A4 landscape;margin:12mm}
    @media screen and (max-width:700px),screen and (max-device-width:700px){body{width:100%;padding:12px;font-size:14px}.toolbar{align-items:stretch;flex-direction:column}.toolbar button{align-self:flex-start;min-height:44px}.sheet{width:100%;padding:18px;border-radius:12px}.head{align-items:flex-start;flex-direction:column;gap:8px}.head h1{font-size:21px}.meta{text-align:left}.filters{display:grid;gap:7px;margin:14px 0}.metrics{grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}.metrics div{min-width:0;padding:10px}.metrics strong{font-size:15px}table,tbody{display:block;width:100%}thead{display:none}tr{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px 14px;margin:0 0 12px;padding:14px;border:1px solid #dce5df;border-radius:10px}td{display:block;min-width:0;padding:0;border:0;overflow-wrap:anywhere}td::before{content:attr(data-label);display:block;margin-bottom:3px;color:#667872;font-size:11px}td:nth-child(n+2):nth-child(-n+5){grid-column:1/-1}td:nth-child(3){font-weight:700}td:nth-child(5){padding-bottom:10px;border-bottom:1px solid #dce5df}.footnote{line-height:1.5}}
    @media print{body{padding:0;background:#fff}.toolbar{display:none}.sheet{max-width:none;padding:0;border:0;border-radius:0}.head{break-after:avoid}}
  </style></head><body><div class="toolbar"><span>ตัวอย่างรายงานงานวิ่ง</span><button type="button" onclick="window.print()">พิมพ์ / บันทึกเป็น PDF</button></div><main class="sheet"><header class="head"><div><small>S FAST TRANSPORTATION</small><h1>รายงานงานวิ่งคนขับ</h1><p>${escapeHtml(driverName)}</p></div><div class="meta">สร้างเมื่อ ${escapeHtml(driverRunDate(createdAt.toISOString()))}</div></header><div class="filters"><span>เดือนงาน: <strong>${escapeHtml(monthLabel)}</strong></span><span>ประเภทรถ: <strong>${escapeHtml(vehicleType || "ทุกประเภท")}</strong></span></div><div class="metrics"><div><span>งานที่เสร็จ</span><strong>${summary.jobs}</strong></div><div><span>ยอดแจ้ง</span><strong>${escapeHtml(money.format(summary.claimed))}</strong></div><div><span>รอตรวจสอบ</span><strong>${escapeHtml(money.format(summary.pending))}</strong></div><div><span>อนุมัติแล้ว</span><strong>${escapeHtml(money.format(summary.approved))}</strong></div></div><table><thead><tr><th>#</th><th>จบงาน</th><th>ใบงาน</th><th>งาน</th><th>รถ</th><th>ค่าใช้จ่าย</th><th>สถานะ</th></tr></thead><tbody>${details || '<tr><td colspan="7">ไม่มีงานในตัวกรองนี้</td></tr>'}</tbody></table><p class="footnote">ยอดแจ้งรวมรายการที่ไม่อนุมัติด้วย · ยอดรอตรวจสอบนับเฉพาะคำขอที่ยังรอผล</p></main></body></html>`;
}
