"use client";

import { useEffect, useState } from "react";
import { ArrowUpRight, CheckCircle2, Clock3, MapPin, XCircle } from "lucide-react";
import { rejectCustomerJobRequest, subscribeCustomerJobRequests, type CustomerJobRequest } from "@/lib/customer-job-requests";
import type { UserProfile } from "@/lib/transport-repository";

const statusLabel = { pending: "รอพิจารณา", accepted: "รับงานแล้ว", rejected: "ไม่รับงาน" } as const;

export default function CustomerRequestInbox({ actor, onAccept }: { actor: UserProfile; onAccept: (request: CustomerJobRequest) => void }) {
  const [requests, setRequests] = useState<CustomerJobRequest[]>([]);
  const [error, setError] = useState("");
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [rejectingId, setRejectingId] = useState("");
  const [busyId, setBusyId] = useState("");

  useEffect(() => subscribeCustomerJobRequests(actor, setRequests, setError), [actor]);

  async function reject(item: CustomerJobRequest) {
    const reason = notes[item.id]?.trim() || "";
    if (!reason) { setError("กรุณาระบุเหตุผลที่ไม่รับงาน"); return; }
    setBusyId(item.id); setError("");
    try { await rejectCustomerJobRequest(item.id, reason); setRejectingId(""); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "บันทึกผลไม่สำเร็จ"); }
    finally { setBusyId(""); }
  }

  const sorted = [...requests].sort((a, b) => Number(b.status === "pending") - Number(a.status === "pending") || (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));
  return <div className="customer-request-inbox">
    <div className="customer-request-inbox-intro"><strong>คำขอจากลูกค้า</strong><span>รอพิจารณา {requests.filter(item => item.status === "pending").length} รายการ</span></div>
    {error && <p role="alert" className="customer-request-inbox-error">{error}</p>}
    {!sorted.length && <p className="customer-request-inbox-empty">ยังไม่มีคำขอแจ้งงานจากลูกค้า</p>}
    {sorted.map(item => <article className="customer-request-inbox-card" data-status={item.status} key={item.id}>
      <header><div><small>{item.customerName} · {item.requesterName}</small><h3>{item.cargoType} · {item.vehicleType}</h3></div><span className="customer-request-inbox-state">{item.status === "pending" ? <Clock3 size={16} /> : item.status === "accepted" ? <CheckCircle2 size={16} /> : <XCircle size={16} />}{statusLabel[item.status]}</span></header>
      <div className="customer-request-inbox-route"><div><MapPin size={17} /><span><small>จุดรับ</small><strong>{item.pickupPlace.name}</strong><a href={item.pickupPlace.navigationUrl} target="_blank" rel="noreferrer">ตรวจหมุด <ArrowUpRight size={14} /></a></span><time>{item.pickupDate} {item.pickupTime}</time></div><div><MapPin size={17} /><span><small>จุดส่ง</small><strong>{item.deliveryPlace.name}</strong><a href={item.deliveryPlace.navigationUrl} target="_blank" rel="noreferrer">ตรวจหมุด <ArrowUpRight size={14} /></a></span><time>{item.deliveryDate} {item.deliveryTime}</time></div></div>
      {item.notes && <p className="customer-request-inbox-note">หมายเหตุ: {item.notes}</p>}
      <p className="customer-request-inbox-meta">แจ้งเมื่อ {item.createdAt?.toMillis ? new Date(item.createdAt.toMillis()).toLocaleString("th-TH") : "—"} · ส่งผลถึง {item.recipientEmails.join(", ")} และอีเมลบริษัท</p>
      {item.status === "pending" ? <div className="customer-request-inbox-actions"><button type="button" className="accept" onClick={() => onAccept(item)}>รับงานและสร้างใบงาน</button><button type="button" onClick={() => { setRejectingId(rejectingId === item.id ? "" : item.id); setError(""); }}>ไม่รับงาน</button></div> : item.status === "accepted" ? <p className="customer-request-inbox-result">สร้างใบงาน {item.workOrder || "—"} แล้ว</p> : <p className="customer-request-inbox-result rejected">เหตุผล: {item.rejectionReason}</p>}
      {rejectingId === item.id && item.status === "pending" && <div className="customer-request-inbox-reject"><label>เหตุผลที่ไม่รับงาน<textarea rows={3} maxLength={500} value={notes[item.id] || ""} onChange={event => setNotes(current => ({ ...current, [item.id]: event.target.value }))} placeholder="ระบุเหตุผลเพื่อแจ้งลูกค้า" /></label><div><button type="button" onClick={() => setRejectingId("")}>ยกเลิก</button><button type="button" disabled={busyId === item.id || !notes[item.id]?.trim()} onClick={() => void reject(item)}>{busyId === item.id ? "กำลังบันทึก…" : "ยืนยันไม่รับงาน"}</button></div></div>}
    </article>)}
  </div>;
}
