"use client";
import { useState } from "react";
import { ContactEditor, useContacts } from "./ContactBook";
import { canManageOrganizationLists, type UserProfile } from "@/lib/transport-repository";
export type StopContact = { id: string; name: string; phone: string; notes: string };
export default function ContactPicker({ actor, value, onChange }: { actor: UserProfile; value: StopContact; onChange: (value: StopContact) => void }) {
  const { items, error, loading } = useContacts(actor.organizationId ?? "main");
  const [search, setSearch] = useState("");
  const [adding, setAdding] = useState(false);
  const canWrite = canManageOrganizationLists(actor, actor.organizationId ?? "main");
  const options = items.filter(item => item.active && (item.id === value.id || [item.name, item.phone, item.company, item.location].join(" ").toLowerCase().includes(search.toLowerCase())));
  return <div className="contact-picker">
    <label>ค้นหาในสมุดรายชื่อ<input value={search} onChange={e => setSearch(e.target.value)} placeholder="ชื่อ เบอร์โทร บริษัท หรือสถานที่" /></label>
    <label>เลือกผู้ติดต่อ<select value={value.id} disabled={loading || Boolean(error)} onChange={e => { const selected = items.find(item => item.id === e.target.value); onChange(selected ? { id: selected.id, name: selected.name, phone: selected.phone, notes: selected.notes } : { id: "", name: "", phone: "", notes: "" }); }}><option value="">{loading ? "กำลังโหลด…" : "ระบุเอง หรือเลือกจากสมุดรายชื่อ"}</option>{value.id && !options.some(item => item.id === value.id) && <option value={value.id}>{value.name} (ข้อมูลที่เลือกไว้)</option>}{options.map(item => <option key={item.id} value={item.id}>{item.name} · {item.phone}{item.company ? ` · ${item.company}` : ""}</option>)}</select></label>
    {error && <small role="alert">โหลดสมุดรายชื่อไม่สำเร็จ สามารถระบุผู้ติดต่อเองได้</small>}
    <label>ชื่อผู้ติดต่อ<input value={value.name} required={Boolean(value.phone.trim())} maxLength={160} onChange={e => onChange({ ...value, name: e.target.value })} /></label>
    <label>เบอร์โทรผู้ติดต่อ<input type="tel" value={value.phone} maxLength={40} required={Boolean(value.name.trim())} pattern="[+0-9()\\s\\-]{7,40}" onChange={e => onChange({ ...value, phone: e.target.value })} /></label>
    <label>หมายเหตุการติดต่อ<input value={value.notes} maxLength={500} onChange={e => onChange({ ...value, notes: e.target.value })} placeholder="เช่น ติดต่อก่อนเข้ารับ 30 นาที" /></label>
    <small>แก้ไขด้านบนเฉพาะใบงานนี้ สมุดรายชื่อจะไม่เปลี่ยนแปลง</small>
    {canWrite && <button type="button" onClick={() => setAdding(!adding)}>{adding ? "ปิดการเพิ่มรายชื่อ" : "+ เพิ่มผู้ติดต่อในสมุดรายชื่อ"}</button>}
    {adding && <ContactEditor actor={actor} initial={{ name: value.name, phone: value.phone, company: "", location: "", notes: value.notes }} onSave={contact => { onChange({ id: contact.id, name: contact.name, phone: contact.phone, notes: contact.notes }); setAdding(false); }} onCancel={() => setAdding(false)} />}
  </div>;
}
