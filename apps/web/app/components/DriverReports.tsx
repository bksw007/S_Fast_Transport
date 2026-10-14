"use client";

import { useEffect, useMemo, useState } from "react";
import { BarChart3, CalendarDays, Printer, ReceiptText, Truck } from "lucide-react";
import { historyMonthLabel, jobHistoryDate, jobHistoryMonth, type TransportJob } from "@s-fast-transport/shared";
import { subscribeDriverExpenses, type DriverExpense } from "@/lib/driver-expenses";
import { driverRunDate, driverRunExpenseLabel, driverRunReportHtml, driverRunReportRows, driverRunReportSummary } from "@/lib/driver-run-report";
import type { UserProfile } from "@/lib/transport-repository";
import "./driver-reports.css";

const money = new Intl.NumberFormat("th-TH", { style: "currency", currency: "THB" });

export default function DriverReports({ jobs, actor, dataState }: { jobs: TransportJob[]; actor: UserProfile; dataState: "loading" | "ready" | "error" }) {
  const [expenses, setExpenses] = useState<DriverExpense[]>([]);
  const [expenseLoading, setExpenseLoading] = useState(true);
  const [expenseError, setExpenseError] = useState("");
  const [currentMonth] = useState(() => new Date(Date.now() + 7 * 60 * 60 * 1000).toISOString().slice(0, 7));
  const [month, setMonth] = useState(currentMonth);
  const [vehicleType, setVehicleType] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => subscribeDriverExpenses(actor, false, items => { setExpenses(items); setExpenseLoading(false); setExpenseError(""); }, error => { setExpenseError(`โหลดค่าใช้จ่ายไม่สำเร็จ: ${error}`); setExpenseLoading(false); }), [actor]);

  const completedJobs = useMemo(() => jobs.filter(job => job.status === "completed" && job.assignedDriverUid === actor.uid), [jobs, actor.uid]);
  const months = useMemo(() => [...new Set([currentMonth, ...completedJobs.map(jobHistoryMonth)])].sort((a, b) => a === "unknown" ? 1 : b === "unknown" ? -1 : b.localeCompare(a)), [completedJobs, currentMonth]);
  const selectedMonth = month;
  const monthlyJobs = completedJobs.filter(job => jobHistoryMonth(job) === selectedMonth);
  const vehicleTypes = [...new Set(monthlyJobs.map(job => job.vehicleType?.trim() || "ไม่ระบุประเภทรถ"))].sort((a, b) => a.localeCompare(b, "th"));
  const selectedVehicleType = vehicleTypes.includes(vehicleType) ? vehicleType : "";
  const rows = driverRunReportRows(completedJobs, expenses, actor.uid, selectedMonth, selectedVehicleType);
  const totals = driverRunReportSummary(rows);
  const ready = dataState === "ready" && !expenseLoading && !expenseError;

  function printReport() {
    if (!ready || !rows.length) return;
    try {
      const html = driverRunReportHtml(rows, actor.fullName || actor.displayName || "คนขับ", historyMonthLabel(selectedMonth), selectedVehicleType);
      const url = URL.createObjectURL(new Blob([html], { type: "text/html;charset=utf-8" }));
      const preview = window.open(url, "_blank");
      if (!preview) { URL.revokeObjectURL(url); setMessage("เบราว์เซอร์บล็อกหน้ารายงาน กรุณาอนุญาตป๊อปอัปแล้วลองใหม่"); return; }
      preview.focus();
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
      setMessage("เปิดรายงานแล้ว กด ‘พิมพ์ / บันทึกเป็น PDF’ เพื่อบันทึกไฟล์");
    } catch { setMessage("เปิดรายงานไม่สำเร็จ กรุณาลองใหม่"); }
  }

  return <section className="screen driver-reports-screen">
    <header className="driver-reports-hero"><span><BarChart3 size={17} /> DRIVER REPORTS</span><h1>รายงานงานวิ่ง</h1><p>ดูงานที่วิ่งเสร็จและค่าใช้จ่ายของคุณแยกตามเดือนและประเภทรถ</p></header>
    <div className="driver-reports-filters"><label><span><CalendarDays size={16} /> เดือน</span><select value={selectedMonth} onChange={event => { setMonth(event.target.value); setVehicleType(""); setMessage(""); }} disabled={!months.length}><option value="" disabled>เลือกเดือน</option>{months.map(value => <option key={value} value={value}>{historyMonthLabel(value)}</option>)}</select></label><label><span><Truck size={16} /> ประเภทรถ</span><select value={selectedVehicleType} onChange={event => { setVehicleType(event.target.value); setMessage(""); }} disabled={!vehicleTypes.length}><option value="">ทุกประเภท</option>{vehicleTypes.map(value => <option key={value} value={value}>{value}</option>)}</select></label></div>
    {dataState === "error" && <p role="alert" className="driver-reports-error">โหลดใบงานไม่สำเร็จ กรุณารีเฟรชหน้าแล้วลองใหม่</p>}
    {expenseError && <p role="alert" className="driver-reports-error">{expenseError}</p>}
    {(dataState === "loading" || expenseLoading) && <p role="status" className="driver-reports-empty">กำลังโหลดรายงาน…</p>}
    {ready && <>
      <div className="driver-reports-summary" aria-label="สรุปรายงาน"><div><span>งานที่เสร็จ</span><strong>{totals.jobs}</strong><small>ใบงาน</small></div><div><span>ยอดแจ้งทั้งหมด</span><strong>{money.format(totals.claimed)}</strong></div><div><span>รอตรวจสอบ</span><strong>{money.format(totals.pending)}</strong></div><div><span>อนุมัติแล้ว</span><strong>{money.format(totals.approved)}</strong></div></div>
      <p className="driver-reports-summary-note">ยอดแจ้งทั้งหมดรวมรายการที่ไม่อนุมัติด้วย</p>
      <div className="driver-reports-list-head"><div><h2>รายการงานวิ่ง</h2><p>{selectedMonth ? historyMonthLabel(selectedMonth) : "ยังไม่มีเดือนงาน"} · {rows.length} งาน</p></div><button type="button" onClick={printReport} disabled={!rows.length}><Printer size={17} /> พิมพ์ / บันทึก PDF</button></div>
      {rows.length ? <div className="driver-reports-list">{rows.map(({ job, expense }) => <article className="driver-reports-card" key={job.id}><div className="driver-reports-card-head"><div><small>ใบงาน {job.workOrder}</small><strong>{job.customer}</strong></div><span>{driverRunDate(jobHistoryDate(job))}</span></div><p className="driver-reports-route">{job.pickupLocation} → {job.deliveryLocation}</p><div className="driver-reports-vehicle"><Truck size={16} /><span>{job.vehicleType?.trim() || "ไม่ระบุประเภทรถ"} · {job.vehiclePlate || "ไม่ระบุทะเบียน"}</span></div><div className="driver-reports-expense"><span><ReceiptText size={16} /> ค่าใช้จ่าย <strong>{expense ? money.format(expense.amount) : "—"}</strong></span><em className={expense ? `status-${expense.status}` : "status-none"}>{driverRunExpenseLabel(expense)}</em></div></article>)}</div> : <div className="driver-reports-empty"><BarChart3 size={26} /><strong>{completedJobs.length ? "ไม่พบงานในตัวกรองนี้" : "ยังไม่มีงานที่วิ่งเสร็จ"}</strong><p>{completedJobs.length ? "ลองเลือกเดือนหรือประเภทรถอื่น" : "เมื่อจบงาน รายงานจะแสดงที่นี่"}</p></div>}
      {message && <p role="status" className="driver-reports-message">{message}</p>}
    </>}
  </section>;
}
