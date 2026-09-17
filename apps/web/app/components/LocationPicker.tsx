"use client";

import { useEffect, useState } from "react";
import { ExternalLink, Link2, LoaderCircle, MapPinned, Save } from "lucide-react";
import type { JobPlace } from "@s-fast-transport/shared";
import { resolveGoogleMapsLink } from "@/lib/google-maps-link";
import {
  createSavedLocation,
  savedLocationToJobPlace,
  subscribeSavedLocations,
  type SavedLocation
} from "@/lib/location-repository";
import type { UserProfile } from "@/lib/transport-repository";
import { ListManagerComboBox } from "./ListManagerComboBox";

export function LocationPicker({
  value,
  place,
  title,
  organizationId,
  actor,
  onChange
}: {
  value: string;
  place?: JobPlace;
  title: string;
  organizationId: string;
  actor: UserProfile;
  onChange: (value: string, place?: JobPlace) => void;
}) {
  const [locations, setLocations] = useState<SavedLocation[]>([]);
  const [mapsOpen, setMapsOpen] = useState(false);
  const [mapsUrl, setMapsUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => subscribeSavedLocations(organizationId, setLocations, () => setLocations([])), [organizationId]);

  function chooseSaved(id: string) {
    const saved = locations.find((item) => item.id === id);
    if (saved) onChange(saved.name, savedLocationToJobPlace(saved));
  }

  async function resolveLink() {
    setBusy(true);
    setMessage("");
    try {
      const resolved = await resolveGoogleMapsLink(mapsUrl);
      const next: JobPlace = {
        name: resolved.googleName,
        googleName: resolved.googleName,
        originalMapsUrl: resolved.originalUrl,
        navigationUrl: resolved.navigationUrl,
        lat: resolved.lat,
        lng: resolved.lng,
        ...(resolved.googlePlaceId ? { googlePlaceId: resolved.googlePlaceId } : {})
      };
      onChange(resolved.googleName, next);
      setMessage("อ่านชื่อและพิกัดแล้ว คุณสามารถแก้ชื่อที่ใช้ในใบงานได้");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "อ่านลิงก์ไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  async function saveCurrent() {
    if (!place) return;
    setBusy(true);
    setMessage("");
    try {
      const id = await createSavedLocation(organizationId, { ...place, name: value, notes: "" }, actor);
      onChange(value, { ...place, locationId: id, name: value });
      setMessage("บันทึกเข้าคลังสถานที่แล้ว");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "บันทึกสถานที่ไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  return <div className="location-picker">
    {!!locations.filter(item => item.active).length && <select aria-label={`เลือก${title}จากคลังสถานที่`} value={place?.locationId || ""} onChange={event => chooseSaved(event.target.value)}>
      <option value="">เลือกจากคลังสถานที่…</option>
      {locations.filter(item => item.active).map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
    </select>}
    <ListManagerComboBox
      field="location"
      value={value}
      onChange={(name) => onChange(name, place ? { ...place, name } : undefined)}
      placeholder={`ค้นหาหรือเพิ่มสถานที่${title === "รับงาน" ? "รับ" : "ส่ง"}`}
      organizationId={organizationId}
      actor={actor}
    />
    <div className="location-picker-actions">
      <button type="button" className="location-tool-button" onClick={() => { setMapsOpen(current => !current); setMessage(""); }}><Link2 size={15} /> {place ? "เปลี่ยนลิงก์แผนที่" : "เพิ่มลิงก์ Google Maps"}</button>
      {place && <a href={place.navigationUrl} target="_blank" rel="noreferrer"><ExternalLink size={15} /> ตรวจสอบหมุด</a>}
      {place && !place.locationId && <button type="button" className="location-tool-button" disabled={busy || !value.trim()} onClick={() => void saveCurrent()}><Save size={15} /> บันทึกไว้ใช้ครั้งหน้า</button>}
    </div>
    {mapsOpen && <div className="location-link-panel">
      <label><span>วางลิงก์ที่ลูกค้าส่งมา</span><div><input type="url" value={mapsUrl} onChange={event => setMapsUrl(event.target.value)} placeholder="https://maps.app.goo.gl/..." /><button type="button" disabled={busy || !mapsUrl.trim()} onClick={() => void resolveLink()}>{busy ? <LoaderCircle className="spin" size={16} /> : <MapPinned size={16} />} อ่านพิกัด</button></div></label>
    </div>}
    {place && <div className="location-coordinate"><MapPinned size={14} /><span>{place.googleName || place.name}</span><code>{place.lat.toFixed(6)}, {place.lng.toFixed(6)}</code></div>}
    {message && <p className="location-picker-message" role="status">{message}</p>}
  </div>;
}

