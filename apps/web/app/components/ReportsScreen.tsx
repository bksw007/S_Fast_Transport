"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { BarChart3, Download, Printer, RotateCcw } from "lucide-react";
import { statusLabels, type TransportJob } from "@s-fast-transport/shared";
import { bangkokDate, deliveryLabels, deliveryResult, filterReportJobs, groupReportJobs, summarizeJobs, type GroupBy, type ReportFilters } from "@/lib/reports";

const tabs = ["อัตราส่งตรงเวลา", "งานสำเร็จและงานล่าช้า", "ประสิทธิภาพรถและคนขับ", "ส่งออก Excel หรือ PDF"];
const rate = (value: number | null) => value === null ? "—" : `${value}%`;
const dateTime = (value?: string) => value && Number.isFinite(Date.parse(value)) ? new Date(value).toLocaleString("th-TH", { timeZone: "Asia/Bangkok", dateStyle: "short", timeStyle: "short" }) : "ไม่บันทึก";
const initialFilters = (): ReportFilters => { const today = bangkokDate(); return { start: `${today.slice(0, 7)}-01`, end: today, organization: "", customer: "", search: "", status: "" }; };
const detailHeaders = ["เลขที่งาน", "วันที่งาน", "บริษัท", "ลูกค้า", "รถ", "คนขับ", "ต้นทาง", "ปลายทาง", "สถานะงาน", "กำหนดถึงจุดส่ง (ไทย)", "ถึงจุดส่งจริง (ไทย)", "ผลการส่ง"];

export function ReportsScreen({ jobs, dataState = "ready" }: { jobs: TransportJob[]; dataState?: "loading" | "ready" | "error" }) {
  const [tab, setTab] = useState(0);
  const reportId = useId();
  const [filters, setFilters] = useState(initialFilters);
  const [groupBy, setGroupBy] = useState<GroupBy>("vehicle");
  const [now, setNow] = useState(() => Date.now());
  const [page, setPage] = useState(1);
  const [exporting, setExporting] = useState(false);
  const [message, setMessage] = useState("");
  const exportLock = useRef(false);
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 60_000); return () => clearInterval(timer); }, []);
  const invalidDates = Boolean(filters.start && filters.end && filters.start > filters.end);
  const filtered = useMemo(() => invalidDates ? [] : filterReportJobs(jobs, filters, now), [jobs, filters, now, invalidDates]);
  const summary = useMemo(() => summarizeJobs(filtered, now), [filtered, now]);
  const groups = useMemo(() => groupReportJobs(filtered, groupBy, now), [filtered, groupBy, now]);
  const companies = [...new Map(jobs.map(job => [job.organizationId || "unknown", job.carrierName || job.organizationId || "ไม่ระบุบริษัท"])).entries()].sort((a, b) => a[1].localeCompare(b[1], "th"));
  const customers = [...new Set(jobs.map(job => job.customer))].sort((a, b) => a.localeCompare(b, "th"));
  const pages = Math.max(1, Math.ceil(filtered.length / 25));
  const currentPage = Math.min(page, pages);
  const shown = filtered.slice((currentPage - 1) * 25, currentPage * 25);
  const missingDates = jobs.filter(job => !job.jobDate).length;
  const period = `${filters.start || "ไม่จำกัด"} ถึง ${filters.end || "ไม่จำกัด"}`;
  const scope = `บริษัท: ${companies.find(([id]) => id === filters.organization)?.[1] || "ทั้งหมดตามสิทธิ์"} · ลูกค้า: ${filters.customer || "ทั้งหมด"} · สถานะ: ${filters.status === "delayed" ? "ล่าช้า / เลยกำหนด" : statusLabels[filters.status as keyof typeof statusLabels] || "ทั้งหมด"} · ค้นหา: ${filters.search || "—"}`;
  const methodology = "ตรงเวลา = ถึงจุดส่งจริงไม่เกินกำหนดส่ง (เวลาไทย) • อัตราตรงเวลา = งานถึงตรงเวลา ÷ งานที่มีทั้งกำหนดส่งและเวลาถึงจริง • ไม่รวมงานยกเลิกและงานประเมินไม่ได้ • จำนวนเที่ยวอิงใบงาน ไม่ใช่ GPS";
  function change(patch: Partial<ReportFilters>) { setFilters(current => ({ ...current, ...patch })); setPage(1); setMessage(""); }
  function detailRows() { return filtered.map(job => [job.workOrder, job.jobDate || "ไม่ระบุ", job.carrierName || job.organizationId || "ไม่ระบุ", job.customer, job.vehiclePlate, job.driverName, job.pickupLocation, job.deliveryLocation, statusLabels[job.status], job.deliveryDate && job.deliveryTime ? `${job.deliveryDate} ${job.deliveryTime}` : "ไม่ระบุ", dateTime(job.arrivedDeliveryAt), deliveryLabels[deliveryResult(job, now)]]); }
  async function exportExcel() {
    if (exportLock.current || !filtered.length || invalidDates) return;
    exportLock.current = true; setExporting(true); setMessage("");
    try {
      const { Workbook } = await import("exceljs");
      const workbook = new Workbook(); workbook.creator = "S Fast Transport";
      const overview = workbook.addWorksheet("สรุปรายงาน");
      overview.addRows([["รายงานขนส่ง S Fast Transport"], ["ช่วงวันที่งาน", period], ["ตัวกรอง", scope], ["สร้างเมื่อ (ไทย)", dateTime(new Date(now).toISOString())], ["วิธีคำนวณ", methodology], ["งานทั้งหมด", summary.total], ["สำเร็จ", summary.completed], ["กำลังดำเนินการ", summary.active], ["ยกเลิก", summary.cancelled], ["ถึงตรงเวลา", summary.onTime], ["ถึงล่าช้า", summary.late], ["เลยกำหนด", summary.overdue], ["ประเมินไม่ได้", summary.unknown], ["อัตราตรงเวลา", rate(summary.onTimeRate)]]);
      const detail = workbook.addWorksheet("รายละเอียดงาน"); detail.addRow(detailHeaders); detail.addRows(detailRows());
      const groupHeaders = ["ชื่อ", "บริษัท", "งานทั้งหมด", "สำเร็จ", "ยกเลิก", "เที่ยวตามใบงาน", "ถึงตรงเวลา", "ถึงล่าช้า", "เลยกำหนด", "ประเมินไม่ได้", "อัตราตรงเวลา"];
      for (const [by, title] of [["vehicle", "รายรถ"], ["driver", "รายคนขับ"], ["company", "รายบริษัท"], ["customer", "รายลูกค้า"]] as const) {
        const sheet = workbook.addWorksheet(title); sheet.addRow(groupHeaders);
        sheet.addRows(groupReportJobs(filtered, by, now).map(row => [row.label, row.company, row.total, row.completed, row.cancelled, row.trips, row.onTime, row.late, row.overdue, row.unknown, rate(row.onTimeRate)]));
      }
      workbook.worksheets.forEach(sheet => {
        sheet.columns.forEach(column => { column.width = 24; });
        sheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
        sheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF334D47" } };
        sheet.views = [{ state: "frozen", ySplit: 1 }];
        if (sheet !== overview) sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: sheet.rowCount, column: sheet.columnCount } };
      });
      const buffer = await workbook.xlsx.writeBuffer();
      const url = URL.createObjectURL(new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
      const link = document.createElement("a"); link.href = url; link.download = `S-Fast-Reports-${bangkokDate()}.xlsx`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 10_000);
      setMessage(`ส่งออก Excel ${filtered.length} งาน พร้อมสรุปรถ คนขับ บริษัท และลูกค้าแล้ว`);
    } catch { setMessage("ส่งออกไม่สำเร็จ กรุณาลองใหม่"); }
    finally { exportLock.current = false; setExporting(false); }
  }
  function printReport() {
    const win = window.open("", "_blank");
    if (!win) { setMessage("กรุณาอนุญาตหน้าต่างป๊อปอัปเพื่อพิมพ์รายงาน"); return; }
    const escape = (value: unknown) => String(value).replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!);
    const table = (headers: string[], rows: unknown[][]) => `<table><thead><tr>${headers.map(value => `<th>${escape(value)}</th>`).join("")}</tr></thead><tbody>${rows.map(row => `<tr>${row.map(value => `<td>${escape(value)}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
    win.document.write(`<!doctype html><html lang="th"><head><meta charset="utf-8"><title>รายงาน S Fast Transport</title><style>body{font-family:Tahoma,sans-serif;color:#172620;padding:20px;font-size:11px}table{border-collapse:collapse;width:100%;margin:16px 0}td,th{border:1px solid #ccc;padding:6px;text-align:left;overflow-wrap:anywhere}th{background:#eef3ef}tr{break-inside:avoid}thead{display:table-header-group}h2{margin-top:24px}@page{size:A4 landscape;margin:10mm}@media print{button{display:none}body{padding:0}}</style></head><body><button onclick="window.print()">พิมพ์ / บันทึกเป็น PDF</button><h1>S Fast Transport · รายงานขนส่ง</h1><p>วันที่งาน: ${escape(period)}</p><p>${escape(scope)}</p><p>สร้างเมื่อ ${escape(dateTime(new Date(now).toISOString()))}</p><p>ทั้งหมด ${summary.total} · สำเร็จ ${summary.completed} · กำลังดำเนินการ ${summary.active} · ยกเลิก ${summary.cancelled} · ตรงเวลา ${escape(rate(summary.onTimeRate))}</p><p>${escape(methodology)}</p><h2>สรุป${escape(({ vehicle: "รายรถ", driver: "รายคนขับ", company: "รายบริษัท", customer: "รายลูกค้า" })[groupBy])}</h2>${table(["ชื่อ", "บริษัท", "ทั้งหมด", "สำเร็จ", "ถึงตรงเวลา", "ถึงล่าช้า", "เลยกำหนด", "ประเมินไม่ได้", "ตรงเวลา %"], groups.map(row => [row.label, row.company, row.total, row.completed, row.onTime, row.late, row.overdue, row.unknown, rate(row.onTimeRate)]))}<h2>รายละเอียดงานทั้งหมดตามตัวกรอง</h2>${table(detailHeaders, detailRows())}</body></html>`);
    win.document.close(); win.focus(); win.print();
    setMessage("เปิดรายงานแล้ว เลือกบันทึกเป็น PDF ในหน้าต่างพิมพ์ได้เลย");
  }
  if (dataState !== "ready") return <section className="screen reports-screen"><h1>รายงานขนส่ง</h1><p role={dataState === "error" ? "alert" : "status"}>{dataState === "error" ? "โหลดข้อมูลรายงานไม่สำเร็จ กรุณารีเฟรชหน้าเพื่อลองใหม่" : "กำลังโหลดข้อมูลรายงาน…"}</p></section>;
  const exportButtons = <div className="report-actions"><button type="button" onClick={() => void exportExcel()} disabled={exporting || !filtered.length || invalidDates}><Download size={16} />{exporting ? "กำลังสร้างไฟล์…" : "Excel (.xlsx)"}</button><button type="button" onClick={printReport} disabled={!filtered.length || invalidDates}><Printer size={16} />พิมพ์ / PDF</button></div>;
  return <section className="screen reports-screen">
    <header className="report-header"><div><span className="eyebrow">TRANSPORT REPORTS</span><h1><BarChart3 size={24} />รายงานขนส่ง</h1><p>สรุปจากใบงานจริงตามสิทธิ์ของคุณ · เวลาไทย</p></div>{exportButtons}</header>
    <div className="report-tabs" role="tablist" aria-label="ประเภทรายงาน">{tabs.map((title, index) => <button key={title} id={`${reportId}-tab-${index}`} role="tab" aria-selected={tab === index} aria-controls={`${reportId}-panel`} tabIndex={tab === index ? 0 : -1} onClick={() => setTab(index)} onKeyDown={event => {
        const next = event.key === "ArrowRight" ? (index + 1) % tabs.length : event.key === "ArrowLeft" ? (index + tabs.length - 1) % tabs.length : event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : null;
        if (next === null) return;
        event.preventDefault(); setTab(next); document.getElementById(`${reportId}-tab-${next}`)?.focus();
      }}>{title}</button>)}</div>
    <div className="report-filters">
      <label>วันที่งานตั้งแต่<input type="date" value={filters.start} onChange={e => change({ start: e.target.value })} /></label>
      <label>ถึงวันที่<input type="date" value={filters.end} onChange={e => change({ end: e.target.value })} /></label>
      <label>บริษัท<select value={filters.organization} onChange={e => change({ organization: e.target.value })}><option value="">ทุกบริษัทตามสิทธิ์</option>{companies.map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label>
      <label>ลูกค้า<select value={filters.customer} onChange={e => change({ customer: e.target.value })}><option value="">ลูกค้าทั้งหมด</option>{customers.map(name => <option key={name}>{name}</option>)}</select></label>
      <label>สถานะงาน<select value={filters.status} onChange={e => change({ status: e.target.value })}><option value="">ทุกสถานะ</option><option value="delayed">ล่าช้า / เลยกำหนด</option>{Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <label>ค้นหา<input type="search" placeholder="เลขงาน รถ คนขับ หรือเส้นทาง" value={filters.search} onChange={e => change({ search: e.target.value })} /></label>
    </div>
    <div className="report-presets"><button onClick={() => change({ start: bangkokDate(), end: bangkokDate() })}>วันนี้</button><button onClick={() => change({ start: `${bangkokDate().slice(0, 7)}-01`, end: bangkokDate() })}>เดือนนี้</button><button onClick={() => change({ start: "", end: "" })}>ทุกช่วงเวลา</button><button onClick={() => { setFilters(initialFilters()); setPage(1); }}><RotateCcw size={13} />ล้างตัวกรอง</button><span>{filtered.length.toLocaleString("th-TH")} งาน</span></div>
    {invalidDates && <p className="report-warning" role="alert">วันที่เริ่มต้นต้องไม่เกินวันที่สิ้นสุด</p>}
    {missingDates > 0 && (filters.start || filters.end) && <p className="report-note">มี {missingDates} งานที่ไม่ระบุวันที่งาน จึงไม่รวมในช่วงวันที่นี้ <button onClick={() => change({ start: "", end: "" })}>ดูทุกช่วงเวลา</button></p>}
    {message && <p role="status" className="report-note">{message}</p>}
    <div className="report-metrics">{[["งานทั้งหมด", summary.total], ["สำเร็จ", summary.completed], ["กำลังดำเนินการ", summary.active], ["ถึงล่าช้า / เลยกำหนด", `${summary.late} / ${summary.overdue}`], ["อัตราตรงเวลา", rate(summary.onTimeRate)], ["ยกเลิก", summary.cancelled]].map(([label, value]) => <article key={label}><span>{label}</span><strong>{value}</strong></article>)}</div>
    <div role="tabpanel" id={`${reportId}-panel`} aria-labelledby={`${reportId}-tab-${tab}`}>
      {tab === 0 && <div className="report-insight"><div><h2>ความตรงเวลาในการถึงจุดส่ง</h2><strong className="report-rate">{rate(summary.onTimeRate)}</strong><p>ประเมินได้ {summary.evaluated} จาก {summary.total - summary.cancelled} งานที่ไม่ยกเลิก</p><div className="report-meter" aria-hidden="true"><span style={{ width: `${summary.onTimeRate ?? 0}%` }} /></div></div><div><p>ถึงตรงเวลา <b>{summary.onTime}</b> · ถึงล่าช้า <b>{summary.late}</b></p><p>ยังไม่ถึงจุดส่งและเลยกำหนด <b>{summary.overdue}</b></p><p>ข้อมูลไม่พอประเมิน <b>{summary.unknown}</b></p><p className="report-note">{methodology}</p></div></div>}
      {tab === 2 && <><div className="report-section-head"><h2>ผลงานตามทรัพยากร</h2><label>สรุปตาม <select value={groupBy} onChange={e => setGroupBy(e.target.value as GroupBy)}><option value="vehicle">รถ</option><option value="driver">คนขับ</option><option value="company">บริษัท</option><option value="customer">ลูกค้า</option></select></label></div><p className="report-note">เปรียบเทียบจำนวนงานและความตรงเวลา ไม่ใช่อัตราการใช้รถหรือระยะทาง • คนขับที่ไม่มีรหัสบัญชีจะจัดกลุ่มด้วยชื่อภายในบริษัท</p><div className="report-table-wrap"><table><caption>สรุปผลงาน {groups.length} รายการ</caption><thead><tr>{["ชื่อ / บริษัท", "งาน", "สำเร็จ", "เที่ยวตามใบงาน", "ถึงล่าช้า", "เลยกำหนด", "ตรงเวลา"].map(label => <th key={label}>{label}</th>)}</tr></thead><tbody>{groups.map(row => <tr key={row.key}><td><strong>{row.label}</strong><small>{row.company}</small></td><td>{row.total}</td><td>{row.completed}</td><td>{row.trips}</td><td>{row.late}</td><td>{row.overdue}</td><td>{rate(row.onTimeRate)}<small>ประเมิน {row.evaluated} งาน</small></td></tr>)}</tbody></table></div></>}
      {tab === 3 && <div className="report-export"><h2>ส่งออกรายงานที่เลือก</h2><p>{period} · {filtered.length} งาน</p><p>Excel มีรายละเอียดงานและสรุปแยกตามรถ คนขับ บริษัท และลูกค้า พร้อมตัวกรองและวิธีคำนวณ ส่วน PDF ใช้หน้าต่างพิมพ์ของเบราว์เซอร์</p><p>ส่งออกทุกงานที่ตรงตัวกรอง รวมถึงงานในหน้าถัดไป</p>{exportButtons}</div>}
      {(tab === 0 || tab === 1) && <><div className="report-section-head"><h2>{tab === 0 ? "รายละเอียดการส่ง" : "สถานะงานและงานที่ต้องติดตาม"}</h2><button onClick={() => change({ status: filters.status === "delayed" ? "" : "delayed" })}>{filters.status === "delayed" ? "ดูทุกสถานะ" : "ดูเฉพาะล่าช้า / เลยกำหนด"}</button></div><div className="report-table-wrap"><table><caption>วันที่งาน {period}</caption><thead><tr><th>ใบงาน / วันที่</th><th>ลูกค้า / บริษัท</th><th>รถ / คนขับ</th><th>สถานะ</th><th>กำหนดถึงจุดส่ง</th><th>ถึงจริง</th><th>ผลการส่ง</th></tr></thead><tbody>{shown.map(job => <tr key={job.id}><td><strong>{job.workOrder}</strong><small>{job.jobDate || "ไม่ระบุวันที่"}</small></td><td>{job.customer}<small>{job.carrierName || job.organizationId || "ไม่ระบุบริษัท"}</small></td><td>{job.vehiclePlate}<small>{job.driverName}</small></td><td>{statusLabels[job.status]}</td><td>{job.deliveryDate || "—"}<small>{job.deliveryTime || "ไม่ระบุเวลา"}</small></td><td>{dateTime(job.arrivedDeliveryAt)}</td><td><span className={`report-badge ${deliveryResult(job, now)}`}>{deliveryLabels[deliveryResult(job, now)]}</span></td></tr>)}</tbody></table></div>{filtered.length > 0 && <div className="report-pagination"><button disabled={currentPage <= 1} onClick={() => setPage(currentPage - 1)}>ก่อนหน้า</button><span>หน้า {currentPage} / {pages} · 25 งานต่อหน้า</span><button disabled={currentPage >= pages} onClick={() => setPage(currentPage + 1)}>ถัดไป</button></div>}</>}
      {!filtered.length && !invalidDates && <div className="report-empty"><BarChart3 size={28} /><h2>ไม่พบงานตามตัวกรอง</h2><p>ลองเลือกทุกช่วงเวลาหรือล้างตัวกรอง ระบบจะแสดงข้อมูลเมื่อมีใบงานที่คุณมีสิทธิ์ดู</p></div>}
    </div>
  </section>;
}
