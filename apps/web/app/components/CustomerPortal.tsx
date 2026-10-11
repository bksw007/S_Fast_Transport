"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { signOut } from "firebase/auth";
import { getDownloadURL, ref } from "firebase/storage";
import { ArrowUpRight, CalendarDays, ChevronRight, Download, LogOut, MapPin, Phone, Truck, X } from "lucide-react";
import { statusLabels, type StopProof, type TransportJob } from "@s-fast-transport/shared";
import { auth } from "@/lib/firebase-auth";
import { storage } from "@/lib/firebase";
import { completionReportHtml, type ReportProof } from "@/lib/job-completion-report";
import type { UserProfile } from "@/lib/transport-repository";
import "./customer-portal.css";

type Evidence = { pickup: ReportProof; delivery: ReportProof };
const emptyProof: ReportProof = { photos: [] };
const dateText = (value?: string) => value ? new Date(value).toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Bangkok" }) : "—";
const dayText = (value?: string) => value && !Number.isNaN(new Date(`${value}T12:00:00+07:00`).getTime()) ? new Date(`${value}T12:00:00+07:00`).toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Bangkok" }) : value || "—";
const monthKey = (job: TransportJob) => (job.completedAt || job.cancelledAt || job.jobDate || "").slice(0, 7) || "ไม่ระบุเดือน";
const monthLabel = (key: string) => key === "ไม่ระบุเดือน" ? key : new Date(`${key}-01T12:00:00+07:00`).toLocaleDateString("th-TH", { month: "long", year: "numeric", timeZone: "Asia/Bangkok" });

async function loadProof(proof?: StopProof): Promise<ReportProof> {
  return {
    photos: await Promise.all((proof?.photoPaths ?? []).map(path => getDownloadURL(ref(storage, path)))),
    signature: proof?.signaturePath ? await getDownloadURL(ref(storage, proof.signaturePath)) : undefined
  };
}

export default function CustomerPortal({ profile, jobs, loading, error }: { profile: UserProfile; jobs: TransportJob[]; loading: boolean; error: string }) {
  const [selectedId, setSelectedId] = useState("");
  const [month, setMonth] = useState("");
  const [evidence, setEvidence] = useState<Evidence>({ pickup: emptyProof, delivery: emptyProof });
  const [proofError, setProofError] = useState("");
  const [reportBusy, setReportBusy] = useState(false);
  const visible = useMemo(() => jobs.filter(job => job.customerId === profile.customerId), [jobs, profile.customerId]);
  const active = visible.filter(job => !["completed", "cancelled"].includes(job.status));
  const completed = visible.filter(job => job.status === "completed");
  const cancelled = visible.filter(job => job.status === "cancelled");
  const months = [...new Set(completed.map(monthKey))].sort().reverse();
  const selectedMonth = months.includes(month) ? month : months[0] ?? "";
  const history = completed.filter(job => monthKey(job) === selectedMonth).sort((a, b) => (b.completedAt || b.jobDate || "").localeCompare(a.completedAt || a.jobDate || ""));
  const selected = visible.find(job => job.id === selectedId) ?? null;

  function openJob(jobId: string) {
    setEvidence({ pickup: emptyProof, delivery: emptyProof });
    setProofError("");
    setSelectedId(jobId);
  }

  useEffect(() => {
    if (!selected) return;
    let live = true;
    void Promise.all([loadProof(selected.pickupProof), loadProof(selected.deliveryProof)])
      .then(([pickup, delivery]) => { if (live) setEvidence({ pickup, delivery }); })
      .catch(() => { if (live) setProofError("โหลดภาพหลักฐานไม่สำเร็จ กรุณาลองเปิดใบงานอีกครั้ง"); });
    return () => { live = false; };
  }, [selected]);

  async function openReport(job: TransportJob) {
    const preview = window.open("", "_blank");
    if (!preview) { setProofError("กรุณาอนุญาตหน้าต่างใหม่เพื่อเปิดรายงาน"); return; }
    preview.document.write("<p>กำลังเตรียมรายงานการขนส่ง…</p>");
    setReportBusy(true);
    try {
      const [pickup, delivery] = await Promise.all([loadProof(job.pickupProof), loadProof(job.deliveryProof)]);
      preview.document.open();
      preview.document.write(completionReportHtml(job, pickup, delivery, `${window.location.origin}/icons/truck-logo.png`));
      preview.document.close();
    } catch {
      preview.close();
      setProofError("เปิดรายงานไม่สำเร็จ กรุณาลองอีกครั้ง");
    } finally { setReportBusy(false); }
  }

  return <main className="customer-portal">
    <header className="customer-portal-header"><div className="customer-portal-header-inner"><div className="customer-portal-brand"><span className="customer-portal-brand-mark"><Truck size={23} strokeWidth={1.7} /></span><div><strong>S Fast Transportation</strong><span>CUSTOMER PORTAL</span></div></div><button type="button" onClick={() => void signOut(auth)}><LogOut size={16} /> ออกจากระบบ</button></div></header>
    <div className="customer-portal-wrap">
      <section className="customer-portal-hero"><div className="customer-portal-hero-copy"><span className="customer-portal-eyebrow"><span aria-hidden="true" /> ภาพรวมการขนส่งของคุณ</span><h1>ทุกการขนส่ง<br /><em>อยู่ในสายตาคุณ</em></h1><p>ติดตามงานของ {profile.organizationName} และย้อนดูประวัติการส่งมอบได้ในที่เดียว</p></div><div className="customer-portal-counts"><div><span>กำลังดำเนินการ</span><strong>{active.length.toLocaleString("th-TH")}</strong><small>งานที่กำลังขนส่ง</small></div><div><span>ส่งมอบแล้ว</span><strong>{completed.length.toLocaleString("th-TH")}</strong><small>งานทั้งหมดที่เสร็จสิ้น</small></div></div></section>
      {loading && <p role="status">กำลังโหลดใบงาน…</p>}
      {error && <p role="alert" className="customer-portal-error">โหลดใบงานไม่สำเร็จ: {error}</p>}
      {!loading && !error && <>
        <section className="customer-portal-section"><div className="customer-portal-section-title"><div><span className="customer-portal-section-kicker">LIVE OPERATIONS / 01</span><h2>งานกำลังดำเนินการ</h2><p>อัปเดตสถานะจากใบงานของบริษัทคุณ</p></div><span className="customer-portal-section-count">{active.length} งาน</span></div>{active.length ? <div className="customer-portal-grid">{active.map(job => <JobCard key={job.id} job={job} onOpen={() => openJob(job.id)} />)}</div> : <p className="customer-portal-empty">ขณะนี้ไม่มีงานที่กำลังดำเนินการ</p>}</section>
        <section className="customer-portal-section"><div className="customer-portal-section-title"><div><span className="customer-portal-section-kicker">DELIVERY ARCHIVE / 02</span><h2>ประวัติการส่งมอบ</h2><p>เลือกเดือนเพื่อดูงานที่เสร็จแล้ว</p></div><label className="customer-portal-month"><CalendarDays size={17} /><span>เดือน</span><select value={selectedMonth} onChange={event => setMonth(event.target.value)} disabled={!months.length}>{months.length ? months.map(key => <option key={key} value={key}>{monthLabel(key)}</option>) : <option value="">ยังไม่มีประวัติ</option>}</select></label></div>{history.length ? <div className="customer-portal-grid">{history.map(job => <JobCard key={job.id} job={job} onOpen={() => openJob(job.id)} />)}</div> : <p className="customer-portal-empty">ยังไม่มีงานที่เสร็จแล้วในเดือนนี้</p>}</section>
        {cancelled.length > 0 && <section className="customer-portal-section"><div className="customer-portal-section-title"><div><span className="customer-portal-section-kicker">OTHER RECORDS / 03</span><h2>งานที่ยกเลิก</h2></div><span className="customer-portal-section-count">{cancelled.length} งาน</span></div><div className="customer-portal-grid">{cancelled.map(job => <JobCard key={job.id} job={job} onOpen={() => openJob(job.id)} />)}</div></section>}
      </>}
    </div>
    {selected && <div className="customer-portal-backdrop" onClick={() => setSelectedId("")}><article className="customer-portal-detail" role="dialog" aria-modal="true" aria-label={`ใบงาน ${selected.workOrder}`} onClick={event => event.stopPropagation()}><div className="customer-portal-detail-head"><div><small>TRANSPORT DETAILS</small><h2>{selected.workOrder}</h2><span>{statusLabels[selected.status]}</span></div><button type="button" aria-label="ปิดรายละเอียดใบงาน" onClick={() => setSelectedId("")}><X size={19} /></button></div>
      <dl className="customer-portal-facts"><div><dt>วันที่งาน</dt><dd>{dayText(selected.jobDate)}</dd></div><div><dt>เส้นทาง</dt><dd>{selected.pickupLocation} → {selected.deliveryLocation}</dd></div><div><dt>กำหนดรับ</dt><dd>{dayText(selected.pickupDate)} {selected.pickupTime || ""}</dd></div><div><dt>กำหนดส่ง</dt><dd>{dayText(selected.deliveryDate)} {selected.deliveryTime || ""}</dd></div><div><dt>คนขับ</dt><dd>{selected.driverName || "—"}</dd></div><div><dt>เบอร์คนขับ</dt><dd>{selected.driverPhone ? <a href={`tel:${selected.driverPhone.replace(/[^+\d]/g, "")}`}><Phone size={15} /> {selected.driverPhone}</a> : "—"}</dd></div><div><dt>ถึงจุดส่งจริง</dt><dd>{dateText(selected.arrivedDeliveryAt)}</dd></div><div><dt>ปิดงาน</dt><dd>{dateText(selected.completedAt)}</dd></div></dl>
      {selected.lastIssue && !selected.lastIssue.resolvedAt && <p className="customer-portal-issue">มีการแจ้งปัญหา: {selected.lastIssue.note || "กรุณาติดต่อผู้ประสานงาน"}</p>}
      {proofError && <p role="alert" className="customer-portal-error">{proofError}</p>}
      <div className="customer-portal-proof-grid"><ProofBlock title="จุดรับสินค้า" proof={selected.pickupProof} files={evidence.pickup} /><ProofBlock title="จุดส่งสินค้า" proof={selected.deliveryProof} files={evidence.delivery} /></div>
      {selected.status === "completed" && <button className="customer-portal-report" type="button" disabled={reportBusy} onClick={() => void openReport(selected)}><Download size={18} /> {reportBusy ? "กำลังเตรียมรายงาน…" : "ดาวน์โหลดรายงานการขนส่ง"}</button>}
    </article></div>}
  </main>;
}

function JobCard({ job, onOpen }: { job: TransportJob; onOpen: () => void }) {
  return <button className="customer-portal-card" type="button" data-status={job.status} onClick={onOpen}><span className="customer-portal-card-top"><span><small>เลขที่ใบงาน</small><strong>{job.workOrder}</strong></span><span className="customer-portal-status"><span aria-hidden="true" />{statusLabels[job.status]}</span></span><span className="customer-portal-route"><span><MapPin size={16} /><span><small>จุดรับสินค้า</small><strong>{job.pickupLocation || "ไม่ระบุจุดรับ"}</strong></span></span><span><MapPin size={16} /><span><small>จุดส่งสินค้า</small><strong>{job.deliveryLocation || "ไม่ระบุจุดส่ง"}</strong></span></span></span><span className="customer-portal-card-bottom"><span><CalendarDays size={15} /> {dayText(job.jobDate)}</span><span>ดูรายละเอียด <ArrowUpRight size={16} /></span></span></button>;
}

function ProofBlock({ title, proof, files }: { title: string; proof?: StopProof; files: ReportProof }) {
  return <section className="customer-portal-proof"><h3>{title}<ChevronRight size={16} aria-hidden="true" /></h3><div className="customer-portal-photos">{files.photos.length ? files.photos.map((url, index) => <a href={url} target="_blank" rel="noreferrer" key={url}><Image src={url} alt={`${title} ภาพ ${index + 1}`} width={240} height={125} unoptimized /></a>) : <p>ยังไม่มีภาพหลักฐาน</p>}</div><div className="customer-portal-signature"><span>ผู้ลงลายเซ็น: {proof?.signerName || "—"}</span>{files.signature && <Image src={files.signature} alt={`ลายเซ็น ${title}`} width={220} height={75} unoptimized />}</div></section>;
}
