"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Check, ChevronDown, ExternalLink, MapPinned, Search, Unlink } from "lucide-react";
import type { JobPlace } from "@s-fast-transport/shared";
import {
  selectSavedLocation,
  subscribeSavedLocations,
  filterSavedLocations,
  type SavedLocation
} from "@/lib/location-repository";

const recentKey = (organizationId: string) => `sfast:recent-locations:${organizationId}`;

function readRecentIds(organizationId: string): string[] {
  try {
    const stored: unknown = JSON.parse(window.localStorage.getItem(recentKey(organizationId)) || "[]");
    return Array.isArray(stored) ? stored.filter((id): id is string => typeof id === "string").slice(0, 5) : [];
  } catch { return []; }
}

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
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [recent, setRecent] = useState(() => ({ organizationId, ids: readRecentIds(organizationId) }));
  const recentIds = recent.organizationId === organizationId ? recent.ids : readRecentIds(organizationId);
  const pickerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const listId = useId();

  useEffect(() => {
    if (!open) return;
    searchRef.current?.focus();
    const closeOutside = (event: PointerEvent) => {
      if (!pickerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", closeOutside);
    return () => document.removeEventListener("pointerdown", closeOutside);
  }, [open]);

  useEffect(() => subscribeSavedLocations(
    organizationId,
    (items) => { setLocations(items); setMessage(""); },
    () => { setLocations([]); setMessage("โหลดคลังพิกัดไม่สำเร็จ"); }
  ), [organizationId]);

  function chooseSaved(id: string) {
    const selected = selectSavedLocation(id, locations);
    if (!selected) return;
    onChange(selected.name, selected.place);
    const nextRecent = [id, ...recentIds.filter(recentId => recentId !== id)].slice(0, 5);
    setRecent({ organizationId, ids: nextRecent });
    try { window.localStorage.setItem(recentKey(organizationId), JSON.stringify(nextRecent)); } catch { /* Storage may be unavailable. */ }
    setOpen(false);
    setQuery("");
    triggerRef.current?.focus();
  }

  const activeLocations = locations.filter((item) => item.active);
  const matchingLocations = filterSavedLocations(activeLocations, query, "active");
  const recentLocations = recentIds.map(id => matchingLocations.find(item => item.id === id)).filter((item): item is SavedLocation => Boolean(item));
  const otherLocations = matchingLocations.filter(item => !recentIds.includes(item.id));
  const selectedName = activeLocations.find(item => item.id === place?.locationId)?.name || place?.name;
  return <div className="location-picker">
    <div className="location-picker-select" ref={pickerRef} onKeyDown={event => {
      if (event.key === "Escape" && open) { event.preventDefault(); setOpen(false); setQuery(""); triggerRef.current?.focus(); }
    }}>
      <button type="button" ref={triggerRef} className="location-picker-trigger" aria-label={`เลือก${title}จากตั้งค่าพิกัดแผนที่`} aria-expanded={open} aria-controls={listId} onClick={() => { setRecent({ organizationId, ids: readRecentIds(organizationId) }); setQuery(""); setOpen(current => !current); }}>
        <span>{selectedName || "เลือกจากตั้งค่าพิกัดแผนที่…"}</span><ChevronDown size={17} />
      </button>
      {open && <div className="location-picker-panel" id={listId}>
        <label className="location-picker-search"><Search size={17} /><input ref={searchRef} aria-label={`ค้นหาสถานที่${title}`} value={query} onChange={event => setQuery(event.target.value)} onKeyDown={event => {
          if (event.key === "ArrowDown") { event.preventDefault(); pickerRef.current?.querySelector<HTMLButtonElement>(".location-picker-option")?.focus(); }
          if (event.key === "Enter") { event.preventDefault(); const first = recentLocations[0] || otherLocations[0]; if (first) chooseSaved(first.id); }
        }} placeholder="พิมพ์ชื่อสถานที่เพื่อค้นหา" /></label>
        <div className="location-picker-results">
          {recentLocations.length > 0 && <><p className="location-picker-group-title">ใช้ล่าสุด</p>{recentLocations.map(item => <button type="button" className="location-picker-option" key={item.id} onClick={() => chooseSaved(item.id)}><span>{item.name}</span>{place?.locationId === item.id && <Check size={16} />}</button>)}</>}
          {otherLocations.length > 0 && <><p className="location-picker-group-title">{recentLocations.length ? "สถานที่ทั้งหมด" : "สถานที่"}</p>{otherLocations.map(item => <button type="button" className="location-picker-option" key={item.id} onClick={() => chooseSaved(item.id)}><span>{item.name}</span>{place?.locationId === item.id && <Check size={16} />}</button>)}</>}
          {!matchingLocations.length && <p className="location-picker-no-results">{activeLocations.length ? "ไม่พบสถานที่ที่ค้นหา" : "ยังไม่มีสถานที่ที่ใช้งานได้"}</p>}
        </div>
      </div>}
    </div>
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
