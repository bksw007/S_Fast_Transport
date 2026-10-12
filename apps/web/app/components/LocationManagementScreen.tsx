"use client";

import { useEffect, useRef, useState } from "react";
import { ExternalLink, Link2, ListFilter, LoaderCircle, MapPinned, Pencil, Plus, Power, Save, Search } from "lucide-react";
import { extractGoogleMapsUrl, resolveGoogleMapsLink } from "@/lib/google-maps-link";
import LocationPinPicker from "./LocationPinPicker";
import {
  createSavedLocation,
  filterSavedLocations,
  setSavedLocationActive,
  subscribeSavedLocations,
  updateSavedLocation,
  type LocationDraft,
  type LocationStatusFilter,
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
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<LocationStatusFilter>("all");
  const [sourceFilter, setSourceFilter] = useState("all");
  const [manualPinOpen, setManualPinOpen] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const latestMapInputRef = useRef("");

  useEffect(() => subscribeSavedLocations(organizationId, items => { setLocations(items); setMessage(""); }, error => setMessage(`โหลดข้อมูลไม่สำเร็จ: ${error}`)), [organizationId]);

  function changeMapsInput(value: string) {
    latestMapInputRef.current = value;
    setManualPinOpen(false);
    setDraft(current => ({ ...current, originalMapsUrl: value, navigationUrl: "", lat: 0, lng: 0, googleName: "", googlePlaceId: undefined }));
  }

  async function readLink() {
    const input = draft.originalMapsUrl;
    setBusy("resolve"); setMessage("");
    try {
      const result = await resolveGoogleMapsLink(input);
      if (latestMapInputRef.current !== input) return;
      latestMapInputRef.current = result.originalUrl;
      setManualPinOpen(false);
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
    } catch (error) {
      if (latestMapInputRef.current === input) {
        setMessage(`${error instanceof Error ? error.message : "อ่านลิงก์ไม่สำเร็จ"} · หาก Google ไม่ส่งพิกัดมา เลือกหมุดบนแผนที่ด้านล่างแทนได้`);
        try { extractGoogleMapsUrl(input); setManualPinOpen(true); } catch { /* An invalid link cannot be saved with a manual pin. */ }
      }
    }
    finally { setBusy(""); }
  }

  async function save() {
    setBusy("save"); setMessage("");
    try {
      if (editingId) await updateSavedLocation(organizationId, editingId, draft, actor);
      else await createSavedLocation(organizationId, draft, actor);
      setDraft(emptyDraft); setEditingId(""); setManualPinOpen(false); latestMapInputRef.current = ""; setMessage(editingId ? "แก้ไขสถานที่แล้ว" : "เพิ่มสถานที่แล้ว");
    } catch (error) { setMessage(error instanceof Error ? error.message : "บันทึกสถานที่ไม่สำเร็จ"); }
    finally { setBusy(""); }
  }

  function edit(item: SavedLocation) {
    setEditingId(item.id);
    setManualPinOpen(false);
    latestMapInputRef.current = item.originalMapsUrl;
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
    formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function startNew() {
    setEditingId("");
    setManualPinOpen(false);
    latestMapInputRef.current = "";
    setDraft(emptyDraft);
    setMessage("");
    formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function toggle(item: SavedLocation) {
    setBusy(item.id); setMessage("");
    try { await setSavedLocationActive(organizationId, item.id, !item.active, actor); setMessage("เปลี่ยนสถานะสถานที่แล้ว"); }
    catch (error) { setMessage(error instanceof Error ? error.message : "เปลี่ยนสถานะไม่สำเร็จ"); }
    finally { setBusy(""); }
  }

  const customerSources = [...new Map(locations.filter(item => item.sourceCustomerId).map(item => [item.sourceCustomerId!, item.sourceCustomerName || "ลูกค้า"])).entries()];
  const filteredLocations = filterSavedLocations(locations, search, statusFilter).filter(item => sourceFilter === "all" || (sourceFilter === "main" ? !item.sourceCustomerId : item.sourceCustomerId === sourceFilter));

  return <section className="screen location-management-screen">
    <div className="section-title"><div><h1>ตั้งค่าพิกัดแผนที่</h1><p>จับคู่ชื่อสถานที่ ลิงก์ Google Maps และพิกัด เพื่อเลือกใช้ในใบงานได้อย่างถูกต้อง</p></div></div>
    <section className="location-list-section" aria-labelledby="location-list-title">
      <header className="location-list-head">
        <div><h2 id="location-list-title">รายการพิกัดแผนที่</h2><p>ทั้งหมด {locations.length} รายการ · แสดง {filteredLocations.length} รายการ</p></div>
        <button type="button" onClick={startNew}><Plus size={16} /> เพิ่มรายการใหม่</button>
      </header>
      <div className="location-list-toolbar">
        <label><Search size={16} /><input type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder="ค้นหาชื่อ สถานที่ หรือคำแนะนำ" /></label>
        <label><ListFilter size={16} /><select value={statusFilter} onChange={event => setStatusFilter(event.target.value as LocationStatusFilter)}><option value="all">ทุกสถานะ</option><option value="active">ใช้งาน</option><option value="inactive">พักใช้</option></select></label>
        {organizationId === "main" && <label><ListFilter size={16} /><select aria-label="แหล่งที่มาของพิกัด" value={sourceFilter} onChange={event => setSourceFilter(event.target.value)}><option value="all">ทุกแหล่งที่มา</option><option value="main">บริษัทหลัก</option>{customerSources.map(([id, name]) => <option key={id} value={id}>ลูกค้า: {name}</option>)}</select></label>}
      </div>
      <div className="location-library-grid">
        {filteredLocations.map(item => <article key={item.id} className={[!item.active ? "inactive" : "", editingId === item.id ? "editing" : ""].filter(Boolean).join(" ")}>
          <header><span><MapPinned size={20} /></span><div><h2>{item.name}</h2><p>{item.googleName || "สถานที่กำหนดเอง"}</p><p>{item.sourceCustomerId ? `พิกัดจากลูกค้า: ${item.sourceCustomerName || "ลูกค้า"}` : "พิกัดบริษัทหลัก"}</p></div><b>{editingId === item.id ? "กำลังแก้ไข" : item.active ? "ใช้งาน" : "พักใช้"}</b></header>
          <p>{item.notes || "ไม่มีคำแนะนำเพิ่มเติม"}</p><code>{item.lat.toFixed(6)}, {item.lng.toFixed(6)}</code>
          <footer><a href={item.navigationUrl} target="_blank" rel="noreferrer"><ExternalLink size={15} /> เปิดแผนที่</a><button type="button" onClick={() => edit(item)}><Pencil size={15} /> แก้ไข</button><button type="button" disabled={busy === item.id} onClick={() => void toggle(item)}><Power size={15} /> {item.active ? "พักใช้" : "เปิดใช้"}</button></footer>
        </article>)}
        {!locations.length && !message && <div className="resource-empty"><MapPinned size={25} /><strong>ยังไม่มีสถานที่บันทึกไว้</strong><span>กด “เพิ่มรายการใหม่” เพื่อบันทึกลิงก์ Google Maps รายการแรก</span></div>}
        {!!locations.length && !filteredLocations.length && <div className="resource-empty"><Search size={25} /><strong>ไม่พบรายการที่ค้นหา</strong><span>ลองเปลี่ยนคำค้นหาหรือตัวกรองสถานะ</span></div>}
      </div>
    </section>
    <form ref={formRef} className={`location-library-form ${editingId ? "editing" : ""}`} onSubmit={event => { event.preventDefault(); void save(); }}>
      <header><span className="location-library-icon"><MapPinned size={22} /></span><div><h2>{editingId ? "แก้ไขสถานที่" : "เพิ่มสถานที่จาก Google Maps"}</h2><p>{editingId ? `กำลังแก้ไข “${draft.name}”` : "วางลิงก์ที่ลูกค้าส่งมา แล้วตั้งชื่อให้เข้าใจง่ายในบริษัท"}</p></div></header>
      <label className="wide"><span>ลิงก์ Google Maps</span><div className="location-resolve-row"><input required type="text" inputMode="url" value={draft.originalMapsUrl} onChange={event => changeMapsInput(event.target.value)} onPaste={event => { try { const url = extractGoogleMapsUrl(event.clipboardData.getData("text")); event.preventDefault(); changeMapsInput(url); } catch { /* Keep pasted text visible so the user can correct it. */ } }} placeholder="วางลิงก์หรือข้อความที่แชร์จาก Google Maps" /><button type="button" disabled={busy === "resolve" || !draft.originalMapsUrl.trim()} onClick={() => void readLink()}>{busy === "resolve" ? <LoaderCircle className="spin" size={16} /> : <Link2 size={16} />} อ่านลิงก์</button></div></label>
      <div className="location-pin-picker-section"><button type="button" disabled={!draft.originalMapsUrl.trim()} onClick={() => { try { const url = extractGoogleMapsUrl(draft.originalMapsUrl); latestMapInputRef.current = url; setDraft(current => ({ ...current, originalMapsUrl: url })); setManualPinOpen(current => !current); setMessage(""); } catch (error) { setMessage(error instanceof Error ? error.message : "ลิงก์ Google Maps ไม่ถูกต้อง"); } }}>{manualPinOpen ? "ซ่อนแผนที่เลือกหมุด" : "อ่านพิกัดไม่ได้? เลือกหมุดเองบนแผนที่"}</button>{manualPinOpen && <><p>เปิดลิงก์ต้นทางเพื่อตรวจสอบสถานที่ แล้วแตะตำแหน่งเดียวกันบนแผนที่นี้ก่อนบันทึก <a href={extractGoogleMapsUrl(draft.originalMapsUrl)} target="_blank" rel="noreferrer">เปิดลิงก์ Google Maps</a></p><LocationPinPicker initialCenter={locations.find(item => item.active) ?? { lat: 13.7563, lng: 100.5018 }} value={draft.navigationUrl ? { lat: draft.lat, lng: draft.lng } : undefined} onPick={({ lat, lng }) => { const navigationUrl = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=driving`; setDraft(current => ({ ...current, lat, lng, navigationUrl, googlePlaceId: undefined })); setMessage("เลือกหมุดแล้ว กรุณาตรวจสอบชื่อและพิกัดก่อนบันทึก"); }} /></>}</div>
      <label><span>ชื่อที่ใช้ในระบบ</span><input required maxLength={160} value={draft.name} onChange={event => setDraft({ ...draft, name: event.target.value })} placeholder="เช่น ท่าเรือกรุงเทพ – โรงพักสินค้า 13" /></label>
      <label><span>ชื่อที่พบจาก Google</span><input readOnly value={draft.googleName || "รออ่านจากลิงก์"} /></label>
      <label className="wide"><span>คำแนะนำสำหรับคนขับ</span><textarea rows={3} maxLength={500} value={draft.notes} onChange={event => setDraft({ ...draft, notes: event.target.value })} placeholder="เช่น รถใหญ่เข้าประตู 3 โทรหา รปภ. ก่อนเข้า" /></label>
      {!!draft.navigationUrl && <div className="location-form-preview"><MapPinned size={17} /><span>{draft.lat.toFixed(6)}, {draft.lng.toFixed(6)}</span><a href={draft.navigationUrl} target="_blank" rel="noreferrer"><ExternalLink size={15} /> เปิดตรวจสอบหมุด</a></div>}
      <footer><button type="submit" disabled={busy === "save" || !draft.navigationUrl}>{busy === "save" ? <LoaderCircle className="spin" size={16} /> : <Save size={16} />} {editingId ? "บันทึกการแก้ไข" : "บันทึกเข้าคลังสถานที่"}</button>{editingId && <button type="button" onClick={() => { setEditingId(""); setDraft(emptyDraft); }}>ยกเลิก</button>}</footer>
    </form>
    {message && <p className="location-library-message" role="status">{message}</p>}
  </section>;
}
