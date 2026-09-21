"use client";
import { useEffect, useState } from "react";
import { Building2, Link2, Monitor, Save, RotateCcw } from "lucide-react";
import { canEditCompanySettings, defaultCompanySettings, loadCompanySettings, saveCompanySettings, type CompanySettings } from "@/lib/settings-repository";
import type { UserProfile } from "@/lib/transport-repository";
import { formatPhoneNumber } from "@/lib/profile-repository";

export type AppearanceSettings = { theme: "light" | "dark"; fontScale: number; onThemeChange: (theme: "light" | "dark") => void; onFontScaleChange: (scale: number) => void };
export default function SettingsScreen({ actor, appearance }: { actor: UserProfile; appearance: AppearanceSettings }) {
  const [draft, setDraft] = useState<CompanySettings>(defaultCompanySettings);
  const [saved, setSaved] = useState<CompanySettings>(defaultCompanySettings);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [retry, setRetry] = useState(0);
  const canEdit = canEditCompanySettings(actor);
  const dirty = JSON.stringify(saved) !== JSON.stringify(draft);
  useEffect(() => {
    let cancelled = false;
    loadCompanySettings(actor.organizationId || "main").then(data => {
      if (cancelled) return;
      const initial = { ...data, name: data.name || actor.organizationName || "S Fast Transport" };
      setDraft(initial); setSaved(initial); setLoading(false);
    }).catch(() => { if (!cancelled) { setLoadError("โหลดการตั้งค่าไม่สำเร็จ กรุณาลองใหม่"); setLoading(false); } });
    return () => { cancelled = true; };
  }, [actor.organizationId, actor.organizationName, retry]);
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  function update<K extends keyof CompanySettings>(field: K, value: CompanySettings[K]) { setDraft(current => ({ ...current, [field]: value })); setMessage(""); }
  async function save(event: React.FormEvent) {
    event.preventDefault(); if (busy || !canEdit) return;
    setBusy(true); setMessage("");
    try { const clean = await saveCompanySettings(draft, actor); setSaved(clean); setDraft(clean); setMessage("บันทึกการตั้งค่าแล้ว"); }
    catch (error) { setMessage(error instanceof Error ? error.message : "บันทึกไม่สำเร็จ"); }
    finally { setBusy(false); }
  }
  return <section className="screen settings-screen">
    <header className="section-title"><div><span className="eyebrow">WORKSPACE SETTINGS</span><h1>ตั้งค่าระบบ</h1><p>ข้อมูลบริษัท การแชร์งาน และการแสดงผลของคุณ</p></div></header>
    {loading ? <p role="status">กำลังโหลดการตั้งค่า…</p> : loadError ? <div role="alert">{loadError}<button onClick={() => { setLoadError(""); setLoading(true); setRetry(value => value + 1); }}>ลองใหม่</button></div> : <form onSubmit={save}>
      {!canEdit && <p className="settings-note">ข้อมูลบริษัทแสดงแบบอ่านอย่างเดียว การแก้ไขต้องดำเนินการโดยผู้ดูแลบริษัทหลัก</p>}
      <fieldset disabled={!canEdit || busy} className="settings-panel"><legend><Building2 size={19} /> ข้อมูลบริษัท</legend><p>ชื่อบริษัทนี้ใช้กับใบงานและลิงก์ติดตามที่สร้างใหม่ ข้อมูลอื่นเก็บเป็นข้อมูลติดต่อบริษัท</p><div className="settings-fields">
        <label>ชื่อบริษัท *<input required maxLength={150} value={draft.name} onChange={e => update("name", e.target.value)} /></label>
        <label>เลขประจำตัวผู้เสียภาษี<input inputMode="numeric" maxLength={13} pattern="[0-9]{13}" value={draft.taxId} onChange={e => update("taxId", e.target.value)} /></label>
        <label>ผู้ติดต่อหลัก<input maxLength={150} value={draft.contactName} onChange={e => update("contactName", e.target.value)} /></label>
        <label>เบอร์ติดต่อ<input type="tel" inputMode="numeric" maxLength={12} pattern="[0-9]{3}-[0-9]{3}-[0-9]{4}" value={formatPhoneNumber(draft.phone)} onChange={e => update("phone", formatPhoneNumber(e.target.value))} /></label>
        <label>อีเมลบริษัท<input type="email" maxLength={254} value={draft.email} onChange={e => update("email", e.target.value)} /></label>
        <label>ลิงก์โลโก้บริษัท (HTTPS)<input type="url" maxLength={2000} placeholder="https://…" value={draft.logoUrl} onChange={e => update("logoUrl", e.target.value)} /></label>
        <label className="settings-wide">ที่อยู่บริษัท<textarea rows={3} maxLength={1000} value={draft.address} onChange={e => update("address", e.target.value)} /></label>
      </div></fieldset>
      <fieldset disabled={!canEdit || busy} className="settings-panel"><legend><Link2 size={19} /> ลิงก์ติดตามงาน</legend><p>มีผลกับ Share และ QR ที่สร้างใหม่ ลิงก์เดิมยังใช้วันหมดอายุเดิม</p><label>อายุลิงก์เริ่มต้น (วัน)<input required type="number" min={1} max={30} step={1} value={draft.trackingLinkDays} onChange={e => update("trackingLinkDays", Number(e.target.value))} /></label><small>กำหนดได้ 1–30 วัน หน้าลูกค้าที่เลือกวันหมดอายุเองจะใช้วันที่เลือก</small></fieldset>
      <div className="settings-save"><span role="status">{busy ? "กำลังบันทึก…" : message || (dirty ? "มีการเปลี่ยนแปลงที่ยังไม่บันทึก" : "การตั้งค่าปัจจุบัน")}</span>{canEdit && <div><button type="button" disabled={busy || !dirty} onClick={() => { setDraft(saved); setMessage(""); }}><RotateCcw size={16} />คืนค่าที่บันทึก</button><button className="resource-save-button" disabled={busy || !dirty} type="submit"><Save size={16} />บันทึกการตั้งค่า</button></div>}</div>
    </form>}
    <section className="settings-panel"><h2><Monitor size={19} /> การแสดงผล</h2><p>บันทึกอัตโนมัติสำหรับเบราว์เซอร์นี้</p><div className="settings-fields"><label>ธีม<select value={appearance.theme} onChange={e => appearance.onThemeChange(e.target.value as "light" | "dark")}><option value="light">สว่าง</option><option value="dark">มืด</option></select></label><label>ขนาดตัวอักษร<select value={appearance.fontScale} onChange={e => appearance.onFontScaleChange(Number(e.target.value))}><option value={0.92}>เล็ก</option><option value={1}>ปกติ</option><option value={1.12}>ใหญ่</option></select></label></div></section>
  </section>;
}
