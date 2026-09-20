"use client";
import { ChevronDown } from "lucide-react";
import { useState } from "react";
import { ContactEditor, useContacts } from "./ContactBook";
import { canManageOrganizationLists, type UserProfile } from "@/lib/transport-repository";
export type StopContact = { id: string; name: string; phone: string; notes: string };
export default function ContactPicker({ actor, value, onChange }: { actor: UserProfile; value: StopContact; onChange: (value: StopContact) => void }) {
  const { items, error, loading } = useContacts(actor.organizationId ?? "main");
  const [expanded, setExpanded] = useState(false);
  const [adding, setAdding] = useState(false);
  const canWrite = canManageOrganizationLists(actor, actor.organizationId ?? "main");
  const options = items.filter(item => item.active);
  return <div className="contact-picker">
    <label className="contact-picker-select"><span>เลือกผู้ติดต่อ</span><select value={value.id} disabled={loading || Boolean(error)} onChange={e => { const selected = items.find(item => item.id === e.target.value); onChange(selected ? { id: selected.id, name: selected.name, phone: selected.phone, notes: "" } : { id: "", name: "", phone: "", notes: "" }); }}><option value="">{loading ? "กำลังโหลด…" : "ระบุเอง หรือเลือกจากสมุดรายชื่อ"}</option>{value.id && !options.some(item => item.id === value.id) && <option value={value.id}>{value.name} (ข้อมูลที่เลือกไว้)</option>}{options.map(item => <option key={item.id} value={item.id}>{item.name} · {item.phone}</option>)}</select></label>
    {error && <small role="alert">โหลดสมุดรายชื่อไม่สำเร็จ สามารถระบุผู้ติดต่อเองได้</small>}
    <div className="contact-phone-preview">{value.phone || "เบอร์โทรจะแสดงเมื่อเลือกผู้ติดต่อ"}</div>
    <details open={expanded} onToggle={event => setExpanded(event.currentTarget.open)}><summary><span>{value.name ? "แก้ไขชื่อ / เบอร์เฉพาะงานนี้" : "ระบุผู้ติดต่อเอง / เพิ่มรายชื่อ"}</span><ChevronDown size={16} /></summary><div className="contact-picker-expanded" onInvalid={() => setExpanded(true)}>
    <label>ชื่อผู้ติดต่อ<input value={value.name} required={Boolean(value.phone.trim())} maxLength={160} onChange={e => onChange({ ...value, name: e.target.value })} /></label>
    <label>เบอร์โทรผู้ติดต่อ<input type="tel" value={value.phone} maxLength={40} required={Boolean(value.name.trim())} pattern="[+0-9()\\s\\-]{7,40}" onChange={e => onChange({ ...value, phone: e.target.value })} /></label>
    {canWrite && <button type="button" onClick={() => setAdding(!adding)}>{adding ? "ปิดการเพิ่มรายชื่อ" : "+ เพิ่มผู้ติดต่อในสมุดรายชื่อ"}</button>}
    {adding && <ContactEditor hideNotes actor={actor} initial={{ name: value.name, phone: value.phone, company: "", location: "", notes: "" }} onSave={contact => { onChange({ id: contact.id, name: contact.name, phone: contact.phone, notes: "" }); setAdding(false); }} onCancel={() => setAdding(false)} />}
    </div></details>
  </div>;
}
