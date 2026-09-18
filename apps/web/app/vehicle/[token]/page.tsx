"use client";

import Image from "next/image";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { CalendarDays, ExternalLink, FileText, PackageCheck, Printer, Scale, ShieldCheck, Truck } from "lucide-react";
import { subscribePublicVehicle, type PublicVehicleProfile } from "@/lib/public-vehicle-repository";
import "./vehicle-profile.css";

const documentLabels = {
  compulsoryInsurance: "พรบ.",
  vehicleInsurance: "ประกันภัยรถ",
  cargoInsurance: "ประกันสินค้า",
  other: "เอกสารอื่นๆ"
} as const;

const imageLabels = { front: "ด้านหน้า", rear: "ด้านหลัง", right: "ด้านขวา", left: "ด้านซ้าย" } as const;

export default function PublicVehiclePage() {
  const params = useParams<{ token: string }>();
  const [vehicle, setVehicle] = useState<PublicVehicleProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!params.token) return;
    return subscribePublicVehicle(
      params.token,
      (nextVehicle) => { setVehicle(nextVehicle); setError(""); setLoading(false); },
      () => { setError("ลิงก์นี้หมดอายุ ถูกปิดใช้งาน หรือไม่ถูกต้อง"); setLoading(false); }
    );
  }, [params.token]);

  if (loading) return <VehicleState title="กำลังโหลดข้อมูลรถ" description="ระบบกำลังตรวจสอบลิงก์สำหรับคุณ" />;
  if (error || !vehicle) return <VehicleState title="ไม่สามารถเปิดข้อมูลรถได้" description={error || "ไม่พบข้อมูลรถสำหรับลิงก์นี้"} />;

  return (
    <main className="public-vehicle-shell">
      <header className="public-vehicle-header">
        <div className="public-vehicle-brand"><Image src="/icons/truck-logo.png" alt="S Fast Transport" width={56} height={56} priority /><div><strong>{vehicle.organizationName}</strong><span>Vehicle Profile</span></div></div>
        <button type="button" onClick={() => window.print()}><Printer size={17} /> พิมพ์ / บันทึก PDF</button>
      </header>

      <section className="public-vehicle-hero">
        <div><span>ข้อมูลยานพาหนะ</span><h1>{vehicle.plate}</h1><p>{vehicle.vehicleType} · {[vehicle.brand, vehicle.model].filter(Boolean).join(" ") || "ไม่ระบุยี่ห้อและรุ่น"}</p></div>
        <strong className="public-vehicle-status"><span /> {vehicle.statusLabel}</strong>
      </section>

      <section className="public-vehicle-facts">
        <article><Scale size={20} /><span>น้ำหนักตัวรถ</span><strong>{weight(vehicle.vehicleWeightKg)}</strong></article>
        <article><PackageCheck size={20} /><span>น้ำหนักบรรทุก</span><strong>{weight(vehicle.capacityKg)}</strong></article>
        <article><ShieldCheck size={20} /><span>พรบ.หมดอายุ</span><strong>{dateLabel(vehicle.compulsoryInsuranceExpiry)}</strong></article>
        <article><CalendarDays size={20} /><span>ประกันหมดอายุ</span><strong>{dateLabel(vehicle.insuranceExpiry)}</strong></article>
      </section>

      <section className="public-vehicle-section">
        <header><div><span>VEHICLE VIEWS</span><h2>ภาพรถ 4 ด้าน</h2></div><Truck size={23} /></header>
        {vehicle.images.length ? <div className="public-vehicle-gallery">{vehicle.images.map((file) => <figure key={file.kind}><Image unoptimized src={file.url} alt={`ภาพรถ${imageLabels[file.kind]}`} width={900} height={600} sizes="(max-width: 720px) 100vw, 50vw" /><figcaption>{imageLabels[file.kind]}</figcaption></figure>)}</div> : <p className="public-vehicle-empty">ยังไม่มีภาพรถแนบไว้</p>}
      </section>

      <section className="public-vehicle-section">
        <header><div><span>VEHICLE DOCUMENTS</span><h2>เอกสารยานพาหนะ</h2></div><FileText size={23} /></header>
        {vehicle.documents.length ? <div className="public-vehicle-documents">{vehicle.documents.map((file) => <a key={file.kind} href={file.url} target="_blank" rel="noreferrer"><FileText size={19} /><span><strong>{documentLabels[file.kind]}</strong><small>{file.fileName || "เปิดเอกสาร"}</small></span><ExternalLink size={15} /></a>)}</div> : <p className="public-vehicle-empty">ยังไม่มีเอกสารแนบไว้</p>}
      </section>

      <footer className="public-vehicle-footer">ข้อมูลนี้จัดทำโดย {vehicle.organizationName} · ลิงก์หมดอายุ {new Date(vehicle.expiresAt).toLocaleDateString("th-TH", { dateStyle: "long" })}</footer>
    </main>
  );
}

function weight(value: number | null) {
  return value === null ? "—" : `${value.toLocaleString("th-TH")} กก.`;
}

function dateLabel(value: string) {
  if (!value) return "—";
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString("th-TH", { dateStyle: "long" });
}

function VehicleState({ title, description }: { title: string; description: string }) {
  return <main className="public-vehicle-state"><Truck size={40} /><h1>{title}</h1><p>{description}</p></main>;
}
