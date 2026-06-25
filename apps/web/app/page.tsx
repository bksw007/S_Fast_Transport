"use client";

import { useMemo, useState } from "react";
import {
  AlertTriangle,
  Bell,
  CheckCircle2,
  ChevronRight,
  CircleDot,
  Clock3,
  FileImage,
  Gauge,
  ListChecks,
  MapPin,
  Moon,
  Phone,
  Plus,
  QrCode,
  Route,
  Settings,
  Share2,
  Sun,
  TextCursorInput,
  Truck,
  UserRound
} from "lucide-react";
import {
  adminMenu,
  driverActions,
  driverMenu,
  sampleJobs,
  statusLabels,
  timelineEvents,
  type JobStatus
} from "@s-fast-transport/shared";

const statusOrder: JobStatus[] = [
  "assigned",
  "accepted",
  "to_pickup",
  "arrived_pickup",
  "loading",
  "to_delivery",
  "arrived_delivery",
  "unloading",
  "ready_to_close",
  "completed"
];

export default function Home() {
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [fontScale, setFontScale] = useState(1);
  const [mode, setMode] = useState<"driver" | "admin">("driver");
  const [activeAction, setActiveAction] = useState("to_delivery");
  const selectedJob = sampleJobs[0];
  const activeJobs = useMemo(() => sampleJobs.filter((job) => job.trackingEnabled), []);

  return (
    <main className="app-shell" data-theme={theme} style={{ "--font-scale": fontScale } as React.CSSProperties}>
      <section className="phone-frame">
        <header className="topbar">
          <div className="brand">
            <span className="brand-mark">S</span>
            <div>
              <strong>S Fast Transport</strong>
              <span>Real-time job tracking</span>
            </div>
          </div>
          <div className="top-actions">
            <button aria-label="ลดขนาดอักษร" onClick={() => setFontScale((value) => Math.max(0.92, value - 0.08))}>
              <TextCursorInput size={18} />
            </button>
            <button aria-label="เปลี่ยนธีม" onClick={() => setTheme(theme === "light" ? "dark" : "light")}>
              {theme === "light" ? <Moon size={18} /> : <Sun size={18} />}
            </button>
          </div>
        </header>

        <div className="mode-switch" role="tablist" aria-label="เลือกโหมด">
          <button className={mode === "driver" ? "selected" : ""} onClick={() => setMode("driver")}>
            <Truck size={17} />
            Driver
          </button>
          <button className={mode === "admin" ? "selected" : ""} onClick={() => setMode("admin")}>
            <Gauge size={17} />
            Admin
          </button>
        </div>

        {mode === "driver" ? (
          <DriverView activeAction={activeAction} setActiveAction={setActiveAction} />
        ) : (
          <AdminView activeJobs={activeJobs} />
        )}

        <nav className="bottom-nav" aria-label="เมนูหลัก">
          {(mode === "driver" ? driverMenu.slice(0, 4) : adminMenu.slice(0, 4)).map((item, index) => (
            <button key={item} className={index === 1 ? "selected" : ""}>
              {index === 0 && <ListChecks size={18} />}
              {index === 1 && <MapPin size={18} />}
              {index === 2 && <Route size={18} />}
              {index === 3 && <FileImage size={18} />}
              <span>{item}</span>
            </button>
          ))}
        </nav>
      </section>

      <aside className="desktop-panel">
        <AdminView activeJobs={activeJobs} compact={false} />
        <JobDetail job={selectedJob} />
      </aside>
    </main>
  );
}

function DriverView({
  activeAction,
  setActiveAction
}: {
  activeAction: string;
  setActiveAction: (value: string) => void;
}) {
  const selectedJob = sampleJobs[0];
  const currentStep = statusOrder.indexOf(selectedJob.status);

  return (
    <section className="screen">
      <div className="section-title">
        <div>
          <h1>กำลังขนส่ง</h1>
          <p>{selectedJob.workOrder} · {selectedJob.vehiclePlate}</p>
        </div>
        <span className="live-dot">Live</span>
      </div>

      <article className="job-card primary">
        <div className="job-card-head">
          <div>
            <span className="label">ลูกค้า</span>
            <h2>{selectedJob.customer}</h2>
          </div>
          <button aria-label="โทรหาผู้เกี่ยวข้อง">
            <Phone size={18} />
          </button>
        </div>
        <div className="route-block">
          <RoutePoint title="รับสินค้า" value={selectedJob.pickupLocation} />
          <RoutePoint title="ส่งสินค้า" value={selectedJob.deliveryLocation} />
        </div>
        <div className="metric-row">
          <Metric icon={<Clock3 size={18} />} label="ETA" value={selectedJob.eta} />
          <Metric icon={<Gauge size={18} />} label="Speed" value={`${selectedJob.currentLocation.speed} กม./ชม.`} />
          <Metric icon={<MapPin size={18} />} label="อัปเดต" value={`${selectedJob.lastUpdatedMinutes} นาที`} />
        </div>
      </article>

      <div className="progress-card">
        {statusOrder.slice(0, 10).map((status, index) => (
          <span key={status} className={index <= currentStep ? "done" : ""} title={statusLabels[status]} />
        ))}
      </div>

      <div className="action-grid">
        {driverActions.map((action) => (
          <button
            key={action.id}
            className={activeAction === action.id ? "active" : ""}
            onClick={() => setActiveAction(action.id)}
          >
            {action.id === "completed" ? <CheckCircle2 size={20} /> : <CircleDot size={20} />}
            {action.label}
          </button>
        ))}
      </div>

      <article className="privacy-card">
        <Bell size={20} />
        <div>
          <strong>ติดตามเฉพาะงานนี้เท่านั้น</strong>
          <p>ระบบหยุดแชร์ตำแหน่งอัตโนมัติเมื่อกดจบงาน</p>
        </div>
      </article>
    </section>
  );
}

function AdminView({ activeJobs, compact = true }: { activeJobs: typeof sampleJobs; compact?: boolean }) {
  return (
    <section className={compact ? "screen" : "admin-wide"}>
      <div className="section-title">
        <div>
          <h1>Live Tracking</h1>
          <p>ติดตามรถตามใบงานแบบ Real-time</p>
        </div>
        <button className="icon-text">
          <Plus size={17} />
          งานใหม่
        </button>
      </div>

      <div className="map-card">
        <div className="map-grid" />
        {activeJobs.map((job, index) => (
          <span
            key={job.id}
            className={`vehicle-pin pin-${index + 1} ${job.alerts.length ? "warning" : ""}`}
            aria-label={job.id}
          >
            <Truck size={18} />
          </span>
        ))}
      </div>

      <div className="stat-strip">
        <Metric icon={<Truck size={18} />} label="กำลังวิ่ง" value="18" />
        <Metric icon={<AlertTriangle size={18} />} label="แจ้งเตือน" value="3" />
        <Metric icon={<Clock3 size={18} />} label="ส่งช้า" value="2" />
      </div>

      <div className="job-list">
        {activeJobs.map((job) => (
          <article key={job.id} className="job-row">
            <div className="job-row-main">
              <strong>{job.workOrder}</strong>
              <span>{job.driverName} · {job.vehiclePlate}</span>
              <small>{job.pickupLocation} → {job.deliveryLocation}</small>
            </div>
            <div className="job-row-side">
              <span className={job.alerts.length ? "status danger" : "status"}>{statusLabels[job.status]}</span>
              <b>ETA {job.eta}</b>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function JobDetail({ job }: { job: typeof sampleJobs[number] }) {
  return (
    <section className="detail-panel">
      <div className="detail-head">
        <div>
          <h2>{job.id}</h2>
          <p>{job.customer}</p>
        </div>
        <div className="detail-actions">
          <button><Share2 size={18} /> Share</button>
          <button><QrCode size={18} /> QR</button>
          <button><Settings size={18} /></button>
        </div>
      </div>

      <div className="tabs">
        {["รายละเอียดงาน", "หลักฐาน", "ตำแหน่งปัจจุบัน", "ประวัติเส้นทาง", "Timeline เหตุการณ์"].map((tab, index) => (
          <button key={tab} className={index === 4 ? "selected" : ""}>{tab}</button>
        ))}
      </div>

      <div className="detail-grid">
        <article>
          <span className="label">Driver</span>
          <strong>{job.driverName}</strong>
          <p>{job.driverPhone}</p>
        </article>
        <article>
          <span className="label">Tracking</span>
          <strong>{job.trackingEnabled ? "กำลังแชร์ตำแหน่ง" : "หยุดแชร์"}</strong>
          <p>ล่าสุด {job.lastUpdatedMinutes} นาทีที่แล้ว</p>
        </article>
        <article>
          <span className="label">POD</span>
          <strong>รูปต้นทาง 3 รูป</strong>
          <p>รอลายเซ็นผู้รับปลายทาง</p>
        </article>
      </div>

      <div className="timeline">
        {timelineEvents.map((event) => (
          <article key={event.id}>
            <time>{event.time}</time>
            <span />
            <div>
              <strong>{event.title}</strong>
              <p>{event.detail}</p>
              <small>{event.actor}</small>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function RoutePoint({ title, value }: { title: string; value: string }) {
  return (
    <div className="route-point">
      <MapPin size={18} />
      <div>
        <span>{title}</span>
        <strong>{value}</strong>
      </div>
    </div>
  );
}

function Metric({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="metric">
      {icon}
      <div>
        <span>{label}</span>
        <strong>{value}</strong>
      </div>
    </div>
  );
}
