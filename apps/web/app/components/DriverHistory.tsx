"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { CalendarDays, Camera, CheckCircle2, ChevronDown, ChevronUp, FileImage, MapPin, Truck } from "lucide-react";
import { filterDriverHistory, historyMonthLabel, jobHistoryDate, jobHistoryMonth, type HistoryStatusFilter, type TransportJob } from "@s-fast-transport/shared";
import { subscribeJobRecords, type JobRecord } from "@/lib/job-detail-repository";
import DriverProofPhotoEditor from "./DriverProofPhotoEditor";
import type { UserProfile } from "@/lib/transport-repository";

function dateLabel(value?: string) {
  if (!value) return "ไม่ระบุเวลา";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short" });
}

function Proofs({ job }: { job: TransportJob }) {
  const [records, setRecords] = useState<JobRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => subscribeJobRecords(job.id, "proofs", rows => { setRecords(rows); setLoading(false); }, cause => { setError(cause.message); setLoading(false); }), [job.id]);
  const currentPaths = [...(job.pickupProof?.photoPaths ?? []), ...(job.deliveryProof?.photoPaths ?? [])];
  const visibleRecords = records.filter(({ data }) => !["photo", "photo_revision"].includes(String(data.proofKind)) || currentPaths.includes(String(data.storagePath)));
  if (loading) return <p className="driver-history-proof-message">กำลังโหลดหลักฐาน...</p>;
  if (error) return <p className="driver-history-proof-message" role="alert">โหลดหลักฐานไม่สำเร็จ: {error}</p>;
  if (!visibleRecords.length) return <p className="driver-history-proof-message">ยังไม่มีไฟล์หลักฐานสำหรับงานนี้</p>;
  return <div className="driver-history-proofs">{visibleRecords.map(({ id, data }) => {
    const url = typeof data.downloadUrl === "string" && data.downloadUrl.startsWith("https://") ? data.downloadUrl : "";
    const isImage = typeof data.contentType === "string" && data.contentType.startsWith("image/");
    const stage = data.proofStage === "pickup" || data.checkInStage === "pickup" ? "จุดรับ" : data.proofStage === "delivery" || data.checkInStage === "delivery" ? "จุดส่ง" : "เอกสารอื่น";
    const name = data.proofKind === "signature" ? `ลายเซ็น ${data.signerName || ""}` : data.proofKind === "photo" || data.proofKind === "photo_revision" ? "รูปสินค้า" : data.proofKind === "issue" ? "รูปแจ้งปัญหา" : data.fileName || "ไฟล์แนบ";
    const content = <><span className="driver-history-proof-image">{url && isImage ? <Image unoptimized src={url} alt={`${stage} ${name}`} width={420} height={260} /> : <FileImage size={32} />}</span><span className="driver-history-proof-caption"><small>{stage}</small><strong>{name}</strong><em>{url ? "แตะเพื่อเปิดไฟล์" : "ไม่มีลิงก์ไฟล์"}</em></span></>;
    return url ? <a href={url} target="_blank" rel="noreferrer" key={id} className="driver-history-proof">{content}</a> : <div key={id} className="driver-history-proof">{content}</div>;
  })}</div>;
}

export default function DriverHistory({ jobs, actor, onNotice }: { jobs: TransportJob[]; actor: UserProfile; onNotice: (notice: { title: string; detail: string; tone: "success" | "error" }) => void }) {
  const [expandedId, setExpandedId] = useState("");
  const [statusFilter, setStatusFilter] = useState<HistoryStatusFilter>("all");
  const [monthFilter, setMonthFilter] = useState("all");
  const allHistory = filterDriverHistory(jobs, "all", "all");
  const months = [...new Set(allHistory.map(jobHistoryMonth))].sort((a, b) => a === "unknown" ? 1 : b === "unknown" ? -1 : b.localeCompare(a));
  const history = filterDriverHistory(jobs, statusFilter, monthFilter);

  return <section className="screen driver-history-screen">
    <div className="section-title"><div><h1>ประวัติงาน</h1><p>งานที่เสร็จหรือยกเลิกแล้ว {allHistory.length} งาน</p></div></div>
    <div className="driver-history-filters" aria-label="ตัวกรองประวัติงาน">
      <div className="driver-history-filter-status" role="group" aria-label="สถานะงาน">
        {([ ["all", "ทั้งหมด"], ["completed", "เสร็จงาน"], ["cancelled", "ยกเลิก"] ] as const).map(([value, label]) => <button key={value} type="button" className={statusFilter === value ? "selected" : ""} aria-pressed={statusFilter === value} onClick={() => setStatusFilter(value)}>{label}</button>)}
      </div>
      <label className="driver-history-filter-month"><CalendarDays size={18} /><span>เดือน</span><select value={monthFilter} onChange={event => setMonthFilter(event.target.value)}><option value="all">ทุกเดือน</option>{months.map(month => <option key={month} value={month}>{historyMonthLabel(month)}</option>)}</select></label>
    </div>
    <p className="driver-history-count">แสดง {history.length} จาก {allHistory.length} งาน</p>
    {!history.length && <div className="driver-history-empty"><CheckCircle2 size={30} /><strong>{allHistory.length ? "ไม่พบงานในตัวกรองนี้" : "ยังไม่มีประวัติงาน"}</strong><p>{allHistory.length ? "ลองเลือกสถานะหรือเดือนอื่น" : "เมื่อจบงาน รายการจะปรากฏที่นี่"}</p></div>}
    {history.map(job => <article className={`driver-history-card ${expandedId === job.id ? "expanded" : ""}`} key={job.id}>
      <button type="button" className="driver-history-toggle" aria-expanded={expandedId === job.id} aria-controls={`driver-history-details-${job.id}`} onClick={() => setExpandedId(current => current === job.id ? "" : job.id)}>
        <span className="driver-history-icon"><Truck size={21} /></span>
        <span className="driver-history-heading"><small>ใบงาน {job.workOrder}</small><strong>{job.customer}</strong><span>{job.pickupLocation} → {job.deliveryLocation}</span></span>
        <span className={`driver-history-status ${job.status}`}>{job.status === "completed" ? "เสร็จงาน" : "ยกเลิก"}</span>
        {expandedId === job.id ? <ChevronUp size={19} /> : <ChevronDown size={19} />}
      </button>
      <div className="driver-history-summary"><span>{jobHistoryDate(job) ? `${job.status === "completed" ? "จบงาน" : job.cancelledAt ? "ยกเลิกงาน" : "วันที่อ้างอิง"} ${dateLabel(jobHistoryDate(job))}` : "ไม่ระบุเวลา"}</span><span>{job.vehiclePlate}</span></div>
      {expandedId === job.id && <div className="driver-history-details" id={`driver-history-details-${job.id}`}>
        <div className="driver-history-route"><p><MapPin size={17} /> <span><small>จุดรับ</small><strong>{job.pickupLocation}</strong></span></p><p><MapPin size={17} /> <span><small>จุดส่ง</small><strong>{job.deliveryLocation}</strong></span></p></div>
        <div className="driver-history-proof-status"><span><Camera size={17} /> จุดรับ: {job.pickupProof ? `${job.pickupProof.photoPaths.length} รูป · ผู้เซ็น ${job.pickupProof.signerName}` : "ไม่มีข้อมูลยืนยัน"}</span><span><Camera size={17} /> จุดส่ง: {job.deliveryProof ? `${job.deliveryProof.photoPaths.length} รูป · ผู้เซ็น ${job.deliveryProof.signerName}` : "ไม่มีข้อมูลยืนยัน"}</span></div>
        {job.status === "completed" && <DriverProofPhotoEditor job={job} actor={actor} onNotice={onNotice} />}
        <h3>ประวัติไฟล์หลักฐาน</h3><Proofs job={job} />
      </div>}
    </article>)}
  </section>;
}
