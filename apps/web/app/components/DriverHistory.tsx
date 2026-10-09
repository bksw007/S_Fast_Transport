"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { CheckCircle2, ChevronDown, ChevronUp, FileImage, MapPin, Truck } from "lucide-react";
import type { TransportJob } from "@s-fast-transport/shared";
import { subscribeJobRecords, type JobRecord } from "@/lib/job-detail-repository";

function dateLabel(value?: string) {
  if (!value) return "ไม่ระบุเวลา";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short" });
}

function Proofs({ jobId }: { jobId: string }) {
  const [records, setRecords] = useState<JobRecord[]>([]);
  const [error, setError] = useState("");
  useEffect(() => subscribeJobRecords(jobId, "proofs", setRecords, cause => setError(cause.message)), [jobId]);
  if (error) return <p role="alert">โหลดหลักฐานไม่สำเร็จ: {error}</p>;
  if (!records.length) return <p>ยังไม่มีไฟล์หลักฐานสำหรับงานนี้</p>;
  return <div className="driver-history-proofs">{records.map(({ id, data }) => {
    const url = typeof data.downloadUrl === "string" && data.downloadUrl.startsWith("https://") ? data.downloadUrl : "";
    const isImage = typeof data.contentType === "string" && data.contentType.startsWith("image/");
    return <a href={url || undefined} target="_blank" rel="noreferrer" key={id} className="driver-history-proof">
      {url && isImage ? <Image unoptimized src={url} alt={data.proofKind === "signature" ? "ลายเซ็น" : "รูปหลักฐาน"} width={220} height={145} /> : <FileImage size={30} />}
      <span>{data.proofStage === "pickup" || data.checkInStage === "pickup" ? "จุดรับ" : data.proofStage === "delivery" || data.checkInStage === "delivery" ? "จุดส่ง" : "หลักฐาน"} · {data.proofKind === "signature" ? `ลายเซ็น ${data.signerName || ""}` : data.proofKind === "photo" ? "รูปสินค้า" : data.fileName || "ไฟล์แนบ"}</span>
    </a>;
  })}</div>;
}

export default function DriverHistory({ jobs }: { jobs: TransportJob[] }) {
  const [expandedId, setExpandedId] = useState("");
  const history = jobs.filter(job => job.status === "completed" || job.status === "cancelled")
    .sort((a, b) => String(b.completedAt || b.deliveryDate || b.id).localeCompare(String(a.completedAt || a.deliveryDate || a.id)));
  return <section className="screen driver-history-screen">
    <div className="section-title"><div><h1>ประวัติงาน</h1><p>งานที่เสร็จหรือยกเลิกแล้ว {history.length} งาน</p></div></div>
    {!history.length && <div className="driver-history-empty"><CheckCircle2 size={30} /><strong>ยังไม่มีประวัติงาน</strong><p>เมื่อจบงาน รายการจะปรากฏที่นี่</p></div>}
    {history.map(job => <article className="driver-history-card" key={job.id}>
      <button type="button" className="driver-history-toggle" aria-expanded={expandedId === job.id} onClick={() => setExpandedId(current => current === job.id ? "" : job.id)}>
        <span className="driver-history-icon"><Truck size={21} /></span>
        <span className="driver-history-heading"><small>ใบงาน {job.workOrder}</small><strong>{job.customer}</strong><span>{job.pickupLocation} → {job.deliveryLocation}</span></span>
        <span className="driver-history-status">{job.status === "completed" ? "เสร็จงาน" : "ยกเลิก"}</span>
        {expandedId === job.id ? <ChevronUp size={19} /> : <ChevronDown size={19} />}
      </button>
      <div className="driver-history-summary"><span>{job.completedAt ? `จบงาน ${dateLabel(job.completedAt)}` : job.deliveryDate ? `กำหนดส่ง ${job.deliveryDate}` : "ไม่ระบุเวลา"}</span><span>{job.vehiclePlate}</span></div>
      {expandedId === job.id && <div className="driver-history-details">
        <p><MapPin size={16} /> จุดรับ: {job.pickupLocation}</p><p><MapPin size={16} /> จุดส่ง: {job.deliveryLocation}</p>
        <div className="driver-history-proof-status"><span>จุดรับ: {job.pickupProof ? `${job.pickupProof.photoPaths.length} รูป · ${job.pickupProof.signerName}` : "ไม่มีข้อมูลยืนยัน"}</span><span>จุดส่ง: {job.deliveryProof ? `${job.deliveryProof.photoPaths.length} รูป · ${job.deliveryProof.signerName}` : "ไม่มีข้อมูลยืนยัน"}</span></div>
        <h3>หลักฐานที่บันทึก</h3><Proofs jobId={job.id} />
      </div>}
    </article>)}
  </section>;
}
