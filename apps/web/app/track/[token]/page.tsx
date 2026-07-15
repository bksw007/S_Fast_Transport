"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { useParams } from "next/navigation";
import { CheckCircle2, Clock3, MapPin, Navigation, PackageCheck, Truck } from "lucide-react";
import { subscribePublicTracking, type PublicTrackingJob } from "@/lib/public-tracking-repository";
import "./tracking.css";

export default function PublicTrackingPage() {
  const params = useParams<{ token: string }>();
  const [tracking, setTracking] = useState<PublicTrackingJob | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!params.token) return;

    return subscribePublicTracking(
      params.token,
      (nextTracking) => {
        setTracking(nextTracking);
        setLoading(false);
      },
      () => {
        setError("ลิงก์นี้หมดอายุ ถูกปิดใช้งาน หรือไม่ถูกต้อง");
        setLoading(false);
      }
    );
  }, [params.token]);

  if (loading) {
    return <TrackingState title="กำลังโหลดสถานะงาน" description="ระบบกำลังตรวจสอบลิงก์ติดตามของคุณ" />;
  }

  if (error || !tracking) {
    return <TrackingState title="ไม่สามารถเปิดลิงก์ติดตามได้" description={error || "ไม่พบข้อมูลงานสำหรับลิงก์นี้"} />;
  }

  const mapUrl = tracking.location
    ? `https://www.google.com/maps?q=${tracking.location.lat},${tracking.location.lng}`
    : null;

  return (
    <main className="tracking-shell">
      <header className="tracking-header">
        <div className="tracking-brand">
          <Image src="/icons/truck-logo.png" alt="S Fast Transport" width={58} height={58} priority />
          <div><strong>S Fast Transport</strong><span>Customer Tracking</span></div>
        </div>
        <span className="tracking-live"><span /> อัปเดตสถานะสด</span>
      </header>

      <section className="tracking-hero">
        <div>
          <span className="tracking-kicker">งานขนส่ง {tracking.workOrder}</span>
          <h1>{tracking.statusLabel}</h1>
          <p>{tracking.customerName} · ดำเนินการโดย {tracking.carrierName}</p>
        </div>
        <div className="tracking-eta"><Clock3 size={20} /><span>เวลาถึงโดยประมาณ</span><strong>{tracking.eta}</strong></div>
      </section>

      <section className="tracking-grid">
        <article className="tracking-route">
          <div className="tracking-section-title"><Navigation size={20} /><div><strong>เส้นทางจัดส่ง</strong><span>ตำแหน่งที่เปิดเผยเฉพาะงานนี้</span></div></div>
          <div className="tracking-stop"><span className="origin" /><div><small>จุดรับสินค้า</small><strong>{tracking.pickupLocation}</strong></div></div>
          <div className="tracking-line" />
          <div className="tracking-stop"><span className="destination" /><div><small>จุดส่งสินค้า</small><strong>{tracking.deliveryLocation}</strong></div></div>
          {mapUrl && <a className="tracking-map-link" href={mapUrl} target="_blank" rel="noreferrer"><MapPin size={18} /> เปิดตำแหน่งล่าสุดใน Google Maps</a>}
        </article>

        <article className="tracking-summary">
          <div><Truck size={20} /><span>รถที่ให้บริการ</span><strong>{tracking.vehicleLabel}</strong></div>
          <div><PackageCheck size={20} /><span>สถานะล่าสุด</span><strong>{tracking.statusLabel}</strong></div>
          <div><CheckCircle2 size={20} /><span>อัปเดตล่าสุด</span><strong>{tracking.lastUpdatedAt}</strong></div>
        </article>
      </section>

      <footer className="tracking-footer">ลิงก์นี้แสดงเฉพาะข้อมูลงานที่จำเป็น และไม่เปิดเผยงานอื่นหรือข้อมูลส่วนตัวของคนขับ</footer>
    </main>
  );
}

function TrackingState({ title, description }: { title: string; description: string }) {
  return <main className="tracking-state"><Truck size={38} /><h1>{title}</h1><p>{description}</p></main>;
}
