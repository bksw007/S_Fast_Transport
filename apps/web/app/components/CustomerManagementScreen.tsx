"use client";

import { useEffect, useState } from "react";
import { statusLabels, type TransportJob } from "@s-fast-transport/shared";
import { createTrackingShareLink, type UserProfile } from "@/lib/transport-repository";
import { normalizeCustomerName, saveCustomer, setCustomerActive, subscribeCustomers, subscribeCustomerLinks, updateCustomerLink, type Customer, type CustomerDraft, type CustomerLink } from "@/lib/customer-repository";

const emptyDraft: CustomerDraft = { name: "", contactName: "", phone: "", email: "", taxId: "", address: "", notes: "" };
const sections = ["รายชื่อลูกค้า", "งานของลูกค้า", "สร้างลิงก์ติดตามเฉพาะงาน", "กำหนดวันหมดอายุของลิงก์"];
function localDate(value: number) {
  const date = new Date(value);
  return new Date(value - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}
export function CustomerManagementScreen({ actor, jobs, canWrite }: { actor: UserProfile; jobs: TransportJob[]; canWrite: boolean }) {
  const [tab, setTab] = useState(0);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [links, setLinks] = useState<CustomerLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [linksLoading, setLinksLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [customerFilter, setCustomerFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [editing, setEditing] = useState<Customer | null>(null);
  const [draft, setDraft] = useState<CustomerDraft | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [jobId, setJobId] = useState("");
  const [expiry, setExpiry] = useState(() => localDate(Date.now() + 7 * 86400000));
  const [url, setUrl] = useState("");
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30000);
    const stopCustomers = subscribeCustomers(items => { setCustomers(items); setLoading(false); }, text => { setError(`โหลดลูกค้าไม่สำเร็จ: ${text}`); setLoading(false); });
    const stopLinks = subscribeCustomerLinks(items => { setLinks(items); setLinksLoading(false); }, text => { setError(`โหลดลิงก์ไม่สำเร็จ: ${text}`); setLinksLoading(false); });
    return () => { clearInterval(timer); stopCustomers(); stopLinks(); };
  }, []);
  async function perform(action: () => Promise<void>, success: string) {
    setBusy(true); setError(""); setMessage("");
    try { await action(); setMessage(success); } catch (cause) { setError(cause instanceof Error ? cause.message : "ดำเนินการไม่สำเร็จ กรุณาลองใหม่"); } finally { setBusy(false); }
  }
  const needle = normalizeCustomerName(search);
  const matches = (...values: string[]) => normalizeCustomerName(values.join(" ")).includes(needle);
  const selectedCustomer = customers.find(item => item.id === customerFilter);
  const customerNames = selectedCustomer ? [selectedCustomer.name, ...selectedCustomer.aliases].map(normalizeCustomerName) : [];
  const filteredJobs = jobs.filter(job => (!customerFilter || customerNames.includes(normalizeCustomerName(job.customer))) && (!statusFilter || job.status === statusFilter) && matches(job.customer, job.workOrder, job.vehiclePlate));
  const filteredLinks = links.filter(link => matches(link.customerName, link.workOrder));
  const disabled = busy || !canWrite;
  const linkUrl = (token: string) => `${window.location.origin}/track/${token}`;
  return <section className="screen customer-screen">
    <header><span className="eyebrow">CUSTOMERS</span><h1>ลูกค้าและลิงก์ติดตาม</h1><p>จัดการผู้ว่าจ้าง ตรวจสอบงาน และแชร์สถานะเฉพาะงานให้ลูกค้า</p></header>
    <nav className="customer-tabs" aria-label="เมนูย่อยลูกค้า">{sections.map((label, index) => <button key={label} type="button" aria-pressed={tab === index} className={tab === index ? "active" : ""} onClick={() => { setTab(index); setSearch(""); }}>{label}</button>)}</nav>
    {!canWrite && <p role="status">ต้องเชื่อมต่อด้วยบัญชีที่ได้รับอนุมัติก่อนบันทึกข้อมูล</p>}
    {error && <p className="customer-error" role="alert">{error}</p>}{message && <p role="status">{message}</p>}
    {tab !== 2 && <label className="customer-search">ค้นหา<input value={search} onChange={event => setSearch(event.target.value)} placeholder={tab === 0 ? "ชื่อ ผู้ติดต่อ เบอร์โทร หรือเลขผู้เสียภาษี" : "ชื่อลูกค้าหรือเลขที่ใบงาน"} /></label>}
    {tab === 0 && <>
      <div className="customer-toolbar"><p>{customers.length} ราย · เปิดใช้งาน {customers.filter(item => item.active).length} ราย</p><button disabled={disabled || loading} onClick={() => { setEditing(null); setDraft({ ...emptyDraft }); }}>เพิ่มลูกค้า</button></div>
      {draft && <form className="customer-card customer-form" onSubmit={event => { event.preventDefault(); void perform(async () => { const duplicate = customers.find(item => item.id !== editing?.id && [item.name, ...item.aliases].some(name => normalizeCustomerName(name) === normalizeCustomerName(draft.name))); if (duplicate) throw new Error("ชื่อลูกค้านี้มีอยู่แล้ว"); await saveCustomer(draft, editing, actor); setDraft(null); }, "บันทึกลูกค้าเรียบร้อย"); }}>
        <h2>{editing ? "แก้ไขลูกค้า" : "เพิ่มลูกค้า"}</h2>
        {([ ["name", "ชื่อลูกค้า / บริษัท"], ["contactName", "ผู้ติดต่อ"], ["phone", "เบอร์โทร"], ["email", "อีเมล"], ["taxId", "เลขประจำตัวผู้เสียภาษี"], ["address", "ที่อยู่"], ["notes", "หมายเหตุ"] ] as [keyof CustomerDraft, string][]).map(([key, label]) => <label key={key}>{label}<input required={key === "name"} type={key === "email" ? "email" : key === "phone" ? "tel" : "text"} maxLength={key === "taxId" ? 13 : key === "name" ? 200 : 1000} value={draft[key]} onChange={event => setDraft({ ...draft, [key]: event.target.value })} /></label>)}
        <div className="customer-actions"><button type="submit" disabled={disabled}>{busy ? "กำลังบันทึก…" : "บันทึกลูกค้า"}</button><button type="button" disabled={busy} onClick={() => setDraft(null)}>ยกเลิก</button></div>
      </form>}
      {loading ? <p>กำลังโหลดลูกค้า…</p> : customers.filter(item => matches(item.name, item.contactName, item.phone, item.taxId)).length === 0 ? <p>ไม่พบลูกค้า เพิ่มลูกค้าใหม่เพื่อเริ่มจัดการข้อมูล</p> : customers.filter(item => matches(item.name, item.contactName, item.phone, item.taxId)).map(customer => <article key={customer.id} className="customer-card"><div><h2>{customer.name}</h2><span>{customer.active ? "เปิดใช้งาน" : "พักใช้งาน"}</span><p>{customer.contactName || "ยังไม่มีผู้ติดต่อ"} · {customer.phone || "ยังไม่มีเบอร์โทร"}</p>{customer.email && <p>{customer.email}</p>}{customer.address && <p>{customer.address}</p>}{customer.notes && <p>{customer.notes}</p>}</div><div className="customer-actions"><button onClick={() => { setCustomerFilter(customer.id); setSearch(""); setTab(1); }}>ดูงาน</button><button disabled={disabled} onClick={() => { setEditing(customer); setDraft({ name: customer.name, contactName: customer.contactName, phone: customer.phone, email: customer.email, taxId: customer.taxId, address: customer.address, notes: customer.notes }); }}>แก้ไข</button><button disabled={disabled} onClick={() => void perform(() => setCustomerActive(customer, !customer.active, actor), "เปลี่ยนสถานะลูกค้าแล้ว")}>{customer.active ? "พักใช้งาน" : "เปิดใช้งาน"}</button></div></article>)}
    </>}
    {tab === 1 && <><div className="customer-toolbar"><label>ลูกค้า<select value={customerFilter} onChange={event => setCustomerFilter(event.target.value)}><option value="">ทั้งหมด รวมลูกค้าจากใบงานเดิม</option>{customers.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label>สถานะ<select value={statusFilter} onChange={event => setStatusFilter(event.target.value)}><option value="">ทุกสถานะ</option>{Object.entries(statusLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label></div><p>พบ {filteredJobs.length} งานจากใบงานที่มีอยู่ในระบบ</p>{filteredJobs.map(job => <article key={job.id} className="customer-card"><h2>{job.workOrder} · {job.customer}</h2><p>{job.pickupLocation} → {job.deliveryLocation}</p><p>{statusLabels[job.status]} · {job.vehiclePlate}</p><button disabled={disabled} onClick={() => { setJobId(job.id); setUrl(""); setTab(2); }}>สร้างลิงก์ติดตามงานนี้</button></article>)}</>}
    {tab === 2 && <form className="customer-card customer-form" onSubmit={event => { event.preventDefault(); void perform(async () => { const job = jobs.find(item => item.id === jobId); if (!job) throw new Error("กรุณาเลือกใบงาน"); const token = await createTrackingShareLink(job, actor, new Date(expiry)); setUrl(linkUrl(token)); }, "สร้างลิงก์แล้ว สามารถคัดลอกส่งให้ลูกค้าได้"); }}><h2>สร้างลิงก์ติดตามเฉพาะงาน</h2><label>ใบงาน<select required value={jobId} onChange={event => { setJobId(event.target.value); setUrl(""); }}><option value="">เลือกใบงาน</option>{jobs.map(job => <option key={job.id} value={job.id}>{job.workOrder} · {job.customer}</option>)}</select></label><label>วันและเวลาหมดอายุ<input required type="datetime-local" value={expiry} onChange={event => setExpiry(event.target.value)} /></label><p>ผู้ที่มีลิงก์เปิดดูสถานะและตำแหน่งของงานนี้ได้โดยไม่ต้องเข้าสู่ระบบ</p><button disabled={disabled || !jobs.length} type="submit">{busy ? "กำลังสร้าง…" : "สร้างลิงก์"}</button>{!jobs.length && <p>ยังไม่มีใบงานให้สร้างลิงก์</p>}{url && <div className="customer-link-result"><label>ลิงก์ที่สร้าง<input readOnly value={url} onFocus={event => event.target.select()} /></label><button type="button" onClick={() => void perform(() => navigator.clipboard.writeText(url), "คัดลอกลิงก์แล้ว")}>คัดลอกลิงก์</button><a href={url} target="_blank" rel="noreferrer">เปิดดู</a></div>}</form>}
    {tab === 3 && <>{linksLoading ? <p>กำลังโหลดลิงก์…</p> : !filteredLinks.length ? <p>ไม่พบลิงก์ติดตาม</p> : filteredLinks.map(link => <article key={link.id} className="customer-card"><h2>{link.workOrder} · {link.customerName}</h2><p>{!link.enabled ? "ปิดใช้งาน" : link.expiresAt <= now ? "หมดอายุ" : "ใช้งานได้"} · หมดอายุ {new Date(link.expiresAt).toLocaleString("th-TH")}</p><form className="customer-toolbar" key={`${link.id}-${link.expiresAt}`} onSubmit={event => { event.preventDefault(); const form = new FormData(event.currentTarget); void perform(() => updateCustomerLink(link.id, { expiresAt: new Date(String(form.get("expiry"))) }, actor), "บันทึกวันหมดอายุแล้ว"); }}><label>วันหมดอายุใหม่<input name="expiry" type="datetime-local" required defaultValue={localDate(link.expiresAt)} /></label><button disabled={disabled} type="submit">บันทึกวันหมดอายุ</button></form><div className="customer-actions"><button disabled={busy || !link.enabled || link.expiresAt <= now} onClick={() => void perform(() => navigator.clipboard.writeText(linkUrl(link.id)), "คัดลอกลิงก์แล้ว")}>คัดลอกลิงก์</button><button disabled={disabled || (!link.enabled && link.expiresAt <= now)} onClick={() => void perform(() => updateCustomerLink(link.id, { enabled: !link.enabled }, actor), "เปลี่ยนสถานะลิงก์แล้ว")}>{link.enabled ? "ปิดลิงก์" : "เปิดลิงก์อีกครั้ง"}</button></div></article>)}</>}
  </section>;
}
