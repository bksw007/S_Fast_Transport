"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowUpRight, BellRing, CalendarDays, CheckCircle2, Clock3, MapPin, Plus, Send, XCircle } from "lucide-react";
import { collection, onSnapshot } from "firebase/firestore";
import type { JobPlace } from "@s-fast-transport/shared";
import { db } from "@/lib/firebase";
import { submitCustomerJobRequest, subscribeCustomerJobRequests, type CustomerJobRequest, type CustomerRequestContact } from "@/lib/customer-job-requests";
import { subscribeListOptions, type UserProfile } from "@/lib/transport-repository";
import CustomerMapPicker from "./CustomerMapPicker";
import { ListManagerComboBox } from "./ListManagerComboBox";

const dateTime = (date: string, time: string) => `${date} ${time}`;
const requestLabels = { pending: "รอพิจารณา", accepted: "รับงานแล้ว", rejected: "ไม่รับงาน" } as const;
const emptyContact = (): CustomerRequestContact => ({ name: "", phone: "" });

function CustomerContactFields({ title, value, saved, onChange }: { title: string; value: CustomerRequestContact; saved: CustomerRequestContact[]; onChange: (contact: CustomerRequestContact) => void }) {
  return <div className="customer-request-contact-fields">
    {saved.length > 0 && <label className="wide">ผู้ติดต่อที่เคยใช้<select value="" onChange={event => { const selected = saved.find((_, index) => String(index) === event.target.value); if (selected) onChange(selected); }}><option value="">เลือกผู้ติดต่อ หรือกรอกข้อมูลใหม่</option>{saved.map((contact, index) => <option key={`${contact.name}-${contact.phone}-${index}`} value={index}>{contact.name} · {contact.phone}</option>)}</select></label>}
    <label>ชื่อผู้ติดต่อ{title}<input required maxLength={160} value={value.name} onChange={event => onChange({ ...value, name: event.target.value })} placeholder="ชื่อผู้ประสานงาน" /></label>
    <label>เบอร์โทรผู้ติดต่อ{title}<input required type="tel" inputMode="tel" maxLength={20} value={value.phone} onChange={event => onChange({ ...value, phone: event.target.value })} placeholder="เบอร์ที่คนขับติดต่อได้" /></label>
  </div>;
}

export default function CustomerJobRequests({ profile, onOpenJob }: { profile: UserProfile; onOpenJob: (jobId: string) => void }) {
  const [requests, setRequests] = useState<CustomerJobRequest[]>([]);
  const [saved, setSaved] = useState<JobPlace[]>([]);
  const [savedContacts, setSavedContacts] = useState<CustomerRequestContact[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [pickupPlace, setPickupPlace] = useState<JobPlace>();
  const [deliveryPlace, setDeliveryPlace] = useState<JobPlace>();
  const [pickupContact, setPickupContact] = useState<CustomerRequestContact>(emptyContact);
  const [deliveryContact, setDeliveryContact] = useState<CustomerRequestContact>(emptyContact);
  const [pickupDate, setPickupDate] = useState("");
  const [pickupTime, setPickupTime] = useState("");
  const [deliveryDate, setDeliveryDate] = useState("");
  const [deliveryTime, setDeliveryTime] = useState("");
  const [cargoType, setCargoType] = useState("");
  const [vehicleType, setVehicleType] = useState("");
  const [tripCount, setTripCount] = useState("1");
  const [returnGoods, setReturnGoods] = useState(false);
  const [vehicleTypes, setVehicleTypes] = useState<string[]>([]);
  const [notes, setNotes] = useState("");
  const [sendToSelf, setSendToSelf] = useState(true);
  const [extraEmails, setExtraEmails] = useState(["", ""]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const recent = useMemo(() => requests.slice(0, 12), [requests]);

  useEffect(() => subscribeCustomerJobRequests(profile, setRequests, setError), [profile]);
  useEffect(() => subscribeListOptions("main", "vehicle_type", items => setVehicleTypes(items.map(item => item.value)), message => setError(`โหลดประเภทรถไม่สำเร็จ: ${message}`)), []);
  useEffect(() => onSnapshot(collection(db, "customers", profile.customerId || "__none__", "locations"), snapshot => {
    setSaved(snapshot.docs.filter(item => item.data().active !== false).map(item => ({ ...(item.data() as JobPlace), locationId: item.id })).sort((a, b) => a.name.localeCompare(b.name, "th")));
  }, error => setError(error.message)), [profile.customerId]);
  useEffect(() => onSnapshot(collection(db, "customers", profile.customerId || "__none__", "contacts"), snapshot => {
    setSavedContacts(snapshot.docs.map(item => ({ name: String(item.data().name || ""), phone: String(item.data().phone || "") })).filter(item => item.name && item.phone).sort((a, b) => a.name.localeCompare(b.name, "th")));
  }, error => setError(`โหลดผู้ติดต่อที่บันทึกไว้ไม่สำเร็จ: ${error.message}`)), [profile.customerId]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(""); setMessage("");
    if (!pickupPlace || !deliveryPlace) { setError("กรุณาเลือกหมุดจุดรับและจุดส่ง"); return; }
    if (!pickupContact.name.trim() || !pickupContact.phone.trim() || !deliveryContact.name.trim() || !deliveryContact.phone.trim()) { setError("กรุณาระบุชื่อและเบอร์โทรผู้ติดต่อทั้งสองจุด"); return; }
    if (`${deliveryDate}T${deliveryTime}` < `${pickupDate}T${pickupTime}`) { setError("วันและเวลาส่งต้องไม่ก่อนวันและเวลารับ"); return; }
    if (!vehicleTypes.some(item => item.trim().toLocaleLowerCase("th-TH") === vehicleType.trim().toLocaleLowerCase("th-TH"))) { setError("กรุณาเลือกประเภทรถจากรายการของบริษัทขนส่งหลัก"); return; }
    const recipientEmails = [...new Set([...(sendToSelf ? [profile.email] : []), ...extraEmails.filter(Boolean)].map(email => email.trim().toLowerCase()))];
    if (!recipientEmails.length) { setError("กรุณาเลือกอีเมลผู้รับอย่างน้อย 1 ที่อยู่"); return; }
    setBusy(true);
    try {
      await submitCustomerJobRequest({ pickupPlace, deliveryPlace, pickupContact, deliveryContact, pickupDate, pickupTime, deliveryDate, deliveryTime, cargoType, vehicleType, tripCount: Number(tripCount), returnGoods, notes, recipientEmails });
      setShowForm(false); setPickupPlace(undefined); setDeliveryPlace(undefined); setPickupContact(emptyContact()); setDeliveryContact(emptyContact()); setPickupDate(""); setPickupTime(""); setDeliveryDate(""); setDeliveryTime(""); setCargoType(""); setVehicleType(""); setTripCount("1"); setReturnGoods(false); setNotes(""); setExtraEmails(["", ""]); setSendToSelf(true);
      setMessage("ส่งคำขอแจ้งงานแล้ว ระบบจะแจ้งผลทางอีเมลที่เลือกไว้");
    } catch (caught) { setError(caught instanceof Error ? caught.message : "ส่งคำขอไม่สำเร็จ กรุณาลองอีกครั้ง"); }
    finally { setBusy(false); }
  }

  return <section className="customer-portal-section customer-request-section" id="customer-requests">
    <div className="customer-portal-section-title"><div><span className="customer-portal-section-kicker">BOOK A TRANSPORT / 00</span><h2>แจ้งงานขนส่ง</h2><p>เลือกจุดรับและส่งบนแผนที่ แล้วรอทีมงานพิจารณา</p></div><button type="button" className="customer-request-new" onClick={() => setShowForm(value => !value)}>{showForm ? "ปิดแบบฟอร์ม" : <><Plus size={17} /> แจ้งงานใหม่</>}</button></div>
    {message && <p className="customer-request-message" role="status"><CheckCircle2 size={18} />{message}</p>}
    {error && <p className="customer-portal-error" role="alert">{error}</p>}
    {showForm && <form className="customer-request-form" onSubmit={event => void submit(event)}>
      <div className="customer-request-form-head"><BellRing size={22} /><div><strong>รายละเอียดคำขอ</strong><span>บริษัท {profile.organizationName} · ผู้แจ้ง {profile.fullName || profile.displayName}</span></div></div>
      <div className="customer-request-stops">
        <section className="customer-request-stop"><h3><span>01</span> จุดรับสินค้า</h3><CustomerMapPicker title="จุดรับสินค้า" value={pickupPlace} saved={saved} onChange={setPickupPlace} /><div className="customer-request-stop-details"><div className="customer-request-fields"><label>วันที่รับสินค้า<input required type="date" value={pickupDate} onChange={event => setPickupDate(event.target.value)} /></label><label>เวลารับสินค้า<input required type="time" value={pickupTime} onChange={event => setPickupTime(event.target.value)} /></label></div><CustomerContactFields title="จุดรับ" value={pickupContact} saved={savedContacts} onChange={setPickupContact} /></div></section>
        <section className="customer-request-stop"><h3><span>02</span> จุดส่งสินค้า</h3><CustomerMapPicker title="จุดส่งสินค้า" value={deliveryPlace} saved={saved} onChange={setDeliveryPlace} /><div className="customer-request-stop-details"><div className="customer-request-fields"><label>วันที่ส่งสินค้า<input required type="date" value={deliveryDate} onChange={event => setDeliveryDate(event.target.value)} /></label><label>เวลาส่งสินค้า<input required type="time" value={deliveryTime} onChange={event => setDeliveryTime(event.target.value)} /></label></div><CustomerContactFields title="จุดส่ง" value={deliveryContact} saved={savedContacts} onChange={setDeliveryContact} /></div></section>
      </div>
      <section className="customer-request-cargo"><h3><span>03</span> รายละเอียดการขนส่ง</h3><div className="customer-request-fields"><label>ประเภทสินค้า<ListManagerComboBox field="cargo_type" value={cargoType} onChange={setCargoType} placeholder="ค้นหาหรือระบุประเภทสินค้า" organizationId="main" customerId={profile.customerId || undefined} actor={profile} required /><small>รายการใหม่จะบันทึกไว้เฉพาะบริษัทของคุณเมื่อส่งคำขอ</small></label><label>ประเภทรถ<ListManagerComboBox field="vehicle_type" value={vehicleType} onChange={setVehicleType} placeholder="ค้นหาประเภทรถ" organizationId="main" actor={profile} required /><small>เลือกจากรายการเดียวกับหน้าใบงานของแอดมิน</small></label><label>จำนวนรอบ<input required type="number" min={1} max={999} step={1} value={tripCount} onChange={event => setTripCount(event.target.value)} /><small>แจ้งให้แอดมินทราบ ไม่เพิ่มจำนวนคำขอ</small></label><label className="customer-request-return"><input type="checkbox" checked={returnGoods} onChange={event => setReturnGoods(event.target.checked)} /><span>รับสินค้ากลับ<small>แจ้งให้แอดมินทราบเพื่อวางแผนงาน</small></span></label><label className="wide">หมายเหตุ<textarea rows={3} maxLength={2000} value={notes} onChange={event => setNotes(event.target.value)} placeholder="ข้อมูลเพิ่มเติมสำหรับการรับงาน" /></label></div></section>
      <fieldset className="customer-request-emails"><legend>อีเมลรับรายละเอียดและผลการพิจารณา</legend><label className="customer-request-self-email"><input type="checkbox" checked={sendToSelf} onChange={event => setSendToSelf(event.target.checked)} /><span>ส่งถึงอีเมลที่ใช้เข้าสู่ระบบ <strong>{profile.email}</strong></span></label><div className="customer-request-extra-emails">{extraEmails.map((email, index) => <label key={index}>อีเมลเพิ่มเติม {index + 1}<input type="email" maxLength={254} value={email} onChange={event => setExtraEmails(current => current.map((item, position) => position === index ? event.target.value : item))} placeholder="name@example.com" /></label>)}</div><p>ระบบจะส่งไปยังอีเมลที่เลือก และอีเมลบริษัทขนส่งหลัก</p></fieldset>
      <div className="customer-request-actions"><button type="submit" disabled={busy || !pickupPlace || !deliveryPlace}>{busy ? "กำลังส่ง…" : <><Send size={17} /> ส่งคำขอแจ้งงาน</>}</button></div>
    </form>}
    <div className="customer-request-list-heading"><h3>คำขอที่ผ่านมา</h3><span>{requests.length} รายการ</span></div>
    {recent.length ? <div className="customer-request-list">{recent.map(item => <article className="customer-request-card" key={item.id} data-status={item.status}><div className="customer-request-card-head"><span className="customer-request-state">{item.status === "pending" ? <Clock3 size={16} /> : item.status === "accepted" ? <CheckCircle2 size={16} /> : <XCircle size={16} />}{requestLabels[item.status]}</span><small>{item.createdAt?.toMillis ? new Date(item.createdAt.toMillis()).toLocaleString("th-TH") : "กำลังบันทึก"}</small></div><div className="customer-request-route"><span><MapPin size={16} />{item.pickupPlace.name}</span><span><MapPin size={16} />{item.deliveryPlace.name}</span></div><p><CalendarDays size={16} /> รับ {dateTime(item.pickupDate, item.pickupTime)} · ส่ง {dateTime(item.deliveryDate, item.deliveryTime)}</p><p>{item.cargoType} · {item.vehicleType} · {item.tripCount || 1} รอบ{item.returnGoods ? " · รับสินค้ากลับ" : ""}</p>{item.workOrder && <p>เลขที่ใบงาน <strong>{item.workOrder}</strong></p>}{item.rejectionReason && <p className="customer-request-reason">เหตุผล: {item.rejectionReason}</p>}{item.status === "accepted" && item.jobId && <button type="button" onClick={() => onOpenJob(item.jobId!)}>ดูใบงาน <ArrowUpRight size={15} /></button>}</article>)}</div> : <p className="customer-portal-empty">ยังไม่มีคำขอแจ้งงาน</p>}
  </section>;
}
