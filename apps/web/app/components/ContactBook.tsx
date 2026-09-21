"use client";
import { useEffect, useState } from "react";
import { emptyContact, saveContact, setContactActive, subscribeContacts, type ContactDraft, type SavedContact, validateContact } from "@/lib/contact-repository";
import { canManageOrganizationLists, subscribeListOptions, type UserProfile } from "@/lib/transport-repository";

import { subscribeCustomers } from "@/lib/customer-repository";
import { subscribeSavedLocations } from "@/lib/location-repository";
import { formatPhoneNumber } from "@/lib/profile-repository";

export function ContactEditor({ initial = emptyContact, id, actor, onSave, onCancel, hideNotes = false }: { hideNotes?: boolean; initial?: ContactDraft; id?: string; actor: UserProfile; onSave: (contact: SavedContact) => void; onCancel: () => void }) {
  const [draft, setDraft] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const orgId = actor.organizationId ?? "main";
  const [companies, setCompanies] = useState<string[]>([]);
  const [locations, setLocations] = useState<string[]>([]);
  const [companyError, setCompanyError] = useState("");
  const [locationError, setLocationError] = useState("");
  const [companiesReady, setCompaniesReady] = useState(false);
  const [locationsReady, setLocationsReady] = useState(false);
  useEffect(() => {
    const receiveCompanies = (names: string[]) => { setCompanies([...new Set(names)]); setCompaniesReady(true); setCompanyError(""); };
    const failCompanies = () => { setCompanyError("โหลดบริษัท / ลูกค้าไม่สำเร็จ"); setCompaniesReady(true); };
    const stopCompanies = orgId === "main"
      ? subscribeCustomers(items => receiveCompanies(items.filter(item => item.active).map(item => item.name)), failCompanies)
      : subscribeListOptions(orgId, "customer", items => receiveCompanies(items.map(item => item.value)), failCompanies);
    const stopLocations = subscribeSavedLocations(orgId, items => { setLocations([...new Set(items.filter(item => item.active).map(item => item.name))]); setLocationsReady(true); setLocationError(""); }, () => { setLocationError("โหลดสถานที่ไม่สำเร็จ"); setLocationsReady(true); });
    return () => { stopCompanies(); stopLocations(); };
  }, [orgId]);
  async function save() {
    setBusy(true); setError("");
    try { const savedId = await saveContact(draft, id, actor); onSave({ ...validateContact(draft), id: savedId, active: true }); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "บันทึกไม่สำเร็จ"); }
    finally { setBusy(false); }
  }
  return <fieldset className="customer-card customer-form" disabled={busy} onKeyDown={event => { if (event.key === "Enter" && event.target instanceof HTMLInputElement) { event.preventDefault(); if (!busy) void save(); } }}><legend>{id ? "แก้ไขผู้ติดต่อในสมุดรายชื่อ" : "เพิ่มผู้ติดต่อในสมุดรายชื่อ"}</legend>
    {([ ["name", "ชื่อผู้ติดต่อ"], ["phone", "เบอร์โทร"] ] as [keyof ContactDraft, string][]).map(([key, label]) => <label key={key}>{label}<input type={key === "phone" ? "tel" : "text"} inputMode={key === "phone" ? "numeric" : undefined} value={key === "phone" ? formatPhoneNumber(draft[key]) : draft[key]} maxLength={key === "phone" ? 12 : 160} pattern={key === "phone" ? "[0-9]{3}-[0-9]{3}-[0-9]{4}" : undefined} onChange={event => setDraft({ ...draft, [key]: key === "phone" ? formatPhoneNumber(event.target.value) : event.target.value })} /></label>)}
    <label>บริษัท / ลูกค้า<select value={draft.company} disabled={!companiesReady || Boolean(companyError)} onChange={event => setDraft({ ...draft, company: event.target.value })}><option value="">{!companiesReady ? "กำลังโหลด…" : "เลือกบริษัท / ลูกค้า"}</option>{draft.company && !companies.includes(draft.company) && <option value={draft.company}>{draft.company} (ข้อมูลเดิม)</option>}{companies.map(name => <option key={name} value={name}>{name}</option>)}</select>{companyError && <small role="alert">{companyError}</small>}{companiesReady && !companyError && !companies.length && <small>ยังไม่มีข้อมูลลูกค้าในระบบ</small>}</label>
    <label>สถานที่<select value={draft.location} disabled={!locationsReady || Boolean(locationError)} onChange={event => setDraft({ ...draft, location: event.target.value })}><option value="">{!locationsReady ? "กำลังโหลด…" : "เลือกสถานที่"}</option>{draft.location && !locations.includes(draft.location) && <option value={draft.location}>{draft.location} (ข้อมูลเดิม)</option>}{locations.map(name => <option key={name} value={name}>{name}</option>)}</select>{locationError && <small role="alert">{locationError}</small>}{locationsReady && !locationError && !locations.length && <small>เพิ่มสถานที่ได้ที่เมนูตั้งค่าพิกัดแผนที่</small>}</label>
    {!hideNotes && <label>หมายเหตุการติดต่อ<input value={draft.notes} maxLength={500} onChange={event => setDraft({ ...draft, notes: event.target.value })} /></label>}
    {error && <p role="alert" className="customer-error">{error}</p>}<div className="customer-actions"><button type="button" onClick={() => void save()}>{busy ? "กำลังบันทึก…" : "บันทึกในสมุดรายชื่อ"}</button><button type="button" onClick={onCancel}>ยกเลิก</button></div>
  </fieldset>;
}
export function useContacts(orgId: string) {
  const [state, setState] = useState<{ orgId: string; items: SavedContact[]; error: string; loading: boolean }>({ orgId, items: [], error: "", loading: true });
  useEffect(() => subscribeContacts(orgId, items => setState({ orgId, items, loading: false, error: "" }), error => setState({ orgId, items: [], loading: false, error })), [orgId]);
  return state.orgId === orgId ? state : { items: [], error: "", loading: true };
}
export default function ContactBook({ actor }: { actor: UserProfile }) {
  const orgId = actor.organizationId ?? "main";
  const { items, error, loading } = useContacts(orgId);
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<SavedContact | "new" | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const canWrite = canManageOrganizationLists(actor, orgId);
  const filtered = items.filter(item => [item.name, item.phone, item.company, item.location].join(" ").toLowerCase().includes(search.toLowerCase()));
  return <section className="screen customer-screen"><header><span className="eyebrow">CONTACT BOOK</span><h1>สมุดรายชื่อ</h1><p>ผู้ติดต่อจุดรับและจุดส่งของบริษัท เลือกใช้ซ้ำได้ในทุกใบงาน</p></header>
    <div className="customer-toolbar"><label className="customer-search">ค้นหาผู้ติดต่อ<input value={search} onChange={e => setSearch(e.target.value)} placeholder="ชื่อ เบอร์โทร บริษัท หรือสถานที่" /></label><button disabled={!canWrite || busy} onClick={() => setEditing("new")}>เพิ่มผู้ติดต่อ</button></div>
    {error && <p role="alert">โหลดสมุดรายชื่อไม่สำเร็จ: {error}</p>}{message && <p role="status">{message}</p>}
    {editing && <ContactEditor key={editing === "new" ? "new" : editing.id} actor={actor} initial={editing === "new" ? undefined : editing} id={editing === "new" ? undefined : editing.id} onSave={() => { setEditing(null); setMessage("บันทึกแล้ว ข้อมูลในใบงานเดิมจะไม่เปลี่ยนแปลง"); }} onCancel={() => setEditing(null)} />}
    {loading ? <p>กำลังโหลดรายชื่อ…</p> : !error && !filtered.length ? <p>ไม่พบรายชื่อ เพิ่มผู้ติดต่อเพื่อเลือกใช้ในใบงาน</p> : filtered.map(item => <article className="customer-card" key={item.id}><div><h2>{item.name}</h2><a href={`tel:${item.phone.replace(/[^+\d]/g, "")}`}>{formatPhoneNumber(item.phone)}</a><p>{[item.company, item.location].filter(Boolean).join(" · ")}</p>{item.notes && <p>{item.notes}</p>}<small>{item.active ? "เปิดใช้งาน" : "พักใช้งาน"}</small></div><div className="customer-actions"><button disabled={!canWrite || busy} onClick={() => setEditing(item)}>แก้ไข</button><button disabled={!canWrite || busy} onClick={async () => { setBusy(true); try { await setContactActive(item.id, !item.active, actor); setMessage("เปลี่ยนสถานะแล้ว"); } catch { setMessage("เปลี่ยนสถานะไม่สำเร็จ กรุณาลองใหม่"); } finally { setBusy(false); } }}>{item.active ? "พักใช้งาน" : "เปิดใช้งาน"}</button></div></article>)}
  </section>;
}
