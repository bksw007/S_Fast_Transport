"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowUpRight, BellRing, CalendarDays, CheckCircle2, Clock3, MapPin, Plus, Send, XCircle } from "lucide-react";
import { collection, onSnapshot } from "firebase/firestore";
import type { JobPlace } from "@s-fast-transport/shared";
import { db } from "@/lib/firebase";
import { submitCustomerJobRequest, subscribeCustomerJobRequests, type CustomerJobRequest } from "@/lib/customer-job-requests";
import type { UserProfile } from "@/lib/transport-repository";
import CustomerMapPicker from "./CustomerMapPicker";

const dateTime = (date: string, time: string) => `${date} ${time}`;
const requestLabels = { pending: "รอพิจารณา", accepted: "รับงานแล้ว", rejected: "ไม่รับงาน" } as const;

export default function CustomerJobRequests({ profile, onOpenJob }: { profile: UserProfile; onOpenJob: (jobId: string) => void }) {
  const [requests, setRequests] = useState<CustomerJobRequest[]>([]);
  const [saved, setSaved] = useState<JobPlace[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [pickupPlace, setPickupPlace] = useState<JobPlace>();
  const [deliveryPlace, setDeliveryPlace] = useState<JobPlace>();
  const [pickupDate, setPickupDate] = useState("");
  const [pickupTime, setPickupTime] = useState("");
  const [deliveryDate, setDeliveryDate] = useState("");
  const [deliveryTime, setDeliveryTime] = useState("");
  const [cargoType, setCargoType] = useState("");
  const [vehicleType, setVehicleType] = useState("");
  const [notes, setNotes] = useState("");
  const [sendToSelf, setSendToSelf] = useState(true);
  const [extraEmails, setExtraEmails] = useState(["", ""]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const recent = useMemo(() => requests.slice(0, 12), [requests]);

  useEffect(() => subscribeCustomerJobRequests(profile, setRequests, setError), [profile]);
  useEffect(() => onSnapshot(collection(db, "customers", profile.customerId || "__none__", "locations"), snapshot => {
    setSaved(snapshot.docs.filter(item => item.data().active !== false).map(item => ({ ...(item.data() as JobPlace), locationId: item.id })).sort((a, b) => a.name.localeCompare(b.name, "th")));
  }, error => setError(error.message)), [profile.customerId]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(""); setMessage("");
    if (!pickupPlace || !deliveryPlace) { setError("กรุณาเลือกหมุดจุดรับและจุดส่ง"); return; }
    if (`${deliveryDate}T${deliveryTime}` < `${pickupDate}T${pickupTime}`) { setError("วันและเวลาส่งต้องไม่ก่อนวันและเวลารับ"); return; }
    const recipientEmails = [...new Set([...(sendToSelf ? [profile.email] : []), ...extraEmails.filter(Boolean)].map(email => email.trim().toLowerCase()))];
    if (!recipientEmails.length) { setError("กรุณาเลือกอีเมลผู้รับอย่างน้อย 1 ที่อยู่"); return; }
    setBusy(true);
    try {
      await submitCustomerJobRequest({ pickupPlace, deliveryPlace, pickupDate, pickupTime, deliveryDate, deliveryTime, cargoType, vehicleType, notes, recipientEmails });
      setShowForm(false); setPickupPlace(undefined); setDeliveryPlace(undefined); setPickupDate(""); setPickupTime(""); setDeliveryDate(""); setDeliveryTime(""); setCargoType(""); setVehicleType(""); setNotes(""); setExtraEmails(["", ""]); setSendToSelf(true);
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
      <div className="customer-request-places"><CustomerMapPicker title="จุดรับสินค้า" value={pickupPlace} saved={saved} onChange={setPickupPlace} /><CustomerMapPicker title="จุดส่งสินค้า" value={deliveryPlace} saved={saved} onChange={setDeliveryPlace} /></div>
      <div className="customer-request-fields"><label>วันที่รับสินค้า<input required type="date" value={pickupDate} onChange={event => setPickupDate(event.target.value)} /></label><label>เวลารับสินค้า<input required type="time" value={pickupTime} onChange={event => setPickupTime(event.target.value)} /></label><label>วันที่ส่งสินค้า<input required type="date" value={deliveryDate} onChange={event => setDeliveryDate(event.target.value)} /></label><label>เวลาส่งสินค้า<input required type="time" value={deliveryTime} onChange={event => setDeliveryTime(event.target.value)} /></label><label>ประเภทสินค้า<input required maxLength={160} value={cargoType} onChange={event => setCargoType(event.target.value)} placeholder="เช่น อุปกรณ์ไฟฟ้า" /></label><label>ประเภทรถ<input required maxLength={160} value={vehicleType} onChange={event => setVehicleType(event.target.value)} placeholder="เช่น รถ 6 ล้อตู้ทึบ" /></label><label className="wide">หมายเหตุ<textarea rows={3} maxLength={2000} value={notes} onChange={event => setNotes(event.target.value)} placeholder="ข้อมูลเพิ่มเติมสำหรับการรับงาน" /></label></div>
      <fieldset className="customer-request-emails"><legend>อีเมลรับรายละเอียดและผลการพิจารณา</legend><label className="customer-request-self-email"><input type="checkbox" checked={sendToSelf} onChange={event => setSendToSelf(event.target.checked)} /><span>ส่งถึงอีเมลที่ใช้เข้าสู่ระบบ <strong>{profile.email}</strong></span></label><div className="customer-request-extra-emails">{extraEmails.map((email, index) => <label key={index}>อีเมลเพิ่มเติม {index + 1}<input type="email" maxLength={254} value={email} onChange={event => setExtraEmails(current => current.map((item, position) => position === index ? event.target.value : item))} placeholder="name@example.com" /></label>)}</div><p>ระบบจะส่งไปยังอีเมลที่เลือก และอีเมลบริษัทขนส่งหลัก</p></fieldset>
      <div className="customer-request-actions"><button type="submit" disabled={busy || !pickupPlace || !deliveryPlace}>{busy ? "กำลังส่ง…" : <><Send size={17} /> ส่งคำขอแจ้งงาน</>}</button></div>
    </form>}
    <div className="customer-request-list-heading"><h3>คำขอที่ผ่านมา</h3><span>{requests.length} รายการ</span></div>
    {recent.length ? <div className="customer-request-list">{recent.map(item => <article className="customer-request-card" key={item.id} data-status={item.status}><div className="customer-request-card-head"><span className="customer-request-state">{item.status === "pending" ? <Clock3 size={16} /> : item.status === "accepted" ? <CheckCircle2 size={16} /> : <XCircle size={16} />}{requestLabels[item.status]}</span><small>{item.createdAt?.toMillis ? new Date(item.createdAt.toMillis()).toLocaleString("th-TH") : "กำลังบันทึก"}</small></div><div className="customer-request-route"><span><MapPin size={16} />{item.pickupPlace.name}</span><span><MapPin size={16} />{item.deliveryPlace.name}</span></div><p><CalendarDays size={16} /> รับ {dateTime(item.pickupDate, item.pickupTime)} · ส่ง {dateTime(item.deliveryDate, item.deliveryTime)}</p><p>{item.cargoType} · {item.vehicleType}</p>{item.workOrder && <p>เลขที่ใบงาน <strong>{item.workOrder}</strong></p>}{item.rejectionReason && <p className="customer-request-reason">เหตุผล: {item.rejectionReason}</p>}{item.status === "accepted" && item.jobId && <button type="button" onClick={() => onOpenJob(item.jobId!)}>ดูใบงาน <ArrowUpRight size={15} /></button>}</article>)}</div> : <p className="customer-portal-empty">ยังไม่มีคำขอแจ้งงาน</p>}
  </section>;
}
