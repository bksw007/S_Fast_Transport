"use client";

import Image from "next/image";
import { useParams, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { CalendarDays, ExternalLink, FileText, IdCard, Mail, Phone, Printer, Truck, UserRound } from "lucide-react";
import { subscribePublicDriver, type PublicDriverProfile } from "@/lib/public-driver-repository";
import "./driver-profile.css";

const documentLabels = { idCard: "บัตรประชาชน", driverLicense: "ใบขับขี่" } as const;

export default function PublicDriverPage() {
  const params = useParams<{ token: string }>();
  const searchParams = useSearchParams();
  const [driver, setDriver] = useState<PublicDriverProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const printStarted = useRef(false);
  const printRequested = searchParams.get("print") === "1";

  useEffect(() => {
    if (!params.token) return;
    return subscribePublicDriver(
      params.token,
      (nextDriver) => { setDriver(nextDriver); setError(""); setLoading(false); },
      () => { setError("ลิงก์นี้หมดอายุ ถูกปิดใช้งาน หรือไม่ถูกต้อง"); setLoading(false); }
    );
  }, [params.token]);

  useEffect(() => {
    if (!driver?.name) return;
    const previousTitle = document.title;
    document.title = `ข้อมูลคนขับ ${driver.name}`;
    return () => { document.title = previousTitle; };
  }, [driver?.name]);

  useEffect(() => {
    if (!driver || !printRequested || printStarted.current) return;
    printStarted.current = true;
    let active = true;
    const printWhenReady = async () => {
      await Promise.all(Array.from(document.images).map((image) => image.complete ? Promise.resolve() : new Promise<void>((resolve) => {
        image.addEventListener("load", () => resolve(), { once: true });
        image.addEventListener("error", () => resolve(), { once: true });
      })));
      if (active) window.print();
    };
    const timer = window.setTimeout(() => void printWhenReady(), 120);
    return () => { active = false; window.clearTimeout(timer); };
  }, [driver, printRequested]);

  if (loading) return <DriverState title="กำลังโหลดข้อมูลคนขับ" description="ระบบกำลังตรวจสอบลิงก์สำหรับคุณ" />;
  if (error || !driver) return <DriverState title="ไม่สามารถเปิดข้อมูลคนขับได้" description={error || "ไม่พบข้อมูลคนขับสำหรับลิงก์นี้"} />;

  return (
    <main className="public-driver-shell">
      <header className="public-driver-header">
        <div className="public-driver-brand"><Image src="/icons/truck-logo.png" alt="S Fast Transport" width={56} height={56} priority /><div><strong>{driver.organizationName}</strong><span>Driver Profile</span></div></div>
        <button type="button" onClick={() => window.print()}><Printer size={17} /> พิมพ์ / บันทึก PDF</button>
      </header>

      <section className="public-driver-hero">
        <span className="public-driver-photo">{driver.photoURL ? <Image unoptimized loading="eager" src={driver.photoURL} alt={driver.name} width={220} height={220} /> : <UserRound size={54} />}</span>
        <div><span>ข้อมูลพนักงานขับรถ</span><h1>{driver.name}</h1><p>{driver.licenseType || "ไม่ระบุประเภทใบขับขี่"} · {driver.assignedVehiclePlate || "ยังไม่มอบหมายรถ"}</p></div>
        <strong className="public-driver-status"><span /> {driver.statusLabel}</strong>
      </section>

      <section className="public-driver-facts">
        <article><IdCard size={20} /><span>เลขที่ใบขับขี่</span><strong>{driver.licenseNumber || "—"}</strong></article>
        <article><CalendarDays size={20} /><span>ใบขับขี่หมดอายุ</span><strong>{dateLabel(driver.licenseExpiry)}</strong></article>
        <article><Phone size={20} /><span>เบอร์ติดต่อ</span><strong>{driver.phone || "—"}</strong></article>
        <article><Mail size={20} /><span>อีเมล</span><strong>{driver.email || "—"}</strong></article>
        <article><Truck size={20} /><span>รถที่มอบหมาย</span><strong>{[driver.assignedVehiclePlate, driver.assignedVehicleType].filter(Boolean).join(" · ") || "ยังไม่มอบหมายรถ"}</strong></article>
      </section>

      <section className="public-driver-section">
        <header><div><span>DRIVER DOCUMENTS</span><h2>เอกสารคนขับ</h2></div><FileText size={23} /></header>
        {driver.documents.length ? <div className="public-driver-documents">{driver.documents.map((file) => <a className="public-driver-document" key={file.kind} href={file.url} target="_blank" rel="noreferrer"><span className={`public-driver-document-preview ${file.contentType.startsWith("image/") ? "is-image" : "is-pdf"}`}>{file.contentType.startsWith("image/") ? <Image unoptimized loading="eager" src={file.url} alt={documentLabels[file.kind]} width={720} height={960} sizes="(max-width: 720px) 100vw, 50vw" /> : <><FileText size={32} /><em>PDF</em></>}</span><span className="public-driver-document-meta"><span><strong>{documentLabels[file.kind]}</strong><small>{file.fileName || "เปิดเอกสาร"}</small></span><ExternalLink size={15} /></span></a>)}</div> : <p className="public-driver-empty">ยังไม่มีเอกสารแนบไว้</p>}
      </section>

      <footer className="public-driver-footer">ข้อมูลนี้จัดทำโดย {driver.organizationName} · ลิงก์หมดอายุ {new Date(driver.expiresAt).toLocaleDateString("th-TH", { dateStyle: "long" })}</footer>
    </main>
  );
}

function dateLabel(value: string) {
  if (!value) return "—";
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString("th-TH", { dateStyle: "long" });
}

function DriverState({ title, description }: { title: string; description: string }) {
  return <main className="public-driver-state"><UserRound size={40} /><h1>{title}</h1><p>{description}</p></main>;
}
