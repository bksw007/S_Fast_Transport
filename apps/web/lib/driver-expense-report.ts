import type { TransportJob } from "@s-fast-transport/shared";
import type { DriverExpense, ExpenseStatus } from "./driver-expenses";

export type ExpenseReportRow = { claim: DriverExpense; vehiclePlate: string };

export function expenseReportRows(claims: DriverExpense[], jobs: TransportJob[], month: string, driverUid = "", vehiclePlate = ""): ExpenseReportRow[] {
  const jobsById = new Map(jobs.map(job => [job.id, job]));
  return claims.filter(claim => claim.completedMonth === month && (!driverUid || claim.driverUid === driverUid))
    .map(claim => ({ claim, vehiclePlate: jobsById.get(claim.jobId)?.vehiclePlate?.trim() || "ไม่ระบุรถ" }))
    .filter(row => !vehiclePlate || row.vehiclePlate === vehiclePlate);
}

export function expenseReportSummary(rows: ExpenseReportRow[]) {
  return rows.reduce((result, { claim }) => {
    result.counts[claim.status === "paid" ? "approved" : claim.status]++;
    result.total += claim.amount;
    if (claim.status === "approved" || claim.status === "paid") result.approvedTotal += claim.amount;
    return result;
  }, { counts: { pending: 0, approved: 0, rejected: 0 } as Record<Exclude<ExpenseStatus, "paid">, number>, total: 0, approvedTotal: 0 });
}

const escapeHtml = (value: unknown) => String(value ?? "").replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!);
const money = new Intl.NumberFormat("th-TH", { style: "currency", currency: "THB" });
const statuses: Record<ExpenseStatus, string> = { pending: "รอตรวจสอบ", approved: "อนุมัติแล้ว", rejected: "ไม่อนุมัติ", paid: "อนุมัติแล้ว" };

export function driverExpenseReportHtml(rows: ExpenseReportRow[], monthLabel: string, driverLabel: string, vehicleLabel: string, createdAt = new Date()) {
  const summary = expenseReportSummary(rows);
  const details = rows.map(({ claim, vehiclePlate }, index) => `<tr><td>${index + 1}</td><td>${escapeHtml(claim.workOrder)}</td><td>${escapeHtml(claim.driverName)}</td><td>${escapeHtml(vehiclePlate)}</td><td>${escapeHtml(claim.note || "—")}</td><td>${escapeHtml(statuses[claim.status])}</td><td class="number">${escapeHtml(money.format(claim.amount))}</td></tr>`).join("");
  return `<!doctype html><html lang="th"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>รายงานค่าใช้จ่ายคนขับ ${escapeHtml(monthLabel)}</title><style>
    *{box-sizing:border-box}body{margin:0;padding:22px;color:#203431;background:#f4f6f2;font-family:"Noto Sans Thai",Tahoma,sans-serif;font-size:12px}.toolbar{display:flex;justify-content:space-between;align-items:center;gap:12px;max-width:1100px;margin:0 auto 16px}.toolbar button{border:0;border-radius:8px;background:#264b49;color:white;padding:10px 16px;font:inherit;cursor:pointer}.sheet{max-width:1100px;margin:auto;padding:28px;background:white;border:1px solid #dce5df;border-radius:14px}.brand{display:flex;justify-content:space-between;gap:20px;padding-bottom:18px;border-bottom:3px solid #264b49}.brand small{color:#866b47;letter-spacing:.12em;font-weight:700}.brand h1{margin:6px 0 3px;font-size:24px}.brand p{margin:0;color:#667872}.meta{text-align:right;color:#667872}.filters{display:flex;gap:16px;flex-wrap:wrap;margin:18px 0;padding:12px 15px;background:#f1f5f1;border-radius:8px}.metrics{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin:16px 0 23px}.metrics div{border:1px solid #dce5df;border-radius:8px;padding:12px}.metrics span,.metrics strong{display:block}.metrics span{color:#667872}.metrics strong{margin-top:5px;font-size:17px}table{width:100%;border-collapse:collapse}th,td{padding:9px 8px;border-bottom:1px solid #dce5df;text-align:left;vertical-align:top;overflow-wrap:anywhere}th{background:#eaf0eb;color:#31534e}tr{break-inside:avoid}thead{display:table-header-group}.number{text-align:right;white-space:nowrap}.footnote{margin-top:16px;color:#667872;font-size:11px}@page{size:A4 landscape;margin:12mm}@media print{body{padding:0;background:white}.toolbar{display:none}.sheet{max-width:none;padding:0;border:0;border-radius:0}.brand{break-after:avoid}}
  </style></head><body><div class="toolbar"><span>ตัวอย่างรายงานค่าใช้จ่ายคนขับ</span><button type="button" onclick="window.print()">พิมพ์ / บันทึกเป็น PDF</button></div><main class="sheet"><header class="brand"><div><small>S FAST TRANSPORTATION</small><h1>รายงานค่าใช้จ่ายคนขับ</h1><p>ค่าใช้จ่ายตามใบงานที่วิ่งเสร็จแล้ว</p></div><div class="meta">สร้างเมื่อ ${escapeHtml(createdAt.toLocaleString("th-TH", { timeZone: "Asia/Bangkok", dateStyle: "medium", timeStyle: "short" }))}</div></header><div class="filters"><span>เดือนงาน: <strong>${escapeHtml(monthLabel)}</strong></span><span>คนขับ: <strong>${escapeHtml(driverLabel)}</strong></span><span>รถ: <strong>${escapeHtml(vehicleLabel)}</strong></span></div><div class="metrics"><div><span>รายการทั้งหมด</span><strong>${rows.length}</strong></div><div><span>ยอดแจ้งทั้งหมด</span><strong>${escapeHtml(money.format(summary.total))}</strong></div><div><span>ยอดอนุมัติแล้ว</span><strong>${escapeHtml(money.format(summary.approvedTotal))}</strong></div></div><table><thead><tr><th>#</th><th>ใบงาน</th><th>คนขับ</th><th>รถ</th><th>รายละเอียด</th><th>สถานะ</th><th class="number">จำนวนเงิน</th></tr></thead><tbody>${details || '<tr><td colspan="7">ไม่มีรายการตามตัวกรอง</td></tr>'}</tbody></table><p class="footnote">รอตรวจสอบ ${summary.counts.pending} · อนุมัติแล้ว ${summary.counts.approved} · ไม่อนุมัติ ${summary.counts.rejected}</p></main></body></html>`;
}
