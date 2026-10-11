"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, ArrowRight, CalendarDays, CheckCircle2, ChevronLeft, ChevronRight, Clock3, LayoutDashboard, ListChecks, MapPin, Search, Trash2, Truck, UserRound } from "lucide-react";
import { historyMonthLabel, jobHistoryMonth, statusLabels, type TransportJob } from "@s-fast-transport/shared";

type Filter = "all" | "active" | "attention" | "completed" | "cancelled";
const filters: { id: Filter; label: string }[] = [
  { id: "all", label: "ทั้งหมด" }, { id: "active", label: "กำลังดำเนินงาน" },
  { id: "attention", label: "ต้องติดตาม" }, { id: "completed", label: "เสร็จงาน" }, { id: "cancelled", label: "ยกเลิก" }
];
const isActive = (job: TransportJob) => job.status !== "completed" && job.status !== "cancelled";
const needsAttention = (job: TransportJob) => isActive(job) && (job.alerts.length > 0 || job.status === "problem");
const pageSize = 12;

export default function AdminDashboard({ jobs, deletedJobs = [], dataState, selectedJobId, onSelectJob, onPermanentlyDelete }: {
  jobs: TransportJob[];
  deletedJobs?: TransportJob[];
  dataState: "loading" | "ready" | "error";
  selectedJobId: string;
  onSelectJob: (jobId: string) => void;
  onPermanentlyDelete?: (job: TransportJob) => Promise<void>;
}) {
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");
  const [month, setMonth] = useState("all");
  const [page, setPage] = useState(1);
  const [confirmJobId, setConfirmJobId] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [deletingId, setDeletingId] = useState("");
  const [deleteError, setDeleteError] = useState("");
  const [deletedMessage, setDeletedMessage] = useState("");
  const allJobs = useMemo(() => [...jobs, ...deletedJobs], [jobs, deletedJobs]);
  const deletedIds = useMemo(() => new Set(deletedJobs.map(job => job.id)), [deletedJobs]);
  const jobMonth = (job: TransportJob) => job.status === "cancelled" || job.status === "completed" ? jobHistoryMonth(job) : job.jobDate?.slice(0, 7) || "unknown";
  const months = useMemo(() => [...new Set(allJobs.map(jobMonth))].sort((a, b) => a === "unknown" ? 1 : b === "unknown" ? -1 : b.localeCompare(a)), [allJobs]);
  const counts = useMemo(() => ({
    all: allJobs.length,
    active: jobs.filter(isActive).length,
    attention: jobs.filter(needsAttention).length,
    completed: jobs.filter(job => job.status === "completed").length,
    cancelled: allJobs.filter(job => job.status === "cancelled").length
  }), [jobs, allJobs]);
  const shown = useMemo(() => {
    const term = search.trim().toLocaleLowerCase("th-TH");
    return allJobs.filter(job => {
      const matchesFilter = filter === "all" || (filter === "active" ? isActive(job) : filter === "attention" ? needsAttention(job) : job.status === filter);
      return matchesFilter && (month === "all" || jobMonth(job) === month) && (!term || [job.workOrder, job.customer, job.driverName, job.vehiclePlate, job.pickupLocation, job.deliveryLocation].some(value => value.toLocaleLowerCase("th-TH").includes(term)));
    });
  }, [allJobs, search, filter, month]);
  const pages = Math.max(1, Math.ceil(shown.length / pageSize));
  const currentPage = Math.min(page, pages);
  const completedPercent = counts.all ? Math.round(counts.completed / counts.all * 100) : 0;
  const ready = dataState === "ready";
  function selectFilter(next: Filter) { setFilter(next); setPage(1); }
  async function permanentlyDelete(job: TransportJob) {
    if (!onPermanentlyDelete || confirmation !== job.workOrder || deletingId) return;
    setDeletingId(job.id); setDeleteError(""); setDeletedMessage("");
    try {
      await onPermanentlyDelete(job);
      setConfirmJobId(""); setConfirmation("");
      setDeletedMessage(`ลบใบงาน ${job.workOrder} ถาวรแล้ว`);
    } catch (error) {
      setDeleteError(error instanceof Error ? error.message : "ลบใบงานไม่สำเร็จ กรุณาลองใหม่");
    } finally { setDeletingId(""); }
  }
  const metrics = [
    { id: "all" as const, label: "ใบงานทั้งหมด", hint: "งานที่คุณมีสิทธิ์ดู", value: counts.all, icon: ListChecks },
    { id: "active" as const, label: "กำลังดำเนินงาน", hint: "ยังไม่เสร็จหรือยกเลิก", value: counts.active, icon: Truck },
    { id: "attention" as const, label: "ต้องติดตาม", hint: "งานมีปัญหาหรือแจ้งเตือน", value: counts.attention, icon: AlertTriangle },
    { id: "completed" as const, label: "เสร็จงานแล้ว", hint: "ปิดงานเรียบร้อย", value: counts.completed, icon: CheckCircle2 }
  ];

  return <section className="screen transport-dashboard" aria-busy={dataState === "loading"}>
    <header className="dashboard-header">
      <div><span className="dashboard-eyebrow"><LayoutDashboard size={15} /> TRANSPORT OVERVIEW</span><h1>Dashboard</h1><p>ภาพรวมงานขนส่งทั้งหมดที่คุณมีสิทธิ์ดู</p></div>
      <span className={`dashboard-connection ${ready ? "is-ready" : ""}`} role="status"><span />{ready ? "เชื่อมต่อข้อมูลแล้ว" : dataState === "error" ? "เชื่อมต่อไม่สำเร็จ" : "กำลังโหลดข้อมูล"}</span>
    </header>

    <div className="dashboard-metrics">{metrics.map(metric => <button key={metric.id} className={`dashboard-metric ${metric.id}`} disabled={!ready} aria-pressed={filter === metric.id} onClick={() => selectFilter(metric.id)}>
      <span className="dashboard-metric-top"><span>{metric.label}</span><metric.icon size={20} /></span>
      <strong>{ready ? metric.value.toLocaleString("th-TH") : "—"}<small>งาน</small></strong><span className="dashboard-metric-hint">{metric.hint}<ArrowRight size={15} /></span>
    </button>)}</div>

    <section className="dashboard-progress" aria-label="สัดส่วนสถานะงาน">
      <div className="dashboard-progress-copy"><span className="dashboard-section-kicker">ภาพรวมความคืบหน้า</span><h2>{ready ? `${completedPercent}%` : "—"}<small>เสร็จงานแล้ว</small></h2><p>เทียบกับใบงานทั้งหมด {ready ? counts.all.toLocaleString("th-TH") : "—"} งาน</p></div>
      <div className="dashboard-progress-chart"><div className="dashboard-status-bar" role="img" aria-label={ready ? `เสร็จ ${counts.completed} งาน กำลังดำเนินงาน ${counts.active} งาน ยกเลิก ${counts.cancelled} งาน` : "ยังไม่มีข้อมูลสรุป"}>
        {ready && counts.all > 0 && <><span className="completed" style={{ width: `${counts.completed / counts.all * 100}%` }} /><span className="active" style={{ width: `${counts.active / counts.all * 100}%` }} /><span className="cancelled" style={{ width: `${counts.cancelled / counts.all * 100}%` }} /></>}
      </div><div className="dashboard-legend">{(["completed", "active", "cancelled"] as const).map(id => <button key={id} disabled={!ready} onClick={() => selectFilter(id)}><span className={id} />{filters.find(item => item.id === id)?.label}<strong>{ready ? counts[id] : "—"}</strong></button>)}</div></div>
    </section>

    <section className="dashboard-jobs" aria-labelledby="dashboard-jobs-title">
      <div className="dashboard-list-heading"><div><span className="dashboard-section-kicker">รายการงานขนส่ง</span><h2 id="dashboard-jobs-title">ติดตามทุกงานในที่เดียว</h2><p>เลือกใบงานเพื่อดูรายละเอียด หลักฐาน และตำแหน่งรถ</p></div><label className="dashboard-search"><Search size={18} /><input aria-label="ค้นหาใบงาน" placeholder="ค้นหาใบงาน ลูกค้า คนขับ หรือทะเบียน" value={search} onChange={event => { setSearch(event.target.value); setPage(1); }} /></label></div>
      <div className="dashboard-filters" role="group" aria-label="กรองสถานะงาน">{filters.map(item => <button key={item.id} aria-pressed={filter === item.id} onClick={() => selectFilter(item.id)}>{item.label}<span>{ready ? counts[item.id] : "—"}</span></button>)}</div>
      <label className="dashboard-month-filter"><CalendarDays size={17} /><span>เดือน</span><select value={month} onChange={event => { setMonth(event.target.value); setPage(1); }}><option value="all">ทุกเดือน</option>{months.map(value => <option key={value} value={value}>{historyMonthLabel(value)}</option>)}</select></label>
      {deletedMessage && <p className="dashboard-delete-success" role="status">{deletedMessage}</p>}
      {dataState === "loading" ? <div className="dashboard-empty" role="status"><Clock3 size={30} /><h3>กำลังโหลดใบงาน</h3><p>กำลังรวบรวมข้อมูลภาพรวมของคุณ</p></div>
        : dataState === "error" ? <div className="dashboard-empty" role="alert"><AlertTriangle size={30} /><h3>โหลดข้อมูลไม่สำเร็จ</h3><p>ตรวจสอบการเชื่อมต่อ แล้วเปิด Dashboard อีกครั้งหรือรีเฟรชหน้า</p></div>
        : !shown.length ? <div className="dashboard-empty"><Search size={30} /><h3>{allJobs.length ? "ไม่พบงานที่ตรงกับตัวกรอง" : "ยังไม่มีใบงาน"}</h3><p>{allJobs.length ? "ลองเปลี่ยนคำค้นหา สถานะ หรือเดือน" : "เมื่อมีใบงาน ระบบจะแสดงภาพรวมและรายการงานที่นี่"}</p>{(search || filter !== "all" || month !== "all") && <button onClick={() => { setSearch(""); setMonth("all"); selectFilter("all"); }}>ล้างตัวกรอง</button>}</div>
        : <><div className="dashboard-job-grid">{shown.slice((currentPage - 1) * pageSize, currentPage * pageSize).map(job => { const deleted = deletedIds.has(job.id); const interactiveCard = !deleted && filter !== "cancelled"; const Card = interactiveCard ? "button" : "div"; return <Card type={interactiveCard ? "button" : undefined} className={`dashboard-job ${needsAttention(job) ? "needs-attention" : ""}`} key={job.id} aria-haspopup={interactiveCard ? "dialog" : undefined} aria-label={interactiveCard ? `เปิดรายละเอียดใบงาน ${job.workOrder}` : undefined} data-selected={selectedJobId === job.id} onClick={interactiveCard ? () => onSelectJob(job.id) : undefined}>
          <span className="dashboard-job-top"><span className="dashboard-work-order">{job.workOrder}</span><span className={`dashboard-job-status ${job.status === "completed" ? "completed" : needsAttention(job) ? "attention" : ""}`}>{deleted ? "ลบใบงานแล้ว" : statusLabels[job.status]}</span></span>
          <span className="dashboard-customer">{job.customer}</span>
          <span className="dashboard-job-route"><span><MapPin size={16} /><span><small>รับสินค้า</small><strong>{job.pickupLocation}</strong></span></span><span><MapPin size={16} /><span><small>ส่งสินค้า</small><strong>{job.deliveryLocation}</strong></span></span></span>
          <span className="dashboard-job-assignment"><span><UserRound size={15} />{job.driverName || "ยังไม่ระบุคนขับ"}</span><span><Truck size={15} />{job.vehiclePlate || "ยังไม่ระบุรถ"}</span></span>
          {needsAttention(job) && <span className="dashboard-job-alert"><AlertTriangle size={14} />{job.alerts[0] || "งานนี้มีปัญหา กรุณาตรวจสอบ"}</span>}
          <span className="dashboard-job-footer"><span><Clock3 size={14} /> {job.status === "cancelled" ? "ยกเลิก" : "ETA"} {job.status === "cancelled" ? (job.cancelledAt ? new Date(job.cancelledAt).toLocaleDateString("th-TH") : "—") : job.eta || "—"}</span>{interactiveCard && <span>ดูรายละเอียด<ArrowRight size={16} /></span>}{!deleted && filter === "cancelled" && <button type="button" className="dashboard-detail-link" onClick={() => onSelectJob(job.id)}>ดูรายละเอียด <ArrowRight size={16} /></button>}</span>
          {filter === "cancelled" && onPermanentlyDelete && <div className="dashboard-delete-area">{confirmJobId !== job.id ? <button type="button" className="dashboard-delete-button" onClick={() => { setConfirmJobId(job.id); setConfirmation(""); setDeleteError(""); }}><Trash2 size={15} /> ลบใบงานถาวร</button> : <div className="dashboard-delete-confirm"><strong>ลบ {job.workOrder} ถาวร?</strong><p>ใบงาน รูปหลักฐาน ลายเซ็น ตำแหน่ง และลิงก์ติดตามจะถูกลบและกู้คืนจากระบบไม่ได้</p><label>พิมพ์เลขใบงานเพื่อยืนยัน<input value={confirmation} onChange={event => setConfirmation(event.target.value)} placeholder={job.workOrder} autoComplete="off" /></label>{deleteError && <p role="alert">{deleteError}</p>}<div><button type="button" disabled={Boolean(deletingId)} onClick={() => { setConfirmJobId(""); setConfirmation(""); setDeleteError(""); }}>ยกเลิก</button><button type="button" className="danger" disabled={confirmation !== job.workOrder || Boolean(deletingId)} onClick={() => void permanentlyDelete(job)}>{deletingId === job.id ? "กำลังลบ…" : "ยืนยันลบถาวร"}</button></div></div>}</div>}
        </Card>; })}</div><div className="dashboard-pagination"><span>แสดง {(currentPage - 1) * pageSize + 1}–{Math.min(currentPage * pageSize, shown.length)} จาก {shown.length} งาน</span>{pages > 1 && <div><button aria-label="หน้าก่อนหน้า" disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)}><ChevronLeft size={18} /></button><span>{currentPage} / {pages}</span><button aria-label="หน้าถัดไป" disabled={currentPage === pages} onClick={() => setPage(currentPage + 1)}><ChevronRight size={18} /></button></div>}</div></>}
    </section>
  </section>;
}
