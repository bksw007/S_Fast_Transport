"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { signOut } from "firebase/auth";
import { getDownloadURL, ref } from "firebase/storage";
import { AlertTriangle, ArrowUpRight, BarChart3, CalendarDays, CheckCircle2, ChevronRight, Clock3, Download, LayoutDashboard, LogOut, MapPin, Navigation, PackageCheck, PenLine, Phone, Truck, UserRound, X } from "lucide-react";
import { historyMonthLabel, jobHistoryMonth, statusLabels, type StopProof, type TransportJob } from "@s-fast-transport/shared";
import { auth } from "@/lib/firebase-auth";
import { storage } from "@/lib/firebase";
import { completionReportHtml, type ReportProof } from "@/lib/job-completion-report";
import { bangkokDateKey, nextStopSchedule } from "@/lib/job-card-schedule";
import { driverIssueLabels } from "@/lib/driver-issue-labels";
import type { UserProfile } from "@/lib/transport-repository";
import CustomerJobRequests from "./CustomerJobRequests";
import CustomerReports from "./CustomerReports";
import "./customer-portal.css";

type Evidence = { pickup: ReportProof; delivery: ReportProof; returnPickup: ReportProof; returnDelivery: ReportProof; handover: string[] };
const emptyProof: ReportProof = { photos: [] };
const dateText = (value?: string) => value ? new Date(value).toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Bangkok" }) : "—";
const scheduledArrival = (date?: string, time?: string, fallback?: string) => /^\d{4}-\d{2}-\d{2}$/.test(date || "") && /^([01]\d|2[0-3]):[0-5]\d$/.test(time || "")
  ? `${dateText(`${date}T${time}:00+07:00`)} น.`
  : /^([01]\d|2[0-3]):[0-5]\d$/.test(time || "") ? `${time} น.` : fallback && fallback !== "-" ? fallback : "ยังไม่ระบุ";
const phoneHref = (phone?: string) => { const number = (phone || "").replace(/[^\d+]/g, ""); return number.length >= 9 ? `tel:${number}` : null; };
const monthKey = (job: TransportJob) => jobHistoryMonth(job);
const monthLabel = historyMonthLabel;
const stopSchedule = (date?: string, time?: string) => [date, time].filter(Boolean).join(" ") || "ยังไม่ระบุ";
function cardTone(job: TransportJob) {
  if (job.status === "cancelled") return "cancelled";
  if (job.status === "completed") return "completed";
  if (job.status === "problem" || (job.lastIssue && !job.lastIssue.resolvedAt)) return "attention";
  if (job.status !== "assigned") return "active";
  return (job.pickupDate || job.jobDate) === bangkokDateKey() ? "today" : "upcoming";
}

async function loadProof(proof?: StopProof): Promise<ReportProof> {
  return {
    photos: await Promise.all((proof?.photoPaths ?? []).map(path => getDownloadURL(ref(storage, path)))),
    signature: proof?.signaturePath ? await getDownloadURL(ref(storage, proof.signaturePath)) : undefined
  };
}

export default function CustomerPortal({ profile, jobs, loading, error }: { profile: UserProfile; jobs: TransportJob[]; loading: boolean; error: string }) {
  const [view, setView] = useState<"overview" | "requests" | "reports">("overview");
  const [selectedId, setSelectedId] = useState("");
  const [month, setMonth] = useState("");
  const [evidence, setEvidence] = useState<Evidence>({ pickup: emptyProof, delivery: emptyProof, returnPickup: emptyProof, returnDelivery: emptyProof, handover: [] });
  const [proofLoading, setProofLoading] = useState(false);
  const [issuePhoto, setIssuePhoto] = useState("");
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
    setEvidence({ pickup: emptyProof, delivery: emptyProof, returnPickup: emptyProof, returnDelivery: emptyProof, handover: [] });
    setProofLoading(true);
    setIssuePhoto("");
    setProofError("");
    setSelectedId(jobId);
  }

  useEffect(() => {
    if (!selected) return;
    let live = true;
    void Promise.all([loadProof(selected.pickupProof), loadProof(selected.deliveryProof), loadProof(selected.returnPickupProof), loadProof(selected.returnDeliveryProof), Promise.all((selected.handoverDocumentPhotoPaths ?? []).map(path => getDownloadURL(ref(storage, path))))])
      .then(([pickup, delivery, returnPickup, returnDelivery, handover]) => { if (live) setEvidence({ pickup, delivery, returnPickup, returnDelivery, handover }); })
      .catch(() => { if (live) setProofError("โหลดภาพหลักฐานไม่สำเร็จ กรุณาลองเปิดใบงานอีกครั้ง"); })
      .finally(() => { if (live) setProofLoading(false); });
    const issue = selected.lastIssue;
    if (issue?.photoPath) void getDownloadURL(ref(storage, issue.photoPath)).then(url => { if (live) setIssuePhoto(url); }).catch(() => {});
    return () => { live = false; };
  }, [selected]);

  useEffect(() => {
    if (!selectedId) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") setSelectedId(""); };
    window.addEventListener("keydown", onKeyDown);
    return () => { document.body.style.overflow = previousOverflow; window.removeEventListener("keydown", onKeyDown); };
  }, [selectedId]);

  async function openReport(job: TransportJob) {
    const preview = window.open("", "_blank");
    if (!preview) { setProofError("กรุณาอนุญาตหน้าต่างใหม่เพื่อเปิดรายงาน"); return; }
    preview.document.write("<p>กำลังเตรียมรายงานการขนส่ง…</p>");
    setReportBusy(true);
    try {
      const [pickup, delivery, returnPickup, returnDelivery, issuePhoto, handover] = await Promise.all([loadProof(job.pickupProof), loadProof(job.deliveryProof), loadProof(job.returnPickupProof), loadProof(job.returnDeliveryProof), job.lastIssue?.photoPath ? getDownloadURL(ref(storage, job.lastIssue.photoPath)).catch(() => "") : Promise.resolve(""), Promise.all((job.handoverDocumentPhotoPaths ?? []).map(path => getDownloadURL(ref(storage, path))))]);
      preview.document.open();
      preview.document.write(completionReportHtml(job, pickup, delivery, `${window.location.origin}/icons/truck-logo.png`, new Date(), { pickup: returnPickup, delivery: returnDelivery }, issuePhoto, handover));
      preview.document.close();
    } catch {
      preview.close();
      setProofError("เปิดรายงานไม่สำเร็จ กรุณาลองอีกครั้ง");
    } finally { setReportBusy(false); }
  }

  return <main className="customer-portal">
    <header className="customer-portal-header"><div className="customer-portal-header-inner"><div className="customer-portal-brand"><Image className="customer-portal-brand-mark" src="/icons/truck-logo.png" alt="S Fast Transport" width={46} height={46} /><div><strong>S Fast Transportation</strong><span>CUSTOMER PORTAL</span></div></div><button type="button" onClick={() => void signOut(auth)}><LogOut size={16} /> ออกจากระบบ</button></div></header>
    <nav className="customer-portal-nav" aria-label="เมนูลูกค้า"><div><button type="button" aria-current={view === "overview" ? "page" : undefined} onClick={() => setView("overview")}><LayoutDashboard size={16} /> ภาพรวมใบงาน</button><button type="button" aria-current={view === "requests" ? "page" : undefined} onClick={() => setView("requests")}><PenLine size={16} /> แจ้งงาน</button><button type="button" aria-current={view === "reports" ? "page" : undefined} onClick={() => setView("reports")}><BarChart3 size={16} /> รายงาน</button></div></nav>
    <div className="customer-portal-wrap">
      {view === "overview" && <>
      <section className="customer-portal-hero"><div className="customer-portal-hero-copy"><span className="customer-portal-eyebrow"><span aria-hidden="true" /> ภาพรวมการขนส่งของคุณ</span><h1>ทุกการขนส่ง<br /><em>อยู่ในสายตาคุณ</em></h1><p>ติดตามงานของ {profile.organizationName} และย้อนดูประวัติการส่งมอบได้ในที่เดียว</p></div><div className="customer-portal-counts"><div><span>กำลังดำเนินการ</span><strong>{active.length.toLocaleString("th-TH")}</strong><small>งานที่กำลังขนส่ง</small></div><div><span>ส่งมอบแล้ว</span><strong>{completed.length.toLocaleString("th-TH")}</strong><small>งานทั้งหมดที่เสร็จสิ้น</small></div></div></section>
      {loading && <p role="status">กำลังโหลดใบงาน…</p>}
      {error && <p role="alert" className="customer-portal-error">โหลดใบงานไม่สำเร็จ: {error}</p>}
      {!loading && !error && <>
        <section className="customer-portal-section"><div className="customer-portal-section-title"><div><span className="customer-portal-section-kicker">LIVE OPERATIONS / 01</span><h2>งานกำลังดำเนินการ</h2><p>อัปเดตสถานะจากใบงานของบริษัทคุณ</p></div><span className="customer-portal-section-count">{active.length} งาน</span></div>{active.length ? <div className="customer-portal-grid">{active.map(job => <JobCard key={job.id} job={job} onOpen={() => openJob(job.id)} />)}</div> : <p className="customer-portal-empty">ขณะนี้ไม่มีงานที่กำลังดำเนินการ</p>}</section>
        <section className="customer-portal-section"><div className="customer-portal-section-title"><div><span className="customer-portal-section-kicker">DELIVERY ARCHIVE / 02</span><h2>ประวัติการส่งมอบ</h2><p>เลือกเดือนเพื่อดูงานที่เสร็จแล้ว</p></div><label className="customer-portal-month"><CalendarDays size={17} /><span>เดือน</span><select value={selectedMonth} onChange={event => setMonth(event.target.value)} disabled={!months.length}>{months.length ? months.map(key => <option key={key} value={key}>{monthLabel(key)}</option>) : <option value="">ยังไม่มีประวัติ</option>}</select></label></div>{history.length ? <div className="customer-portal-grid">{history.map(job => <JobCard key={job.id} job={job} onOpen={() => openJob(job.id)} />)}</div> : <p className="customer-portal-empty">ยังไม่มีงานที่เสร็จแล้วในเดือนนี้</p>}</section>
        {cancelled.length > 0 && <section className="customer-portal-section"><div className="customer-portal-section-title"><div><span className="customer-portal-section-kicker">OTHER RECORDS / 03</span><h2>งานที่ยกเลิก</h2></div><span className="customer-portal-section-count">{cancelled.length} งาน</span></div><div className="customer-portal-grid">{cancelled.map(job => <JobCard key={job.id} job={job} onOpen={() => openJob(job.id)} />)}</div></section>}
      </>}
      </>}
      {view === "requests" && <CustomerJobRequests profile={profile} onOpenJob={openJob} />}
      {view === "reports" && <CustomerReports profile={profile} jobs={visible} loading={loading} error={error} onOpenJob={openJob} />}
    </div>
    {selected && <CustomerJobDetail job={selected} evidence={evidence} proofLoading={proofLoading} issuePhoto={issuePhoto} proofError={proofError} reportBusy={reportBusy} onClose={() => setSelectedId("")} onReport={() => void openReport(selected)} />}
  </main>;
}

function CustomerJobDetail({ job, evidence, proofLoading, issuePhoto, proofError, reportBusy, onClose, onReport }: {
  job: TransportJob;
  evidence: Evidence;
  proofLoading: boolean;
  issuePhoto: string;
  proofError: string;
  reportBusy: boolean;
  onClose: () => void;
  onReport: () => void;
}) {
  const phone = phoneHref(job.driverPhone);
  const location = job.currentLocation;
  const mapUrl = location && Number.isFinite(location.lat) && Number.isFinite(location.lng) && (location.lat !== 0 || location.lng !== 0)
    ? `https://www.google.com/maps?q=${location.lat},${location.lng}` : null;
  const issue = job.lastIssue;
  const issueImageUrl = issuePhoto || (issue?.photoUrl?.startsWith("https://") ? issue.photoUrl : "");
  const completed = job.status === "completed";

  return <div className="customer-portal-backdrop" onClick={onClose}>
    <article className="customer-portal-detail" role="dialog" aria-modal="true" aria-label={`ใบงาน ${job.workOrder}`} onClick={event => event.stopPropagation()}>
      <div className="customer-portal-detail-head">
        <div><span className="customer-portal-section-kicker">TRANSPORT DETAILS</span><strong>รายละเอียดการขนส่ง</strong></div>
        <button type="button" aria-label="ปิดรายละเอียดใบงาน" onClick={onClose}><X size={20} /></button>
      </div>

      <section className="customer-portal-detail-hero">
        <div className="customer-portal-detail-intro"><span>งานขนส่ง {job.workOrder}</span><h2>{job.returnTrip ? `${job.activeLeg === 2 ? "ขากลับ" : "ขาไป"} · ` : ""}{statusLabels[job.status]}</h2><p>{job.customer} · ดำเนินการโดย {job.carrierName || "S Fast Transportation"}</p></div>
        <div className="customer-portal-detail-arrivals">
          <div><Clock3 size={18} /><span>ถึงจุดรับโดยประมาณ</span><strong>{scheduledArrival(job.pickupDate, job.pickupTime)}</strong></div>
          <div><Clock3 size={18} /><span>ถึงจุดส่งโดยประมาณ</span><strong>{scheduledArrival(job.deliveryDate, job.deliveryTime, job.eta)}</strong></div>
        </div>
      </section>

      <div className="customer-portal-detail-grid">
        <section className="customer-portal-detail-route">
          <div className="customer-portal-detail-section-title"><Navigation size={20} /><div><h3>เส้นทางจัดส่ง</h3><p>รายละเอียดจุดรับและจุดส่งของใบงานนี้</p></div></div>
          <div className="customer-portal-detail-stop"><span className="origin" /><div><small>จุดรับสินค้า</small><strong>{job.pickupLocation || "ยังไม่ระบุ"}</strong>{job.pickupPlace?.navigationUrl && <a href={job.pickupPlace.navigationUrl} target="_blank" rel="noreferrer">เปิดจุดรับใน Google Maps <ArrowUpRight size={14} /></a>}</div></div>
          <div className="customer-portal-detail-line" />
          <div className="customer-portal-detail-stop"><span className="destination" /><div><small>จุดส่งสินค้า</small><strong>{job.deliveryLocation || "ยังไม่ระบุ"}</strong>{job.deliveryPlace?.navigationUrl && <a href={job.deliveryPlace.navigationUrl} target="_blank" rel="noreferrer">เปิดจุดส่งใน Google Maps <ArrowUpRight size={14} /></a>}</div></div>
          {job.returnTrip && <><h4>เที่ยวขากลับ · รับสินค้ากลับ</h4><div className="customer-portal-detail-stop"><span className="origin" /><div><small>รับสินค้ากลับ · {scheduledArrival(job.returnTrip.pickupDate, job.returnTrip.pickupTime)}</small><strong>{job.returnTrip.pickupLocation}</strong>{job.returnTrip.pickupPlace?.navigationUrl && <a href={job.returnTrip.pickupPlace.navigationUrl} target="_blank" rel="noreferrer">เปิดจุดรับขากลับ <ArrowUpRight size={14} /></a>}</div></div><div className="customer-portal-detail-stop"><span className="destination" /><div><small>ส่งสินค้ากลับ · {scheduledArrival(job.returnTrip.deliveryDate, job.returnTrip.deliveryTime)}</small><strong>{job.returnTrip.deliveryLocation}</strong>{job.returnTrip.deliveryPlace?.navigationUrl && <a href={job.returnTrip.deliveryPlace.navigationUrl} target="_blank" rel="noreferrer">เปิดจุดส่งขากลับ <ArrowUpRight size={14} /></a>}</div></div></>}
          {mapUrl && <a className="customer-portal-map-link" href={mapUrl} target="_blank" rel="noreferrer"><MapPin size={17} /> เปิดตำแหน่งล่าสุดใน Google Maps <ArrowUpRight size={15} /></a>}
        </section>
        <aside className="customer-portal-detail-side">
          <section className="customer-portal-detail-summary">
            <div><Truck size={18} /><span>รถที่ให้บริการ</span><strong>{job.vehiclePlate || "ยังไม่ระบุ"}</strong></div>
            <div><PackageCheck size={18} /><span>สถานะล่าสุด</span><strong>{statusLabels[job.status]}</strong></div>
            <div><CheckCircle2 size={18} /><span>อัปเดตล่าสุด</span><strong>{dateText(location?.updatedAt)}</strong></div>
          </section>
          <section className="customer-portal-driver-card"><div className="customer-portal-detail-section-title"><UserRound size={20} /><div><h3>ติดต่อคนขับ</h3><p>ผู้รับผิดชอบใบงานนี้</p></div></div><strong>{job.driverName || "ยังไม่ระบุชื่อ"}</strong><span>{job.driverPhone || "ยังไม่ระบุเบอร์โทร"}</span>{phone ? <a href={phone}><Phone size={17} /> โทรหาคนขับ</a> : <small>ยังไม่มีเบอร์โทรที่ใช้ได้ในใบงาน</small>}</section>
        </aside>
      </div>

      {issue && <section className={`customer-portal-issue ${issue.resolvedAt ? "is-resolved" : ""}`} role="status"><AlertTriangle size={21} /><div><strong>{issue.resolvedAt ? "ปัญหาที่แจ้งได้รับการจัดการแล้ว" : "คนขับแจ้งปัญหาเข้ามา"}</strong><p>{driverIssueLabels[issue.type] || "ปัญหาการขนส่ง"}{issue.note ? ` · ${issue.note}` : ""}</p><small>แจ้งเมื่อ {dateText(issue.reportedAt)}{issue.resolvedAt ? ` · ดำเนินการแล้ว ${dateText(issue.resolvedAt)}` : ""}</small>{issue.resolutionNote && <p>การดำเนินการ: {issue.resolutionNote}</p>}{issueImageUrl && <a href={issueImageUrl} target="_blank" rel="noreferrer">ดูภาพประกอบปัญหา</a>}</div></section>}

      {proofError && <p role="alert" className="customer-portal-error">{proofError}</p>}
      <div className="customer-portal-proof-grid" aria-label="หลักฐานการขนส่ง"><ProofBlock title={job.returnTrip ? "ขาไป · หลักฐานจุดรับ" : "หลักฐานจากจุดรับ"} proof={job.pickupProof} files={evidence.pickup} loading={proofLoading} /><ProofBlock title={job.returnTrip ? "ขาไป · หลักฐานจุดส่ง" : "หลักฐานจากจุดส่ง"} proof={job.deliveryProof} files={evidence.delivery} loading={proofLoading} />{job.returnTrip && <><ProofBlock title="ขากลับ · หลักฐานจุดรับ" proof={job.returnPickupProof} files={evidence.returnPickup} loading={proofLoading} /><ProofBlock title="ขากลับ · หลักฐานจุดส่ง" proof={job.returnDeliveryProof} files={evidence.returnDelivery} loading={proofLoading} /></>}<section className="customer-portal-proof"><h3>เอกสารนำส่ง<ChevronRight size={16} aria-hidden="true" /></h3><div className="customer-portal-photos">{evidence.handover.length ? evidence.handover.map((url, index) => <a href={url} target="_blank" rel="noreferrer" key={url}><Image src={url} alt={`เอกสารนำส่ง ภาพ ${index + 1}`} width={240} height={125} unoptimized /></a>) : <p>{proofLoading ? "กำลังโหลดเอกสาร…" : "ไม่มีเอกสารนำส่งสำหรับงานนี้"}</p>}</div></section></div>
      <section className="customer-portal-report-panel"><div><strong>รายงานการขนส่ง</strong><span>รายงานการขนส่ง พร้อมภาพและลายเซ็น{job.returnTrip ? "ทั้งขาไปและขากลับ" : "ทั้งสองจุด"}</span></div><button className="customer-portal-report" type="button" disabled={!completed || reportBusy} onClick={onReport}><Download size={18} /> {reportBusy ? "กำลังเตรียมรายงาน…" : "ดาวน์โหลดรายงานการขนส่ง"}</button>{!completed && <small>ดาวน์โหลดได้เมื่องานเสร็จสมบูรณ์</small>}</section>
    </article>
  </div>;
}

function JobCard({ job, onOpen }: { job: TransportJob; onOpen: () => void }) {
  const eta = nextStopSchedule(job);
  const cancelledDate = job.cancelledAt ? new Date(job.cancelledAt).toLocaleDateString("th-TH", { timeZone: "Asia/Bangkok" }) : "—";
  return <button className="customer-portal-card" type="button" data-status={job.status} data-tone={cardTone(job)} onClick={onOpen}>
    <span className="customer-portal-card-top"><span><small>เลขที่ใบงาน{(job.roundTotal || 0) > 1 ? ` · รอบ ${job.roundNumber}/${job.roundTotal}` : ""}</small><strong>{job.workOrder}</strong></span><span className="customer-portal-status"><span aria-hidden="true" />{job.returnTrip ? `${job.activeLeg === 2 ? "ขากลับ" : "ขาไป"} · ` : ""}{statusLabels[job.status]}</span></span>
    <span className="customer-portal-route">
      <span className="customer-portal-stop"><span className="customer-portal-stop-place"><MapPin size={16} /><span><small>รับสินค้า</small><strong>{job.pickupLocation || "ไม่ระบุจุดรับ"}</strong></span></span><span className="customer-portal-stop-schedule"><small>วันเวลารับสินค้า</small><strong>{stopSchedule(job.pickupDate, job.pickupTime)}</strong></span></span>
      <span className="customer-portal-stop"><span className="customer-portal-stop-place"><MapPin size={16} /><span><small>ส่งสินค้า</small><strong>{job.deliveryLocation || "ไม่ระบุจุดส่ง"}</strong></span></span><span className="customer-portal-stop-schedule"><small>วันเวลาส่งสินค้า</small><strong>{stopSchedule(job.deliveryDate, job.deliveryTime)}</strong></span></span>
      {job.returnTrip && <><span className="customer-portal-stop"><span className="customer-portal-stop-place"><MapPin size={16} /><span><small>รับสินค้ากลับ</small><strong>{job.returnTrip.pickupLocation}</strong></span></span><span className="customer-portal-stop-schedule"><small>วันเวลารับกลับ</small><strong>{stopSchedule(job.returnTrip.pickupDate, job.returnTrip.pickupTime)}</strong></span></span><span className="customer-portal-stop"><span className="customer-portal-stop-place"><MapPin size={16} /><span><small>ส่งสินค้ากลับ</small><strong>{job.returnTrip.deliveryLocation}</strong></span></span><span className="customer-portal-stop-schedule"><small>วันเวลาส่งกลับ</small><strong>{stopSchedule(job.returnTrip.deliveryDate, job.returnTrip.deliveryTime)}</strong></span></span></>}
    </span>
    <span className="customer-portal-card-bottom"><span><Clock3 size={15} />{job.status === "cancelled" ? `ยกเลิก ${cancelledDate}` : `ETA ${eta.label} ${eta.value}`}</span><span>ดูรายละเอียด <ArrowUpRight size={16} /></span></span>
  </button>;
}

function ProofBlock({ title, proof, files, loading }: { title: string; proof?: StopProof; files: ReportProof; loading: boolean }) {
  return <section className="customer-portal-proof"><h3>{title}<ChevronRight size={16} aria-hidden="true" /></h3><div className="customer-portal-photos">{files.photos.length ? files.photos.map((url, index) => <a href={url} target="_blank" rel="noreferrer" key={url}><Image src={url} alt={`${title} ภาพ ${index + 1}`} width={240} height={125} unoptimized /></a>) : <p>{loading ? "กำลังโหลดหลักฐาน…" : "ยังไม่มีภาพจากจุดนี้"}</p>}</div><div className="customer-portal-signature"><span><PenLine size={16} /> ลายเซ็น {proof?.signerName || "ยังไม่ระบุ"}</span>{files.signature ? <Image src={files.signature} alt={`ลายเซ็น ${title}`} width={220} height={75} unoptimized /> : <small>{loading ? "" : "ยังไม่มีลายเซ็นจากจุดนี้"}</small>}</div></section>;
}
