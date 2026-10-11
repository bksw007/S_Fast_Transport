"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { useParams } from "next/navigation";
import { AlertTriangle, Camera, CheckCircle2, Clock3, Download, MapPin, Navigation, PackageCheck, PenLine, Phone, Truck, UserRound } from "lucide-react";
import { statusLabels, type JobStatus } from "@s-fast-transport/shared";
import { completionReportHtml, type CompletionReportJob, type ReportProof } from "@/lib/job-completion-report";
import { driverIssueLabels } from "@/lib/driver-issue-labels";
import { fetchPublicTrackingDetails, publicTrackingAssetUrl, subscribePublicTracking, type PublicProof, type PublicTrackingDetails, type PublicTrackingJob } from "@/lib/public-tracking-repository";
import "./tracking.css";

function thaiDateTime(value: string) {
  const date = new Date(value);
  return Number.isFinite(date.getTime())
    ? date.toLocaleString("th-TH", { timeZone: "Asia/Bangkok", dateStyle: "medium", timeStyle: "short" })
    : "ยังไม่ระบุ";
}

function scheduledArrival(date: string, time: string, fallback = "") {
  if (/^\d{4}-\d{2}-\d{2}$/.test(date) && /^([01]\d|2[0-3]):[0-5]\d$/.test(time)) {
    return `${thaiDateTime(`${date}T${time}:00+07:00`)} น.`;
  }
  if (/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) return `${time} น.`;
  return fallback && fallback !== "-" ? fallback : "ยังไม่ระบุ";
}

function phoneHref(phone: string) {
  const number = phone.replace(/[^\d+]/g, "");
  return number.length >= 9 ? `tel:${number}` : null;
}

export default function PublicTrackingPage() {
  const params = useParams<{ token: string }>();
  const [tracking, setTracking] = useState<PublicTrackingJob | null>(null);
  const [details, setDetails] = useState<PublicTrackingDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [detailsLoading, setDetailsLoading] = useState(true);
  const [error, setError] = useState("");
  const [detailsError, setDetailsError] = useState("");
  const hasTracking = Boolean(tracking);

  useEffect(() => {
    if (!params.token) return;
    return subscribePublicTracking(
      params.token,
      (nextTracking) => { setError(""); setTracking(nextTracking); setLoading(false); },
      () => { setError("ลิงก์นี้หมดอายุ ถูกปิดใช้งาน หรือไม่ถูกต้อง"); setLoading(false); }
    );
  }, [params.token]);

  useEffect(() => {
    if (!params.token || !hasTracking) return;
    const controller = new AbortController();
    async function refresh() {
      try {
        const next = await fetchPublicTrackingDetails(params.token, controller.signal);
        if (controller.signal.aborted) return;
        setDetails(next);
        setDetailsError("");
      } catch (cause) {
        if (!controller.signal.aborted) setDetailsError(cause instanceof Error ? cause.message : "โหลดรายละเอียดงานไม่สำเร็จ");
      } finally {
        if (!controller.signal.aborted) setDetailsLoading(false);
      }
    }
    void refresh();
    const timer = setInterval(() => void refresh(), 30_000);
    return () => { controller.abort(); clearInterval(timer); };
  }, [params.token, hasTracking]);

  if (loading) return <TrackingState title="กำลังโหลดสถานะงาน" description="ระบบกำลังตรวจสอบลิงก์ติดตามของคุณ" />;
  if (error || !tracking) return <TrackingState title="ไม่สามารถเปิดลิงก์ติดตามได้" description={error || "ไม่พบข้อมูลงานสำหรับลิงก์นี้"} />;

  const mapUrl = tracking.location ? `https://www.google.com/maps?q=${tracking.location.lat},${tracking.location.lng}` : null;
  const callablePhone = details ? phoneHref(details.driverPhone) : null;
  const canDownloadReport = details?.status === "completed";
  const statusLabel = details?.status && details.status in statusLabels ? statusLabels[details.status as JobStatus] : tracking.statusLabel;

  function openReport() {
    if (!details || !canDownloadReport) return;
    const preview = window.open("", "_blank");
    if (!preview) { setDetailsError("กรุณาอนุญาตหน้าต่างใหม่เพื่อเปิดรายงาน"); return; }
    const reportProof = (stage: "pickup" | "delivery", proof: PublicProof): ReportProof => ({
      photos: Array.from({ length: proof.photoCount }, (_, index) => publicTrackingAssetUrl(params.token, stage, "photo", index)),
      signature: proof.hasSignature ? publicTrackingAssetUrl(params.token, stage, "signature") : undefined
    });
    const reportJob: CompletionReportJob = {
      status: "completed", workOrder: details.workOrder, customer: details.customer, carrierName: details.carrierName,
      jobDate: details.jobDate, cargoType: details.cargoType, tripCount: details.tripCount,
      pickupLocation: details.pickupLocation, pickupDate: details.pickupDate, pickupTime: details.pickupTime,
      deliveryLocation: details.deliveryLocation, deliveryDate: details.deliveryDate, deliveryTime: details.deliveryTime,
      vehiclePlate: details.vehiclePlate, vehicleType: details.vehicleType, driverName: details.driverName,
      routeDistanceMeters: details.routeDistanceMeters ?? undefined, arrivedDeliveryAt: details.arrivedDeliveryAt,
      completedAt: details.completedAt,
      pickupProof: { signerName: details.pickupProof.signerName, signedAt: details.pickupProof.signedAt },
      deliveryProof: { signerName: details.deliveryProof.signerName, signedAt: details.deliveryProof.signedAt }
    };
    preview.document.write(completionReportHtml(reportJob, reportProof("pickup", details.pickupProof), reportProof("delivery", details.deliveryProof), `${window.location.origin}/icons/truck-logo.png`));
    preview.document.close();
    preview.focus();
  }

  return (
    <main className="tracking-shell">
      <header className="tracking-header">
        <div className="tracking-brand"><Image src="/icons/truck-logo.png" alt="S Fast Transport" width={58} height={58} priority /><div><strong>S Fast Transport</strong><span>Customer Tracking</span></div></div>
        <span className="tracking-live"><span /> อัปเดตอัตโนมัติ</span>
      </header>
      <section className="tracking-hero">
        <div><span className="tracking-kicker">งานขนส่ง {tracking.workOrder}</span><h1>{statusLabel}</h1><p>{tracking.customerName} · ดำเนินการโดย {tracking.carrierName}</p></div>
        <div className="tracking-arrivals">
          <div className="tracking-eta"><Clock3 size={20} /><span>ถึงจุดรับโดยประมาณ</span><strong>{details ? scheduledArrival(details.pickupDate, details.pickupTime) : "กำลังโหลด..."}</strong></div>
          <div className="tracking-eta"><Clock3 size={20} /><span>ถึงจุดส่งโดยประมาณ</span><strong>{details ? scheduledArrival(details.deliveryDate, details.deliveryTime, details.eta) : tracking.eta}</strong></div>
        </div>
      </section>
      {detailsError && <p className="tracking-data-error" role="alert">{detailsError} · ระบบจะลองโหลดใหม่อัตโนมัติ</p>}
      <section className="tracking-grid">
        <article className="tracking-route">
          <div className="tracking-section-title"><Navigation size={20} /><div><strong>เส้นทางจัดส่ง</strong><span>ตำแหน่งที่เปิดเผยเฉพาะงานนี้</span></div></div>
          <div className="tracking-stop"><span className="origin" /><div><small>จุดรับสินค้า</small><strong>{tracking.pickupLocation}</strong>{tracking.pickupPlace && <a href={tracking.pickupPlace.navigationUrl} target="_blank" rel="noreferrer">เปิดจุดรับใน Google Maps</a>}</div></div>
          <div className="tracking-line" />
          <div className="tracking-stop"><span className="destination" /><div><small>จุดส่งสินค้า</small><strong>{tracking.deliveryLocation}</strong>{tracking.deliveryPlace && <a href={tracking.deliveryPlace.navigationUrl} target="_blank" rel="noreferrer">เปิดจุดส่งใน Google Maps</a>}</div></div>
          {mapUrl && <a className="tracking-map-link" href={mapUrl} target="_blank" rel="noreferrer"><MapPin size={18} /> เปิดตำแหน่งล่าสุดใน Google Maps</a>}
        </article>
        <aside className="tracking-side">
          <article className="tracking-summary">
            <div><Truck size={20} /><span>รถที่ให้บริการ</span><strong>{tracking.vehicleLabel}</strong></div>
            <div><PackageCheck size={20} /><span>สถานะล่าสุด</span><strong>{statusLabel}</strong></div>
            <div><CheckCircle2 size={20} /><span>อัปเดตล่าสุด</span><strong>{thaiDateTime(tracking.lastUpdatedAt)}</strong></div>
          </article>
          <article className="tracking-driver-card">
            <div className="tracking-section-title"><UserRound size={20} /><div><strong>ติดต่อคนขับ</strong><span>ผู้รับผิดชอบใบงานนี้</span></div></div>
            <strong className="tracking-driver-name">{details?.driverName || (detailsLoading ? "กำลังโหลด..." : "ยังไม่ระบุชื่อ")}</strong>
            <span className="tracking-driver-phone">{details?.driverPhone || "ยังไม่ระบุเบอร์โทร"}</span>
            {callablePhone ? <a className="tracking-call-button" href={callablePhone}><Phone size={18} /> โทรหาคนขับ</a> : <span className="tracking-call-unavailable">ยังไม่มีเบอร์โทรที่ใช้ได้ในใบงาน</span>}
          </article>
        </aside>
      </section>
      {details?.issue && <section className={`tracking-issue ${details.issue.resolvedAt ? "is-resolved" : ""}`} role="status">
        <AlertTriangle size={22} /><div><strong>{details.issue.resolvedAt ? "ปัญหาที่แจ้งได้รับการจัดการแล้ว" : "คนขับแจ้งปัญหาเข้ามา"}</strong><p>{driverIssueLabels[details.issue.type] || "ปัญหาการขนส่ง"}{details.issue.note ? ` · ${details.issue.note}` : ""}</p><small>แจ้งเมื่อ {thaiDateTime(details.issue.reportedAt)}{details.issue.resolvedAt ? ` · ดำเนินการแล้ว ${thaiDateTime(details.issue.resolvedAt)}` : ""}</small>{details.issue.resolutionNote && <p>การดำเนินการ: {details.issue.resolutionNote}</p>}{details.issue.hasPhoto && <a href={publicTrackingAssetUrl(params.token, "issue", "issue")} target="_blank" rel="noreferrer">ดูภาพประกอบปัญหา</a>}</div>
      </section>}
      <section className="tracking-evidence-grid" aria-label="หลักฐานการขนส่ง">
        <ProofCard token={params.token} stage="pickup" title="หลักฐานจากจุดรับ" proof={details?.pickupProof} loading={detailsLoading} />
        <ProofCard token={params.token} stage="delivery" title="หลักฐานจากจุดส่ง" proof={details?.deliveryProof} loading={detailsLoading} />
      </section>
      <section className="tracking-report"><div><strong>รายงานการขนส่ง</strong><span>รายงานการขนส่ง พร้อมภาพและลายเซ็นทั้งสองจุด</span></div><button type="button" onClick={openReport} disabled={!canDownloadReport}><Download size={18} /> ดาวน์โหลดรายงานการขนส่ง</button>{!canDownloadReport && <small>ดาวน์โหลดได้เมื่องานเสร็จสมบูรณ์</small>}</section>
      <footer className="tracking-footer">ลิงก์นี้แสดงข้อมูลเฉพาะใบงานนี้ รวมถึงเบอร์ติดต่อคนขับและหลักฐานการส่งมอบ จนกว่าลิงก์จะหมดอายุ</footer>
    </main>
  );
}

function ProofCard({ token, stage, title, proof, loading }: { token: string; stage: "pickup" | "delivery"; title: string; proof?: PublicProof; loading: boolean }) {
  return <article className="tracking-proof-card">
    <div className="tracking-section-title"><Camera size={20} /><div><strong>{title}</strong><span>{proof?.photoCount ? `${proof.photoCount} ภาพ` : "ภาพถ่ายและลายเซ็น"}</span></div></div>
    {proof?.photoCount ? <div className="tracking-proof-photos">{Array.from({ length: proof.photoCount }, (_, index) => <a key={index} href={publicTrackingAssetUrl(token, stage, "photo", index)} target="_blank" rel="noreferrer"><Image unoptimized src={publicTrackingAssetUrl(token, stage, "photo", index)} alt={`${title} ภาพที่ ${index + 1}`} width={360} height={240} /></a>)}</div> : <p className="tracking-proof-empty">{loading ? "กำลังโหลดหลักฐาน..." : "ยังไม่มีภาพจากจุดนี้"}</p>}
    {proof?.hasSignature ? <div className="tracking-signature"><div><PenLine size={17} /><span>ลายเซ็น {proof.signerName || "ผู้รับสินค้า"}</span><small>{thaiDateTime(proof.signedAt)}</small></div><Image unoptimized src={publicTrackingAssetUrl(token, stage, "signature")} alt={`ลายเซ็น${proof.signerName || title}`} width={240} height={110} /></div> : <p className="tracking-proof-empty">{loading ? "" : "ยังไม่มีลายเซ็นจากจุดนี้"}</p>}
  </article>;
}

function TrackingState({ title, description }: { title: string; description: string }) {
  return <main className="tracking-state"><Truck size={38} /><h1>{title}</h1><p>{description}</p></main>;
}
