"use client";

import { useEffect, useState } from "react";
import { ExternalLink, Link2, LoaderCircle, MapPinned, Pencil, Power, Save } from "lucide-react";
import { resolveGoogleMapsLink } from "@/lib/google-maps-link";
import {
  createSavedLocation,
  setSavedLocationActive,
  subscribeSavedLocations,
  updateSavedLocation,
  type LocationDraft,
  type SavedLocation
} from "@/lib/location-repository";
import type { UserProfile } from "@/lib/transport-repository";

const emptyDraft: LocationDraft = { name: "", googleName: "", originalMapsUrl: "", navigationUrl: "", lat: 0, lng: 0, notes: "" };

export default function LocationManagementScreen({ actor }: { actor: UserProfile }) {
  const organizationId = actor.organizationId ?? "main";
  const [locations, setLocations] = useState<SavedLocation[]>([]);
  const [draft, setDraft] = useState<LocationDraft>(emptyDraft);
  const [editingId, setEditingId] = useState("");
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("กำลังโหลดคลังสถานที่…");

  useEffect(() => subscribeSavedLocations(organizationId, items => { setLocations(items); setMessage(""); }, error => setMessage(`โหลดข้อมูลไม่สำเร็จ: ${error}`)), [organizationId]);

  async function readLink() {
    setBusy("resolve"); setMessage("");
    try {
      const result = await resolveGoogleMapsLink(draft.originalMapsUrl);
      setDraft(current => ({
        ...current,
        name: current.name || result.googleName,
        googleName: result.googleName,
        originalMapsUrl: result.originalUrl,
        navigationUrl: result.navigationUrl,
        lat: result.lat,
        lng: result.lng,
        ...(result.googlePlaceId ? { googlePlaceId: result.googlePlaceId } : {})
      }));
      setMessage("อ่านพิกัดแล้ว กรุณาตรวจสอบชื่อและหมุดก่อนบันทึก");
    } catch (error) { setMessage(error instanceof Error ? error.message : "อ่านลิงก์ไม่สำเร็จ"); }
    finally { setBusy(""); }
  }

  async function save() {
    setBusy("save"); setMessage("");
    try {
      if (editingId) await updateSavedLocation(organizationId, editingId, draft, actor);
      else await createSavedLocation(organizationId, draft, actor);
      setDraft(emptyDraft); setEditingId(""); setMessage(editingId ? "แก้ไขสถานที่แล้ว" : "เพิ่มสถานที่แล้ว");
    } catch (error) { setMessage(error instanceof Error ? error.message : "บันทึกสถานที่ไม่สำเร็จ"); }
    finally { setBusy(""); }
  }

  function edit(item: SavedLocation) {
    setEditingId(item.id);
    setDraft({
      name: item.name,
      googleName: item.googleName,
      originalMapsUrl: item.originalMapsUrl,
      navigationUrl: item.navigationUrl,
      lat: item.lat,
      lng: item.lng,
      googlePlaceId: item.googlePlaceId,
      notes: item.notes
    });
    setMessage("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function toggle(item: SavedLocation) {
    setBusy(item.id); setMessage("");
    try { await setSavedLocationActive(organizationId, item.id, !item.active, actor); setMessage("เปลี่ยนสถานะสถานที่แล้ว"); }
    catch (error) { setMessage(error instanceof Error ? error.message : "เปลี่ยนสถานะไม่สำเร็จ"); }
    finally { setBusy(""); }
  }

  return <section className="screen location-management-screen">
    <div className="section-title"><div><h1>ตั้งค่าพิกัดแผนที่</h1><p>จับคู่ชื่อสถานที่ ลิงก์ Google Maps และพิกัด เพื่อเลือกใช้ในใบงานได้อย่างถูกต้อง</p></div></div>
    <form className="location-library-form" onSubmit={event => { event.preventDefault(); void save(); }}>
      <header><span className="location-library-icon"><MapPinned size={22} /></span><div><h2>{editingId ? "แก้ไขสถานที่" : "เพิ่มสถานที่จาก Google Maps"}</h2><p>วางลิงก์ที่ลูกค้าส่งมา แล้วตั้งชื่อให้เข้าใจง่ายในบริษัท</p></div></header>
      <label className="wide"><span>ลิงก์ Google Maps</span><div className="location-resolve-row"><input required type="url" value={draft.originalMapsUrl} onChange={event => setDraft({ ...draft, originalMapsUrl: event.target.value })} placeholder="https://maps.app.goo.gl/..." /><button type="button" disabled={busy === "resolve" || !draft.originalMapsUrl.trim()} onClick={() => void readLink()}>{busy === "resolve" ? <LoaderCircle className="spin" size={16} /> : <Link2 size={16} />} อ่านลิงก์</button></div></label>
      <label><span>ชื่อที่ใช้ในระบบ</span><input required maxLength={160} value={draft.name} onChange={event => setDraft({ ...draft, name: event.target.value })} placeholder="เช่น ท่าเรือกรุงเทพ – โรงพักสินค้า 13" /></label>
      <label><span>ชื่อที่พบจาก Google</span><input readOnly value={draft.googleName || "รออ่านจากลิงก์"} /></label>
      <label className="wide"><span>คำแนะนำสำหรับคนขับ</span><textarea rows={3} maxLength={500} value={draft.notes} onChange={event => setDraft({ ...draft, notes: event.target.value })} placeholder="เช่น รถใหญ่เข้าประตู 3 โทรหา รปภ. ก่อนเข้า" /></label>
      {!!draft.navigationUrl && <div className="location-form-preview"><MapPinned size={17} /><span>{draft.lat.toFixed(6)}, {draft.lng.toFixed(6)}</span><a href={draft.navigationUrl} target="_blank" rel="noreferrer"><ExternalLink size={15} /> เปิดตรวจสอบหมุด</a></div>}
      <footer><button type="submit" disabled={busy === "save" || !draft.navigationUrl}>{busy === "save" ? <LoaderCircle className="spin" size={16} /> : <Save size={16} />} {editingId ? "บันทึกการแก้ไข" : "บันทึกเข้าคลังสถานที่"}</button>{editingId && <button type="button" onClick={() => { setEditingId(""); setDraft(emptyDraft); }}>ยกเลิก</button>}</footer>
    </form>
    {message && <p className="location-library-message" role="status">{message}</p>}
    <div className="location-library-grid">
      {locations.map(item => <article key={item.id} className={!item.active ? "inactive" : ""}>
        <header><span><MapPinned size={20} /></span><div><h2>{item.name}</h2><p>{item.googleName || "สถานที่กำหนดเอง"}</p></div><b>{item.active ? "ใช้งาน" : "พักใช้"}</b></header>
        <p>{item.notes || "ไม่มีคำแนะนำเพิ่มเติม"}</p><code>{item.lat.toFixed(6)}, {item.lng.toFixed(6)}</code>
        <footer><a href={item.navigationUrl} target="_blank" rel="noreferrer"><ExternalLink size={15} /> เปิดแผนที่</a><button type="button" onClick={() => edit(item)}><Pencil size={15} /> แก้ไข</button><button type="button" disabled={busy === item.id} onClick={() => void toggle(item)}><Power size={15} /> {item.active ? "พักใช้" : "เปิดใช้"}</button></footer>
      </article>)}
      {!locations.length && !message && <div className="resource-empty"><MapPinned size={25} /><strong>ยังไม่มีสถานที่บันทึกไว้</strong><span>วางลิงก์ Google Maps ด้านบนเพื่อเพิ่มรายการแรก</span></div>}
    </div>
  </section>;
}
