"use client";

import type { ReturnTrip } from "@s-fast-transport/shared";
import type { UserProfile } from "@/lib/transport-repository";
import { LocationPicker } from "./LocationPicker";
import ContactPicker from "./ContactPicker";
import "./return-trip-fields.css";

type Props = {
  value: ReturnTrip;
  onChange: (value: ReturnTrip) => void;
  organizationId: string;
  actor: UserProfile;
};

export default function ReturnTripFields({ value, onChange, organizationId, actor }: Props) {
  function set<K extends keyof ReturnTrip>(field: K, next: ReturnTrip[K]) { onChange({ ...value, [field]: next }); }
  return <section className="return-trip-fields" aria-label="รายละเอียดรับสินค้ากลับ">
    <div className="return-trip-fields-heading"><strong>เที่ยวขากลับ</strong><span>จุดรับและส่งสลับจากขาไปแล้ว ตรวจสอบวันเวลาและผู้ติดต่อก่อนบันทึก</span></div>
    <div className="return-trip-stops">
      <fieldset><legend>รับสินค้าขากลับ</legend>
        <div className="return-trip-field"><span>สถานที่</span><LocationPicker value={value.pickupLocation} place={value.pickupPlace} title="รับสินค้าขากลับ" organizationId={organizationId} onChange={(name, place) => onChange({ ...value, pickupLocation: name, pickupPlace: place })} /></div>
        <div className="return-trip-schedule"><label>วันที่รับ<input type="date" required value={value.pickupDate} onChange={event => set("pickupDate", event.target.value)} /></label><label>เวลารับ<input type="time" required value={value.pickupTime} onChange={event => set("pickupTime", event.target.value)} /></label></div>
        <div className="return-trip-field"><span>ผู้ติดต่อ</span><ContactPicker actor={actor} value={{ id: value.pickupContactId || "", name: value.pickupContact || "", phone: value.pickupContactPhone || "", notes: value.pickupContactNotes || "" }} onChange={contact => onChange({ ...value, pickupContactId: contact.id, pickupContact: contact.name, pickupContactPhone: contact.phone, pickupContactNotes: contact.notes })} /></div>
      </fieldset>
      <fieldset><legend>ส่งสินค้าขากลับ</legend>
        <div className="return-trip-field"><span>สถานที่</span><LocationPicker value={value.deliveryLocation} place={value.deliveryPlace} title="ส่งสินค้าขากลับ" organizationId={organizationId} onChange={(name, place) => onChange({ ...value, deliveryLocation: name, deliveryPlace: place })} /></div>
        <div className="return-trip-schedule"><label>วันที่ส่ง<input type="date" required value={value.deliveryDate} onChange={event => set("deliveryDate", event.target.value)} /></label><label>เวลาส่ง<input type="time" required value={value.deliveryTime} onChange={event => set("deliveryTime", event.target.value)} /></label></div>
        <div className="return-trip-field"><span>ผู้ติดต่อ</span><ContactPicker actor={actor} value={{ id: value.deliveryContactId || "", name: value.deliveryContact || "", phone: value.deliveryContactPhone || "", notes: value.deliveryContactNotes || "" }} onChange={contact => onChange({ ...value, deliveryContactId: contact.id, deliveryContact: contact.name, deliveryContactPhone: contact.phone, deliveryContactNotes: contact.notes })} /></div>
      </fieldset>
    </div>
  </section>;
}
