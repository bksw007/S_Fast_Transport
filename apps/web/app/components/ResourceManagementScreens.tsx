"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import {
  Building2,
  ChevronDown,
  ChevronUp,
  Copy,
  Download,
  Edit3,
  ExternalLink,
  Eye,
  FileImage,
  FileText,
  Mail,
  Phone,
  Plus,
  Power,
  Printer,
  Save,
  Share2,
  Truck,
  Upload,
  UserRound,
  Users,
  X
} from "lucide-react";
import { ListManagerComboBox } from "./ListManagerComboBox";
import {
  createDriver,
  createSubcontractOrganization,
  createVehicle,
  createVehicleShareLink,
  downloadVehicleFile,
  getVehicleFilePreviewURL,
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
  uploadVehicleFiles,
  vehicleDocumentKinds,
  vehicleImageKinds,
  type DriverDraft,
  type OrganizationDraft,
  type SubcontractOrganization,
  type TransportDriver,
  type TransportVehicle,
  type VehicleDocumentKind,
  type VehicleDraft,
  type VehicleFile,
  type VehicleImageKind,
  type VehicleUploadSelection
} from "@/lib/resource-repository";
import { subscribeOrganizationUserProfiles, type UserProfile } from "@/lib/transport-repository";
import { downloadPrivateDocument, driverLicenseTypes, formatPhoneNumber, getPrivateDocumentPreviewURL } from "@/lib/profile-repository";
import { thaiProvinces } from "@/lib/thai-provinces";

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
  plateNumber: "",
  plateProvince: "",
  vehicleType: "",
  brand: "",
  model: "",
  capacityKg: "",
  vehicleWeightKg: "",
  compulsoryInsuranceExpiry: "",
  insuranceExpiry: "",
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

const vehicleDocumentLabels: Record<VehicleDocumentKind, string> = {
  compulsoryInsurance: "พรบ.",
  vehicleInsurance: "ประกันภัยรถ",
  cargoInsurance: "ประกันสินค้า",
  other: "อื่นๆ"
};

const vehicleImageLabels: Record<VehicleImageKind, string> = {
  front: "ด้านหน้า",
  rear: "ด้านหลัง",
  right: "ด้านขวา",
  left: "ด้านซ้าย"
};

const emptyVehicleUploads: VehicleUploadSelection = { documents: {}, images: {} };

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
  const [vehicleUploads, setVehicleUploads] = useState<VehicleUploadSelection>(emptyVehicleUploads);
  const [driverDraft, setDriverDraft] = useState<DriverDraft>(emptyDriverDraft);
  const [editingVehicle, setEditingVehicle] = useState<TransportVehicle | null>(null);
  const [editingDriver, setEditingDriver] = useState<TransportDriver | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("กำลังโหลดข้อมูลรถและคนขับ...");
  const [expandedVehicleId, setExpandedVehicleId] = useState<string | null>(null);
  const [expandedDriverId, setExpandedDriverId] = useState<string | null>(null);
  const [documentLoading, setDocumentLoading] = useState("");
  const [documentPreview, setDocumentPreview] = useState<{ label: string; fileName: string; path: string; url: string; source: "driver" | "vehicle" } | null>(null);
  const [vehicleShare, setVehicleShare] = useState<{ plate: string; url: string } | null>(null);

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
    setVehicleUploads(emptyVehicleUploads);
    setDriverDraft(emptyDriverDraft);
    setEditingVehicle(null);
    setEditingDriver(null);
    setShowForm(false);
  }

  function changeOrganization(nextId: string) {
    setOrganizationId(nextId);
    setExpandedVehicleId(null);
    setExpandedDriverId(null);
    resetResourceForm();
    setMessage(`กำลังโหลดข้อมูลของ ${nextId === "main" ? "S Fast Transport" : nextId}...`);
  }

  async function saveVehicle(event: React.FormEvent) {
    event.preventDefault();
    if (busy || !organizationId) return;
    setBusy("vehicle");
    let savedVehicleId = "";
    try {
      savedVehicleId = editingVehicle
        ? await updateVehicle(editingVehicle, vehicleDraft, actor)
        : await createVehicle(organizationId, vehicleDraft, actor);
      await uploadVehicleFiles(organizationId, savedVehicleId, vehicleUploads, actor);
      setMessage(editingVehicle ? "แก้ไขข้อมูลรถแล้ว" : "เพิ่มรถเข้าบริษัทแล้ว");
      resetResourceForm();
    } catch (error) {
      setMessage(savedVehicleId ? `บันทึกข้อมูลรถแล้ว แต่อัปโหลดไฟล์ไม่ครบ: ${toMessage(error)}` : toMessage(error));
      if (savedVehicleId) resetResourceForm();
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
    setVehicleUploads(emptyVehicleUploads);
    setVehicleDraft({
      plateNumber: item.plateNumber,
      plateProvince: item.plateProvince,
      vehicleType: item.vehicleType,
      brand: item.brand,
      model: item.model,
      capacityKg: item.capacityKg?.toString() ?? "",
      vehicleWeightKg: item.vehicleWeightKg?.toString() ?? "",
      compulsoryInsuranceExpiry: item.compulsoryInsuranceExpiry,
      insuranceExpiry: item.insuranceExpiry,
      status: item.status
    });
    setShowForm(true);
  }

  function selectVehicleUpload(category: keyof VehicleUploadSelection, kind: VehicleDocumentKind | VehicleImageKind, file: File | null) {
    setVehicleUploads((current) => {
      const nextCategory = { ...current[category] } as Record<string, File>;
      if (file) nextCategory[kind] = file;
      else delete nextCategory[kind];
      return { ...current, [category]: nextCategory };
    });
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
        phone: formatPhoneNumber(linkedProfile.phone),
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

  async function viewDriverDocument(path: string, fileName: string, label: string) {
    if (documentLoading) return;
    setDocumentLoading(path);
    setMessage(`กำลังโหลด${label}...`);
    try {
      const url = await getPrivateDocumentPreviewURL(path);
      setDocumentPreview({ label, fileName, path, url, source: "driver" });
      setMessage(`เปิด${label}แล้ว`);
    } catch (error) {
      setMessage(toMessage(error));
    } finally {
      setDocumentLoading("");
    }
  }

  async function downloadVehicleAttachment(path: string, fileName: string) {
    try {
      setMessage("กำลังดาวน์โหลดไฟล์รถ...");
      await downloadVehicleFile(path, fileName);
      setMessage("ดาวน์โหลดไฟล์รถแล้ว");
    } catch (error) {
      setMessage(toMessage(error));
    }
  }

  async function viewVehicleAttachment(path: string, fileName: string, label: string) {
    if (documentLoading) return;
    setDocumentLoading(path);
    try {
      const url = await getVehicleFilePreviewURL(path);
      setDocumentPreview({ label, fileName, path, url, source: "vehicle" });
    } catch (error) {
      setMessage(toMessage(error));
    } finally {
      setDocumentLoading("");
    }
  }

  async function shareVehicle(item: TransportVehicle) {
    if (busy) return;
    setBusy(`share-${item.id}`);
    setMessage(`กำลังสร้างลิงก์ข้อมูลรถ ${item.plate}...`);
    try {
      const token = await createVehicleShareLink(item, actor);
      const url = `${window.location.origin}/vehicle/${token}`;
      setVehicleShare({ plate: item.plate, url });
      setMessage("สร้างลิงก์ข้อมูลรถแล้ว");
    } catch (error) {
      setMessage(toMessage(error));
    } finally {
      setBusy("");
    }
  }

  async function copyVehicleShareLink() {
    if (!vehicleShare) return;
    try {
      await navigator.clipboard.writeText(vehicleShare.url);
      setMessage("คัดลอกลิงก์ข้อมูลรถแล้ว");
    } catch {
      setMessage("คัดลอกอัตโนมัติไม่สำเร็จ กรุณาเลือกลิงก์แล้วคัดลอก");
    }
  }

  async function openVehiclePdf(item: TransportVehicle) {
    const printWindow = window.open("", "_blank");
    if (!printWindow) { setMessage("เบราว์เซอร์บล็อกหน้าต่าง PDF กรุณาอนุญาตป๊อปอัปแล้วลองใหม่"); return; }
    printWindow.opener = null;
    printWindow.document.write("<!doctype html><html lang=\"th\"><body style=\"font-family:sans-serif;padding:32px\">กำลังจัดทำเอกสารรถ...</body></html>");
    try {
      const imageEntries = Object.entries(item.images) as [VehicleImageKind, VehicleFile][];
      const documentEntries = Object.entries(item.documents) as [VehicleDocumentKind, VehicleFile][];
      const [imageURLs, documentURLs] = await Promise.all([
        Promise.all(imageEntries.map(async ([kind, file]) => ({ kind, url: await getVehicleFilePreviewURL(file.storagePath) }))),
        Promise.all(documentEntries.map(async ([kind, file]) => ({ kind, fileName: file.fileName, contentType: file.contentType, url: await getVehicleFilePreviewURL(file.storagePath) })))
      ]);
      printWindow.document.open();
      printWindow.document.write(vehiclePrintDocument(item, organizationName, imageURLs, documentURLs));
      printWindow.document.close();
      setMessage("เปิดเอกสารรถแล้ว เลือกพิมพ์หรือบันทึกเป็น PDF ได้เลย");
    } catch (error) {
      printWindow.close();
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
            <ResourceField label="เลขทะเบียน *"><input required value={vehicleDraft.plateNumber} placeholder="เช่น 70-1234" onChange={(event) => setVehicleDraft({ ...vehicleDraft, plateNumber: event.target.value })} /></ResourceField>
            <ResourceField label="ทะเบียนจังหวัด *"><select required value={vehicleDraft.plateProvince} onChange={(event) => setVehicleDraft({ ...vehicleDraft, plateProvince: event.target.value })}><option value="">เลือกจังหวัด</option>{thaiProvinces.map((province) => <option key={province} value={province}>{province}</option>)}</select></ResourceField>
            <ResourceField label="ประเภทรถ *"><ListManagerComboBox field="vehicle_type" value={vehicleDraft.vehicleType} placeholder="ค้นหาหรือเพิ่มประเภทรถ" organizationId={organizationId} actor={actor} required onChange={(value) => setVehicleDraft({ ...vehicleDraft, vehicleType: value })} /></ResourceField>
            <ResourceField label="ยี่ห้อ"><input value={vehicleDraft.brand} placeholder="Isuzu" onChange={(event) => setVehicleDraft({ ...vehicleDraft, brand: event.target.value })} /></ResourceField>
            <ResourceField label="รุ่น"><input value={vehicleDraft.model} placeholder="FXZ" onChange={(event) => setVehicleDraft({ ...vehicleDraft, model: event.target.value })} /></ResourceField>
            <ResourceField label="น้ำหนักบรรทุก (กก.)"><input type="number" min="0" value={vehicleDraft.capacityKg} placeholder="12000" onChange={(event) => setVehicleDraft({ ...vehicleDraft, capacityKg: event.target.value })} /></ResourceField>
            <ResourceField label="น้ำหนักตัวรถ (กก.)"><input type="number" min="0" value={vehicleDraft.vehicleWeightKg} placeholder="8500" onChange={(event) => setVehicleDraft({ ...vehicleDraft, vehicleWeightKg: event.target.value })} /></ResourceField>
            <ResourceField label="พรบ.หมดอายุ"><input type="date" value={vehicleDraft.compulsoryInsuranceExpiry} onChange={(event) => setVehicleDraft({ ...vehicleDraft, compulsoryInsuranceExpiry: event.target.value })} /></ResourceField>
            <ResourceField label="ประกันหมดอายุ"><input type="date" value={vehicleDraft.insuranceExpiry} onChange={(event) => setVehicleDraft({ ...vehicleDraft, insuranceExpiry: event.target.value })} /></ResourceField>
            <ResourceField label="สถานะ" wide><select value={vehicleDraft.status} onChange={(event) => setVehicleDraft({ ...vehicleDraft, status: event.target.value as VehicleDraft["status"] })}>{Object.entries(vehicleStatusLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></ResourceField>
          </div>
          <VehicleUploadSection
            title="เอกสารยานพาหนะ"
            description="แนบรูปหรือ PDF ได้ ไม่บังคับ · รูปจะถูกบีบอัดอัตโนมัติ"
            icon={<FileText size={20} />}
          >
            {vehicleDocumentKinds.map((kind) => <VehicleUploadField key={kind} label={vehicleDocumentLabels[kind]} accept="image/jpeg,image/png,image/webp,application/pdf" selectedFile={vehicleUploads.documents[kind]} currentFile={editingVehicle?.documents[kind]} onChange={(file) => selectVehicleUpload("documents", kind, file)} />)}
          </VehicleUploadSection>
          <VehicleUploadSection
            title="ภาพรถ 4 ด้าน"
            description="ใช้ภาพ JPG, PNG หรือ WEBP ไม่บังคับ · รูปละไม่เกิน 20 MB ก่อนบีบอัด"
            icon={<FileImage size={20} />}
          >
            {vehicleImageKinds.map((kind) => <VehicleUploadField key={kind} label={vehicleImageLabels[kind]} accept="image/jpeg,image/png,image/webp" selectedFile={vehicleUploads.images[kind]} currentFile={editingVehicle?.images[kind]} onChange={(file) => selectVehicleUpload("images", kind, file)} />)}
          </VehicleUploadSection>
          <footer><button className="resource-save-button" disabled={busy === "vehicle"}><Save size={17} /> {editingVehicle ? "บันทึกการแก้ไข" : "เพิ่มรถ"}</button><button type="button" onClick={resetResourceForm}>ยกเลิก</button></footer>
        </form>
      )}

      {showForm && tab === "drivers" && (
        <form className="resource-form" onSubmit={saveDriver}>
          <header><div><small>{editingDriver ? "EDIT DRIVER" : "NEW DRIVER"}</small><h2>{editingDriver ? "แก้ไขข้อมูลคนขับ" : "เพิ่มคนขับ"}</h2></div><UserRound size={24} /></header>
          <div className="resource-form-grid">
            <ResourceField label="เชื่อมบัญชีผู้ใช้งาน" wide><select value={driverDraft.userUid} onChange={(event) => linkDriverProfile(event.target.value)}><option value="">ไม่เชื่อมบัญชี</option>{userProfiles.filter((item) => item.role === "driver").map((item) => <option key={item.uid} value={item.uid}>{item.fullName || item.displayName} · {item.email}</option>)}</select></ResourceField>
            <ResourceField label="ชื่อ–นามสกุล *"><input required value={driverDraft.name} placeholder="ชื่อคนขับ" onChange={(event) => setDriverDraft({ ...driverDraft, name: event.target.value })} /></ResourceField>
            <ResourceField label="เบอร์ติดต่อ *"><input type="tel" inputMode="numeric" required maxLength={12} pattern="[0-9]{3}-[0-9]{3}-[0-9]{4}" value={formatPhoneNumber(driverDraft.phone)} placeholder="080-000-0000" onChange={(event) => setDriverDraft({ ...driverDraft, phone: formatPhoneNumber(event.target.value) })} /></ResourceField>
            <ResourceField label="อีเมล"><input type="email" value={driverDraft.email} placeholder="driver@company.com" onChange={(event) => setDriverDraft({ ...driverDraft, email: event.target.value })} /></ResourceField>
            <ResourceField label="เลขที่ใบขับขี่ *"><input required disabled={Boolean(editingDriver?.licenseNumber)} value={driverDraft.licenseNumber} onChange={(event) => setDriverDraft({ ...driverDraft, licenseNumber: event.target.value })} /></ResourceField>
            <ResourceField label="ประเภทใบขับขี่"><select value={driverDraft.licenseType} onChange={(event) => setDriverDraft({ ...driverDraft, licenseType: event.target.value })}><option value="">เลือกประเภทใบขับขี่</option>{driverLicenseTypes.map((item) => <option key={item} value={item}>{item}</option>)}</select></ResourceField>
            <ResourceField label="ใบขับขี่หมดอายุ"><input type="date" value={driverDraft.licenseExpiry} onChange={(event) => setDriverDraft({ ...driverDraft, licenseExpiry: event.target.value })} /></ResourceField>
            <ResourceField label="รถที่มอบหมาย"><select value={driverDraft.assignedVehicleId} onChange={(event) => setDriverDraft({ ...driverDraft, assignedVehicleId: event.target.value })}><option value="">ยังไม่มอบหมายรถ</option>{vehicles.map((item) => <option key={item.id} value={item.id} disabled={item.status === "inactive" && item.id !== driverDraft.assignedVehicleId}>{item.plate} · {item.vehicleType}{item.status === "inactive" ? " · ระงับ" : ""}</option>)}</select></ResourceField>
            <ResourceField label="สถานะ"><select value={driverDraft.status} onChange={(event) => setDriverDraft({ ...driverDraft, status: event.target.value as DriverDraft["status"] })}>{Object.entries(driverStatusLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></ResourceField>
          </div>
          <footer><button className="resource-save-button" disabled={busy === "driver"}><Save size={17} /> {editingDriver ? "บันทึกการแก้ไข" : "เพิ่มคนขับ"}</button><button type="button" onClick={resetResourceForm}>ยกเลิก</button></footer>
        </form>
      )}

      {tab === "vehicles" ? (
        <div className="fleet-card-grid">
          {!vehicles.length && <div className="resource-empty"><Truck size={25} /><strong>ยังไม่มีรถในบริษัทนี้</strong><span>กด “เพิ่มรถ” เพื่อสร้างรายการแรก</span></div>}
          {vehicles.map((item) => {
            const expanded = expandedVehicleId === item.id;
            const fileCount = Object.keys(item.documents).length + Object.keys(item.images).length;
            return (
              <article key={item.id} className={`fleet-card vehicle-card ${expanded ? "expanded" : "collapsed"} ${item.status === "inactive" ? "inactive" : ""}`}>
                <header className="vehicle-card-toggle-header" onClick={() => setExpandedVehicleId(expanded ? null : item.id)}>
                  <span className="fleet-icon"><Truck size={21} /></span>
                  <div><small>{item.vehicleType || "ไม่ระบุประเภท"}{fileCount ? ` · ${fileCount} ไฟล์` : ""}</small><h2>{item.plate}</h2></div>
                  <span className={`resource-status ${item.status}`}>{vehicleStatusLabels[item.status]}</span>
                  <button type="button" className="driver-card-toggle" aria-expanded={expanded} aria-label={expanded ? `ย่อข้อมูลรถ ${item.plate}` : `ขยายข้อมูลรถ ${item.plate}`} onClick={(event) => { event.stopPropagation(); setExpandedVehicleId(expanded ? null : item.id); }}>{expanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}</button>
                </header>
                {expanded && (
                  <div className="vehicle-card-details">
                    <dl className="resource-details"><div><dt>ยี่ห้อ / รุ่น</dt><dd>{[item.brand, item.model].filter(Boolean).join(" ") || "—"}</dd></div><div><dt>น้ำหนักบรรทุก</dt><dd>{item.capacityKg !== null ? `${item.capacityKg.toLocaleString()} กก.` : "—"}</dd></div><div><dt>น้ำหนักตัวรถ</dt><dd>{item.vehicleWeightKg !== null ? `${item.vehicleWeightKg.toLocaleString()} กก.` : "—"}</dd></div><div className={expiryClass(item.compulsoryInsuranceExpiry)}><dt>พรบ.หมดอายุ</dt><dd>{item.compulsoryInsuranceExpiry || "—"}</dd></div><div className={expiryClass(item.insuranceExpiry)}><dt>ประกันหมดอายุ</dt><dd>{item.insuranceExpiry || "—"}</dd></div></dl>
                    <VehicleStoredFiles vehicle={item} loadingPath={documentLoading} onView={viewVehicleAttachment} onDownload={downloadVehicleAttachment} />
                    <footer className="vehicle-card-actions"><button type="button" onClick={() => editVehicle(item)}><Edit3 size={15} /> แก้ไข</button><button type="button" disabled={busy === `share-${item.id}`} onClick={() => void shareVehicle(item)}><Share2 size={15} /> {busy === `share-${item.id}` ? "กำลังสร้าง" : "แชร์เว็บ"}</button><button type="button" onClick={() => void openVehiclePdf(item)}><Printer size={15} /> PDF</button><button type="button" className={item.status === "inactive" ? "resource-restore-action" : "resource-danger-action"} disabled={busy === item.id} onClick={() => void toggleVehicle(item)}><Power size={15} /> {item.status === "inactive" ? "เปิดใช้" : "ระงับ"}</button></footer>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      ) : (
        <div className="fleet-card-grid">
          {!drivers.length && <div className="resource-empty"><UserRound size={25} /><strong>ยังไม่มีคนขับในบริษัทนี้</strong><span>กด “เพิ่มคนขับ” เพื่อสร้างรายการแรก</span></div>}
          {drivers.map((item) => {
            const vehicle = vehicles.find((entry) => entry.id === item.assignedVehicleId);
            const linked = userProfiles.find((entry) => entry.uid === item.userUid);
            const name = linked?.fullName || item.name;
            const phone = linked?.phone || item.phone;
            const email = linked?.email || item.email;
            const licenseNumber = linked?.licenseNumber || item.licenseNumber;
            const licenseExpiry = linked?.licenseExpiry || item.licenseExpiry;
            const expanded = expandedDriverId === item.id;

            return (
              <article key={item.id} className={`fleet-card driver-card ${expanded ? "expanded" : "collapsed"} ${item.status === "inactive" ? "inactive" : ""}`}>
                <header className="driver-card-toggle-header" onClick={() => setExpandedDriverId(expanded ? null : item.id)}>
                  <span className={`fleet-icon driver ${linked?.photoURL ? "has-photo" : ""}`} style={linked?.photoURL ? { backgroundImage: `url(${linked.photoURL})` } : undefined}>{!linked?.photoURL && <UserRound size={21} />}</span>
                  <div><small>{linked ? "เชื่อมกับบัญชีผู้ใช้" : item.licenseType || "พนักงานขับรถ"}</small><h2>{name}</h2></div>
                  <span className={`resource-status ${item.status}`}>{driverStatusLabels[item.status]}</span>
                  <button type="button" className="driver-card-toggle" aria-expanded={expanded} aria-label={expanded ? `ย่อข้อมูลของ ${name}` : `ขยายข้อมูลของ ${name}`} onClick={(event) => { event.stopPropagation(); setExpandedDriverId(expanded ? null : item.id); }}>
                    {expanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                  </button>
                </header>
                {expanded && (
                  <div className="driver-card-details">
                    <dl className="resource-details"><div><dt><Phone size={13} /> โทร</dt><dd>{phone || "—"}</dd></div><div><dt><Mail size={13} /> อีเมล</dt><dd>{email || "—"}</dd></div><div><dt>ใบขับขี่</dt><dd>{licenseNumber || "—"}</dd></div><div className={expiryClass(licenseExpiry)}><dt>หมดอายุ</dt><dd>{licenseExpiry || "—"}</dd></div><div><dt>รถประจำ</dt><dd>{vehicle?.plate || "ยังไม่มอบหมาย"}</dd></div></dl>
                    {linked && <LinkedDriverDocuments profile={linked} loadingPath={documentLoading} onView={viewDriverDocument} onDownload={downloadDriverDocument} />}
                    <footer><button onClick={() => editDriver(item)}><Edit3 size={15} /> แก้ไข</button><button className={item.status === "inactive" ? "resource-restore-action" : "resource-danger-action"} disabled={busy === item.id} onClick={() => void toggleDriver(item)}><Power size={15} /> {item.status === "inactive" ? "เปิดใช้" : "ระงับ"}</button></footer>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}

      {vehicleShare && (
        <div className="vehicle-share-overlay" role="presentation" onClick={() => setVehicleShare(null)}>
          <section className="vehicle-share-dialog" role="dialog" aria-modal="true" aria-label={`แชร์ข้อมูลรถ ${vehicleShare.plate}`} onClick={(event) => event.stopPropagation()}>
            <header><div><small>SHARE VEHICLE</small><h2>แชร์ข้อมูลรถ</h2><span>{vehicleShare.plate}</span></div><button type="button" aria-label="ปิดหน้าต่างแชร์" onClick={() => setVehicleShare(null)}><X size={20} /></button></header>
            <p>ผู้รับเปิดดูข้อมูลรถ รูปภาพ และเอกสารที่แนบไว้ได้โดยไม่ต้องเข้าสู่ระบบ ลิงก์มีวันหมดอายุตามการตั้งค่าบริษัท</p>
            <label>ลิงก์สำหรับลูกค้า<input readOnly value={vehicleShare.url} onFocus={(event) => event.target.select()} /></label>
            <footer><button type="button" onClick={() => void copyVehicleShareLink()}><Copy size={16} /> คัดลอกลิงก์</button><a href={vehicleShare.url} target="_blank" rel="noreferrer"><ExternalLink size={16} /> เปิดหน้าเว็บ</a></footer>
          </section>
        </div>
      )}

      {documentPreview && (
        <div className="driver-document-overlay" role="presentation" onClick={() => setDocumentPreview(null)}>
          <section className="driver-document-viewer" role="dialog" aria-modal="true" aria-label={documentPreview.label} onClick={(event) => event.stopPropagation()}>
            <header><div><small>{documentPreview.source === "driver" ? "DRIVER DOCUMENT" : "VEHICLE FILE"}</small><h2>{documentPreview.label}</h2><span>{documentPreview.fileName}</span></div><button type="button" aria-label="ปิดหน้าต่างเอกสาร" onClick={() => setDocumentPreview(null)}><X size={20} /></button></header>
            <div className="driver-document-canvas">
              {/\.pdf$/i.test(documentPreview.fileName)
                ? <iframe src={documentPreview.url} title={documentPreview.label} />
                : <Image src={documentPreview.url} alt={documentPreview.label} width={1400} height={1000} unoptimized />}
            </div>
            <footer><span>{documentPreview.source === "driver" ? "เอกสารส่วนตัว กรุณาเปิดเผยเท่าที่จำเป็น" : "ไฟล์ยานพาหนะของบริษัท"}</span><button type="button" onClick={() => void (documentPreview.source === "driver" ? downloadDriverDocument(documentPreview.path, documentPreview.fileName) : downloadVehicleAttachment(documentPreview.path, documentPreview.fileName))}><Download size={16} /> ดาวน์โหลดไฟล์</button></footer>
          </section>
        </div>
      )}
    </section>
  );
}

function LinkedDriverDocuments({ profile, loadingPath, onView, onDownload }: { profile: UserProfile; loadingPath: string; onView: (path: string, fileName: string, label: string) => Promise<void>; onDownload: (path: string, fileName: string) => Promise<void> }) {
  const documents = [
    { label: "บัตรประชาชน", path: profile.idCardFrontPath, fileName: profile.idCardFrontFileName },
    { label: "ใบขับขี่", path: profile.driverLicenseFrontPath, fileName: profile.driverLicenseFrontFileName }
  ];

  return (
    <div className="linked-driver-documents">
      <span>เอกสารจากโปรไฟล์</span>
      {documents.map((document) => document.path ? (
        <div className="linked-driver-document" key={document.label}>
          <strong>{document.label}</strong>
          <button type="button" disabled={loadingPath === document.path} onClick={() => void onView(document.path, document.fileName, document.label)}><Eye size={14} /> {loadingPath === document.path ? "กำลังโหลด" : "ดู"}</button>
          <button type="button" onClick={() => void onDownload(document.path, document.fileName)}><Download size={14} /> ดาวน์โหลด</button>
        </div>
      ) : <small key={document.label}>ยังไม่มี{document.label}</small>)}
    </div>
  );
}

function VehicleUploadSection({ title, description, icon, children }: { title: string; description: string; icon: React.ReactNode; children: React.ReactNode }) {
  return <section className="vehicle-upload-section"><header>{icon}<div><h3>{title}</h3><p>{description}</p></div></header><div>{children}</div></section>;
}

function VehicleUploadField({ label, accept, selectedFile, currentFile, onChange }: { label: string; accept: string; selectedFile?: File; currentFile?: VehicleFile; onChange: (file: File | null) => void }) {
  return (
    <label className={`vehicle-upload-field ${selectedFile || currentFile ? "has-file" : ""}`}>
      <span className="vehicle-upload-icon">{selectedFile?.type.startsWith("image/") ? <SelectedVehicleImage key={`${selectedFile.name}-${selectedFile.lastModified}`} file={selectedFile} alt={`ตัวอย่าง${label}`} /> : <Upload size={18} />}</span>
      <span><strong>{label}</strong><small>{selectedFile?.name || currentFile?.fileName || "ยังไม่ได้เลือกไฟล์"}</small></span>
      <em>{selectedFile ? "เลือกแล้ว" : currentFile ? "เปลี่ยนไฟล์" : "เลือกไฟล์"}</em>
      <input type="file" accept={accept} onChange={(event) => { onChange(event.target.files?.[0] ?? null); event.target.value = ""; }} />
    </label>
  );
}

function SelectedVehicleImage({ file, alt }: { file: File; alt: string }) {
  const [url] = useState(() => URL.createObjectURL(file));
  useEffect(() => () => URL.revokeObjectURL(url), [url]);
  return <Image unoptimized src={url} alt={alt} width={80} height={80} />;
}

function VehicleStoredFiles({ vehicle, loadingPath, onView, onDownload }: { vehicle: TransportVehicle; loadingPath: string; onView: (path: string, fileName: string, label: string) => Promise<void>; onDownload: (path: string, fileName: string) => Promise<void> }) {
  const documents = vehicleDocumentKinds.flatMap((kind) => vehicle.documents[kind] ? [{ kind, file: vehicle.documents[kind] }] : []);
  const images = vehicleImageKinds.flatMap((kind) => vehicle.images[kind] ? [{ kind, file: vehicle.images[kind] }] : []);

  return (
    <div className="vehicle-stored-files">
      <section><header><FileImage size={16} /><strong>ภาพรถ</strong><span>{images.length}/4</span></header>{images.length ? <div className="vehicle-stored-images">{images.map(({ kind, file }) => <article key={kind} className="vehicle-stored-document-card"><button type="button" className="vehicle-document-preview vehicle-photo-preview" disabled={loadingPath === file.storagePath} onClick={() => void onView(file.storagePath, file.fileName, `ภาพรถ${vehicleImageLabels[kind]}`)}><StoredVehicleImage file={file} alt={`ภาพรถ${vehicleImageLabels[kind]}`} /></button><div><span><strong>{vehicleImageLabels[kind]}</strong><small>{file.fileName}</small></span><button type="button" aria-label={`ดูภาพรถ${vehicleImageLabels[kind]}`} disabled={loadingPath === file.storagePath} onClick={() => void onView(file.storagePath, file.fileName, `ภาพรถ${vehicleImageLabels[kind]}`)}><Eye size={14} /></button><button type="button" aria-label={`ดาวน์โหลดภาพรถ${vehicleImageLabels[kind]}`} onClick={() => void onDownload(file.storagePath, file.fileName)}><Download size={14} /></button></div></article>)}</div> : <small>ยังไม่มีภาพรถ</small>}</section>
      <section><header><FileText size={16} /><strong>เอกสารรถ</strong><span>{documents.length}/4</span></header>{documents.length ? <div className="vehicle-stored-documents">{documents.map(({ kind, file }) => <article key={kind} className="vehicle-stored-document-card"><button type="button" className="vehicle-document-preview" disabled={loadingPath === file.storagePath} onClick={() => void onView(file.storagePath, file.fileName, vehicleDocumentLabels[kind])}>{file.contentType.startsWith("image/") ? <StoredVehicleImage file={file} alt={`เอกสาร${vehicleDocumentLabels[kind]}`} /> : <FileText size={24} />}</button><div><span><strong>{vehicleDocumentLabels[kind]}</strong><small>{file.fileName}</small></span><button type="button" aria-label={`ดู${vehicleDocumentLabels[kind]}`} disabled={loadingPath === file.storagePath} onClick={() => void onView(file.storagePath, file.fileName, vehicleDocumentLabels[kind])}><Eye size={14} /></button><button type="button" aria-label={`ดาวน์โหลด${vehicleDocumentLabels[kind]}`} onClick={() => void onDownload(file.storagePath, file.fileName)}><Download size={14} /></button></div></article>)}</div> : <small>ยังไม่มีเอกสารรถ</small>}</section>
    </div>
  );
}

function StoredVehicleImage({ file, alt }: { file: VehicleFile; alt: string }) {
  const [url, setUrl] = useState("");
  useEffect(() => {
    let active = true;
    getVehicleFilePreviewURL(file.storagePath).then((nextURL) => { if (active) setUrl(nextURL); }).catch(() => { if (active) setUrl(""); });
    return () => { active = false; };
  }, [file.storagePath]);
  return url ? <Image unoptimized src={url} alt={alt} width={240} height={160} /> : <FileImage size={20} />;
}

function escapeHtml(value: string | number | null) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[character] ?? character);
}

function vehiclePrintDocument(vehicle: TransportVehicle, organizationName: string, images: { kind: VehicleImageKind; url: string }[], documents: { kind: VehicleDocumentKind; fileName: string; contentType: string; url: string }[]) {
  const details = [
    ["ประเภทรถ", vehicle.vehicleType || "—"],
    ["ยี่ห้อ / รุ่น", [vehicle.brand, vehicle.model].filter(Boolean).join(" ") || "—"],
    ["น้ำหนักตัวรถ", vehicle.vehicleWeightKg === null ? "—" : `${vehicle.vehicleWeightKg.toLocaleString("th-TH")} กก.`],
    ["น้ำหนักบรรทุก", vehicle.capacityKg === null ? "—" : `${vehicle.capacityKg.toLocaleString("th-TH")} กก.`],
    ["พรบ.หมดอายุ", vehicle.compulsoryInsuranceExpiry || "—"],
    ["ประกันหมดอายุ", vehicle.insuranceExpiry || "—"],
    ["สถานะ", vehicleStatusLabels[vehicle.status]]
  ];
  const documentRows = documents.map(({ kind, fileName, contentType, url }) => `<li>${contentType.startsWith("image/") ? `<img src="${escapeHtml(url)}" alt="${escapeHtml(vehicleDocumentLabels[kind])}">` : `<div class="pdf-mark">PDF</div>`}<div><strong>${escapeHtml(vehicleDocumentLabels[kind])}</strong><a href="${escapeHtml(url)}">${escapeHtml(fileName || "เปิดเอกสาร")}</a></div></li>`);
  const photos = images.map(({ kind, url }) => `<figure><img src="${escapeHtml(url)}" alt="${escapeHtml(vehicleImageLabels[kind])}"><figcaption>${escapeHtml(vehicleImageLabels[kind])}</figcaption></figure>`).join("");
  return `<!doctype html><html lang="th"><head><meta charset="utf-8"><title>ข้อมูลรถ ${escapeHtml(vehicle.plate)}</title><style>*{box-sizing:border-box}body{margin:0;padding:14mm;color:#1b2528;font-family:"Noto Sans Thai",Tahoma,sans-serif;font-size:11pt}header{display:flex;justify-content:space-between;align-items:end;padding-bottom:18px;border-bottom:3px solid #334b52}header small{color:#6b777b;letter-spacing:.15em}h1{margin:5px 0 0;font-size:28pt}header strong{color:#334b52}.details{display:grid;grid-template-columns:repeat(2,1fr);margin:18px 0;border:1px solid #ccd3d5;border-radius:10px;overflow:hidden}.details div{padding:10px 12px;border-right:1px solid #e1e5e6;border-bottom:1px solid #e1e5e6}.details span,.details strong{display:block}.details span{color:#6b777b;font-size:8pt}.photos{display:grid;grid-template-columns:repeat(2,1fr);gap:8px}.photos figure{margin:0;break-inside:avoid}.photos img{width:100%;aspect-ratio:4/3;object-fit:cover;border-radius:8px}.photos figcaption{margin-top:3px;color:#6b777b;font-size:8pt}h2{margin:22px 0 9px;font-size:14pt}.documents{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));align-items:start;gap:10px;padding:0;list-style:none}.documents li{min-width:0;overflow:hidden;border:1px solid #dfe4e5;border-radius:9px;background:#fff;break-inside:avoid}.documents img,.documents .pdf-mark{display:grid;width:100%;aspect-ratio:3/4;place-items:center;border-bottom:1px solid #dfe4e5;background:#eef1f2;object-fit:contain}.documents li>div{padding:8px 9px 10px}.documents .pdf-mark{color:#647176;font-size:18pt;font-weight:700}.documents strong,.documents a{display:block}.documents a{margin-top:3px;color:#334b52;font-size:8pt;overflow-wrap:anywhere}.actions{margin-bottom:14px}.actions button{padding:9px 13px;border:0;border-radius:7px;color:white;background:#334b52;font:inherit}@page{size:A4 portrait;margin:0}@media print{body{padding:10mm}.actions{display:none}}</style></head><body><div class="actions"><button onclick="window.print()">พิมพ์ / บันทึกเป็น PDF</button></div><header><div><small>VEHICLE PROFILE</small><h1>${escapeHtml(vehicle.plate)}</h1></div><strong>${escapeHtml(organizationName)}</strong></header><section class="details">${details.map(([label, value]) => `<div><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`).join("")}</section>${photos ? `<h2>ภาพรถ 4 ด้าน</h2><section class="photos">${photos}</section>` : ""}<h2>เอกสารยานพาหนะ</h2>${documentRows.length ? `<ul class="documents">${documentRows.join("")}</ul>` : "<p>ไม่มีเอกสารแนบ</p>"}</body></html>`;
}
