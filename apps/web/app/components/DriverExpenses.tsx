"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { CalendarDays, CheckCircle2, CircleDollarSign, FileImage, ReceiptText, Truck, X } from "lucide-react";
import { historyMonthLabel, jobHistoryDate, jobHistoryMonth, type TransportJob } from "@s-fast-transport/shared";
import { getExpenseReceiptUrl, reviewDriverExpense, submitDriverExpense, subscribeDriverExpenses, type DriverExpense, type ExpenseStatus } from "@/lib/driver-expenses";
import type { UserProfile } from "@/lib/transport-repository";
import "./driver-expenses.css";

const money = new Intl.NumberFormat("th-TH", { style: "currency", currency: "THB" });
const statusText: Record<ExpenseStatus, string> = { pending: "รอตรวจสอบ", approved: "อนุมัติแล้ว", rejected: "ไม่อนุมัติ", paid: "จ่ายแล้ว" };

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

function ExpenseForm({ job, actor, claim, onDone }: { job: TransportJob; actor: UserProfile; claim?: DriverExpense; onDone: () => void }) {
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [receipts, setReceipts] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await submitDriverExpense(job, actor, Number(amount), note, receipts);
      onDone();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "ส่งค่าใช้จ่ายไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }
  return <form className="expense-form" onSubmit={event => void submit(event)}>
    <div className="expense-form-head"><strong>{claim?.status === "rejected" ? "ส่งคำขอใหม่" : "แจ้งค่าใช้จ่าย"}</strong><button type="button" onClick={onDone} aria-label="ปิดแบบฟอร์ม"><X size={18} /></button></div>
    <label><span>จำนวนเงิน (บาท)</span><input type="number" inputMode="decimal" min="0.01" max="1000000" step="0.01" value={amount} onChange={event => setAmount(event.target.value)} required placeholder="0.00" /></label>
    <label><span>รายละเอียดค่าใช้จ่าย</span><textarea value={note} onChange={event => setNote(event.target.value)} maxLength={500} rows={3} placeholder="เช่น ค่าทางด่วน ค่าที่จอดรถ หรือค่าใช้จ่ายอื่นในงานนี้" /></label>
    <label><span>รูปบิล 1–5 รูป</span><input type="file" accept="image/*" multiple required onChange={event => { const selected = Array.from(event.target.files ?? []); setReceipts(selected.length > 5 ? [] : selected); setError(selected.length > 5 ? "แนบรูปบิลได้ไม่เกิน 5 รูป" : ""); }} /><small>{receipts.length ? receipts.map(file => file.name).join(" · ") : "รองรับรูปจากโทรศัพท์ · รูปต้นฉบับไม่เกิน 20 MB ต่อรูป"}</small></label>
    {error && <p role="alert" className="expense-error">{error}</p>}
    <button type="submit" className="expense-primary" disabled={busy || !receipts.length}>{busy ? "กำลังส่งรูปและบันทึก…" : "ส่งให้แอดมินตรวจสอบ"}</button>
  </form>;
}

export default function DriverExpenses({ jobs, actor, adminView = false }: { jobs: TransportJob[]; actor: UserProfile; adminView?: boolean }) {
  const [claims, setClaims] = useState<DriverExpense[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [month, setMonth] = useState("");
  const [editingJobId, setEditingJobId] = useState("");
  const [reviewNotes, setReviewNotes] = useState<Record<string, string>>({});
  const [reviewingId, setReviewingId] = useState("");

  useEffect(() => subscribeDriverExpenses(actor, adminView, items => { setClaims(items); setLoading(false); setError(""); }, message => { setError(`โหลดค่าใช้จ่ายไม่สำเร็จ: ${message}`); setLoading(false); }), [actor, adminView]);

  const completedJobs = useMemo(() => jobs.filter(job => job.status === "completed" && job.assignedDriverUid === actor.uid).sort((a, b) => (jobHistoryDate(b) || "").localeCompare(jobHistoryDate(a) || "")), [jobs, actor.uid]);
  const months = useMemo(() => [...new Set(adminView ? claims.map(claim => claim.completedMonth) : completedJobs.map(jobHistoryMonth))].filter(value => value && value !== "unknown").sort((a, b) => b.localeCompare(a)), [adminView, claims, completedJobs]);
  const selectedMonth = months.includes(month) ? month : months[0] || "";
  const visibleJobs = completedJobs.filter(job => jobHistoryMonth(job) === selectedMonth);
  const visibleClaims = claims.filter(claim => claim.completedMonth === selectedMonth);
  const claimsByJob = new Map(claims.map(claim => [claim.jobId, claim]));
  const total = visibleClaims.reduce((sum, claim) => sum + claim.amount, 0);

  async function review(claim: DriverExpense, status: "approved" | "rejected" | "paid") {
    if (reviewingId) return;
    const reviewNote = status === "paid" ? claim.reviewNote : reviewNotes[claim.id] || "";
    if (status === "rejected" && !reviewNote.trim()) { setError("กรุณาระบุเหตุผลก่อนปฏิเสธ"); return; }
    setReviewingId(claim.id);
    setError("");
    try { await reviewDriverExpense(claim, actor, status, reviewNote); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "บันทึกผลตรวจสอบไม่สำเร็จ"); }
    finally { setReviewingId(""); }
  }

  return <section className="screen driver-expenses-screen">
    <header className="expense-hero"><span><ReceiptText size={17} /> {adminView ? "EXPENSE REVIEW" : "DRIVER EXPENSES"}</span><h1>{adminView ? "ตรวจค่าใช้จ่ายคนขับ" : "แจ้งค่าใช้จ่าย"}</h1><p>{adminView ? "ตรวจบิล อนุมัติ และติดตามการจ่ายตามใบงาน" : "เลือกงานที่วิ่งเสร็จแล้ว เพื่อส่งค่าใช้จ่ายและรูปบิลให้แอดมิน"}</p></header>
    <div className="expense-months" aria-label="เลือกเดือน">
      {months.map(value => {
        const monthlyClaims = claims.filter(claim => claim.completedMonth === value);
        const count = adminView ? monthlyClaims.length : completedJobs.filter(job => jobHistoryMonth(job) === value).length;
        return <button type="button" key={value} className={selectedMonth === value ? "selected" : ""} aria-pressed={selectedMonth === value} onClick={() => { setMonth(value); setEditingJobId(""); }}><CalendarDays size={16} /><span>{historyMonthLabel(value)}</span><b>{count}</b></button>;
      })}
    </div>
    {selectedMonth && <div className="expense-summary"><span><CircleDollarSign size={20} /> ยอดแจ้งเดือนนี้</span><strong>{money.format(total)}</strong><small>{visibleClaims.length} รายการ{adminView ? ` · รอตรวจสอบ ${visibleClaims.filter(claim => claim.status === "pending").length}` : ""}</small></div>}
    {error && <p className="expense-error" role="alert">{error}</p>}
    {loading && <p className="expense-empty">กำลังโหลดค่าใช้จ่าย…</p>}
    {!loading && !months.length && <p className="expense-empty">{adminView ? "ยังไม่มีคนขับแจ้งค่าใช้จ่าย" : "ยังไม่มีงานที่วิ่งเสร็จ"}</p>}
    {!loading && <div className="expense-list">
      {adminView ? visibleClaims.map(claim => <article className="expense-card" key={claim.id}>
        <div className="expense-card-head"><span className="expense-card-icon"><ReceiptText size={22} /></span><div><small>ใบงาน {claim.workOrder}</small><strong>{claim.driverName}</strong></div><em className={`expense-status ${claim.status}`}>{statusText[claim.status]}</em></div>
        <div className="expense-card-detail"><strong>{money.format(claim.amount)}</strong><p>{claim.note || "ไม่ระบุรายละเอียด"}</p></div>
        <div className="expense-receipts">{claim.receiptPaths.map((path, index) => <ReceiptPreview key={path} path={path} index={index} />)}</div>
        {claim.status === "pending" && <div className="expense-review"><label>หมายเหตุการตรวจสอบ<textarea rows={2} maxLength={500} value={reviewNotes[claim.id] || ""} onChange={event => setReviewNotes(current => ({ ...current, [claim.id]: event.target.value }))} placeholder="ระบุเหตุผลหากไม่อนุมัติ" /></label><div><button type="button" disabled={Boolean(reviewingId)} onClick={() => void review(claim, "rejected")}>ไม่อนุมัติ</button><button type="button" className="expense-primary" disabled={Boolean(reviewingId)} onClick={() => void review(claim, "approved")}>อนุมัติ</button></div></div>}
        {claim.status === "approved" && <button type="button" className="expense-primary expense-paid" disabled={Boolean(reviewingId)} onClick={() => void review(claim, "paid")}>ทำเครื่องหมายว่าจ่ายแล้ว</button>}
        {claim.reviewNote && <p className="expense-review-note">หมายเหตุแอดมิน: {claim.reviewNote}</p>}
      </article>) : visibleJobs.map(job => {
        const claim = claimsByJob.get(job.id);
        return <article className="expense-card" key={job.id}>
          <div className="expense-card-head"><span className="expense-card-icon"><Truck size={22} /></span><div><small>ใบงาน {job.workOrder}</small><strong>{job.customer}</strong></div>{claim && <em className={`expense-status ${claim.status}`}>{statusText[claim.status]}</em>}</div>
          <p className="expense-route">{job.pickupLocation} → {job.deliveryLocation}</p>
          <small className="expense-date">จบงาน {jobHistoryDate(job) ? new Date(jobHistoryDate(job) || "").toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short" }) : "ไม่ระบุเวลา"}</small>
          {claim && <div className="expense-card-detail"><strong>{money.format(claim.amount)}</strong><p>{claim.note || "ไม่ระบุรายละเอียด"}</p><div className="expense-receipts">{claim.receiptPaths.map((path, index) => <ReceiptPreview key={path} path={path} index={index} />)}</div>{claim.reviewNote && <p className="expense-review-note">หมายเหตุแอดมิน: {claim.reviewNote}</p>}</div>}
          {(!claim || claim.status === "rejected") && (editingJobId === job.id ? <ExpenseForm key={job.id} job={job} actor={actor} claim={claim} onDone={() => setEditingJobId("")} /> : <button type="button" className="expense-open" onClick={() => setEditingJobId(job.id)}>{claim ? "แก้ไขและส่งใหม่" : "แจ้งค่าใช้จ่ายงานนี้"}</button>)}
        </article>;
      })}
    </div>}
    {!loading && selectedMonth && (adminView ? !visibleClaims.length : !visibleJobs.length) && <p className="expense-empty"><CheckCircle2 size={25} /> ไม่มีรายการในเดือนนี้</p>}
  </section>;
}
