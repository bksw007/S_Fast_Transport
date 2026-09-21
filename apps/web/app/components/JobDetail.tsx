"use client";
import JobContacts from "./JobContacts";
import { useEffect, useState } from "react";
import Image from "next/image";
import { QrCode, Settings, Share2, Truck, MapPin, FileText, Clock3, UserRound, PackageCheck } from "lucide-react";
import { statusLabels, type TransportJob } from "@s-fast-transport/shared";
import { createTrackingShareLink, uploadProof, type UserProfile } from "@/lib/transport-repository";
import { recordTime, saveJobSettings, subscribeJobRecords, type JobRecord } from "@/lib/job-detail-repository";
import { formatPhoneNumber } from "@/lib/profile-repository";

const tabs = ["รายละเอียดงาน", "หลักฐาน", "ตำแหน่งปัจจุบัน", "ประวัติเส้นทาง", "Timeline เหตุการณ์"];
const dateLabel = (value: number | string) => value && Number.isFinite(new Date(value).getTime()) ? new Date(value).toLocaleString("th-TH") : "รอบันทึกเวลา";
const mapUrl = (lat: number, lng: number) => `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
const validPoint = (lat: unknown, lng: unknown) => typeof lat === "number" && typeof lng === "number" && Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 && (lat !== 0 || lng !== 0);

function Records({ jobId, kind }: { jobId: string; kind: "proofs" | "events" | "locations" }) {
  const [rows, setRows] = useState<JobRecord[]>([]);
  const [state, setState] = useState("กำลังโหลด…");
  useEffect(() => subscribeJobRecords(jobId, kind, data => { setRows(data); setState(""); }, () => setState("โหลดข้อมูลไม่สำเร็จ กรุณาปิดแล้วเปิดแท็บนี้อีกครั้ง")), [jobId, kind]);
  if (state) return <p className="job-detail-empty" role="status">{state}</p>;
  if (!rows.length) return <p className="job-detail-empty">ยังไม่มี{kind === "proofs" ? "หลักฐาน" : kind === "events" ? "เหตุการณ์ที่บันทึก" : "ประวัติตำแหน่ง"}สำหรับใบงานนี้</p>;
  return <div className={`job-records job-records-${kind}`}>
    {kind === "locations" && <p>ตำแหน่งที่บันทึกจริง ล่าสุดไม่เกิน 500 จุด เรียงจากใหม่ไปเก่า</p>}
    {rows.map(({ id, data }) => <article key={id}>
      <time>{dateLabel(recordTime(data))}</time>
      {kind === "proofs" ? <><strong>{data.fileName || "หลักฐานส่งสินค้า"}</strong><p>อัปโหลดโดย {data.uploadedByName || "—"}</p>{typeof data.downloadUrl === "string" && data.downloadUrl.startsWith("https://") && <a href={data.downloadUrl} target="_blank" rel="noreferrer">เปิด / ดาวน์โหลดหลักฐาน</a>}</>
        : kind === "events" ? <><strong>{data.message || data.type || "เหตุการณ์"}</strong><p>{data.actorName || "ระบบ"}</p></>
        : <><strong>{Number(data.speed || 0).toFixed(1)} กม./ชม.</strong>{validPoint(data.lat, data.lng) ? <a href={mapUrl(data.lat, data.lng)} target="_blank" rel="noreferrer">{data.lat.toFixed(6)}, {data.lng.toFixed(6)} · เปิดแผนที่</a> : <p>ไม่มีพิกัดที่ใช้งานได้</p>}</>}
    </article>)}
  </div>;
}

export default function JobDetail({ job, actor, canWrite, map }: { job: TransportJob; actor: UserProfile; canWrite: boolean; map: React.ReactNode }) {
  const [tab, setTab] = useState(0);
  const [panel, setPanel] = useState<"share" | "qr" | "settings" | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [link, setLink] = useState("");
  const [qr, setQr] = useState("");
  const [settings, setSettings] = useState({ driverPhone: job.driverPhone, eta: job.eta, notes: job.notes || "" });

  async function perform(action: () => Promise<void>, success: string) {
    setBusy(true); setMessage("");
    try { await action(); setMessage(success); } catch (error) { setMessage(error instanceof Error ? error.message : "ทำรายการไม่สำเร็จ"); } finally { setBusy(false); }
  }
  async function share(kind: "share" | "qr") {
    setPanel(kind);
    await perform(async () => {
      const url = link || `${window.location.origin}/track/${await createTrackingShareLink(job, actor)}`;
      setLink(url);
      if (kind === "qr") {
        const QRCode = await import("qrcode");
        setQr(await QRCode.toDataURL(url, { width: 280, margin: 2 }));
      } else {
        try { await navigator.clipboard.writeText(url); } catch { throw new Error("สร้างลิงก์แล้ว กรุณาคัดลอกจากช่องลิงก์ด้านล่าง"); }
      }
    }, kind === "qr" ? "สแกน QR เพื่อติดตามงาน · อายุลิงก์ตามการตั้งค่าบริษัท" : "คัดลอกลิงก์ติดตามแล้ว · อายุลิงก์ตามการตั้งค่าบริษัท");
  }
  return <section className="detail-panel job-detail-functional">
    <div className="job-detail-toolbar">
      <div className="detail-head"><div className="job-detail-identity"><span className="job-detail-emblem"><Truck size={26} /></span><div><span className="job-detail-eyebrow">ใบงานขนส่ง</span><h2>{job.workOrder}</h2><p>{job.customer}</p></div><span className={`job-detail-status ${job.status === "problem" || job.status === "cancelled" ? "is-alert" : ""}`}>{statusLabels[job.status]}</span></div><div className="detail-actions">
        <button disabled={busy || !canWrite} onClick={() => void share("share")}><Share2 size={18} /> Share</button>
        <button disabled={busy || !canWrite} onClick={() => void share("qr")}><QrCode size={18} /> QR</button>
        <button aria-label="ตั้งค่าใบงาน" aria-expanded={panel === "settings"} disabled={busy || !canWrite} onClick={() => { setSettings({ driverPhone: job.driverPhone, eta: job.eta, notes: job.notes || "" }); setPanel(panel === "settings" ? null : "settings"); setMessage(""); }}><Settings size={18} /></button>
      </div></div>
      <div className="tabs" role="tablist" aria-label="ข้อมูลใบงาน">{tabs.map((label, index) => <button key={label} id={`job-tab-${index}`} role="tab" aria-selected={tab === index} aria-controls="job-tab-content" tabIndex={tab === index ? 0 : -1} className={tab === index ? "selected" : ""} onClick={() => { setTab(index); setPanel(null); }} onKeyDown={event => {
        const next = event.key === "ArrowRight" ? (index + 1) % tabs.length : event.key === "ArrowLeft" ? (index + tabs.length - 1) % tabs.length : event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : null;
        if (next !== null) { event.preventDefault(); setTab(next); setPanel(null); document.getElementById(`job-tab-${next}`)?.focus(); }
      }}>{label}</button>)}</div>
    </div>
    <div className="job-detail-body">
      {(busy || message) && <p role="status">{busy ? "กำลังดำเนินการ…" : message}</p>}
      {panel && <aside className="job-action-panel">
        <button className="job-action-close" disabled={busy} onClick={() => setPanel(null)}>ปิด{panel === "settings" ? "การตั้งค่า" : "ลิงก์ติดตาม"}</button>
        {panel === "settings" ? <form onSubmit={event => { event.preventDefault(); void perform(async () => { await saveJobSettings(job, settings, actor); setPanel(null); }, "บันทึกการตั้งค่าแล้ว"); }}>
          <h3>ตั้งค่าใบงาน</h3>
          <label>เบอร์ติดต่อคนขับ<input type="tel" inputMode="numeric" maxLength={12} pattern="[0-9]{3}-[0-9]{3}-[0-9]{4}" value={formatPhoneNumber(settings.driverPhone)} onChange={event => setSettings({ ...settings, driverPhone: formatPhoneNumber(event.target.value) })} /></label>
          <label>กำหนดถึง (ETA)<input required maxLength={100} value={settings.eta} onChange={event => setSettings({ ...settings, eta: event.target.value })} /></label>
          <label>หมายเหตุ<textarea maxLength={2000} rows={4} value={settings.notes} onChange={event => setSettings({ ...settings, notes: event.target.value })} /></label>
          <button disabled={busy || !canWrite} type="submit">บันทึกการตั้งค่า</button>
        </form> : <><h3>{panel === "qr" ? "QR ติดตามงาน" : "แชร์ลิงก์ติดตามงาน"}</h3>{panel === "qr" && qr && <><Image unoptimized src={qr} width={280} height={280} alt={`QR ติดตามใบงาน ${job.workOrder}`} /><a download={`tracking-${job.workOrder}.png`} href={qr}>ดาวน์โหลด QR</a></>}{link && <><label>ลิงก์ติดตาม<input readOnly value={link} onFocus={event => event.target.select()} /></label><a href={link} target="_blank" rel="noreferrer">เปิดหน้าติดตาม</a></>}</>}
      </aside>}
      <div role="tabpanel" id="job-tab-content" aria-labelledby={`job-tab-${tab}`} tabIndex={0}>
        {tab === 0 && <div className="job-detail-overview">
          <JobContacts job={job} /><section className="job-detail-route"><h3><MapPin size={18} /> เส้นทางขนส่ง</h3><div className="job-route-stops"><div><span className="job-route-dot" /><div><small>จุดรับสินค้า</small><strong>{job.pickupLocation || "—"}</strong>{job.pickupPlace && <a href={job.pickupPlace.navigationUrl} target="_blank" rel="noreferrer">เปิดเส้นทางไปจุดรับ</a>}</div></div><div><span className="job-route-dot destination" /><div><small>จุดส่งสินค้า</small><strong>{job.deliveryLocation || "—"}</strong>{job.deliveryPlace && <a href={job.deliveryPlace.navigationUrl} target="_blank" rel="noreferrer">เปิดเส้นทางไปจุดส่ง</a>}</div></div></div></section>
          <div className="job-detail-section-grid">
            <DetailGroup title="ข้อมูลใบงาน" icon={<FileText size={18} />} fields={{ "เลขที่ใบงาน": job.workOrder, "ลูกค้า": job.customer, "บริษัทขนส่ง": job.carrierName, "วันที่รับงาน": [job.jobDate, job.pickupTime].filter(Boolean).join(". ") }} />
            <DetailGroup title="รถและคนขับ" icon={<UserRound size={18} />} fields={{ "คนขับ": job.driverName, "เบอร์ติดต่อ": formatPhoneNumber(job.driverPhone), "ทะเบียนรถ": job.vehiclePlate, "จำนวนรอบ": job.tripCount }} />
            <DetailGroup title="กำหนดการส่ง" icon={<Clock3 size={18} />} fields={{ "กำหนดส่ง": [job.deliveryDate, job.deliveryTime].filter(Boolean).join(" "), "กำหนดถึง (ETA)": job.eta }} />
            <DetailGroup title="หมายเหตุ" icon={<PackageCheck size={18} />} fields={{ "รายละเอียดเพิ่มเติม": job.notes || "ไม่มีหมายเหตุเพิ่มเติม" }} />
          </div>
        </div>}

        {tab === 1 && <><label className="upload-button">แนบรูป / PDF<input aria-label="แนบหลักฐาน" type="file" accept="image/*,.pdf" disabled={busy || !canWrite} onChange={event => { const file = event.target.files?.[0]; if (file) void perform(() => uploadProof(job, file, actor), "อัปโหลดหลักฐานแล้ว"); event.target.value = ""; }} /></label><p>รูปต้นฉบับไม่เกิน 20 MB · PDF ไม่เกิน 10 MB</p><Records key={`${job.id}-proofs`} jobId={job.id} kind="proofs" /></>}
        {tab === 2 && <><p>{job.trackingEnabled ? "กำลังแชร์ตำแหน่ง" : "หยุดแชร์ตำแหน่ง"} · ล่าสุด {dateLabel(job.currentLocation.updatedAt)}</p>{job.trackingStatus !== "not_started" && validPoint(job.currentLocation.lat, job.currentLocation.lng) ? <>{map}<a href={mapUrl(job.currentLocation.lat, job.currentLocation.lng)} target="_blank" rel="noreferrer">เปิดตำแหน่งล่าสุดใน Google Maps</a><p>ความเร็ว {job.currentLocation.speed} กม./ชม. · ความแม่นยำ {job.currentLocation.accuracy} เมตร</p></> : <p>ยังไม่มีพิกัดสำหรับงานนี้</p>}</>}
        {tab === 3 && <Records key={`${job.id}-locations`} jobId={job.id} kind="locations" />}
        {tab === 4 && <Records key={`${job.id}-events`} jobId={job.id} kind="events" />}
      </div>
    </div>
  </section>;
}

function DetailGroup({ title, icon, fields }: { title: string; icon: React.ReactNode; fields: Record<string, string | number | undefined> }) {
  return <section className="job-detail-group"><h3>{icon}{title}</h3><dl className="job-detail-fields">{Object.entries(fields).map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value || "—"}</dd></div>)}</dl></section>;
}
