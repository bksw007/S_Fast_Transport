"use client";

import { useEffect, useRef, useState } from "react";
import { FilePlus2, X } from "lucide-react";
import { ListManagerComboBox } from "./ListManagerComboBox";
import { LocationPicker } from "./LocationPicker";
import { createHistoricalJob, historicalPhotoCategories, type HistoricalJobDraft, type HistoricalPhotoCategory, type HistoricalPhotos } from "@/lib/historical-job";
import { isImageFile, MAX_SOURCE_IMAGE_BYTES } from "@/lib/image-upload";
import type { UserProfile } from "@/lib/transport-repository";
import { subscribeDrivers, subscribeSubcontractOrganizations, type SubcontractOrganization, type TransportDriver } from "@/lib/resource-repository";
import "./historical-job.css";

const photoLabels: Record<HistoricalPhotoCategory, string> = {
  pickup: "รูปรับสินค้า", delivery: "รูปลงสินค้า", document: "รูปเอกสาร (ถ้ามี)", expense: "รูปค่าใช้จ่ายคนขับ (ถ้ามี)"
};
const emptyPhotos = (): HistoricalPhotos => ({ pickup: [], delivery: [], document: [], expense: [] });
const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
const initialDraft = (): HistoricalJobDraft => ({
  submissionId: crypto.randomUUID(), customer: "", carrierOrganizationId: "main",
  driverId: "", vehiclePlate: "", vehicleType: "", cargoType: "", tripCount: "1",
  pickupDate: "", pickupTime: "", pickupLocation: "", deliveryDate: "", deliveryTime: "", deliveryLocation: "",
  arrivedDeliveryAt: "", completedAt: "", notes: ""
});

function SelectedPhoto({ file, onRemove, disabled }: { file: File; onRemove: () => void; disabled: boolean }) {
  const image = useRef<HTMLImageElement>(null);
  const link = useRef<HTMLAnchorElement>(null);
  useEffect(() => {
    const objectUrl = URL.createObjectURL(file);
    if (image.current) image.current.src = objectUrl;
    if (link.current) link.current.href = objectUrl;
    return () => URL.revokeObjectURL(objectUrl);
  }, [file]);
  return <div className="historical-photo"><a ref={link} target="_blank" rel="noreferrer" aria-label={`เปิดรูป ${file.name}`}><img ref={image} alt={`ตัวอย่าง ${file.name}`} /></a><span title={file.name}>{file.name}</span><button type="button" disabled={disabled} onClick={onRemove} aria-label={`ลบรูป ${file.name}`}><X size={16} /></button></div>;
}

export default function HistoricalJobScreen({ actor }: { actor: UserProfile }) {
  const [draft, setDraft] = useState(initialDraft);
  const [photos, setPhotos] = useState<HistoricalPhotos>(emptyPhotos);
  const [organizations, setOrganizations] = useState<SubcontractOrganization[]>([]);
  const [companyError, setCompanyError] = useState("");
  const [driverData, setDriverData] = useState<{ organizationId: string; items: TransportDriver[]; error: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [saved, setSaved] = useState("");
  useEffect(() => subscribeSubcontractOrganizations(setOrganizations, setCompanyError), []);
  useEffect(() => subscribeDrivers(draft.carrierOrganizationId,
    items => setDriverData({ organizationId: draft.carrierOrganizationId, items, error: "" }),
    error => setDriverData({ organizationId: draft.carrierOrganizationId, items: [], error })
  ), [draft.carrierOrganizationId]);
  const driversReady = driverData?.organizationId === draft.carrierOrganizationId;
  const drivers = driversReady ? driverData.items : [];
  function change(field: keyof HistoricalJobDraft, value: string) { setDraft(current => ({ ...current, [field]: value })); }
  function addPhotos(category: HistoricalPhotoCategory, selected: FileList | null) {
    const files = Array.from(selected ?? []);
    if (photos[category].length + files.length > 10) { setError("แต่ละหมวดแนบได้ไม่เกิน 10 รูป"); return; }
    if (files.some(file => !isImageFile(file) || file.size < 1 || file.size > MAX_SOURCE_IMAGE_BYTES)) { setError("กรุณาเลือกรูปภาพขนาดไม่เกิน 20 MB ต่อรูป"); return; }
    setError(""); setPhotos(current => ({ ...current, [category]: [...current[category], ...files] }));
  }
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true); setError(""); setSaved("");
    try {
      const workOrder = await createHistoricalJob(draft, photos, actor, setMessage);
      setSaved(workOrder); setDraft(initialDraft()); setPhotos(emptyPhotos()); setMessage("");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "บันทึกใบงานย้อนหลังไม่สำเร็จ กรุณาลองใหม่"); }
    finally { setBusy(false); }
  }
  const dateKey = draft.pickupDate.replaceAll("-", "");
  return <section className="screen historical-job-screen">
    <header className="section-title historical-hero"><span className="eyebrow">PAST EVENT / ใบงานย้อนหลัง</span><h1><FilePlus2 size={25} /> เพิ่มใบงานย้อนหลัง</h1><p>บันทึกงานที่เสร็จแล้วตามวันที่เกิดขึ้นจริง ระบบจะออกเลขจากวันที่รับสินค้าและลงท้าย PE</p></header>
    {saved && <p className="historical-success" role="status">บันทึกใบงาน {saved} แล้ว · เพิ่มรูปภายหลังได้จากปุ่มแก้ไขใน Dashboard และดู PDF ได้ในเมนูรายงาน</p>}
    <form onSubmit={event => void submit(event)}>
      <section><h2><span>01</span> ข้อมูลงาน</h2><div className="historical-grid">
        <label>เลขใบงาน<input readOnly value={dateKey ? `JN-${dateKey}•••PE` : "เลือกวันที่รับสินค้าก่อน"} /><small>ลำดับจริงเริ่ม 001 และกำหนดเมื่อบันทึก</small></label>
        <label>วันที่รับงานจากผู้ว่าจ้าง<input type="date" readOnly value={draft.pickupDate} /><small>ดึงจากวันที่รับสินค้าอัตโนมัติ</small></label>
        <label>บริษัทผู้ว่าจ้าง<ListManagerComboBox field="customer" value={draft.customer} onChange={value => change("customer", value)} placeholder="เลือกลูกค้าหรือเพิ่มชื่อ" organizationId="main" actor={actor} required /></label>
        <label>บริษัทขนส่ง<select required value={draft.carrierOrganizationId} onChange={event => setDraft(current => ({ ...current, carrierOrganizationId: event.target.value, driverId: "" }))}><option value="main">{actor.organizationName || "S Fast Transport"} · บริษัทหลัก</option>{organizations.map(company => <option key={company.id} value={company.id}>{company.name}{company.active ? "" : " · ปิดใช้งาน"}</option>)}</select>{companyError && <small role="alert">โหลดบริษัทขนส่งไม่สำเร็จ: {companyError}</small>}</label>
        <label>คนขับ<select required value={draft.driverId} disabled={!driversReady || Boolean(driverData?.error)} onChange={event => change("driverId", event.target.value)}><option value="">{driversReady ? "เลือกคนขับจากบริษัทที่เลือก" : "กำลังโหลดคนขับ…"}</option>{drivers.map(driver => <option key={driver.id} value={driver.id}>{driver.name}{driver.status === "inactive" ? " · ปิดใช้งาน" : ""}</option>)}</select>{driverData?.error && <small role="alert">โหลดคนขับไม่สำเร็จ: {driverData.error}</small>}{driversReady && !drivers.length && <small>บริษัทนี้ยังไม่มีคนขับในระบบ</small>}</label>
        <label>ทะเบียนรถ<ListManagerComboBox field="vehicle_plate" value={draft.vehiclePlate} onChange={value => change("vehiclePlate", value)} placeholder="เลือกทะเบียนรถหรือพิมพ์" organizationId="main" actor={actor} required /></label>
        <label>ประเภทรถ<ListManagerComboBox field="vehicle_type" value={draft.vehicleType} onChange={value => change("vehicleType", value)} placeholder="ประเภทรถ" organizationId="main" actor={actor} /></label>
        <label>ประเภทสินค้า<ListManagerComboBox field="cargo_type" value={draft.cargoType} onChange={value => change("cargoType", value)} placeholder="ประเภทสินค้า" organizationId="main" actor={actor} /></label>
        <label>จำนวนเที่ยว<input type="number" required min="1" max="999" value={draft.tripCount} onChange={event => change("tripCount", event.target.value)} /></label>
      </div></section>
      <section><h2><span>02</span> วันเวลาและสถานที่</h2>
        <div className="historical-route-grid">
          <div className="historical-route-panel"><h3>จุดรับสินค้า</h3>
            <div className="historical-route-times">
              <label className="historical-field">วันที่รับสินค้า<input type="date" required max={today()} value={draft.pickupDate} onChange={event => change("pickupDate", event.target.value)} /></label>
              <label className="historical-field">เวลารับสินค้า<input type="time" value={draft.pickupTime} onChange={event => change("pickupTime", event.target.value)} /></label>
            </div>
            <div className="historical-field historical-location"><span>สถานที่รับสินค้า</span><LocationPicker value={draft.pickupLocation} place={draft.pickupPlace} title="รับงาน" organizationId="main" onChange={(value, place) => setDraft(current => ({ ...current, pickupLocation: value, pickupPlace: place }))} /></div>
          </div>
          <div className="historical-route-panel"><h3>จุดส่งสินค้า</h3>
            <div className="historical-route-times">
              <label className="historical-field">วันที่ส่งสินค้า<input type="date" required max={today()} value={draft.deliveryDate} onChange={event => change("deliveryDate", event.target.value)} /></label>
              <label className="historical-field">กำหนดเวลาส่ง<input type="time" value={draft.deliveryTime} onChange={event => change("deliveryTime", event.target.value)} /></label>
            </div>
            <div className="historical-field historical-location"><span>สถานที่ส่งสินค้า</span><LocationPicker value={draft.deliveryLocation} place={draft.deliveryPlace} title="ส่งงาน" organizationId="main" onChange={(value, place) => setDraft(current => ({ ...current, deliveryLocation: value, deliveryPlace: place }))} /></div>
          </div>
        </div>
        <div className="historical-actual-times">
          <label className="historical-field">ถึงจุดส่งจริง (ถ้าทราบ)<input type="datetime-local" max={`${today()}T23:59`} value={draft.arrivedDeliveryAt} onChange={event => change("arrivedDeliveryAt", event.target.value)} /></label>
          <label className="historical-field">จบงานจริง<input type="datetime-local" required max={`${today()}T23:59`} value={draft.completedAt} onChange={event => change("completedAt", event.target.value)} /></label>
        </div>
        <label className="historical-notes">หมายเหตุ<textarea rows={3} maxLength={2000} value={draft.notes} onChange={event => change("notes", event.target.value)} /></label>
      </section>
      <section><h2><span>03</span> รูปหลักฐาน</h2><p>แนบรูปตอนนี้หรือบันทึกใบงานก่อน แล้วเพิ่มรูปภายหลังจากหน้าแก้ไขใบงาน · ไม่ต้องมีลายเซ็น</p><div className="historical-photo-grid">{historicalPhotoCategories.map(category => <div className="historical-photo-group" key={category}><label>{photoLabels[category]}<input type="file" accept="image/*" multiple disabled={busy} onChange={event => { addPhotos(category, event.target.files); event.target.value = ""; }} /></label><small>{photos[category].length}/10 รูป · รูปต้นฉบับไม่เกิน 20 MB</small><div className="historical-photo-list">{photos[category].map((file, index) => <SelectedPhoto key={`${file.name}-${file.lastModified}-${index}`} file={file} disabled={busy} onRemove={() => setPhotos(current => ({ ...current, [category]: current[category].filter((_, position) => position !== index) }))} />)}</div></div>)}</div><p>รูปค่าใช้จ่ายเป็นหลักฐานประกอบใบงาน ยังไม่สร้างรายการเบิกจ่ายหรือยอดเงินอัตโนมัติ</p></section>
      <section className="historical-review"><h2><span>04</span> ตรวจสอบก่อนบันทึก</h2><p>{draft.pickupDate ? `งานนี้จะอยู่ในรายงานตามวันที่รับสินค้า ${draft.pickupDate}` : "เลือกวันที่รับสินค้าเพื่อกำหนดเดือนรายงาน"} · สถานะเสร็จแล้ว · ไม่แจ้งงานใหม่หรือเปิด GPS</p>{message && <p role="status">{message}</p>}{error && <p role="alert" className="historical-error">{error}</p>}<button type="submit" disabled={busy || !driversReady || Boolean(driverData?.error)}>{busy ? "กำลังบันทึก…" : "บันทึกใบงานย้อนหลัง"}</button></section>
    </form>
  </section>;
}
