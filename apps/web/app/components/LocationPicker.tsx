"use client";

import { useEffect, useState } from "react";
import { ExternalLink, MapPinned, Unlink } from "lucide-react";
import type { JobPlace } from "@s-fast-transport/shared";
import {
  selectSavedLocation,
  subscribeSavedLocations,
  type SavedLocation
} from "@/lib/location-repository";

export function LocationPicker({
  value,
  place,
  title,
  organizationId,
  onChange
}: {
  value: string;
  place?: JobPlace;
  title: string;
  organizationId: string;
  onChange: (value: string, place?: JobPlace) => void;
}) {
  const [locations, setLocations] = useState<SavedLocation[]>([]);
  const [message, setMessage] = useState("");

  useEffect(() => subscribeSavedLocations(
    organizationId,
    (items) => { setLocations(items); setMessage(""); },
    () => { setLocations([]); setMessage("โหลดคลังพิกัดไม่สำเร็จ"); }
  ), [organizationId]);

  function chooseSaved(id: string) {
    const selected = selectSavedLocation(id, locations);
    if (selected) onChange(selected.name, selected.place);
    else onChange(value, undefined);
  }

  const activeLocations = locations.filter((item) => item.active);
  return <div className="location-picker">
    <select aria-label={`เลือก${title}จากตั้งค่าพิกัดแผนที่`} value={place?.locationId || ""} onChange={event => chooseSaved(event.target.value)}>
      <option value="">เลือกจากตั้งค่าพิกัดแผนที่…</option>
      {activeLocations.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
    </select>
    <input
      value={value}
      maxLength={160}
      placeholder={`ชื่อสถานที่${title === "รับงาน" ? "รับ" : "ส่ง"}ที่แสดงในใบงาน`}
      onChange={(event) => onChange(event.target.value, place ? { ...place, name: event.target.value } : undefined)}
    />
    <div className="location-picker-actions">
      {place && <a href={place.navigationUrl} target="_blank" rel="noreferrer"><ExternalLink size={15} /> ตรวจสอบหมุด</a>}
      {place && <button type="button" className="location-tool-button" onClick={() => onChange(value, undefined)}><Unlink size={15} /> ล้างพิกัด</button>}
    </div>
    {place && <div className="location-coordinate"><MapPinned size={14} /><span>{place.googleName || place.name}</span><code>{place.lat.toFixed(6)}, {place.lng.toFixed(6)}</code></div>}
    {!activeLocations.length && !message && <p className="location-picker-message">ยังไม่มีรายการ กรุณาเพิ่มในเมนู “ตั้งค่าพิกัดแผนที่”</p>}
    {message && <p className="location-picker-message" role="status">{message}</p>}
  </div>;
}
