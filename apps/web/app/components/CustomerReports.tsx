"use client";

import { useState } from "react";
import { BarChart3, CalendarDays, Download, FileText, Printer } from "lucide-react";
import { historyMonthLabel, jobHistoryMonth, type TransportJob } from "@s-fast-transport/shared";
import { customerMonthlyCsv, customerMonthlyJobs } from "@/lib/customer-monthly-report";
import type { UserProfile } from "@/lib/transport-repository";

const currentMonth = () => new Date(Date.now() + 7 * 60 * 60 * 1000).toISOString().slice(0, 7);
const day = (value?: string) => /^\d{4}-\d{2}-\d{2}$/.test(value || "")
  ? new Date(`${value}T12:00:00+07:00`).toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Bangkok" }) : "—";
const completedDay = (value?: string) => value && !Number.isNaN(Date.parse(value))
  ? new Date(value).toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Bangkok" }) : "—";

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

  function exportCsv() {
    if (loading || error || !rows.length) return;
    const url = URL.createObjectURL(new Blob([customerMonthlyCsv(jobs, profile.customerId || "", month)], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `customer-transport-report-${month}.csv`;
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    setMessage("ดาวน์โหลด CSV แล้ว");
  }

  return <section className="customer-monthly-report">
    <header className="customer-monthly-report-hero"><span><BarChart3 size={16} /> MONTHLY REPORT</span><h1>รายงานการขนส่ง</h1><p>สรุปงานที่ส่งมอบเสร็จแล้วของ {profile.organizationName} แยกตามเดือน</p><strong className="customer-monthly-report-print-period">{historyMonthLabel(month)}</strong></header>
    <div className="customer-monthly-report-toolbar"><label className="customer-portal-month"><CalendarDays size={17} /><span>เดือนที่เสร็จงาน</span><select value={month} onChange={event => { setMonth(event.target.value); setMessage(""); }}>{months.map(value => <option key={value} value={value}>{historyMonthLabel(value)}</option>)}</select></label><div className="customer-monthly-report-actions"><button type="button" onClick={exportCsv} disabled={loading || Boolean(error) || !rows.length}><Download size={17} /> Export CSV</button><button type="button" className="customer-monthly-report-download" onClick={() => window.print()} disabled={loading || Boolean(error) || !rows.length}><Printer size={17} /> พิมพ์ / บันทึก PDF</button></div></div>
    {loading && <p role="status" className="customer-portal-empty">กำลังโหลดรายงาน…</p>}
    {error && <p role="alert" className="customer-portal-error">โหลดรายงานไม่สำเร็จ: {error}</p>}
    {!loading && !error && <>
      <div className="customer-monthly-report-summary"><div><span>งานที่เสร็จ</span><strong>{rows.length.toLocaleString("th-TH")}</strong><small>ใบงานใน {historyMonthLabel(month)}</small></div><div><span>รถที่ให้บริการ</span><strong>{vehicles.toLocaleString("th-TH")}</strong><small>ทะเบียนรถในรายการ</small></div></div>
      <div className="customer-portal-section-title customer-monthly-report-title"><div><span className="customer-portal-section-kicker">COMPLETED DELIVERIES</span><h2>รายการงานที่เสร็จแล้ว</h2><p>เรียงจากงานที่เสร็จล่าสุด · เลื่อนตารางด้านข้างเพื่อดูข้อมูลทั้งหมด</p></div><span className="customer-portal-section-count">{rows.length} งาน</span></div>
      {rows.length ? <div className="customer-monthly-report-table-wrap" role="region" aria-label="ตารางรายงานการขนส่ง" tabIndex={0}><table className="customer-monthly-report-table"><thead><tr><th scope="col">ใบงาน</th><th scope="col">วันที่รับสินค้า</th><th scope="col">จุดรับ</th><th scope="col">วันที่ส่งสินค้า</th><th scope="col">จุดส่ง</th><th scope="col">รถ / สินค้า</th><th scope="col">เสร็จงาน</th><th scope="col" className="customer-monthly-report-action-col">รายละเอียด</th></tr></thead><tbody>{rows.map((job, index) => <tr key={job.id}><td><small>{index + 1}</small><strong>{job.workOrder}</strong></td><td>{day(job.pickupDate)}{job.pickupTime && <small>{job.pickupTime} น.</small>}</td><td>{job.pickupLocation || "—"}</td><td>{day(job.deliveryDate)}{job.deliveryTime && <small>{job.deliveryTime} น.</small>}</td><td>{job.deliveryLocation || "—"}</td><td>{job.vehicleType || "—"}<small>{job.vehiclePlate || "—"}{job.cargoType ? ` · ${job.cargoType}` : ""}</small></td><td>{completedDay(job.completedAt)}</td><td className="customer-monthly-report-action-col"><button type="button" onClick={() => onOpenJob(job.id)}><FileText size={15} /> ดูงาน</button></td></tr>)}</tbody></table></div> : <p className="customer-portal-empty">ยังไม่มีงานที่เสร็จแล้วในเดือนนี้ ลองเลือกเดือนอื่น</p>}
    </>}
    {message && <p role="status" className="customer-monthly-report-message">{message}</p>}
  </section>;
}
