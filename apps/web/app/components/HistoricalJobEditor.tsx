"use client";

import { useEffect, useState } from "react";
import { Save, Upload } from "lucide-react";
import type { TransportJob } from "@s-fast-transport/shared";
import { historicalPhotoCategories, historicalPhotoLabels, type HistoricalJobDraft, type HistoricalPhotoCategory, type HistoricalPhotos } from "@/lib/historical-job";
import { isImageFile, MAX_SOURCE_IMAGE_BYTES } from "@/lib/image-upload";
import type { UserProfile } from "@/lib/transport-repository";
import { subscribeDrivers, subscribeSubcontractOrganizations, type SubcontractOrganization, type TransportDriver } from "@/lib/resource-repository";
import { ListManagerComboBox } from "./ListManagerComboBox";
import { LocationPicker } from "./LocationPicker";
import { EditField } from "./JobEditor";

function localDateTime(value?: string) {
  return value ? new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Bangkok", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(value)).replace(" ", "T") : "";
}

const emptyPhotos = (): HistoricalPhotos => ({ pickup: [], delivery: [], document: [], expense: [] });

export default function HistoricalJobEditor({ job, actor, busy, onSave, onSavePhotos }: { job: TransportJob; actor: UserProfile; busy: boolean; onSave: (draft: HistoricalJobDraft) => Promise<void>; onSavePhotos: (photos: HistoricalPhotos, onProgress: (message: string) => void) => Promise<void> }) {
  const [draft, setDraft] = useState<HistoricalJobDraft>(() => ({
    submissionId: job.id, customer: job.customer, carrierOrganizationId: job.carrierOrganizationId ?? "", driverId: job.driverId ?? "",
    vehiclePlate: job.vehiclePlate, vehicleType: job.vehicleType ?? "", cargoType: job.cargoType ?? "", tripCount: String(job.tripCount ?? 1),
    pickupDate: job.pickupDate ?? "", pickupTime: job.pickupTime ?? "", pickupLocation: job.pickupLocation, pickupPlace: job.pickupPlace,
    deliveryDate: job.deliveryDate ?? "", deliveryTime: job.deliveryTime ?? "", deliveryLocation: job.deliveryLocation, deliveryPlace: job.deliveryPlace,
    arrivedDeliveryAt: localDateTime(job.arrivedDeliveryAt), completedAt: localDateTime(job.completedAt), notes: job.notes ?? ""
  }));
  const [organizations, setOrganizations] = useState<SubcontractOrganization[]>([]);
  const [companyError, setCompanyError] = useState("");
  const [driverData, setDriverData] = useState<{ organizationId: string; items: TransportDriver[]; error: string } | null>(null);
  const [photos, setPhotos] = useState<HistoricalPhotos>(emptyPhotos);
  const [photoError, setPhotoError] = useState("");
  const [photoProgress, setPhotoProgress] = useState("");
  useEffect(() => subscribeSubcontractOrganizations(setOrganizations, setCompanyError), []);
  useEffect(() => {
    if (!draft.carrierOrganizationId) return;
    return subscribeDrivers(draft.carrierOrganizationId,
      items => setDriverData({ organizationId: draft.carrierOrganizationId, items, error: "" }),
      error => setDriverData({ organizationId: draft.carrierOrganizationId, items: [], error }));
  }, [draft.carrierOrganizationId]);
  const driversReady = driverData?.organizationId === draft.carrierOrganizationId && !driverData.error;
  const drivers = driversReady ? driverData.items : [];
  function change(field: keyof HistoricalJobDraft, value: string) { setDraft(current => ({ ...current, [field]: value })); }
  function addPhotos(category: HistoricalPhotoCategory, files: FileList | null) {
    const selected = Array.from(files ?? []);
    if ((job.historicalEvidence?.[category]?.length ?? 0) + photos[category].length + selected.length > 10) { setPhotoError("แต่ละหมวดเก็บได้ไม่เกิน 10 รูป"); return; }
    if (selected.some(file => !isImageFile(file) || file.size < 1 || file.size > MAX_SOURCE_IMAGE_BYTES)) { setPhotoError("กรุณาเลือกรูปภาพขนาดไม่เกิน 20 MB ต่อรูป"); return; }
    setPhotoError("");
    setPhotos(current => ({ ...current, [category]: [...current[category], ...selected] }));
  }

  return <div className="job-edit-form"><form className="job-edit-form" onSubmit={event => { event.preventDefault(); void onSave(draft); }}>
    <header className="job-edit-header"><div><h3>แก้ไขใบงานย้อนหลัง</h3><p>เลขใบงาน {job.workOrder} และวันที่รับสินค้าเปลี่ยนไม่ได้ เพื่อคงลำดับเลขเดิม</p></div></header>
    <section className="job-edit-section"><h4>ข้อมูลงาน</h4><div className="job-edit-grid">
      <EditField label="บริษัทผู้ว่าจ้าง"><ListManagerComboBox field="customer" value={draft.customer} onChange={value => change("customer", value)} placeholder="เลือกบริษัทผู้ว่าจ้าง" organizationId="main" actor={actor} required /></EditField>
      <EditField label="บริษัทขนส่ง"><select required value={draft.carrierOrganizationId} onChange={event => setDraft(current => ({ ...current, carrierOrganizationId: event.target.value, driverId: "" }))}><option value="">เลือกบริษัทขนส่ง</option><option value="main">{actor.organizationName || "S Fast Transport"} · บริษัทหลัก</option>{organizations.map(company => <option key={company.id} value={company.id}>{company.name}{company.active ? "" : " · ปิดใช้งาน"}</option>)}</select>{companyError && <small role="alert">โหลดบริษัทขนส่งไม่สำเร็จ: {companyError}</small>}</EditField>
      <EditField label="คนขับ"><select required value={draft.driverId} disabled={!driversReady} onChange={event => change("driverId", event.target.value)}><option value="">{driversReady ? "เลือกคนขับ" : "เลือกบริษัทขนส่งก่อน"}</option>{drivers.map(driver => <option key={driver.id} value={driver.id}>{driver.name}{driver.status === "inactive" ? " · ปิดใช้งาน" : ""}</option>)}</select>{driverData?.error && <small role="alert">โหลดคนขับไม่สำเร็จ: {driverData.error}</small>}</EditField>
      <EditField label="ทะเบียนรถ"><ListManagerComboBox field="vehicle_plate" value={draft.vehiclePlate} onChange={value => change("vehiclePlate", value)} placeholder="ทะเบียนรถ" organizationId="main" actor={actor} required /></EditField>
      <EditField label="ประเภทรถ"><ListManagerComboBox field="vehicle_type" value={draft.vehicleType} onChange={value => change("vehicleType", value)} placeholder="ประเภทรถ" organizationId="main" actor={actor} /></EditField>
      <EditField label="ประเภทสินค้า"><ListManagerComboBox field="cargo_type" value={draft.cargoType} onChange={value => change("cargoType", value)} placeholder="ประเภทสินค้า" organizationId="main" actor={actor} /></EditField>
      <EditField label="จำนวนเที่ยว"><input type="number" required min="1" max="999" value={draft.tripCount} onChange={event => change("tripCount", event.target.value)} /></EditField>
    </div></section>
    <div className="job-edit-stops">
      <fieldset className="job-edit-section"><legend>จุดรับสินค้า</legend>
        <EditField label="วันที่รับสินค้า"><input type="date" readOnly value={draft.pickupDate} /></EditField>
        <EditField label="เวลารับสินค้า"><input type="time" value={draft.pickupTime} onChange={event => change("pickupTime", event.target.value)} /></EditField>
        <EditField label="สถานที่"><LocationPicker value={draft.pickupLocation} place={draft.pickupPlace} title="รับงาน" organizationId="main" onChange={(value, place) => setDraft(current => ({ ...current, pickupLocation: value, pickupPlace: place }))} /></EditField>
      </fieldset>
      <fieldset className="job-edit-section"><legend>จุดส่งสินค้า</legend>
        <EditField label="วันที่ส่งสินค้า"><input type="date" required min={draft.pickupDate} value={draft.deliveryDate} onChange={event => change("deliveryDate", event.target.value)} /></EditField>
        <EditField label="กำหนดเวลาส่ง"><input type="time" value={draft.deliveryTime} onChange={event => change("deliveryTime", event.target.value)} /></EditField>
        <EditField label="สถานที่"><LocationPicker value={draft.deliveryLocation} place={draft.deliveryPlace} title="ส่งงาน" organizationId="main" onChange={(value, place) => setDraft(current => ({ ...current, deliveryLocation: value, deliveryPlace: place }))} /></EditField>
      </fieldset>
    </div>
    <section className="job-edit-section"><h4>เวลาจริงและหมายเหตุ</h4><div className="job-edit-grid">
      <EditField label="ถึงจุดส่งจริง (ถ้าทราบ)"><input type="datetime-local" value={draft.arrivedDeliveryAt} onChange={event => change("arrivedDeliveryAt", event.target.value)} /></EditField>
      <EditField label="จบงานจริง"><input type="datetime-local" required value={draft.completedAt} onChange={event => change("completedAt", event.target.value)} /></EditField>
      <EditField label="หมายเหตุ" wide><textarea rows={3} maxLength={2000} value={draft.notes} onChange={event => change("notes", event.target.value)} /></EditField>
    </div></section>
    <div className="job-edit-actions"><button className="primary" type="submit" disabled={busy || !driversReady}><Save size={17} /> บันทึกการแก้ไข</button></div>
  </form>
    <section className="job-edit-section historical-edit-photos"><h4>เพิ่มรูปหลักฐานภายหลัง</h4><p>รูปเดิมจะยังอยู่ เลือกเพิ่มได้หมวดละไม่เกิน 10 รูป</p><div className="historical-photo-grid">{historicalPhotoCategories.map(category => <div className="historical-photo-group" key={category}><label>{historicalPhotoLabels[category]}<input type="file" accept="image/*" multiple disabled={busy || (job.historicalEvidence?.[category]?.length ?? 0) + photos[category].length >= 10} onChange={event => { addPhotos(category, event.target.files); event.target.value = ""; }} /></label><small>มีแล้ว {job.historicalEvidence?.[category]?.length ?? 0} รูป · เลือกเพิ่ม {photos[category].length} รูป · สูงสุด 10 รูป</small>{photos[category].map((file, index) => <div className="historical-edit-photo" key={`${file.name}-${file.lastModified}-${index}`}><span>{file.name}</span><button type="button" disabled={busy} aria-label={`นำรูป ${file.name} ออก`} onClick={() => setPhotos(current => ({ ...current, [category]: current[category].filter((_, position) => position !== index) }))}>นำออก</button></div>)}</div>)}</div>{photoError && <p role="alert">{photoError}</p>}{photoProgress && <p role="status">{photoProgress}</p>}<div className="job-edit-actions"><button className="primary" type="button" disabled={busy || historicalPhotoCategories.every(category => photos[category].length === 0)} onClick={() => void onSavePhotos(photos, setPhotoProgress)}><Upload size={17} /> บันทึกรูปที่เพิ่ม</button></div></section>
  </div>;
}
