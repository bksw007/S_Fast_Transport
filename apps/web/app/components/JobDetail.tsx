"use client";
import JobContacts from "./JobContacts";
import { useEffect, useState } from "react";
import Image from "next/image";
import { QrCode, Settings, Share2, Truck, MapPin, FileText, Clock3, UserRound, PackageCheck } from "lucide-react";
import { statusLabels, type DriverIssueType, type TransportJob } from "@s-fast-transport/shared";
import { createTrackingShareLink, saveJobRouteDistance, uploadProof, type UserProfile } from "@/lib/transport-repository";
import { recordTime, subscribeJobRecords, type JobRecord } from "@/lib/job-detail-repository";
import { formatPhoneNumber } from "@/lib/profile-repository";
import { coordinateFingerprint } from "@/lib/google-routes-distance";
import { requestJobRoadDistance } from "@/lib/job-road-distance-client";
import JobEditor from "./JobEditor";
import DriverStatusDialog, { type DriverNotice } from "./DriverStatusDialog";
import JobRouteHistory from "./JobRouteHistory";
import { canAdministerJob, deleteJob, resolveDriverIssue, updateJobDetails } from "@/lib/job-detail-repository";

const tabs = ["รายละเอียดงาน", "หลักฐาน", "ตำแหน่งปัจจุบัน", "ประวัติเส้นทาง", "Timeline เหตุการณ์"];
const issueLabels: Record<DriverIssueType, string> = { accident: "อุบัติเหตุ", traffic: "จราจรติดขัด", heavy_rain: "ฝนตกหนัก", vehicle_breakdown: "รถเสีย", road_closed: "เส้นทางปิด", contact_failed: "ติดต่อลูกค้าไม่ได้", loading_delay: "รอสินค้านาน", customer_absent: "ลูกค้าไม่อยู่", signature_refused: "ปฏิเสธเซ็นชื่อ", photo_unavailable: "ถ่ายรูปไม่ได้", goods_damaged: "สินค้าเสียหาย", other: "ปัญหาอื่น ๆ" };
const dateLabel = (value: number | string) => value && Number.isFinite(new Date(value).getTime()) ? new Date(value).toLocaleString("th-TH") : "รอบันทึกเวลา";
const mapUrl = (lat: number, lng: number) => `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
const validPoint = (lat: unknown, lng: unknown) => typeof lat === "number" && typeof lng === "number" && Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 && (lat !== 0 || lng !== 0);

export function previewableEvidenceUrl(data: Record<string, unknown>): string | null {
  const url = data.downloadUrl;
  if (typeof url !== "string" || !url.startsWith("https://")) return null;
  const contentType = typeof data.contentType === "string" ? data.contentType.toLowerCase() : "";
  if (contentType) return contentType.startsWith("image/") ? url : null;
  const fileName = typeof data.fileName === "string" ? data.fileName : "";
  return ["photo", "photo_revision", "signature", "issue"].includes(String(data.proofKind)) || /\.(jpe?g|png|webp|gif|svg)$/i.test(fileName) ? url : null;
}

export function approximateDistanceKm(from?: { lat: number; lng: number }, to?: { lat: number; lng: number }) {
  if (!from || !to || !validPoint(from.lat, from.lng) || !validPoint(to.lat, to.lng)) return null;
  const radians = (degrees: number) => degrees * Math.PI / 180;
  const latitudeDelta = radians(to.lat - from.lat);
  const longitudeDelta = radians(to.lng - from.lng);
  const startLatitude = radians(from.lat);
  const endLatitude = radians(to.lat);
  const haversine = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(startLatitude) * Math.cos(endLatitude) * Math.sin(longitudeDelta / 2) ** 2;
  const normalized = Math.min(1, Math.max(0, haversine));
  return 6371 * 2 * Math.atan2(Math.sqrt(normalized), Math.sqrt(1 - normalized));
}

function distanceLabel(distanceMeters: number | null) {
  if (distanceMeters === null) return "";
  if (distanceMeters < 1000) return `${Math.round(distanceMeters)} ม.`;
  const distanceKm = distanceMeters / 1000;
  return `${distanceKm < 10 ? distanceKm.toFixed(1) : Math.round(distanceKm).toLocaleString("th-TH")} กม.`;
}

export function cachedRoadDistanceMeters(job: Pick<TransportJob, "pickupPlace" | "deliveryPlace" | "routeDistanceMeters" | "routeDistanceFingerprint" | "routeDistanceProvider">) {
  const fingerprint = coordinateFingerprint(job.pickupPlace, job.deliveryPlace);
  return fingerprint
    && job.routeDistanceProvider === "google_routes"
    && job.routeDistanceFingerprint === fingerprint
    && typeof job.routeDistanceMeters === "number"
    && Number.isFinite(job.routeDistanceMeters)
    && job.routeDistanceMeters > 0
      ? job.routeDistanceMeters
      : null;
}

type DistanceState = { meters: number | null; source: "road" | "approximate" | "loading" | "none" };
type RequestedDistanceState = DistanceState & { fingerprint: string };
const pendingDistanceRequests = new Map<string, Promise<number>>();
const sessionDistanceResults = new Map<string, number | null>();

function approximateDistanceState(job: TransportJob): DistanceState {
  const kilometers = approximateDistanceKm(job.pickupPlace, job.deliveryPlace);
  return kilometers === null ? { meters: null, source: "none" } : { meters: kilometers * 1000, source: "approximate" };
}

async function requestRoadDistance(job: TransportJob) {
  const fingerprint = coordinateFingerprint(job.pickupPlace, job.deliveryPlace);
  if (!fingerprint || !job.pickupPlace || !job.deliveryPlace) throw new Error("ไม่มีพิกัดสำหรับคำนวณระยะทาง");
  const requestKey = `${job.id}:${fingerprint}`;
  if (sessionDistanceResults.has(requestKey)) {
    const saved = sessionDistanceResults.get(requestKey);
    if (typeof saved === "number") return saved;
    throw new Error("Google Maps ไม่พร้อมใช้งานในขณะนี้");
  }
  const existing = pendingDistanceRequests.get(requestKey);
  if (existing) return existing;
  const pending = requestJobRoadDistance(job.id, job.pickupPlace, job.deliveryPlace).then(distanceMeters => {
    sessionDistanceResults.set(requestKey, distanceMeters);
    return distanceMeters;
  }, error => {
    sessionDistanceResults.set(requestKey, null);
    throw error;
  });
  pendingDistanceRequests.set(requestKey, pending);
  void pending.then(() => pendingDistanceRequests.delete(requestKey), () => pendingDistanceRequests.delete(requestKey));
  return pending;
}

function Records({ job, kind }: { job: TransportJob; kind: "proofs" | "events" | "locations" }) {
  const [rows, setRows] = useState<JobRecord[]>([]);
  const [state, setState] = useState("กำลังโหลด…");
  useEffect(() => subscribeJobRecords(job.id, kind, data => { setRows(data); setState(""); }, () => setState("โหลดข้อมูลไม่สำเร็จ กรุณาปิดแล้วเปิดแท็บนี้อีกครั้ง")), [job.id, kind]);
  const currentPaths = [...(job.pickupProof?.photoPaths ?? []), ...(job.deliveryProof?.photoPaths ?? []), ...(job.returnPickupProof?.photoPaths ?? []), ...(job.returnDeliveryProof?.photoPaths ?? []), ...(job.handoverDocumentPhotoPaths ?? [])];
  const visibleRows = kind === "proofs" ? rows.filter(({ data }) => !["photo", "photo_revision"].includes(String(data.proofKind)) || currentPaths.includes(String(data.storagePath))) : rows;
  if (state) return <p className="job-detail-empty" role="status">{state}</p>;
  if (!visibleRows.length) return <p className="job-detail-empty">ยังไม่มี{kind === "proofs" ? "หลักฐาน" : kind === "events" ? "เหตุการณ์ที่บันทึก" : "ประวัติตำแหน่ง"}สำหรับใบงานนี้</p>;
  if (kind === "locations") return <JobRouteHistory rows={visibleRows} />;
  return <div className={`job-records job-records-${kind}`}>
    {visibleRows.map(({ id, data }) => <article key={id}>
      <time>{dateLabel(recordTime(data))}</time>
      {kind === "proofs" ? <><strong>{data.proofStage === "handover" ? "เอกสารนำส่ง" : data.proofStage === "returnPickup" ? "ขากลับ · จุดรับสินค้า" : data.proofStage === "returnDelivery" ? "ขากลับ · จุดส่งสินค้า" : data.proofStage === "pickup" ? job.returnTrip ? "ขาไป · จุดรับสินค้า" : "จุดรับสินค้า" : data.proofStage === "delivery" ? job.returnTrip ? "ขาไป · จุดส่งสินค้า" : "จุดส่งสินค้า" : "หลักฐานทั่วไป"} · {data.proofStage === "handover" ? "รูปเอกสาร" : data.proofKind === "signature" ? "ลายเซ็น" : data.proofKind === "photo" || data.proofKind === "photo_revision" ? "รูปสินค้า" : data.fileName || "หลักฐาน"}</strong><p>{data.proofKind === "signature" ? `ผู้เซ็น ${data.signerName || "—"} · ` : ""}อัปโหลดโดย {data.uploadedByName || "—"}</p><EvidencePreview data={data} />{typeof data.downloadUrl === "string" && data.downloadUrl.startsWith("https://") && <a href={data.downloadUrl} target="_blank" rel="noreferrer">เปิด / ดาวน์โหลดหลักฐาน</a>}</>
        : kind === "events" ? <><strong>{data.message || data.type || "เหตุการณ์"}</strong><p>{data.actorName || "ระบบ"}</p>{data.type === "proof_upload_failed" && data.metadata && <p>ขั้นตอน {String(data.metadata.phase || "-")} · {String(data.metadata.assetKind || "-")} #{Number(data.metadata.assetIndex ?? 0) + 1} · HTTP {String(data.metadata.httpStatus || "-")} · ตอบกลับ {String(data.metadata.serverCode || "-")}/{String(data.metadata.serverReason || "-")} · ส่งแล้ว {Math.round(Number(data.metadata.transferredBytes || 0) / 1024)} KB จาก {Math.round(Number(data.metadata.assetBytes || 0) / 1024)} KB</p>}</>
        : null}
    </article>)}
  </div>;
}

function EvidencePreview({ data }: { data: JobRecord["data"] }) {
  const url = previewableEvidenceUrl(data);
  if (!url) return null;
  const label = String(data.fileName || data.proofKind || "หลักฐาน");
  return <a className="job-proof-preview" href={url} target="_blank" rel="noreferrer" aria-label={`เปิดภาพหลักฐาน ${label}`}><Image unoptimized src={url} width={480} height={320} alt={`ภาพตัวอย่าง ${label}`} /></a>;
}

export default function JobDetail({ job, actor, canWrite, map, onDeleted }: { job: TransportJob; actor: UserProfile; canWrite: boolean; map: React.ReactNode; onDeleted: () => void }) {
  const [tab, setTab] = useState(0);
  const [panel, setPanel] = useState<"share" | "qr" | "settings" | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [saveNotice, setSaveNotice] = useState<DriverNotice | null>(null);
  const [resolutionNote, setResolutionNote] = useState("");
  const [link, setLink] = useState("");
  const [qr, setQr] = useState("");
  const [requestedDistance, setRequestedDistance] = useState<RequestedDistanceState | null>(null);
  const routeFingerprint = coordinateFingerprint(job.pickupPlace, job.deliveryPlace);
  const cachedDistance = cachedRoadDistanceMeters(job);
  const routeDistance: DistanceState = cachedDistance !== null
    ? { meters: cachedDistance, source: "road" }
    : requestedDistance?.fingerprint === routeFingerprint
      ? requestedDistance
      : routeFingerprint
        ? { meters: null, source: "loading" }
        : { meters: null, source: "none" };

  useEffect(() => {
    const cached = cachedRoadDistanceMeters(job);
    const fingerprint = coordinateFingerprint(job.pickupPlace, job.deliveryPlace);
    if (cached !== null || !fingerprint) return;
    let active = true;
    void requestRoadDistance(job).then(distanceMeters => {
      if (active) setRequestedDistance({ fingerprint, meters: distanceMeters, source: "road" });
      if (canWrite) void saveJobRouteDistance(job.id, distanceMeters, fingerprint, actor).catch(() => undefined);
    }).catch(() => {
      if (active) setRequestedDistance({ fingerprint, ...approximateDistanceState(job) });
    });
    return () => { active = false; };
  }, [actor, canWrite, job, job.deliveryPlace, job.pickupPlace]);

  const routeDistanceLabel = distanceLabel(routeDistance.meters);

  async function perform(action: () => Promise<void>, success: string) {
    setBusy(true); setMessage("");
    try { await action(); setMessage(success); } catch (error) { setMessage(error instanceof Error ? error.message : "ทำรายการไม่สำเร็จ"); } finally { setBusy(false); }
  }
  async function saveEditedJob(draft: Parameters<typeof updateJobDetails>[1]) {
    if (busy) return;
    setBusy(true);
    setMessage("");
    setSaveNotice({ title: "กำลังบันทึกการแก้ไข", detail: `ใบงาน ${job.workOrder} · กรุณารอสักครู่`, tone: "pending" });
    try {
      await updateJobDetails(job, draft, actor);
      setPanel(null);
      setSaveNotice({ title: "บันทึกการแก้ไขสำเร็จ", detail: `อัปเดตใบงาน ${job.workOrder} เรียบร้อยแล้ว`, tone: "success" });
    } catch (error) {
      const detail = error instanceof Error ? error.message : "บันทึกการแก้ไขไม่สำเร็จ";
      setMessage(detail);
      setSaveNotice({ title: "บันทึกการแก้ไขไม่สำเร็จ", detail: `${detail} กรุณาตรวจข้อมูลแล้วลองอีกครั้ง`, tone: "error" });
    } finally {
      setBusy(false);
    }
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
        <button aria-label="แก้ไขใบงาน" title="แก้ไขใบงาน" aria-expanded={panel === "settings"} disabled={busy || !canWrite || !canAdministerJob(job, actor)} onClick={() => { setPanel(panel === "settings" ? null : "settings"); setMessage(""); }}><Settings size={18} /></button>
      </div></div>
      <div className="tabs" role="tablist" aria-label="ข้อมูลใบงาน">{tabs.map((label, index) => <button key={label} id={`job-tab-${index}`} role="tab" aria-selected={tab === index} aria-controls="job-tab-content" tabIndex={tab === index ? 0 : -1} className={tab === index ? "selected" : ""} onClick={() => { setTab(index); setPanel(null); }} onKeyDown={event => {
        const next = event.key === "ArrowRight" ? (index + 1) % tabs.length : event.key === "ArrowLeft" ? (index + tabs.length - 1) % tabs.length : event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : null;
        if (next !== null) { event.preventDefault(); setTab(next); setPanel(null); document.getElementById(`job-tab-${next}`)?.focus(); }
      }}>{label}</button>)}</div>
    </div>
    <div className="job-detail-body">
      {(busy || message) && <p role="status">{busy ? "กำลังดำเนินการ…" : message}</p>}
      {panel && <aside className="job-action-panel">
        <button className="job-action-close" disabled={busy} onClick={() => setPanel(null)}>ปิด{panel === "settings" ? "การแก้ไข" : "ลิงก์ติดตาม"}</button>
        {panel === "settings" ? <JobEditor job={job} actor={actor} busy={busy} canDelete={canAdministerJob(job, actor)} onSave={saveEditedJob} onDelete={() => perform(async () => { await deleteJob(job, actor); onDeleted(); }, "ลบใบงานแล้ว")} /> : <><h3>{panel === "qr" ? "QR ติดตามงาน" : "แชร์ลิงก์ติดตามงาน"}</h3>{panel === "qr" && qr && <><Image unoptimized src={qr} width={280} height={280} alt={`QR ติดตามใบงาน ${job.workOrder}`} /><a download={`tracking-${job.workOrder}.png`} href={qr}>ดาวน์โหลด QR</a></>}{link && <><label>ลิงก์ติดตาม<input readOnly value={link} onFocus={event => event.target.select()} /></label><a href={link} target="_blank" rel="noreferrer">เปิดหน้าติดตาม</a></>}</>}
      </aside>}
      <div role="tabpanel" id="job-tab-content" aria-labelledby={`job-tab-${tab}`} tabIndex={0}>
        {tab === 0 && <div className="job-detail-overview">
          {job.lastIssue && !job.lastIssue.resolvedAt && <section className="job-issue-resolution"><h3>คนขับแจ้งปัญหา: {issueLabels[job.lastIssue.type] ?? "อื่น ๆ"}</h3>{job.lastIssue.note && <p>{job.lastIssue.note}</p>}<label>วิธีแก้ไขหรือคำแนะนำ<input value={resolutionNote} maxLength={500} placeholder="เช่น ประสานลูกค้าแล้ว ให้เข้าทางประตู 2" onChange={event => setResolutionNote(event.target.value)} /></label><button disabled={busy || !canAdministerJob(job, actor) || !resolutionNote.trim()} onClick={() => void perform(async () => { await resolveDriverIssue(job, resolutionNote, actor); setResolutionNote(""); }, "บันทึกการแก้ไขและแจ้งคนขับแล้ว")}>บันทึกการแก้ไข</button></section>}
          <JobContacts job={job} /><section className="job-detail-route"><div className="job-route-heading"><h3><MapPin size={18} /> เส้นทางขนส่ง</h3>{routeDistance.source === "loading" ? <span role="status">กำลังคำนวณระยะทาง…</span> : routeDistanceLabel && <span title={routeDistance.source === "road" ? "ระยะทางตามถนนจาก Google Maps บันทึกไว้กับใบงานเพื่อไม่เรียกซ้ำ" : "ค่าประมาณแบบเส้นตรง เนื่องจากยังใช้ Google Maps ไม่ได้"}>{routeDistance.source === "road" ? "ระยะทางตามถนน" : "ระยะทางประมาณ"} <strong>{routeDistanceLabel}</strong></span>}</div><div className="job-route-stops"><div><span className="job-route-dot" /><div><small>จุดรับสินค้า</small><strong>{job.pickupLocation || "—"}</strong>{job.pickupPlace && <a href={job.pickupPlace.navigationUrl} target="_blank" rel="noreferrer">เปิดเส้นทางไปจุดรับ</a>}</div></div><div><span className="job-route-dot destination" /><div><small>จุดส่งสินค้า</small><strong>{job.deliveryLocation || "—"}</strong>{job.deliveryPlace && <a href={job.deliveryPlace.navigationUrl} target="_blank" rel="noreferrer">เปิดเส้นทางไปจุดส่ง</a>}</div></div></div></section>
          {job.returnTrip && <section className="job-detail-route"><div className="job-route-heading"><h3><MapPin size={18} /> เที่ยวขากลับ · รับสินค้ากลับ</h3><span>{job.activeLeg === 2 ? "กำลังดำเนินการ" : job.status === "completed" ? "เสร็จแล้ว" : "รอดำเนินการ"}</span></div><div className="job-route-stops"><div><span className="job-route-dot" /><div><small>รับสินค้ากลับ · {job.returnTrip.pickupDate} {job.returnTrip.pickupTime}</small><strong>{job.returnTrip.pickupLocation}</strong>{job.returnTrip.pickupPlace && <a href={job.returnTrip.pickupPlace.navigationUrl} target="_blank" rel="noreferrer">เปิดเส้นทางไปจุดรับ</a>}</div></div><div><span className="job-route-dot destination" /><div><small>ส่งสินค้ากลับ · {job.returnTrip.deliveryDate} {job.returnTrip.deliveryTime}</small><strong>{job.returnTrip.deliveryLocation}</strong>{job.returnTrip.deliveryPlace && <a href={job.returnTrip.deliveryPlace.navigationUrl} target="_blank" rel="noreferrer">เปิดเส้นทางไปจุดส่ง</a>}</div></div></div></section>}
          <div className="job-detail-section-grid">
            <DetailGroup title="ข้อมูลใบงาน" icon={<FileText size={18} />} fields={{ "เลขที่ใบงาน": job.workOrder, "ลูกค้า": job.customer, "บริษัทขนส่ง": job.carrierName, "วันที่รับงานจากผู้ว่าจ้าง": job.jobDate, "ประเภทสินค้า": job.cargoType }} />
            <DetailGroup title="รถและคนขับ" icon={<UserRound size={18} />} fields={{ "คนขับ": job.driverName, "เบอร์ติดต่อ": formatPhoneNumber(job.driverPhone), "ทะเบียนรถ": job.vehiclePlate, "ประเภทรถ": job.vehicleType, "จำนวนรอบ": job.tripCount }} />
            <DetailGroup title="กำหนดการรับ-ส่งสินค้า" icon={<Clock3 size={18} />} fields={{ "กำหนดรับ": [job.pickupDate, job.pickupTime].filter(Boolean).join(" "), "กำหนดส่ง": [job.deliveryDate, job.deliveryTime].filter(Boolean).join(" ") }} />
            {job.returnTrip && <DetailGroup title="กำหนดการขากลับ" icon={<Clock3 size={18} />} fields={{ "กำหนดรับสินค้ากลับ": `${job.returnTrip.pickupDate} ${job.returnTrip.pickupTime}`, "กำหนดส่งสินค้ากลับ": `${job.returnTrip.deliveryDate} ${job.returnTrip.deliveryTime}`, "หลักฐานจุดรับ": job.returnPickupProof ? `${job.returnPickupProof.photoPaths.length} รูป · ${job.returnPickupProof.signerName}` : "รอบันทึก", "หลักฐานจุดส่ง": job.returnDeliveryProof ? `${job.returnDeliveryProof.photoPaths.length} รูป · ${job.returnDeliveryProof.signerName}` : "รอบันทึก" }} />}
            <DetailGroup title="หมายเหตุ" icon={<PackageCheck size={18} />} fields={{ "รายละเอียดเพิ่มเติม": job.notes || "ไม่มีหมายเหตุเพิ่มเติม" }} />
          </div>
        </div>}

        {tab === 1 && <><label className="upload-button">แนบรูป / PDF<input aria-label="แนบหลักฐาน" type="file" accept="image/*,.pdf" disabled={busy || !canWrite} onChange={event => { const file = event.target.files?.[0]; if (file) void perform(async () => { await uploadProof(job, file, actor); }, "อัปโหลดหลักฐานแล้ว"); event.target.value = ""; }} /></label><p>รูปต้นฉบับไม่เกิน 20 MB · PDF ไม่เกิน 10 MB</p><Records key={`${job.id}-proofs`} job={job} kind="proofs" /></>}
        {tab === 2 && <><p>{job.trackingEnabled ? "กำลังแชร์ตำแหน่ง" : "หยุดแชร์ตำแหน่ง"} · ล่าสุด {dateLabel(job.currentLocation.updatedAt)}</p>{job.trackingStatus !== "not_started" && validPoint(job.currentLocation.lat, job.currentLocation.lng) ? <>{map}<a href={mapUrl(job.currentLocation.lat, job.currentLocation.lng)} target="_blank" rel="noreferrer">เปิดตำแหน่งล่าสุดใน Google Maps</a><p>ความเร็ว {job.currentLocation.speed} กม./ชม. · ความแม่นยำ {job.currentLocation.accuracy} เมตร</p></> : <p>ยังไม่มีพิกัดสำหรับงานนี้</p>}</>}
        {tab === 3 && <Records key={`${job.id}-locations`} job={job} kind="locations" />}
        {tab === 4 && <Records key={`${job.id}-events`} job={job} kind="events" />}
      </div>
    </div>
    {saveNotice && <DriverStatusDialog notice={saveNotice} onClose={() => setSaveNotice(null)} />}
  </section>;
}

function DetailGroup({ title, icon, fields }: { title: string; icon: React.ReactNode; fields: Record<string, string | number | undefined> }) {
  return <section className="job-detail-group"><h3>{icon}{title}</h3><dl className="job-detail-fields">{Object.entries(fields).map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value || "—"}</dd></div>)}</dl></section>;
}
