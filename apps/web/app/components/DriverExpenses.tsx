"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { CalendarDays, Camera, CheckCircle2, CircleDollarSign, FileImage, FolderOpen, Plus, Printer, ReceiptText, Truck, X } from "lucide-react";
import { historyMonthLabel, jobHistoryDate, jobHistoryMonth, type TransportJob } from "@s-fast-transport/shared";
import { expenseTitle, getExpenseReceiptUrl, otherExpenseCategories, reviewDriverExpense, submitDriverExpense, submitOtherDriverExpense, subscribeDriverExpenses, type DriverExpense, type ExpenseStatus, type OtherExpenseCategory } from "@/lib/driver-expenses";
import { driverExpenseReportHtml, expenseReportRows, expenseReportSummary } from "@/lib/driver-expense-report";
import { isImageFile, MAX_SOURCE_IMAGE_BYTES } from "@/lib/image-upload";
import type { UserProfile } from "@/lib/transport-repository";
import "./driver-expenses.css";

const money = new Intl.NumberFormat("th-TH", { style: "currency", currency: "THB" });
const statusText: Record<ExpenseStatus, string> = { pending: "รอตรวจสอบ", approved: "อนุมัติแล้ว", rejected: "ไม่อนุมัติ", paid: "อนุมัติแล้ว" };
type AdminTab = "pending" | "approved" | "report";

function ReceiptPreview({ path, index }: { path: string; index: number }) {
  const [url, setUrl] = useState("");
  const [error, setError] = useState(false);
  useEffect(() => {
    let active = true;
    getExpenseReceiptUrl(path).then(next => { if (active) setUrl(next); }).catch(() => { if (active) setError(true); });
    return () => { active = false; };
  }, [path]);
  return <span className="expense-receipt-preview">
    {url ? <a href={url} target="_blank" rel="noreferrer" aria-label={`เปิดรูปบิล ${index + 1}`}><Image unoptimized src={url} alt={`รูปบิล ${index + 1}`} width={150} height={115} /></a> : <span><FileImage size={22} />{error ? "เปิดรูปไม่ได้" : "กำลังโหลด…"}</span>}
  </span>;
}

function SelectedReceipt({ file, onRemove, disabled }: { file: File; onRemove: () => void; disabled: boolean }) {
  return <div><span className="expense-selected-thumb"><FileImage size={17} /></span><span>{file.name}</span><button type="button" disabled={disabled} onClick={onRemove} aria-label={`ลบรูป ${file.name}`}><X size={15} /></button></div>;
}

function ReceiptPicker({ receipts, onChange, keptPaths, onKeptChange, onError, disabled }: { receipts: File[]; onChange: (files: File[]) => void; keptPaths: string[]; onKeptChange: (paths: string[]) => void; onError: (message: string) => void; disabled: boolean }) {
  const cameraRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  function addFiles(files: FileList | null) {
    const selected = Array.from(files ?? []);
    if (!selected.length) return;
    if (keptPaths.length + receipts.length + selected.length > 5) { onError("แนบรูปบิลได้ไม่เกิน 5 รูป"); return; }
    if (selected.some(file => !isImageFile(file) || file.size <= 0 || file.size > MAX_SOURCE_IMAGE_BYTES)) { onError("รูปบิลต้องเป็นไฟล์ภาพและไม่เกิน 20 MB ต่อรูป"); return; }
    onChange([...receipts, ...selected]);
    onError("");
  }
  return <div className="expense-photo-picker">
    <span>รูปบิล {keptPaths.length + receipts.length}/5 รูป</span>
    <div className="expense-photo-actions">
      <button type="button" disabled={disabled || keptPaths.length + receipts.length >= 5} onClick={() => cameraRef.current?.click()}><Camera size={18} /> เพิ่มด้วยกล้อง</button>
      <button type="button" disabled={disabled || keptPaths.length + receipts.length >= 5} onClick={() => fileRef.current?.click()}><FolderOpen size={18} /> เพิ่มด้วยไฟล์</button>
    </div>
    <input ref={cameraRef} className="expense-hidden-input" type="file" accept="image/*" capture="environment" disabled={disabled} tabIndex={-1} aria-hidden="true" onChange={event => { addFiles(event.currentTarget.files); event.currentTarget.value = ""; }} />
    <input ref={fileRef} className="expense-hidden-input" type="file" accept="image/*" multiple disabled={disabled} tabIndex={-1} aria-hidden="true" onChange={event => { addFiles(event.currentTarget.files); event.currentTarget.value = ""; }} />
    {keptPaths.length + receipts.length ? <div className="expense-selected-files">{keptPaths.map((path, index) => <div key={path}><ReceiptPreview path={path} index={index} /><span>รูปบิลเดิม {index + 1}</span><button type="button" disabled={disabled} onClick={() => onKeptChange(keptPaths.filter(item => item !== path))} aria-label={`ลบรูปบิลเดิม ${index + 1}`}><X size={15} /></button></div>)}{receipts.map((file, index) => <SelectedReceipt key={`${file.name}-${file.lastModified}-${index}`} file={file} disabled={disabled} onRemove={() => onChange(receipts.filter((_, position) => position !== index))} />)}</div> : <small>รองรับรูปจากโทรศัพท์ · รูปต้นฉบับไม่เกิน 20 MB ต่อรูป</small>}
  </div>;
}

function ExpenseForm({ job, actor, claim, onDone }: { job?: TransportJob; actor: UserProfile; claim?: DriverExpense; onDone: (month?: string) => void }) {
  const [originalClaim] = useState(claim);
  const [amount, setAmount] = useState(claim ? String(claim.amount) : "");
  const [note, setNote] = useState(claim?.note || "");
  const [category, setCategory] = useState<OtherExpenseCategory>(claim?.category || "repair");
  const [expenseDate, setExpenseDate] = useState(() => claim?.expenseDate || new Date(Date.now() + 7 * 60 * 60 * 1000).toISOString().slice(0, 10));
  const [vehiclePlate, setVehiclePlate] = useState(claim?.vehiclePlate || "");
  const [receipts, setReceipts] = useState<File[]>([]);
  const [keptPaths, setKeptPaths] = useState<string[]>(claim?.receiptPaths || []);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      if (job) await submitDriverExpense(job, actor, Number(amount), note, receipts, keptPaths, originalClaim);
      else await submitOtherDriverExpense(actor, category, expenseDate, vehiclePlate, Number(amount), note, receipts, keptPaths, originalClaim);
      onDone(job ? undefined : expenseDate.slice(0, 7));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "ส่งค่าใช้จ่ายไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }
  return <form className="expense-form" onSubmit={event => void submit(event)}>
    <div className="expense-form-head"><strong>{claim ? "แก้ไขค่าใช้จ่าย" : job ? "แจ้งค่าใช้จ่ายงานนี้" : "แจ้งค่าใช้จ่ายอื่น"}</strong><button type="button" onClick={() => onDone()} aria-label="ปิดแบบฟอร์ม"><X size={18} /></button></div>
    {!job && <div className="expense-other-fields"><label><span>ประเภทค่าใช้จ่าย</span><select value={category} disabled={busy} onChange={event => setCategory(event.target.value as OtherExpenseCategory)}>{otherExpenseCategories.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label><label><span>วันที่ค่าใช้จ่าย</span><input type="date" value={expenseDate} disabled={busy} onChange={event => setExpenseDate(event.target.value)} required /></label><label><span>ทะเบียนรถ (ถ้ามี)</span><input value={vehiclePlate} maxLength={40} disabled={busy} onChange={event => setVehiclePlate(event.target.value)} placeholder="ระบุทะเบียนรถ" /></label></div>}
    <label><span>จำนวนเงิน (บาท)</span><input type="number" inputMode="decimal" min="0.01" max="1000000" step="0.01" value={amount} onChange={event => setAmount(event.target.value)} required placeholder="0.00" /></label>
    <label><span>รายละเอียดค่าใช้จ่าย</span><textarea value={note} onChange={event => setNote(event.target.value)} maxLength={500} rows={3} placeholder={job ? "เช่น ค่าทางด่วนหรือค่าที่จอดรถ" : "ระบุรายการที่ซื้อหรือซ่อม"} /></label>
    <ReceiptPicker receipts={receipts} onChange={setReceipts} keptPaths={keptPaths} onKeptChange={setKeptPaths} onError={setError} disabled={busy} />
    {claim?.status === "approved" && <small>เมื่อบันทึกการแก้ไข รายการจะกลับไปรอแอดมินตรวจสอบอีกครั้ง</small>}
    {error && <p role="alert" className="expense-error">{error}</p>}
    <button type="submit" className="expense-primary" disabled={busy || !receipts.length && !keptPaths.length}>{busy ? "กำลังส่งรูปและบันทึก…" : claim ? "บันทึกและส่งตรวจอีกครั้ง" : "ส่งให้แอดมินตรวจสอบ"}</button>
  </form>;
}

export default function DriverExpenses({ jobs, actor, adminView = false }: { jobs: TransportJob[]; actor: UserProfile; adminView?: boolean }) {
  const tabsId = useId();
  const [claims, setClaims] = useState<DriverExpense[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [month, setMonth] = useState("");
  const [editingJobId, setEditingJobId] = useState("");
  const [editingOtherId, setEditingOtherId] = useState("");
  const [reviewNotes, setReviewNotes] = useState<Record<string, string>>({});
  const [reviewingId, setReviewingId] = useState("");
  const [adminTab, setAdminTab] = useState<AdminTab>("pending");
  const [driverFilter, setDriverFilter] = useState("");
  const [vehicleFilter, setVehicleFilter] = useState("");
  const [reportMessage, setReportMessage] = useState("");

  useEffect(() => subscribeDriverExpenses(actor, adminView, items => { setClaims(items); setLoading(false); setError(""); }, message => { setError(`โหลดค่าใช้จ่ายไม่สำเร็จ: ${message}`); setLoading(false); }), [actor, adminView]);

  const completedJobs = useMemo(() => jobs.filter(job => job.status === "completed" && job.assignedDriverUid === actor.uid).sort((a, b) => (jobHistoryDate(b) || "").localeCompare(jobHistoryDate(a) || "")), [jobs, actor.uid]);
  const [currentMonth] = useState(() => new Date(Date.now() + 7 * 60 * 60 * 1000).toISOString().slice(0, 7));
  const months = useMemo(() => [...new Set(adminView ? claims.map(claim => claim.completedMonth) : [currentMonth, ...completedJobs.map(jobHistoryMonth), ...claims.map(claim => claim.completedMonth)])].filter(value => value && value !== "unknown").sort((a, b) => b.localeCompare(a)), [adminView, claims, completedJobs, currentMonth]);
  const selectedMonth = months.includes(month) ? month : months[0] || "";
  const visibleJobs = completedJobs.filter(job => jobHistoryMonth(job) === selectedMonth);
  const visibleClaims = claims.filter(claim => claim.completedMonth === selectedMonth);
  const visibleOtherClaims = visibleClaims.filter(claim => claim.expenseKind === "other");
  const pendingClaims = visibleClaims.filter(claim => claim.status === "pending");
  const approvedClaims = visibleClaims.filter(claim => claim.status === "approved" || claim.status === "paid");
  const reportRows = expenseReportRows(claims, jobs, selectedMonth, driverFilter, vehicleFilter);
  const reportSummary = expenseReportSummary(reportRows);
  const reportDrivers = [...new Map(visibleClaims.map(claim => [claim.driverUid, claim.driverName || "ไม่ระบุชื่อคนขับ"])).entries()].sort((a, b) => a[1].localeCompare(b[1], "th"));
  const reportVehicles = [...new Set(expenseReportRows(claims, jobs, selectedMonth, driverFilter).map(row => row.vehiclePlate))].sort((a, b) => a.localeCompare(b, "th"));
  const selectedVehicleFilter = vehicleFilter && reportVehicles.includes(vehicleFilter) ? vehicleFilter : "";
  const displayedReportRows = selectedVehicleFilter === vehicleFilter ? reportRows : expenseReportRows(claims, jobs, selectedMonth, driverFilter);
  const displayedReportSummary = selectedVehicleFilter === vehicleFilter ? reportSummary : expenseReportSummary(displayedReportRows);
  const claimsByJob = new Map(claims.map(claim => [claim.jobId, claim]));
  const total = visibleClaims.reduce((sum, claim) => sum + claim.amount, 0);

  function printExpenseReport() {
    if (!displayedReportRows.length) return;
    const html = driverExpenseReportHtml(displayedReportRows, historyMonthLabel(selectedMonth), reportDrivers.find(([uid]) => uid === driverFilter)?.[1] || "ทุกคนขับ", selectedVehicleFilter || "ทุกรถ");
    const url = URL.createObjectURL(new Blob([html], { type: "text/html;charset=utf-8" }));
    const preview = window.open(url, "_blank");
    if (!preview) { URL.revokeObjectURL(url); setReportMessage("เบราว์เซอร์บล็อกหน้าต่างรายงาน กรุณาอนุญาตป๊อปอัปแล้วลองใหม่"); return; }
    preview.focus();
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    setReportMessage("เปิดรายงานแล้ว กด ‘พิมพ์ / บันทึกเป็น PDF’ เพื่อบันทึกไฟล์");
  }

  async function review(claim: DriverExpense, status: "approved" | "rejected") {
    if (reviewingId) return;
    const reviewNote = reviewNotes[claim.id] || "";
    if (status === "rejected" && !reviewNote.trim()) { setError("กรุณาระบุเหตุผลก่อนปฏิเสธ"); return; }
    setReviewingId(claim.id);
    setError("");
    try { await reviewDriverExpense(claim, actor, status, reviewNote); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "บันทึกผลตรวจสอบไม่สำเร็จ"); }
    finally { setReviewingId(""); }
  }

  return <section className="screen driver-expenses-screen">
    <header className="expense-hero"><span><ReceiptText size={17} /> {adminView ? "EXPENSE REVIEW" : "DRIVER EXPENSES"}</span><h1>{adminView ? "ตรวจค่าใช้จ่ายคนขับ" : "แจ้งค่าใช้จ่าย"}</h1><p>{adminView ? "ตรวจบิลค่าใช้จ่ายตามใบงานและรายการอื่นของคนขับ" : "แจ้งค่าใช้จ่ายจากงานที่วิ่งเสร็จ หรือรายการอื่นที่ไม่ผูกใบงาน"}</p></header>
    <div className="expense-months" aria-label="เลือกเดือน">
      {months.map(value => {
        const monthlyClaims = claims.filter(claim => claim.completedMonth === value);
        const count = adminView ? monthlyClaims.length : completedJobs.filter(job => jobHistoryMonth(job) === value).length + monthlyClaims.filter(claim => claim.expenseKind === "other").length;
        return <button type="button" key={value} className={selectedMonth === value ? "selected" : ""} aria-pressed={selectedMonth === value} onClick={() => { setMonth(value); setEditingJobId(""); setEditingOtherId(""); }}><CalendarDays size={16} /><span>{historyMonthLabel(value)}</span><b>{count}</b></button>;
      })}
    </div>
    {adminView && <div className="expense-tabs" role="tablist" aria-label="สถานะค่าใช้จ่าย">
      {([["pending", "รอตรวจสอบ", pendingClaims.length], ["approved", "อนุมัติแล้ว", approvedClaims.length], ["report", "รายงาน", visibleClaims.length]] as const).map(([value, label, count]) => <button type="button" role="tab" key={value} id={`${tabsId}-${value}`} aria-controls={`${tabsId}-panel`} aria-selected={adminTab === value} tabIndex={adminTab === value ? 0 : -1} className={adminTab === value ? "selected" : ""} onClick={() => { setAdminTab(value); setReportMessage(""); }} onKeyDown={event => {
        const values: AdminTab[] = ["pending", "approved", "report"];
        const current = values.indexOf(value);
        const next = event.key === "ArrowRight" ? values[(current + 1) % values.length] : event.key === "ArrowLeft" ? values[(current + values.length - 1) % values.length] : event.key === "Home" ? values[0] : event.key === "End" ? values[values.length - 1] : null;
        if (!next) return;
        event.preventDefault(); setAdminTab(next); document.getElementById(`${tabsId}-${next}`)?.focus();
      }}>{label}<b>{count}</b></button>)}
    </div>}
    {selectedMonth && (!adminView || adminTab !== "report") && <div className="expense-summary"><span><CircleDollarSign size={20} /> {adminView ? adminTab === "pending" ? "ยอดรอตรวจสอบ" : "ยอดอนุมัติแล้ว" : "ยอดแจ้งเดือนนี้"}</span><strong>{money.format(adminView ? (adminTab === "pending" ? pendingClaims : approvedClaims).reduce((sum, claim) => sum + claim.amount, 0) : total)}</strong><small>{adminView ? adminTab === "pending" ? pendingClaims.length : approvedClaims.length : visibleClaims.length} รายการ</small></div>}
    {error && <p className="expense-error" role="alert">{error}</p>}
    {loading && <p className="expense-empty">กำลังโหลดค่าใช้จ่าย…</p>}
    {!loading && !months.length && <p className="expense-empty">ยังไม่มีรายการค่าใช้จ่าย</p>}
    {adminView && adminTab === "report" && !loading && <div role="tabpanel" id={`${tabsId}-panel`} aria-labelledby={`${tabsId}-report`} className="expense-report">
      <div className="expense-report-head"><div><h2>รายงานค่าใช้จ่ายคนขับ</h2><p>เดือน {selectedMonth ? historyMonthLabel(selectedMonth) : "—"} · ทุกสถานะ</p></div><button type="button" className="expense-primary" disabled={!displayedReportRows.length} onClick={printExpenseReport}><Printer size={17} /> พิมพ์ / บันทึก PDF</button></div>
      <div className="expense-report-filters"><label>คนขับ<select value={driverFilter} onChange={event => { setDriverFilter(event.target.value); setVehicleFilter(""); }}><option value="">ทุกคนขับ</option>{reportDrivers.map(([uid, name]) => <option key={uid} value={uid}>{name}</option>)}</select></label><label>รถ<select value={selectedVehicleFilter} onChange={event => setVehicleFilter(event.target.value)}><option value="">ทุกรถ</option>{reportVehicles.map(plate => <option key={plate} value={plate}>{plate}</option>)}</select></label></div>
      <div className="expense-report-metrics"><div><span>รายการ</span><strong>{displayedReportRows.length}</strong></div><div><span>ยอดแจ้งทั้งหมด</span><strong>{money.format(displayedReportSummary.total)}</strong></div><div><span>ยอดอนุมัติแล้ว</span><strong>{money.format(displayedReportSummary.approvedTotal)}</strong></div></div>
      <p className="expense-report-counts">รอตรวจสอบ {displayedReportSummary.counts.pending} · อนุมัติแล้ว {displayedReportSummary.counts.approved} · ไม่อนุมัติ {displayedReportSummary.counts.rejected}</p>
      {displayedReportRows.length ? <div className="expense-report-table-wrap"><table className="expense-report-table"><thead><tr><th>รายการ</th><th>คนขับ</th><th>รถ</th><th>รายละเอียด</th><th>สถานะ</th><th>จำนวนเงิน</th></tr></thead><tbody>{displayedReportRows.map(({ claim, vehiclePlate }) => <tr key={claim.id}><td data-label="รายการ"><strong>{expenseTitle(claim)}</strong></td><td data-label="คนขับ">{claim.driverName}</td><td data-label="รถ">{vehiclePlate}</td><td data-label="รายละเอียด">{claim.note || "—"}</td><td data-label="สถานะ"><em className={`expense-status ${claim.status}`}>{statusText[claim.status]}</em></td><td data-label="จำนวนเงิน" className="expense-report-amount">{money.format(claim.amount)}</td></tr>)}</tbody></table></div> : <p className="expense-empty">ไม่มีรายการตามตัวกรอง</p>}
      {reportMessage && <p role="status" className="expense-report-message">{reportMessage}</p>}
    </div>}
    {!loading && (!adminView || adminTab !== "report") && <div className="expense-list" {...(adminView ? { role: "tabpanel", id: `${tabsId}-panel`, "aria-labelledby": `${tabsId}-${adminTab}` } : {})}>
      {adminView ? (adminTab === "pending" ? pendingClaims : approvedClaims).map(claim => <article className="expense-card" key={claim.id}>
        <div className="expense-card-head"><span className="expense-card-icon"><ReceiptText size={22} /></span><div><small>{expenseTitle(claim)}{claim.expenseDate ? ` · ${claim.expenseDate}` : ""}</small><strong>{claim.driverName}</strong></div><em className={`expense-status ${claim.status}`}>{statusText[claim.status]}</em></div>
        <div className="expense-card-detail"><strong>{money.format(claim.amount)}</strong><p>{claim.note || "ไม่ระบุรายละเอียด"}</p></div>
        <div className="expense-receipts">{claim.receiptPaths.map((path, index) => <ReceiptPreview key={path} path={path} index={index} />)}</div>
        {claim.status === "pending" && <div className="expense-review"><label>หมายเหตุการตรวจสอบ<textarea rows={2} maxLength={500} value={reviewNotes[claim.id] || ""} onChange={event => setReviewNotes(current => ({ ...current, [claim.id]: event.target.value }))} placeholder="ระบุเหตุผลหากไม่อนุมัติ" /></label><div><button type="button" disabled={Boolean(reviewingId)} onClick={() => void review(claim, "rejected")}>ไม่อนุมัติ</button><button type="button" className="expense-primary" disabled={Boolean(reviewingId)} onClick={() => void review(claim, "approved")}>อนุมัติ</button></div></div>}
        {claim.reviewNote && <p className="expense-review-note">หมายเหตุแอดมิน: {claim.reviewNote}</p>}
      </article>) : <>
        <div className="expense-other-entry"><div><strong>ค่าใช้จ่ายอื่น</strong><small>ค่าซ่อมรถ ค่าอุปกรณ์ ค่าล้างรถ และรายการที่ไม่ผูกใบงาน</small></div><button type="button" className="expense-open" onClick={() => setEditingOtherId("new")} disabled={editingOtherId === "new"}><Plus size={17} /> เพิ่มอื่นๆ</button>{editingOtherId === "new" && <ExpenseForm actor={actor} onDone={nextMonth => { setEditingOtherId(""); if (nextMonth) setMonth(nextMonth); }} />}</div>
        {visibleOtherClaims.map(claim => <article className="expense-card" key={claim.id}><div className="expense-card-head"><span className="expense-card-icon"><ReceiptText size={22} /></span><div><small>{claim.expenseDate || "ไม่ระบุวันที่"}{claim.vehiclePlate ? ` · ${claim.vehiclePlate}` : ""}</small><strong>{expenseTitle(claim)}</strong></div><em className={`expense-status ${claim.status}`}>{statusText[claim.status]}</em></div><div className="expense-card-detail"><strong>{money.format(claim.amount)}</strong><p>{claim.note || "ไม่ระบุรายละเอียด"}</p><div className="expense-receipts">{claim.receiptPaths.map((path, index) => <ReceiptPreview key={path} path={path} index={index} />)}</div>{claim.reviewNote && <p className="expense-review-note">หมายเหตุแอดมิน: {claim.reviewNote}</p>}</div>{editingOtherId === claim.id ? <ExpenseForm key={claim.id} actor={actor} claim={claim} onDone={nextMonth => { setEditingOtherId(""); if (nextMonth) setMonth(nextMonth); }} /> : <button type="button" className="expense-open" onClick={() => setEditingOtherId(claim.id)}>แก้ไขรายการ</button>}</article>)}
        {visibleJobs.map(job => {
        const claim = claimsByJob.get(job.id);
        return <article className="expense-card" key={job.id}>
          <div className="expense-card-head"><span className="expense-card-icon"><Truck size={22} /></span><div><small>ใบงาน {job.workOrder}</small><strong>{job.customer}</strong></div>{claim && <em className={`expense-status ${claim.status}`}>{statusText[claim.status]}</em>}</div>
          <p className="expense-route">{job.pickupLocation} → {job.deliveryLocation}</p>
          <small className="expense-date">จบงาน {jobHistoryDate(job) ? new Date(jobHistoryDate(job) || "").toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short" }) : "ไม่ระบุเวลา"}</small>
          {claim && <div className="expense-card-detail"><strong>{money.format(claim.amount)}</strong><p>{claim.note || "ไม่ระบุรายละเอียด"}</p><div className="expense-receipts">{claim.receiptPaths.map((path, index) => <ReceiptPreview key={path} path={path} index={index} />)}</div>{claim.reviewNote && <p className="expense-review-note">หมายเหตุแอดมิน: {claim.reviewNote}</p>}</div>}
          {editingJobId === job.id ? <ExpenseForm key={job.id} job={job} actor={actor} claim={claim} onDone={() => setEditingJobId("")} /> : <button type="button" className="expense-open" onClick={() => setEditingJobId(job.id)}>{claim ? "แก้ไขรายการ" : "แจ้งค่าใช้จ่ายงานนี้"}</button>}
        </article>;
        })}</>}
    </div>}
    {!loading && selectedMonth && (adminView ? adminTab !== "report" && !(adminTab === "pending" ? pendingClaims : approvedClaims).length : !visibleJobs.length && !visibleOtherClaims.length) && <p className="expense-empty"><CheckCircle2 size={25} /> {adminView ? adminTab === "pending" ? "ไม่มีรายการรอตรวจสอบในเดือนนี้" : "ไม่มีรายการที่อนุมัติแล้วในเดือนนี้" : "ยังไม่มีรายการในเดือนนี้"}</p>}
  </section>;
}
