"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Building2,
  Edit3,
  Mail,
  Phone,
  Plus,
  Power,
  Save,
  Truck,
  UserRound,
  Users,
  X
} from "lucide-react";
import { ListManagerComboBox } from "./ListManagerComboBox";
import {
  createDriver,
  createSubcontractOrganization,
  createVehicle,
  isMainCompanyAdmin,
  setDriverActive,
  setSubcontractOrganizationActive,
  setVehicleActive,
  subscribeDrivers,
  subscribeSubcontractOrganizations,
  subscribeVehicles,
  updateDriver,
  updateSubcontractOrganization,
  updateVehicle,
  type DriverDraft,
  type OrganizationDraft,
  type SubcontractOrganization,
  type TransportDriver,
  type TransportVehicle,
  type VehicleDraft
} from "@/lib/resource-repository";
import { subscribeOrganizationUserProfiles, type UserProfile } from "@/lib/transport-repository";
import { downloadPrivateDocument } from "@/lib/profile-repository";

const emptyOrganizationDraft: OrganizationDraft = {
  code: "",
  name: "",
  taxId: "",
  contactName: "",
  phone: "",
  email: "",
  logoUrl: ""
};

const emptyVehicleDraft: VehicleDraft = {
  plate: "",
  vehicleType: "",
  brand: "",
  model: "",
  capacityKg: "",
  registrationExpiry: "",
  insuranceExpiry: "",
  gpsDeviceId: "",
  status: "available"
};

const emptyDriverDraft: DriverDraft = {
  userUid: "",
  name: "",
  phone: "",
  email: "",
  licenseNumber: "",
  licenseType: "",
  licenseExpiry: "",
  assignedVehicleId: "",
  status: "available"
};

const vehicleStatusLabels = {
  available: "พร้อมใช้งาน",
  assigned: "กำลังปฏิบัติงาน",
  maintenance: "ซ่อมบำรุง",
  inactive: "ระงับใช้งาน"
} as const;

const driverStatusLabels = {
  available: "พร้อมรับงาน",
  assigned: "กำลังปฏิบัติงาน",
  leave: "ลางาน",
  inactive: "ระงับใช้งาน"
} as const;

function toMessage(error: unknown) {
  return error instanceof Error ? error.message : "เกิดข้อผิดพลาด กรุณาลองใหม่";
}

function expiryClass(value: string) {
  if (!value) return "";
  const days = (new Date(`${value}T23:59:59`).getTime() - Date.now()) / 86_400_000;
  return days < 0 ? "expired" : days <= 30 ? "expiring" : "";
}

function ResourceField({ label, wide = false, children }: { label: string; wide?: boolean; children: React.ReactNode }) {
  return (
    <div className={`resource-field ${wide ? "wide" : ""}`}>
      <span>{label}</span>
      {children}
    </div>
  );
}

export function SubcontractCompaniesScreen({ actor }: { actor: UserProfile }) {
  const [organizations, setOrganizations] = useState<SubcontractOrganization[]>([]);
  const [draft, setDraft] = useState<OrganizationDraft>(emptyOrganizationDraft);
  const [editingId, setEditingId] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("กำลังโหลดบริษัทซับคอนแท็ค...");

  useEffect(() => subscribeSubcontractOrganizations(
    (items) => {
      setOrganizations(items);
      setMessage(items.length ? "ข้อมูลบริษัทอัปเดตแบบ real-time" : "ยังไม่มีบริษัทซับคอนแท็ค");
    },
    (error) => setMessage(`โหลดข้อมูลไม่สำเร็จ: ${error}`)
  ), []);

  function resetForm() {
    setDraft(emptyOrganizationDraft);
    setEditingId("");
    setShowForm(false);
  }

  function editOrganization(item: SubcontractOrganization) {
    setDraft({
      code: item.id,
      name: item.name,
      taxId: item.taxId,
      contactName: item.contactName,
      phone: item.phone,
      email: item.email,
      logoUrl: item.logoUrl
    });
    setEditingId(item.id);
    setShowForm(true);
  }

  async function saveOrganization(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy("save");
    setMessage(editingId ? "กำลังบันทึกข้อมูลบริษัท..." : "กำลังเพิ่มบริษัท...");
    try {
      if (editingId) await updateSubcontractOrganization(editingId, draft, actor);
      else await createSubcontractOrganization(draft, actor);
      setMessage(editingId ? "แก้ไขข้อมูลบริษัทแล้ว" : "เพิ่มบริษัทซับคอนแท็คแล้ว");
      resetForm();
    } catch (error) {
      setMessage(toMessage(error));
    } finally {
      setBusy("");
    }
  }

  async function toggleOrganization(item: SubcontractOrganization) {
    if (busy) return;
    setBusy(item.id);
    try {
      await setSubcontractOrganizationActive(item.id, !item.active, actor);
      setMessage(item.active ? `ระงับ ${item.name} แล้ว` : `เปิดใช้งาน ${item.name} แล้ว`);
    } catch (error) {
      setMessage(toMessage(error));
    } finally {
      setBusy("");
    }
  }

  const activeCount = organizations.filter((item) => item.active).length;

  return (
    <section className="screen resource-screen">
      <div className="resource-page-head">
        <div>
          <span className="eyebrow">PARTNER NETWORK</span>
          <h1>บริษัทขนส่งซับคอนแท็ค</h1>
          <p>จัดการบริษัทคู่สัญญาและขอบเขตทรัพยากรในระบบ</p>
        </div>
        <button className="resource-primary-button" type="button" onClick={() => { if (showForm) resetForm(); else setShowForm(true); }}>
          {showForm ? <X size={17} /> : <Plus size={17} />}
          {showForm ? "ปิดฟอร์ม" : "เพิ่มบริษัท"}
        </button>
      </div>

      <div className="resource-metrics">
        <article><Building2 size={19} /><span>บริษัททั้งหมด<strong>{organizations.length}</strong></span></article>
        <article><Power size={19} /><span>เปิดใช้งาน<strong>{activeCount}</strong></span></article>
        <article><Users size={19} /><span>ระงับชั่วคราว<strong>{organizations.length - activeCount}</strong></span></article>
      </div>

      <div className="resource-message" role="status">{message}</div>

      {showForm && (
        <form className="resource-form" onSubmit={saveOrganization}>
          <header><div><small>{editingId ? "EDIT PARTNER" : "NEW PARTNER"}</small><h2>{editingId ? "แก้ไขบริษัท" : "เพิ่มบริษัทซับคอนแท็ค"}</h2></div><Building2 size={24} /></header>
          <div className="resource-form-grid">
            <ResourceField label="รหัสบริษัท *"><input value={draft.code} disabled={Boolean(editingId)} required pattern="[a-zA-Z0-9_-]{2,40}" placeholder="เช่น sfast-partner-01" onChange={(event) => setDraft({ ...draft, code: event.target.value })} /></ResourceField>
            <ResourceField label="ชื่อบริษัท *"><input value={draft.name} required placeholder="ชื่อบริษัทขนส่ง" onChange={(event) => setDraft({ ...draft, name: event.target.value })} /></ResourceField>
            <ResourceField label="เลขประจำตัวผู้เสียภาษี"><input value={draft.taxId} inputMode="numeric" placeholder="13 หลัก" onChange={(event) => setDraft({ ...draft, taxId: event.target.value })} /></ResourceField>
            <ResourceField label="ผู้ติดต่อหลัก"><input value={draft.contactName} placeholder="ชื่อผู้ประสานงาน" onChange={(event) => setDraft({ ...draft, contactName: event.target.value })} /></ResourceField>
            <ResourceField label="เบอร์ติดต่อ"><input type="tel" value={draft.phone} placeholder="080-000-0000" onChange={(event) => setDraft({ ...draft, phone: event.target.value })} /></ResourceField>
            <ResourceField label="อีเมล"><input type="email" value={draft.email} placeholder="dispatch@company.com" onChange={(event) => setDraft({ ...draft, email: event.target.value })} /></ResourceField>
            <ResourceField label="URL โลโก้" wide><input type="url" value={draft.logoUrl} placeholder="https://..." onChange={(event) => setDraft({ ...draft, logoUrl: event.target.value })} /></ResourceField>
          </div>
          <footer><button className="resource-save-button" disabled={Boolean(busy)}><Save size={17} /> {editingId ? "บันทึกการแก้ไข" : "เพิ่มบริษัท"}</button><button type="button" onClick={resetForm}>ยกเลิก</button></footer>
        </form>
      )}

      <div className="organization-grid">
        {organizations.map((item) => (
          <article key={item.id} className={`organization-card ${item.active ? "" : "inactive"}`}>
            <div className="organization-card-head">
              <span className="organization-mark" style={item.logoUrl ? { backgroundImage: `url(${item.logoUrl})` } : undefined}>{!item.logoUrl && <Building2 size={24} />}</span>
              <div><small>{item.id}</small><h2>{item.name}</h2><span className={`resource-status ${item.active ? "available" : "inactive"}`}>{item.active ? "เปิดใช้งาน" : "ระงับใช้งาน"}</span></div>
            </div>
            <dl className="resource-details">
              <div><dt>เลขผู้เสียภาษี</dt><dd>{item.taxId || "—"}</dd></div>
              <div><dt>ผู้ติดต่อ</dt><dd>{item.contactName || "—"}</dd></div>
              <div><dt>โทร</dt><dd>{item.phone || "—"}</dd></div>
              <div><dt>อีเมล</dt><dd>{item.email || "—"}</dd></div>
            </dl>
            <footer>
              <button type="button" onClick={() => editOrganization(item)}><Edit3 size={15} /> แก้ไข</button>
              <button type="button" className={item.active ? "resource-danger-action" : "resource-restore-action"} disabled={busy === item.id} onClick={() => void toggleOrganization(item)}><Power size={15} /> {item.active ? "ระงับ" : "เปิดใช้"}</button>
            </footer>
          </article>
        ))}
      </div>
    </section>
  );
}

export function FleetAndDriversScreen({ actor }: { actor: UserProfile }) {
  const mainAdmin = isMainCompanyAdmin(actor);
  const [organizations, setOrganizations] = useState<SubcontractOrganization[]>([]);
  const [organizationId, setOrganizationId] = useState(mainAdmin ? "main" : actor.organizationId ?? "");
  const [vehicles, setVehicles] = useState<TransportVehicle[]>([]);
  const [drivers, setDrivers] = useState<TransportDriver[]>([]);
  const [userProfiles, setUserProfiles] = useState<UserProfile[]>([]);
  const [tab, setTab] = useState<"vehicles" | "drivers">("vehicles");
  const [vehicleDraft, setVehicleDraft] = useState<VehicleDraft>(emptyVehicleDraft);
  const [driverDraft, setDriverDraft] = useState<DriverDraft>(emptyDriverDraft);
  const [editingVehicle, setEditingVehicle] = useState<TransportVehicle | null>(null);
  const [editingDriver, setEditingDriver] = useState<TransportDriver | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("กำลังโหลดข้อมูลรถและคนขับ...");

  useEffect(() => {
    if (!mainAdmin) return;
    return subscribeSubcontractOrganizations(setOrganizations, (error) => setMessage(`โหลดรายชื่อบริษัทไม่สำเร็จ: ${error}`));
  }, [mainAdmin]);

  useEffect(() => {
    if (!organizationId) return;
    const unsubscribeVehicles = subscribeVehicles(
      organizationId,
      (items) => { setVehicles(items); setMessage("ข้อมูลรถและคนขับอัปเดตแบบ real-time"); },
      (error) => setMessage(`โหลดข้อมูลรถไม่สำเร็จ: ${error}`)
    );
    const unsubscribeDrivers = subscribeDrivers(
      organizationId,
      (items) => { setDrivers(items); setMessage("ข้อมูลรถและคนขับอัปเดตแบบ real-time"); },
      (error) => setMessage(`โหลดข้อมูลคนขับไม่สำเร็จ: ${error}`)
    );
    const unsubscribeProfiles = subscribeOrganizationUserProfiles(
      organizationId,
      setUserProfiles,
      (error) => setMessage(`โหลดบัญชีผู้ใช้ไม่สำเร็จ: ${error}`)
    );
    return () => { unsubscribeVehicles(); unsubscribeDrivers(); unsubscribeProfiles(); };
  }, [organizationId]);

  const organizationName = organizationId === "main"
    ? "S Fast Transport"
    : organizations.find((item) => item.id === organizationId)?.name || actor.organizationName || organizationId;
  const availableVehicles = useMemo(() => vehicles.filter((item) => item.status !== "inactive"), [vehicles]);

  function resetResourceForm() {
    setVehicleDraft(emptyVehicleDraft);
    setDriverDraft(emptyDriverDraft);
    setEditingVehicle(null);
    setEditingDriver(null);
    setShowForm(false);
  }

  function changeOrganization(nextId: string) {
    setOrganizationId(nextId);
    resetResourceForm();
    setMessage(`กำลังโหลดข้อมูลของ ${nextId === "main" ? "S Fast Transport" : nextId}...`);
  }

  async function saveVehicle(event: React.FormEvent) {
    event.preventDefault();
    if (busy || !organizationId) return;
    setBusy("vehicle");
    try {
      if (editingVehicle) await updateVehicle(editingVehicle, vehicleDraft, actor);
      else await createVehicle(organizationId, vehicleDraft, actor);
      setMessage(editingVehicle ? "แก้ไขข้อมูลรถแล้ว" : "เพิ่มรถเข้าบริษัทแล้ว");
      resetResourceForm();
    } catch (error) {
      setMessage(toMessage(error));
    } finally {
      setBusy("");
    }
  }

  async function saveDriver(event: React.FormEvent) {
    event.preventDefault();
    if (busy || !organizationId) return;
    setBusy("driver");
    try {
      if (editingDriver) await updateDriver(editingDriver, driverDraft, actor);
      else await createDriver(organizationId, driverDraft, actor);
      setMessage(editingDriver ? "แก้ไขข้อมูลคนขับแล้ว" : "เพิ่มคนขับเข้าบริษัทแล้ว");
      resetResourceForm();
    } catch (error) {
      setMessage(toMessage(error));
    } finally {
      setBusy("");
    }
  }

  function editVehicle(item: TransportVehicle) {
    setTab("vehicles");
    setEditingVehicle(item);
    setVehicleDraft({ ...item, capacityKg: item.capacityKg?.toString() ?? "" });
    setShowForm(true);
  }

  function editDriver(item: TransportDriver) {
    setTab("drivers");
    setEditingDriver(item);
    setDriverDraft({ ...item });
    setShowForm(true);
  }

  function linkDriverProfile(userUid: string) {
    const linkedProfile = userProfiles.find((item) => item.uid === userUid);
    setDriverDraft({
      ...driverDraft,
      userUid,
      ...(linkedProfile ? {
        name: linkedProfile.fullName || linkedProfile.displayName,
        phone: linkedProfile.phone,
        email: linkedProfile.email,
        licenseNumber: linkedProfile.licenseNumber,
        licenseType: linkedProfile.licenseType,
        licenseExpiry: linkedProfile.licenseExpiry
      } : {})
    });
  }

  async function downloadDriverDocument(path: string, fileName: string) {
    try {
      setMessage("กำลังเปิดเอกสารส่วนตัว...");
      await downloadPrivateDocument(path, fileName);
      setMessage("ดาวน์โหลดเอกสารแล้ว");
    } catch (error) {
      setMessage(toMessage(error));
    }
  }

  async function toggleVehicle(item: TransportVehicle) {
    setBusy(item.id);
    try {
      await setVehicleActive(item, item.status === "inactive", actor);
      setMessage(item.status === "inactive" ? `เปิดใช้งาน ${item.plate} แล้ว` : `ระงับ ${item.plate} แล้ว`);
    } catch (error) { setMessage(toMessage(error)); }
    finally { setBusy(""); }
  }

  async function toggleDriver(item: TransportDriver) {
    setBusy(item.id);
    try {
      await setDriverActive(item, item.status === "inactive", actor);
      setMessage(item.status === "inactive" ? `เปิดใช้งาน ${item.name} แล้ว` : `ระงับ ${item.name} แล้ว`);
    } catch (error) { setMessage(toMessage(error)); }
    finally { setBusy(""); }
  }

  if (!organizationId) {
    return <section className="screen empty-state"><Users size={30} /><h1>ยังไม่ได้กำหนดบริษัท</h1><p>กรุณาให้แอดมินบริษัทหลักกำหนดบริษัทให้บัญชีนี้ก่อน</p></section>;
  }

  return (
    <section className="screen resource-screen">
      <div className="resource-page-head">
        <div><span className="eyebrow">FLEET OPERATIONS</span><h1>รถและคนขับ</h1><p>ทรัพยากรของ {organizationName}</p></div>
        <button className="resource-primary-button" type="button" onClick={() => { if (showForm) resetResourceForm(); else setShowForm(true); }}>
          {showForm ? <X size={17} /> : <Plus size={17} />}
          {showForm ? "ปิดฟอร์ม" : tab === "vehicles" ? "เพิ่มรถ" : "เพิ่มคนขับ"}
        </button>
      </div>

      {mainAdmin && (
        <label className="organization-switcher"><Building2 size={17} /><span>บริษัทที่กำลังจัดการ</span><select value={organizationId} onChange={(event) => changeOrganization(event.target.value)}><option value="main">S Fast Transport (บริษัทหลัก)</option>{organizations.map((item) => <option key={item.id} value={item.id}>{item.name}{item.active ? "" : " · ระงับ"}</option>)}</select></label>
      )}

      <div className="resource-metrics">
        <article><Truck size={19} /><span>รถทั้งหมด<strong>{vehicles.length}</strong></span></article>
        <article><UserRound size={19} /><span>คนขับทั้งหมด<strong>{drivers.length}</strong></span></article>
        <article><Power size={19} /><span>พร้อมใช้งาน<strong>{availableVehicles.filter((item) => item.status === "available").length}</strong></span></article>
      </div>

      <div className="resource-message" role="status">{message}</div>
      <div className="resource-tabs"><button className={tab === "vehicles" ? "selected" : ""} onClick={() => { setTab("vehicles"); resetResourceForm(); }}><Truck size={17} /> รถ <span>{vehicles.length}</span></button><button className={tab === "drivers" ? "selected" : ""} onClick={() => { setTab("drivers"); resetResourceForm(); }}><UserRound size={17} /> คนขับ <span>{drivers.length}</span></button></div>

      {showForm && tab === "vehicles" && (
        <form className="resource-form" onSubmit={saveVehicle}>
          <header><div><small>{editingVehicle ? "EDIT VEHICLE" : "NEW VEHICLE"}</small><h2>{editingVehicle ? "แก้ไขข้อมูลรถ" : "เพิ่มรถ"}</h2></div><Truck size={24} /></header>
          <div className="resource-form-grid">
            <ResourceField label="ทะเบียนรถ *"><input required disabled={Boolean(editingVehicle)} value={vehicleDraft.plate} placeholder="70-1234 กรุงเทพมหานคร" onChange={(event) => setVehicleDraft({ ...vehicleDraft, plate: event.target.value })} /></ResourceField>
            <ResourceField label="ประเภทรถ *"><ListManagerComboBox field="vehicle_type" value={vehicleDraft.vehicleType} placeholder="ค้นหาหรือเพิ่มประเภทรถ" organizationId={organizationId} actor={actor} required onChange={(value) => setVehicleDraft({ ...vehicleDraft, vehicleType: value })} /></ResourceField>
            <ResourceField label="ยี่ห้อ"><input value={vehicleDraft.brand} placeholder="Isuzu" onChange={(event) => setVehicleDraft({ ...vehicleDraft, brand: event.target.value })} /></ResourceField>
            <ResourceField label="รุ่น"><input value={vehicleDraft.model} placeholder="FXZ" onChange={(event) => setVehicleDraft({ ...vehicleDraft, model: event.target.value })} /></ResourceField>
            <ResourceField label="น้ำหนักบรรทุก (กก.)"><input type="number" min="0" value={vehicleDraft.capacityKg} placeholder="12000" onChange={(event) => setVehicleDraft({ ...vehicleDraft, capacityKg: event.target.value })} /></ResourceField>
            <ResourceField label="รหัสอุปกรณ์ GPS"><input value={vehicleDraft.gpsDeviceId} placeholder="GPS-001" onChange={(event) => setVehicleDraft({ ...vehicleDraft, gpsDeviceId: event.target.value })} /></ResourceField>
            <ResourceField label="ทะเบียนหมดอายุ"><input type="date" value={vehicleDraft.registrationExpiry} onChange={(event) => setVehicleDraft({ ...vehicleDraft, registrationExpiry: event.target.value })} /></ResourceField>
            <ResourceField label="ประกันหมดอายุ"><input type="date" value={vehicleDraft.insuranceExpiry} onChange={(event) => setVehicleDraft({ ...vehicleDraft, insuranceExpiry: event.target.value })} /></ResourceField>
            <ResourceField label="สถานะ" wide><select value={vehicleDraft.status} onChange={(event) => setVehicleDraft({ ...vehicleDraft, status: event.target.value as VehicleDraft["status"] })}>{Object.entries(vehicleStatusLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></ResourceField>
          </div>
          <footer><button className="resource-save-button" disabled={busy === "vehicle"}><Save size={17} /> {editingVehicle ? "บันทึกการแก้ไข" : "เพิ่มรถ"}</button><button type="button" onClick={resetResourceForm}>ยกเลิก</button></footer>
        </form>
      )}

      {showForm && tab === "drivers" && (
        <form className="resource-form" onSubmit={saveDriver}>
          <header><div><small>{editingDriver ? "EDIT DRIVER" : "NEW DRIVER"}</small><h2>{editingDriver ? "แก้ไขข้อมูลคนขับ" : "เพิ่มคนขับ"}</h2></div><UserRound size={24} /></header>
          <div className="resource-form-grid">
            <ResourceField label="เชื่อมบัญชีผู้ใช้งาน" wide><select value={driverDraft.userUid} onChange={(event) => linkDriverProfile(event.target.value)}><option value="">ไม่เชื่อมบัญชี</option>{userProfiles.filter((item) => item.role === "driver").map((item) => <option key={item.uid} value={item.uid}>{item.fullName || item.displayName} · {item.email}</option>)}</select></ResourceField>
            <ResourceField label="ชื่อ–นามสกุล *"><input required value={driverDraft.name} placeholder="ชื่อคนขับ" onChange={(event) => setDriverDraft({ ...driverDraft, name: event.target.value })} /></ResourceField>
            <ResourceField label="เบอร์ติดต่อ *"><input type="tel" required value={driverDraft.phone} placeholder="080-000-0000" onChange={(event) => setDriverDraft({ ...driverDraft, phone: event.target.value })} /></ResourceField>
            <ResourceField label="อีเมล"><input type="email" value={driverDraft.email} placeholder="driver@company.com" onChange={(event) => setDriverDraft({ ...driverDraft, email: event.target.value })} /></ResourceField>
            <ResourceField label="เลขที่ใบขับขี่ *"><input required disabled={Boolean(editingDriver?.licenseNumber)} value={driverDraft.licenseNumber} onChange={(event) => setDriverDraft({ ...driverDraft, licenseNumber: event.target.value })} /></ResourceField>
            <ResourceField label="ประเภทใบขับขี่"><input value={driverDraft.licenseType} placeholder="ท.2 / ท.3 / ท.4" onChange={(event) => setDriverDraft({ ...driverDraft, licenseType: event.target.value })} /></ResourceField>
            <ResourceField label="ใบขับขี่หมดอายุ"><input type="date" value={driverDraft.licenseExpiry} onChange={(event) => setDriverDraft({ ...driverDraft, licenseExpiry: event.target.value })} /></ResourceField>
            <ResourceField label="รถที่มอบหมาย"><select value={driverDraft.assignedVehicleId} onChange={(event) => setDriverDraft({ ...driverDraft, assignedVehicleId: event.target.value })}><option value="">ยังไม่มอบหมายรถ</option>{vehicles.map((item) => <option key={item.id} value={item.id} disabled={item.status === "inactive" && item.id !== driverDraft.assignedVehicleId}>{item.plate} · {item.vehicleType}{item.status === "inactive" ? " · ระงับ" : ""}</option>)}</select></ResourceField>
            <ResourceField label="สถานะ"><select value={driverDraft.status} onChange={(event) => setDriverDraft({ ...driverDraft, status: event.target.value as DriverDraft["status"] })}>{Object.entries(driverStatusLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></ResourceField>
          </div>
          <footer><button className="resource-save-button" disabled={busy === "driver"}><Save size={17} /> {editingDriver ? "บันทึกการแก้ไข" : "เพิ่มคนขับ"}</button><button type="button" onClick={resetResourceForm}>ยกเลิก</button></footer>
        </form>
      )}

      {tab === "vehicles" ? (
        <div className="fleet-card-grid">{!vehicles.length && <div className="resource-empty"><Truck size={25} /><strong>ยังไม่มีรถในบริษัทนี้</strong><span>กด “เพิ่มรถ” เพื่อสร้างรายการแรก</span></div>}{vehicles.map((item) => <article key={item.id} className={`fleet-card ${item.status === "inactive" ? "inactive" : ""}`}><header><span className="fleet-icon"><Truck size={21} /></span><div><small>{item.vehicleType || "ไม่ระบุประเภท"}</small><h2>{item.plate}</h2></div><span className={`resource-status ${item.status}`}>{vehicleStatusLabels[item.status]}</span></header><dl className="resource-details"><div><dt>ยี่ห้อ / รุ่น</dt><dd>{[item.brand, item.model].filter(Boolean).join(" ") || "—"}</dd></div><div><dt>บรรทุก</dt><dd>{item.capacityKg ? `${item.capacityKg.toLocaleString()} กก.` : "—"}</dd></div><div><dt>GPS</dt><dd>{item.gpsDeviceId || "ยังไม่ผูก"}</dd></div><div className={expiryClass(item.registrationExpiry)}><dt>ทะเบียนหมดอายุ</dt><dd>{item.registrationExpiry || "—"}</dd></div><div className={expiryClass(item.insuranceExpiry)}><dt>ประกันหมดอายุ</dt><dd>{item.insuranceExpiry || "—"}</dd></div></dl><footer><button onClick={() => editVehicle(item)}><Edit3 size={15} /> แก้ไข</button><button className={item.status === "inactive" ? "resource-restore-action" : "resource-danger-action"} disabled={busy === item.id} onClick={() => void toggleVehicle(item)}><Power size={15} /> {item.status === "inactive" ? "เปิดใช้" : "ระงับ"}</button></footer></article>)}</div>
      ) : (
        <div className="fleet-card-grid">{!drivers.length && <div className="resource-empty"><UserRound size={25} /><strong>ยังไม่มีคนขับในบริษัทนี้</strong><span>กด “เพิ่มคนขับ” เพื่อสร้างรายการแรก</span></div>}{drivers.map((item) => { const vehicle = vehicles.find((entry) => entry.id === item.assignedVehicleId); const linked = userProfiles.find((entry) => entry.uid === item.userUid); const name = linked?.fullName || item.name; const phone = linked?.phone || item.phone; const email = linked?.email || item.email; const licenseNumber = linked?.licenseNumber || item.licenseNumber; const licenseExpiry = linked?.licenseExpiry || item.licenseExpiry; return <article key={item.id} className={`fleet-card ${item.status === "inactive" ? "inactive" : ""}`}><header><span className={`fleet-icon driver ${linked?.photoURL ? "has-photo" : ""}`} style={linked?.photoURL ? { backgroundImage: `url(${linked.photoURL})` } : undefined}>{!linked?.photoURL && <UserRound size={21} />}</span><div><small>{linked ? "เชื่อมกับบัญชีผู้ใช้" : item.licenseType || "พนักงานขับรถ"}</small><h2>{name}</h2></div><span className={`resource-status ${item.status}`}>{driverStatusLabels[item.status]}</span></header><dl className="resource-details"><div><dt><Phone size={13} /> โทร</dt><dd>{phone || "—"}</dd></div><div><dt><Mail size={13} /> อีเมล</dt><dd>{email || "—"}</dd></div><div><dt>ใบขับขี่</dt><dd>{licenseNumber || "—"}</dd></div><div className={expiryClass(licenseExpiry)}><dt>หมดอายุ</dt><dd>{licenseExpiry || "—"}</dd></div><div><dt>รถประจำ</dt><dd>{vehicle?.plate || "ยังไม่มอบหมาย"}</dd></div></dl>{linked && <div className="linked-driver-documents"><span>เอกสารจากโปรไฟล์</span>{linked.idCardFrontPath ? <button onClick={() => void downloadDriverDocument(linked.idCardFrontPath, linked.idCardFrontFileName)}>บัตรประชาชน</button> : <small>ยังไม่มีบัตรประชาชน</small>}{linked.driverLicenseFrontPath ? <button onClick={() => void downloadDriverDocument(linked.driverLicenseFrontPath, linked.driverLicenseFrontFileName)}>ใบขับขี่</button> : <small>ยังไม่มีรูปใบขับขี่</small>}</div>}<footer><button onClick={() => editDriver(item)}><Edit3 size={15} /> แก้ไข</button><button className={item.status === "inactive" ? "resource-restore-action" : "resource-danger-action"} disabled={busy === item.id} onClick={() => void toggleDriver(item)}><Power size={15} /> {item.status === "inactive" ? "เปิดใช้" : "ระงับ"}</button></footer></article>; })}</div>
      )}
    </section>
  );
}
