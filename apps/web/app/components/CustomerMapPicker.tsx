"use client";

import { useEffect, useRef, useState } from "react";
import { MapPin, Search } from "lucide-react";
import type { JobPlace } from "@s-fast-transport/shared";

let mapsPromise: Promise<void> | null = null;

function loadMaps(key: string): Promise<void> {
  if (window.google?.maps) return Promise.resolve();
  if (mapsPromise) return mapsPromise;
  mapsPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&v=weekly&language=th&region=TH`;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => { mapsPromise = null; reject(new Error("เปิด Google Maps ไม่สำเร็จ")); };
    document.head.appendChild(script);
  });
  return mapsPromise;
}

function toPlace(lat: number, lng: number, name: string, googlePlaceId?: string): JobPlace {
  const url = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${lat},${lng}`)}${googlePlaceId ? `&query_place_id=${encodeURIComponent(googlePlaceId)}` : ""}`;
  return { name, googleName: name, lat, lng, ...(googlePlaceId ? { googlePlaceId } : {}), originalMapsUrl: url, navigationUrl: url };
}

export default function CustomerMapPicker({ title, value, saved, onChange }: {
  title: string;
  value?: JobPlace;
  saved: JobPlace[];
  onChange: (place: JobPlace) => void;
}) {
  const mapElement = useRef<HTMLDivElement>(null);
  const map = useRef<google.maps.Map | null>(null);
  const marker = useRef<google.maps.Marker | null>(null);
  const geocoder = useRef<google.maps.Geocoder | null>(null);
  const changeRef = useRef(onChange);
  const [search, setSearch] = useState("");
  const [message, setMessage] = useState("");
  const key = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || "";
  useEffect(() => { changeRef.current = onChange; }, [onChange]);

  useEffect(() => {
    if (!key || !mapElement.current) return;
    let active = true;
    void loadMaps(key).then(() => {
      if (!active || !mapElement.current) return;
      const center = value ? { lat: value.lat, lng: value.lng } : { lat: 13.7563, lng: 100.5018 };
      map.current = new google.maps.Map(mapElement.current, { center, zoom: value ? 15 : 10, mapTypeControl: false, streetViewControl: false, fullscreenControl: false });
      geocoder.current = new google.maps.Geocoder();
      marker.current = new google.maps.Marker({ map: map.current, position: value ? center : undefined, draggable: true });
      const choose = async (lat: number, lng: number) => {
        if (!active) return;
        marker.current?.setPosition({ lat, lng });
        map.current?.panTo({ lat, lng });
        let name = `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
        let placeId: string | undefined;
        try {
          const result = await geocoder.current?.geocode({ location: { lat, lng } });
          const found = result?.results[0];
          if (found) { name = found.formatted_address; placeId = found.place_id; }
        } catch { /* Coordinates remain usable when reverse geocoding is unavailable. */ }
        if (active) { changeRef.current(toPlace(lat, lng, name, placeId)); setMessage(""); }
      };
      map.current.addListener("click", (event: google.maps.MapMouseEvent) => { if (event.latLng) void choose(event.latLng.lat(), event.latLng.lng()); });
      marker.current.addListener("dragend", (event: google.maps.MapMouseEvent) => { if (event.latLng) void choose(event.latLng.lat(), event.latLng.lng()); });
    }).catch(error => { if (active) setMessage(error instanceof Error ? error.message : "เปิดแผนที่ไม่สำเร็จ"); });
    return () => { active = false; marker.current?.setMap(null); marker.current = null; map.current = null; };
  // Initial map construction only; subsequent place selections update the marker below.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  useEffect(() => {
    if (!map.current || !marker.current || !value) return;
    const point = { lat: value.lat, lng: value.lng };
    marker.current.setPosition(point);
    map.current.panTo(point);
    map.current.setZoom(15);
  }, [value]);

  async function findPlace() {
    if (!search.trim() || !geocoder.current) return;
    setMessage("กำลังค้นหาสถานที่…");
    try {
      const result = await geocoder.current.geocode({ address: search.trim(), region: "TH" });
      const found = result.results[0];
      const point = found?.geometry.location;
      if (!point) throw new Error("ไม่พบสถานที่ กรุณาลองคำค้นอื่น");
      const place = toPlace(point.lat(), point.lng(), found.formatted_address, found.place_id);
      onChange(place);
      setMessage("");
    } catch (error) { setMessage(error instanceof Error ? error.message : "ค้นหาสถานที่ไม่สำเร็จ"); }
  }

  return <section className="customer-request-map-picker">
    <div className="customer-request-map-title"><MapPin size={18} /><strong>{title}</strong></div>
    {saved.length > 0 && <label>สถานที่ของบริษัทที่เคยใช้<select value="" onChange={event => { const found = saved.find(item => item.locationId === event.target.value); if (found) onChange(found); }}><option value="">เลือกสถานที่เดิม หรือเลือกหมุดใหม่ด้านล่าง</option>{saved.map(item => <option key={item.locationId || item.navigationUrl} value={item.locationId}>{item.name}</option>)}</select></label>}
    <div className="customer-request-map-search"><input aria-label={`ค้นหา${title}`} value={search} onChange={event => setSearch(event.target.value)} onKeyDown={event => { if (event.key === "Enter") { event.preventDefault(); void findPlace(); } }} placeholder="ค้นหาชื่อสถานที่หรือที่อยู่" /><button type="button" onClick={() => void findPlace()} disabled={!key}><Search size={16} /> ค้นหา</button></div>
    {key ? <div ref={mapElement} className="customer-request-map" role="application" aria-label={`แผนที่เลือก${title}`} /> : <p role="alert">ยังไม่ได้ตั้งค่า Google Maps สำหรับเว็บไซต์ กรุณาติดต่อผู้ดูแล</p>}
    {message && <p role="status">{message}</p>}
    {value && <label>ชื่อสถานที่ที่จะแสดงในคำขอ<input maxLength={160} value={value.name} onChange={event => onChange({ ...value, name: event.target.value })} /><small>พิกัด {value.lat.toFixed(6)}, {value.lng.toFixed(6)} · <a href={value.navigationUrl} target="_blank" rel="noreferrer">ตรวจสอบใน Google Maps</a></small></label>}
  </section>;
}
