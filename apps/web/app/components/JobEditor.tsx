"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Save, Trash2 } from "lucide-react";
import type { TransportJob } from "@s-fast-transport/shared";
import { subscribeOrganizationUserProfiles, type UserProfile } from "@/lib/transport-repository";
import { subscribeDrivers, type TransportDriver } from "@/lib/resource-repository";
import { formatPhoneNumber } from "@/lib/profile-repository";
import { jobToEditDraft, type JobEditDraft } from "@/lib/job-edit";
import { ListManagerComboBox } from "./ListManagerComboBox";
import { LocationPicker } from "./LocationPicker";
import ContactPicker from "./ContactPicker";

export default function JobEditor({
  job,
  actor,
  busy,
  canDelete,
  onSave,
  onDelete
}: {
  job: TransportJob;
  actor: UserProfile;
  busy: boolean;
  canDelete: boolean;
  onSave: (draft: JobEditDraft) => Promise<void>;
  onDelete: () => Promise<void>;
}) {
  const [draft, setDraft] = useState(() => jobToEditDraft(job));
  const [drivers, setDrivers] = useState<TransportDriver[]>([]);
  const [profiles, setProfiles] = useState<UserProfile[]>([]);
  const [driversReady, setDriversReady] = useState(false);
  const [profilesReady, setProfilesReady] = useState(false);
  const [driverError, setDriverError] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const organizationId = job.organizationId ?? actor.organizationId ?? "main";

  useEffect(() => {
    const stopDrivers = subscribeDrivers(organizationId, items => { setDrivers(items); setDriversReady(true); }, message => setDriverError(message));
    const stopProfiles = subscribeOrganizationUserProfiles(organizationId, items => { setProfiles(items); setProfilesReady(true); }, message => setDriverError(message));
    return () => { stopDrivers(); stopProfiles(); };
  }, [organizationId]);

  const driverOptions = useMemo(() => drivers
    .filter(driver => driver.organizationId === organizationId && driver.status !== "inactive")
    .map(driver => {
      const linked = profiles.find(user => user.uid === driver.userUid);
      return {
        id: driver.id,
        userUid: driver.userUid,
        name: linked?.fullName || driver.name,
        phone: linked?.phone || driver.phone,
        eligible: Boolean(linked && linked.role === "driver" && linked.active && linked.approvalStatus === "approved" && linked.organizationId === organizationId)
      };
    }), [drivers, organizationId, profiles]);
  const inferredDriverId = drivers.find(driver => driver.userUid && driver.userUid === job.assignedDriverUid)?.id ?? "";
  const selectedDriverId = draft.driverId || inferredDriverId;
  const selectedDriver = driverOptions.find(driver => driver.id === selectedDriverId);
  const currentDriverMissing = selectedDriverId && !driverOptions.some(driver => driver.id === selectedDriverId);
  const driverDataReady = driversReady && profilesReady && !driverError;

  function update<K extends keyof JobEditDraft>(field: K, value: JobEditDraft[K]) {
    setDraft(current => ({ ...current, [field]: value }));
  }

  return <form className="job-edit-form" onSubmit={event => { event.preventDefault(); void onSave({ ...draft, driverId: selectedDriverId }); }}>
    <header className="job-edit-header">
      <div><h3>แก้ไขรายละเอียดใบงาน</h3><p>เลขที่ใบแจ้งงาน {job.workOrder} จะไม่เปลี่ยน</p></div>
    </header>

    <section className="job-edit-section">
      <h4>ข้อมูลทั่วไป</h4>
      <div className="job-edit-grid">
        <EditField label="บริษัทผู้ว่าจ้าง"><ListManagerComboBox field="customer" value={draft.customer} onChange={value => update("customer", value)} placeholder="ค้นหาบริษัทผู้ว่าจ้าง" organizationId={organizationId} actor={actor} required /></EditField>
        <EditField label="วันที่รับงานจากผู้ว่าจ้าง"><input type="date" required value={draft.jobDate} onChange={event => update("jobDate", event.target.value)} /></EditField>
        <EditField label="ประเภทสินค้า"><ListManagerComboBox field="cargo_type" value={draft.cargoType} onChange={value => update("cargoType", value)} placeholder="ค้นหาประเภทสินค้า" organizationId={organizationId} actor={actor} /></EditField>
        <EditField label="ประเภทรถ"><ListManagerComboBox field="vehicle_type" value={draft.vehicleType} onChange={value => update("vehicleType", value)} placeholder="ค้นหาประเภทรถ" organizationId={organizationId} actor={actor} /></EditField>
        <EditField label="จำนวนรอบ"><input type="number" min="1" max="999" required value={draft.tripCount} onChange={event => update("tripCount", event.target.value)} /></EditField>
      </div>
    </section>

    <div className="job-edit-stops">
      <fieldset className="job-edit-section">
        <legend>จุดรับสินค้า</legend>
        <EditField label="สถานที่"><LocationPicker value={draft.pickupLocation} place={draft.pickupPlace} title="รับงาน" organizationId={organizationId} onChange={(value, place) => setDraft(current => ({ ...current, pickupLocation: value, pickupPlace: place }))} /></EditField>
        <div className="job-edit-grid compact"><EditField label="วันที่"><input type="date" value={draft.pickupDate} onChange={event => update("pickupDate", event.target.value)} /></EditField><EditField label="เวลา"><input type="time" value={draft.pickupTime} onChange={event => update("pickupTime", event.target.value)} /></EditField></div>
        <EditField label="ผู้ติดต่อ"><ContactPicker actor={actor} value={{ id: draft.pickupContactId, name: draft.pickupContact, phone: draft.pickupContactPhone, notes: draft.pickupContactNotes }} onChange={contact => setDraft(current => ({ ...current, pickupContactId: contact.id, pickupContact: contact.name, pickupContactPhone: contact.phone, pickupContactNotes: contact.notes }))} /></EditField>
      </fieldset>
      <fieldset className="job-edit-section">
        <legend>จุดส่งสินค้า</legend>
        <EditField label="สถานที่"><LocationPicker value={draft.deliveryLocation} place={draft.deliveryPlace} title="ส่งงาน" organizationId={organizationId} onChange={(value, place) => setDraft(current => ({ ...current, deliveryLocation: value, deliveryPlace: place }))} /></EditField>
        <div className="job-edit-grid compact"><EditField label="วันที่"><input type="date" value={draft.deliveryDate} onChange={event => update("deliveryDate", event.target.value)} /></EditField><EditField label="เวลา"><input type="time" value={draft.deliveryTime} onChange={event => update("deliveryTime", event.target.value)} /></EditField></div>
        <EditField label="ผู้ติดต่อ"><ContactPicker actor={actor} value={{ id: draft.deliveryContactId, name: draft.deliveryContact, phone: draft.deliveryContactPhone, notes: draft.deliveryContactNotes }} onChange={contact => setDraft(current => ({ ...current, deliveryContactId: contact.id, deliveryContact: contact.name, deliveryContactPhone: contact.phone, deliveryContactNotes: contact.notes }))} /></EditField>
      </fieldset>
    </div>

    <section className="job-edit-section">
      <h4>รถ คนขับ และกำหนดการ</h4>
      <div className="job-edit-grid">
        <EditField label="พนักงานขับรถ"><select required value={selectedDriverId} disabled={!driverDataReady || busy} onChange={event => update("driverId", event.target.value)}><option value="">{driverDataReady ? "เลือกพนักงานขับรถ" : "กำลังโหลดคนขับ…"}</option>{currentDriverMissing && <option value={selectedDriverId}>{job.driverName} (ข้อมูลปัจจุบัน)</option>}{driverOptions.map(driver => <option key={driver.id} value={driver.id} disabled={!driver.eligible}>{driver.name}</option>)}</select>{driverError && <small role="alert">โหลดรายชื่อคนขับไม่สำเร็จ: {driverError}</small>}</EditField>
        <EditField label="เบอร์ติดต่อ"><input value={formatPhoneNumber(selectedDriver?.phone || job.driverPhone)} readOnly /></EditField>
        <EditField label="ทะเบียนรถ"><ListManagerComboBox field="vehicle_plate" value={draft.vehiclePlate} onChange={value => update("vehiclePlate", value)} placeholder="ค้นหาทะเบียนรถ" organizationId={organizationId} actor={actor} /></EditField>
        <EditField label="กำหนดถึง (ETA)"><input maxLength={100} value={draft.eta} onChange={event => update("eta", event.target.value)} /></EditField>
        <EditField label="หมายเหตุ" wide><textarea rows={4} maxLength={2000} value={draft.notes} onChange={event => update("notes", event.target.value)} /></EditField>
      </div>
    </section>

    <div className="job-edit-actions"><button className="primary" type="submit" disabled={busy || !driverDataReady || !selectedDriverId}><Save size={17} /> บันทึกการแก้ไข</button></div>

    {canDelete && <section className="job-delete-zone">
      <div><strong>ลบใบงาน</strong><p>นำใบงานออกจากรายการ หยุดติดตาม และปิดลิงก์สาธารณะ โดยยังเก็บหลักฐานไว้สำหรับตรวจสอบ</p></div>
      {!confirmDelete ? <button type="button" className="danger-outline" disabled={busy} onClick={() => setConfirmDelete(true)}><Trash2 size={16} /> ลบใบงาน</button> : <div className="job-delete-confirm" role="alert"><AlertTriangle size={18} /><span>ยืนยันลบ {job.workOrder}?</span><button type="button" disabled={busy} onClick={() => setConfirmDelete(false)}>ยกเลิก</button><button type="button" className="danger" disabled={busy} onClick={() => void onDelete()}>ยืนยันลบ</button></div>}
    </section>}
  </form>;
}

function EditField({ label, wide = false, children }: { label: string; wide?: boolean; children: React.ReactNode }) {
  return <div className={`job-edit-field ${wide ? "wide" : ""}`}><span>{label}</span><div>{children}</div></div>;
}
