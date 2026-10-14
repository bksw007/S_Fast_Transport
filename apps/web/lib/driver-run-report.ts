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

export function driverRunOtherExpenses(expenses: DriverExpense[], driverUid: string, month: string) {
  return expenses.filter(expense => expense.expenseKind === "other" && expense.driverUid === driverUid && expense.completedMonth === month)
    .sort((a, b) => (a.expenseDate || "").localeCompare(b.expenseDate || "") || a.createdAt.localeCompare(b.createdAt));
}

export function driverRunReportSummary(rows: DriverRunReportRow[], otherExpenses: DriverExpense[] = []) {
  const summary = { jobs: rows.length, claimed: 0, approved: 0, pending: 0 };
  for (const expense of [...rows.map(row => row.expense), ...otherExpenses]) {
    if (expense) {
      summary.claimed += expense.amount;
      if (expense.status === "approved" || expense.status === "paid") summary.approved += expense.amount;
      if (expense.status === "pending") summary.pending += expense.amount;
    }
  }
  return summary;
}

export function driverRunExpenseLabel(expense?: DriverExpense) {
  if (!expense) return "ยังไม่แจ้งค่าใช้จ่าย";
  if (expense.status === "approved" || expense.status === "paid") return "อนุมัติแล้ว";
  return expense.status === "rejected" ? "ไม่อนุมัติ" : "รอตรวจสอบ";
}

const escapeHtml = (value: unknown) => String(value ?? "").replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!);
const money = new Intl.NumberFormat("th-TH", { style: "currency", currency: "THB" });
const otherExpenseLabels: Record<string, string> = { repair: "ค่าซ่อมรถ", equipment: "ค่าอุปกรณ์", wash: "ค่าล้างรถ", other: "อื่นๆ" };
export function driverRunDate(value?: string) {
  if (!value || !Number.isFinite(Date.parse(value))) return "ไม่ระบุวันเวลา";
  return new Date(value).toLocaleString("th-TH", { timeZone: "Asia/Bangkok", dateStyle: "medium", timeStyle: "short" });
}

function validPickupDay(value?: string) {
  const date = value?.match(/^(\d{4}-\d{2}-\d{2})/)?.[1];
  if (!date) return "";
  const parsed = new Date(`${date}T12:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date ? date : "";
}

export function driverRunPickupDate(value?: string) {
  const date = validPickupDay(value);
  if (!date) return "ไม่ระบุวันที่";
  const parsed = new Date(`${date}T12:00:00Z`);
  return parsed.toLocaleDateString("th-TH", { timeZone: "Asia/Bangkok", day: "numeric", month: "short", year: "numeric" });
}

export function driverRunReportHtml(rows: DriverRunReportRow[], driver: { name: string; photoURL?: string }, monthLabel: string, vehicleType: string, createdAt = new Date(), otherExpenses: DriverExpense[] = []) {
  const summary = driverRunReportSummary(rows, otherExpenses);
  const sortedRows = [...rows].sort((a, b) => (validPickupDay(a.job.pickupDate) || "9999-12-31").localeCompare(validPickupDay(b.job.pickupDate) || "9999-12-31") || a.job.workOrder.localeCompare(b.job.workOrder, "th"));
  const details = sortedRows.map(({ job, expense }, index) => `<tr><td data-label="ลำดับ">${index + 1}</td><td data-label="วันที่งาน">${escapeHtml(driverRunPickupDate(job.pickupDate))}</td><td data-label="ใบงาน">${escapeHtml(job.workOrder)}</td><td data-label="งาน"><strong>${escapeHtml(job.customer)}</strong><small>${escapeHtml(job.pickupLocation)} → ${escapeHtml(job.deliveryLocation)}</small></td><td data-label="รถ">${escapeHtml(job.vehicleType?.trim() || "ไม่ระบุประเภทรถ")}<small>${escapeHtml(job.vehiclePlate || "ไม่ระบุทะเบียน")}</small></td><td data-label="ค่าใช้จ่าย">${expense ? escapeHtml(money.format(expense.amount)) : "—"}<small>${escapeHtml(driverRunExpenseLabel(expense))}</small></td></tr>`).join("");
  const otherDetails = otherExpenses.map((expense, index) => `<tr><td data-label="ลำดับ">${index + 1}</td><td data-label="วันที่ค่าใช้จ่าย">${escapeHtml(driverRunPickupDate(expense.expenseDate))}</td><td data-label="รายการ">${escapeHtml(otherExpenseLabels[expense.category || ""] || "ค่าใช้จ่ายอื่น")}</td><td data-label="รายละเอียด">${escapeHtml(expense.note || "—")}</td><td data-label="รถ">${escapeHtml(expense.vehiclePlate || "ไม่ระบุทะเบียน")}</td><td data-label="ค่าใช้จ่าย">${escapeHtml(money.format(expense.amount))}<small>${escapeHtml(driverRunExpenseLabel(expense))}</small></td></tr>`).join("");
  const photo = driver.photoURL?.startsWith("https://") ? `<img src="${escapeHtml(driver.photoURL)}" alt="รูปโปรไฟล์พนักงาน" onerror="this.remove()">` : "";
  const initial = Array.from(driver.name.trim())[0] || "ค";
  return `<!doctype html><html lang="th"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>รายงานงานวิ่ง ${escapeHtml(monthLabel)}</title><style>
    *{box-sizing:border-box}body{margin:0;padding:22px;color:#203431;background:#f4f6f2;font-family:"Noto Sans Thai",Tahoma,sans-serif;font-size:12px}.toolbar{display:flex;justify-content:space-between;align-items:center;gap:12px;max-width:820px;margin:0 auto 16px}.toolbar button{border:0;border-radius:8px;background:#264b49;color:#fff;padding:10px 16px;font:inherit;cursor:pointer}.sheet{max-width:820px;margin:auto;padding:26px;background:#fff;border:1px solid #dce5df;border-radius:14px}.head{display:flex;justify-content:space-between;align-items:center;gap:16px;padding-bottom:14px;border-bottom:3px solid #264b49}.brand small{color:#866b47;letter-spacing:.12em;font-weight:700}.brand h1{margin:5px 0 0;font-size:22px}.person{display:flex;align-items:center;justify-content:flex-end;gap:9px;min-width:0;text-align:right}.person-copy{min-width:0}.person-copy strong,.person-copy small{display:block}.person-copy strong{font-size:12px}.person-copy small{margin-top:2px;color:#667872;font-size:10px}.avatar{position:relative;display:grid;place-items:center;flex:none;width:44px;height:44px;overflow:hidden;border-radius:50%;background:#dfeae5;color:#31534e;font-size:18px;font-weight:700}.avatar img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}.filters{display:flex;gap:14px;flex-wrap:wrap;margin:12px 0;padding:9px 12px;background:#f1f5f1;border-radius:8px}.metrics{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;margin:12px 0 9px}.metrics div{border:1px solid #dce5df;border-radius:8px;padding:9px 10px}.metrics span,.metrics strong{display:block}.metrics span{color:#667872;font-size:11px}.metrics strong{margin-top:3px;font-size:15px}table{width:100%;border-collapse:collapse;table-layout:fixed}th,td{padding:8px 6px;border-bottom:1px solid #dce5df;text-align:left;vertical-align:top;overflow-wrap:break-word;word-break:normal}th{background:#eaf0eb;color:#31534e}th:nth-child(1){width:5%}th:nth-child(2){width:14%}th:nth-child(3){width:18%}th:nth-child(4){width:34%}th:nth-child(5){width:16%}th:nth-child(6){width:13%}td small{display:block;margin-top:3px;color:#667872;font-size:10px;line-height:1.35}tr{break-inside:avoid;page-break-inside:avoid}thead{display:table-header-group}.footnote{margin:0 0 9px;color:#667872;font-size:10px;break-inside:avoid}@page{size:A4 portrait;margin:10mm}
    @media screen and (max-width:700px),screen and (max-device-width:700px){body{width:100%;padding:12px;font-size:14px}.toolbar{align-items:stretch;flex-direction:column}.toolbar button{align-self:flex-start;min-height:44px}.sheet{width:100%;padding:18px;border-radius:12px}.head{align-items:stretch;flex-direction:column;gap:8px}.brand h1{font-size:19px}.person{align-self:flex-end}.person-copy strong{font-size:11px}.person-copy small{font-size:9px}.avatar{width:39px;height:39px}.filters{display:grid;gap:7px;margin:14px 0}.metrics{grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}.metrics div{min-width:0;padding:10px}.metrics strong{font-size:15px}table,tbody{display:block;width:100%}thead{display:none}tr{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px 14px;margin:0 0 12px;padding:14px;border:1px solid #dce5df;border-radius:10px}td{display:block;min-width:0;padding:0;border:0;overflow-wrap:anywhere}td::before{content:attr(data-label);display:block;margin-bottom:3px;color:#667872;font-size:11px}td:nth-child(n+3):nth-child(-n+5){grid-column:1/-1}td:nth-child(3){font-weight:700}td:nth-child(5){padding-bottom:10px;border-bottom:1px solid #dce5df}.footnote{line-height:1.5}}
    .other-heading{margin:22px 0 9px;font-size:15px;break-after:avoid}.other-note{margin:0 0 9px;color:#667872;font-size:10px;break-after:avoid}
    @media print{body{padding:0;background:#fff;font-size:10px}.toolbar{display:none}.sheet{max-width:none;padding:0;border:0;border-radius:0}.head{break-after:avoid}.filters,.metrics{break-inside:avoid}}
  </style></head><body><div class="toolbar"><span>ตัวอย่างรายงานงานวิ่ง</span><button type="button" onclick="window.print()">พิมพ์ / บันทึกเป็น PDF</button></div><main class="sheet"><header class="head"><div class="brand"><small>S FAST TRANSPORTATION</small><h1>รายงานงานวิ่งคนขับ</h1></div><div class="person"><div class="person-copy"><strong>${escapeHtml(driver.name)}</strong><small>สร้างเมื่อ ${escapeHtml(driverRunDate(createdAt.toISOString()))}</small></div><span class="avatar">${escapeHtml(initial)}${photo}</span></div></header><div class="filters"><span>เดือนงาน: <strong>${escapeHtml(monthLabel)}</strong></span><span>ประเภทรถ: <strong>${escapeHtml(vehicleType || "ทุกประเภท")}</strong></span></div><div class="metrics"><div><span>งานที่เสร็จ</span><strong>${summary.jobs}</strong></div><div><span>ยอดแจ้ง</span><strong>${escapeHtml(money.format(summary.claimed))}</strong></div><div><span>รอตรวจสอบ</span><strong>${escapeHtml(money.format(summary.pending))}</strong></div><div><span>อนุมัติแล้ว</span><strong>${escapeHtml(money.format(summary.approved))}</strong></div></div><p class="footnote">ยอดแจ้งรวมรายการที่ไม่อนุมัติด้วย · ยอดรอตรวจสอบนับเฉพาะคำขอที่ยังรอผล</p><table><thead><tr><th>#</th><th>วันที่งาน</th><th>ใบงาน</th><th>งาน</th><th>รถ</th><th>ค่าใช้จ่าย</th></tr></thead><tbody>${details || '<tr><td colspan="6">ไม่มีงานในตัวกรองนี้</td></tr>'}</tbody></table>${otherExpenses.length ? `<h2 class="other-heading">ค่าใช้จ่ายอื่น (${otherExpenses.length} รายการ)</h2><p class="other-note">รายการส่วนนี้ไม่ผูกใบงาน และไม่ขึ้นกับตัวกรองประเภทรถ</p><table><thead><tr><th>#</th><th>วันที่ค่าใช้จ่าย</th><th>รายการ</th><th>รายละเอียด</th><th>รถ</th><th>ค่าใช้จ่าย</th></tr></thead><tbody>${otherDetails}</tbody></table>` : ""}</main></body></html>`;
}
