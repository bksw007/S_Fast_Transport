"use client";

import { useState } from "react";
import { BarChart3, CalendarDays, Download, FileText, MapPin, Truck } from "lucide-react";
import { historyMonthLabel, jobHistoryMonth, type TransportJob } from "@s-fast-transport/shared";
import { customerMonthlyJobs, customerMonthlyReportHtml } from "@/lib/customer-monthly-report";
import type { UserProfile } from "@/lib/transport-repository";

const currentMonth = () => new Date(Date.now() + 7 * 60 * 60 * 1000).toISOString().slice(0, 7);
const day = (value?: string) => /^\d{4}-\d{2}-\d{2}$/.test(value || "")
  ? new Date(`${value}T12:00:00+07:00`).toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Bangkok" }) : "ยังไม่ระบุ";
const completedDay = (value?: string) => value && !Number.isNaN(Date.parse(value))
  ? new Date(value).toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Bangkok" }) : "ยังไม่ระบุ";

export default function CustomerReports({ profile, jobs, loading, error, onOpenJob }: {
  profile: UserProfile;
  jobs: TransportJob[];
  loading: boolean;
  error: string;
  onOpenJob: (jobId: string) => void;
}) {
  const [month, setMonth] = useState(currentMonth);
  const [message, setMessage] = useState("");
  const months = [...new Set([currentMonth(), ...jobs.filter(job => job.customerId === profile.customerId && job.status === "completed").map(jobHistoryMonth)])]
    .sort((a, b) => a === "unknown" ? 1 : b === "unknown" ? -1 : b.localeCompare(a));
  const rows = customerMonthlyJobs(jobs, profile.customerId || "", month);
  const vehicles = new Set(rows.map(job => job.vehiclePlate?.trim()).filter(Boolean)).size;

  function openReport() {
    if (loading || error || !rows.length) return;
    const preview = window.open("", "_blank");
    if (!preview) { setMessage("เบราว์เซอร์บล็อกหน้ารายงาน กรุณาอนุญาตหน้าต่างใหม่แล้วลองอีกครั้ง"); return; }
    try {
      preview.document.open();
      preview.document.write(customerMonthlyReportHtml(rows, profile.organizationName || rows[0].customer, month));
      preview.document.close();
      setMessage("เปิดรายงานแล้ว กด ‘พิมพ์ / บันทึกเป็น PDF’ เพื่อดาวน์โหลดไฟล์");
    } catch {
      preview.close();
      setMessage("เปิดรายงานไม่สำเร็จ กรุณาลองใหม่");
    }
  }

  return <section className="customer-monthly-report">
    <header className="customer-monthly-report-hero"><span><BarChart3 size={16} /> MONTHLY REPORT</span><h1>รายงานการขนส่ง</h1><p>สรุปงานที่ส่งมอบเสร็จแล้วของ {profile.organizationName} แยกตามเดือน</p></header>
    <div className="customer-monthly-report-toolbar"><label className="customer-portal-month"><CalendarDays size={17} /><span>เดือนที่เสร็จงาน</span><select value={month} onChange={event => { setMonth(event.target.value); setMessage(""); }}>{months.map(value => <option key={value} value={value}>{historyMonthLabel(value)}</option>)}</select></label><button type="button" className="customer-monthly-report-download" onClick={openReport} disabled={loading || Boolean(error) || rows.length === 0}><Download size={17} /> พิมพ์ / บันทึก PDF</button></div>
    {loading && <p role="status" className="customer-portal-empty">กำลังโหลดรายงาน…</p>}
    {error && <p role="alert" className="customer-portal-error">โหลดรายงานไม่สำเร็จ: {error}</p>}
    {!loading && !error && <>
      <div className="customer-monthly-report-summary"><div><span>งานที่เสร็จ</span><strong>{rows.length.toLocaleString("th-TH")}</strong><small>ใบงานใน {historyMonthLabel(month)}</small></div><div><span>รถที่ให้บริการ</span><strong>{vehicles.toLocaleString("th-TH")}</strong><small>ทะเบียนรถในรายการ</small></div></div>
      <div className="customer-portal-section-title customer-monthly-report-title"><div><span className="customer-portal-section-kicker">COMPLETED DELIVERIES</span><h2>รายการงานที่เสร็จแล้ว</h2><p>เรียงจากงานที่เสร็จล่าสุด</p></div><span className="customer-portal-section-count">{rows.length} งาน</span></div>
      {rows.length ? <div className="customer-monthly-report-list">{rows.map(job => <article key={job.id} className="customer-monthly-report-row"><div className="customer-monthly-report-row-head"><div><small>ใบงานขนส่ง</small><strong>{job.workOrder}</strong></div><span>เสร็จงานแล้ว</span></div><div className="customer-monthly-report-route"><MapPin size={17} /><span>{job.pickupLocation || "ไม่ระบุจุดรับ"} <b>→</b> {job.deliveryLocation || "ไม่ระบุจุดส่ง"}</span></div><div className="customer-monthly-report-meta"><span><CalendarDays size={15} /> รับ {day(job.pickupDate)}{job.pickupTime ? ` ${job.pickupTime} น.` : ""}</span><span><CalendarDays size={15} /> ส่ง {day(job.deliveryDate)}{job.deliveryTime ? ` ${job.deliveryTime} น.` : ""}</span><span><CalendarDays size={15} /> เสร็จ {completedDay(job.completedAt)}</span><span><Truck size={15} /> {job.vehicleType || "ไม่ระบุประเภทรถ"}{job.vehiclePlate ? ` · ${job.vehiclePlate}` : ""}</span></div><button type="button" onClick={() => onOpenJob(job.id)}><FileText size={16} /> ดูรายละเอียดและหลักฐาน</button></article>)}</div> : <p className="customer-portal-empty">ยังไม่มีงานที่เสร็จแล้วในเดือนนี้ ลองเลือกเดือนอื่น</p>}
    </>}
    {message && <p role="status" className="customer-monthly-report-message">{message}</p>}
  </section>;
}
