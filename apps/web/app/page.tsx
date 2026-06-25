"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Bell,
  CheckCircle2,
  CircleDot,
  Clock3,
  FileImage,
  Gauge,
  ListChecks,
  LogOut,
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
  Truck
} from "lucide-react";
import {
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  type User
} from "firebase/auth";
import {
  adminMenu,
  driverActions,
  driverMenu,
  sampleJobs,
  statusLabels,
  timelineEvents,
  type JobStatus,
  type TransportJob
} from "@s-fast-transport/shared";
import { auth } from "@/lib/firebase";
import {
  createJob,
  ensureDriverProfile,
  getUserProfile,
  seedSampleJobs,
  subscribeTodayJobs,
  updateJobStatus,
  uploadProof,
  type JobDraft,
  type UserProfile
} from "@/lib/transport-repository";

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

const emptyJobDraft: JobDraft = {
  customer: "",
  driverName: "",
  driverPhone: "",
  vehiclePlate: "",
  pickupLocation: "",
  deliveryLocation: "",
  eta: ""
};

export default function Home() {
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [fontScale, setFontScale] = useState(1);
  const [mode, setMode] = useState<"driver" | "admin">("driver");
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [jobs, setJobs] = useState<TransportJob[]>(sampleJobs);
  const [selectedJobId, setSelectedJobId] = useState(sampleJobs[0]?.id ?? "");
  const [firebaseMessage, setFirebaseMessage] = useState("ใช้ข้อมูลตัวอย่างจนกว่าจะล็อกอินและอ่าน Firestore ได้");
  const [busyMessage, setBusyMessage] = useState("");

  useEffect(() => {
    return onAuthStateChanged(auth, async (nextUser) => {
      setUser(nextUser);
      setProfile(null);
      setAuthReady(false);

      if (!nextUser) {
        setJobs(sampleJobs);
        setFirebaseMessage("ยังไม่ได้ล็อกอิน: แสดงข้อมูลตัวอย่าง");
        setAuthReady(true);
        return;
      }

      try {
        await ensureDriverProfile(nextUser.uid, nextUser.email ?? "", nextUser.displayName ?? "");
        const nextProfile = await getUserProfile(nextUser.uid);
        setProfile(nextProfile);
        setFirebaseMessage(nextProfile ? `ล็อกอินเป็น ${nextProfile.role}` : "ล็อกอินแล้ว แต่ยังไม่พบโปรไฟล์");
      } catch (error) {
        setFirebaseMessage(toMessage(error));
      } finally {
        setAuthReady(true);
      }
    });
  }, []);

  useEffect(() => {
    if (!user || !profile) {
      return;
    }

    return subscribeTodayJobs(
      profile,
      (nextJobs) => {
        setJobs(nextJobs);
        setSelectedJobId((current) => current || nextJobs[0]?.id || "");
      },
      (message) => setFirebaseMessage(`อ่าน Firestore ไม่สำเร็จ: ${message}`)
    );
  }, [user, profile]);

  const selectedJob = useMemo(
    () => jobs.find((job) => job.id === selectedJobId) ?? jobs[0] ?? sampleJobs[0],
    [jobs, selectedJobId]
  );
  const activeJobs = useMemo(() => jobs.filter((job) => job.trackingEnabled || job.status !== "completed"), [jobs]);
  const canWrite = Boolean(profile && ["owner", "admin", "dispatcher", "driver"].includes(profile.role));

  async function runAction(action: (actor: UserProfile) => Promise<void>) {
    if (!profile) {
      setFirebaseMessage("กรุณาล็อกอินก่อนใช้งานจริง");
      return;
    }

    setBusyMessage("กำลังบันทึก...");
    try {
      await action(profile);
      setFirebaseMessage("บันทึกสำเร็จ");
    } catch (error) {
      setFirebaseMessage(toMessage(error));
    } finally {
      setBusyMessage("");
    }
  }

  if (!authReady || !user) {
    return <LoginScreen authReady={authReady} />;
  }

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

        <UserBadge user={user} profile={profile} />

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

        <StatusBar message={busyMessage || firebaseMessage} />

        {mode === "driver" ? (
          <DriverView
            job={selectedJob}
            canWrite={canWrite}
            onAction={(status) => runAction((actor) => updateJobStatus(selectedJob, status, actor))}
          />
        ) : (
          <AdminView
            activeJobs={activeJobs}
            selectedJobId={selectedJob.id}
            onSelectJob={setSelectedJobId}
            onCreateJob={(draft) => runAction((actor) => createJob(draft, actor))}
            onSeed={() => runAction(seedSampleJobs)}
            canWrite={canWrite}
          />
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
        <AdminView
          activeJobs={activeJobs}
          selectedJobId={selectedJob.id}
          onSelectJob={setSelectedJobId}
          onCreateJob={(draft) => runAction((actor) => createJob(draft, actor))}
          onSeed={() => runAction(seedSampleJobs)}
          canWrite={canWrite}
          compact={false}
        />
        <JobDetail
          job={selectedJob}
          canWrite={canWrite}
          onUpload={(file) => runAction((actor) => uploadProof(selectedJob, file, actor))}
        />
      </aside>
    </main>
  );
}

function LoginScreen({ authReady }: { authReady: boolean }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [message, setMessage] = useState("");

  async function submit(kind: "login" | "signup") {
    setMessage("กำลังตรวจสอบ...");
    try {
      if (kind === "signup") {
        const credential = await createUserWithEmailAndPassword(auth, email, password);
        await ensureDriverProfile(credential.user.uid, credential.user.email ?? email, displayName || email);
      } else {
        await signInWithEmailAndPassword(auth, email, password);
      }
      setMessage("สำเร็จ");
    } catch (error) {
      setMessage(toMessage(error));
    }
  }

  async function signInWithGoogle() {
    setMessage("กำลังเปิด Google...");
    try {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: "select_account" });
      const credential = await signInWithPopup(auth, provider);
      await ensureDriverProfile(
        credential.user.uid,
        credential.user.email ?? "",
        credential.user.displayName ?? credential.user.email ?? ""
      );
      setMessage("สำเร็จ");
    } catch (error) {
      setMessage(toMessage(error));
    }
  }

  return (
    <main className="login-shell">
      <section className="login-card">
        <div className="login-brand">
          <span className="brand-mark">S</span>
          <div>
            <strong>S Fast Transport</strong>
            <span>ระบบติดตามงานขนส่งแบบ Real-time</span>
          </div>
        </div>

        <div className="login-copy">
          <h1>เข้าสู่ระบบก่อนใช้งาน</h1>
          <p>จัดการใบงาน ติดตามรถ อัปเดตสถานะ และแนบหลักฐานส่งของในที่เดียว</p>
        </div>

        <form className="login-form" onSubmit={(event) => event.preventDefault()}>
          <input
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="อีเมล"
            type="email"
            autoComplete="email"
          />
          <input
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="รหัสผ่าน"
            type="password"
            autoComplete="current-password"
          />
          <input
            value={displayName}
            onChange={(event) => setDisplayName(event.target.value)}
            placeholder="ชื่อสำหรับสมัคร driver"
            autoComplete="name"
          />
          <div className="auth-actions">
            <button type="button" onClick={() => submit("login")}>เข้าสู่ระบบ</button>
            <button type="button" onClick={() => submit("signup")}>สมัคร driver</button>
          </div>
          <button className="google-button" type="button" onClick={signInWithGoogle}>
            <span>G</span>
            เข้าสู่ระบบด้วย Google
          </button>
        </form>

        <div className="login-footnote">
          {!authReady ? "กำลังตรวจสอบ session..." : message || "บัญชีใหม่จะเริ่มต้นเป็น driver และสามารถเปลี่ยน role เป็น admin ได้ใน Firestore"}
        </div>
      </section>
    </main>
  );
}

function UserBadge({ user, profile }: { user: User; profile: UserProfile | null }) {
  return (
    <section className="auth-card signed-in">
      <div>
        <strong>{profile?.displayName || user.displayName || user.email}</strong>
        <span>{profile?.role || "กำลังโหลด role"}</span>
      </div>
      <button onClick={() => signOut(auth)} aria-label="ออกจากระบบ">
        <LogOut size={17} />
      </button>
    </section>
  );
}

function StatusBar({ message }: { message: string }) {
  return (
    <div className="sync-bar">
      <Bell size={16} />
      <span>{message}</span>
    </div>
  );
}

function DriverView({
  job,
  canWrite,
  onAction
}: {
  job: TransportJob;
  canWrite: boolean;
  onAction: (status: JobStatus) => void;
}) {
  const currentStep = Math.max(0, statusOrder.indexOf(job.status));

  return (
    <section className="screen">
      <div className="section-title">
        <div>
          <h1>กำลังขนส่ง</h1>
          <p>{job.workOrder} · {job.vehiclePlate}</p>
        </div>
        <span className="live-dot">{job.trackingEnabled ? "Live" : "Standby"}</span>
      </div>

      <article className="job-card primary">
        <div className="job-card-head">
          <div>
            <span className="label">ลูกค้า</span>
            <h2>{job.customer}</h2>
          </div>
          <a className="round-link" aria-label="โทรหาผู้เกี่ยวข้อง" href={`tel:${job.driverPhone}`}>
            <Phone size={18} />
          </a>
        </div>
        <div className="route-block">
          <RoutePoint title="รับสินค้า" value={job.pickupLocation} />
          <RoutePoint title="ส่งสินค้า" value={job.deliveryLocation} />
        </div>
        <div className="metric-row">
          <Metric icon={<Clock3 size={18} />} label="ETA" value={job.eta} />
          <Metric icon={<Gauge size={18} />} label="Speed" value={`${job.currentLocation.speed} กม./ชม.`} />
          <Metric icon={<MapPin size={18} />} label="สถานะ" value={statusLabels[job.status]} />
        </div>
      </article>

      <div className="progress-card">
        {statusOrder.slice(0, 10).map((status, index) => (
          <span key={status} className={index <= currentStep ? "done" : ""} title={statusLabels[status]} />
        ))}
      </div>

      <div className="action-grid">
        {driverActions.map((action) => (
          <button key={action.id} disabled={!canWrite} onClick={() => onAction(action.nextStatus)}>
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

function AdminView({
  activeJobs,
  selectedJobId,
  onSelectJob,
  onCreateJob,
  onSeed,
  canWrite,
  compact = true
}: {
  activeJobs: TransportJob[];
  selectedJobId: string;
  onSelectJob: (jobId: string) => void;
  onCreateJob: (draft: JobDraft) => void;
  onSeed: () => void;
  canWrite: boolean;
  compact?: boolean;
}) {
  const [draft, setDraft] = useState(emptyJobDraft);
  const alertCount = activeJobs.reduce((count, job) => count + job.alerts.length, 0);
  const delayedCount = activeJobs.filter((job) => job.alerts.some((alert) => alert.includes("ไม่อัปเดต"))).length;

  function updateDraft(field: keyof JobDraft, value: string) {
    setDraft((current) => ({ ...current, [field]: value }));
  }

  function submitJob() {
    const nextDraft = {
      ...draft,
      customer: draft.customer || "ลูกค้าใหม่",
      driverName: draft.driverName || "รอระบุคนขับ",
      driverPhone: draft.driverPhone || "-",
      vehiclePlate: draft.vehiclePlate || "-",
      pickupLocation: draft.pickupLocation || "จุดรับสินค้า",
      deliveryLocation: draft.deliveryLocation || "จุดส่งสินค้า",
      eta: draft.eta || "วันนี้"
    };
    onCreateJob(nextDraft);
    setDraft(emptyJobDraft);
  }

  return (
    <section className={compact ? "screen" : "admin-wide"}>
      <div className="section-title">
        <div>
          <h1>Live Tracking</h1>
          <p>ติดตามรถตามใบงานแบบ Real-time</p>
        </div>
        <button className="icon-text" onClick={onSeed} disabled={!canWrite}>
          <Plus size={17} />
          Seed
        </button>
      </div>

      <form className="job-form" onSubmit={(event) => event.preventDefault()}>
        <input value={draft.customer} onChange={(event) => updateDraft("customer", event.target.value)} placeholder="ลูกค้า" />
        <input value={draft.driverName} onChange={(event) => updateDraft("driverName", event.target.value)} placeholder="คนขับ" />
        <input value={draft.vehiclePlate} onChange={(event) => updateDraft("vehiclePlate", event.target.value)} placeholder="ทะเบียน" />
        <input value={draft.pickupLocation} onChange={(event) => updateDraft("pickupLocation", event.target.value)} placeholder="จุดรับ" />
        <input value={draft.deliveryLocation} onChange={(event) => updateDraft("deliveryLocation", event.target.value)} placeholder="จุดส่ง" />
        <input value={draft.eta} onChange={(event) => updateDraft("eta", event.target.value)} placeholder="ETA" />
        <button type="button" onClick={submitJob} disabled={!canWrite}>สร้างงาน</button>
      </form>

      <div className="map-card">
        <div className="map-grid" />
        {activeJobs.slice(0, 3).map((job, index) => (
          <button
            key={job.id}
            className={`vehicle-pin pin-${index + 1} ${job.alerts.length ? "warning" : ""}`}
            aria-label={job.id}
            onClick={() => onSelectJob(job.id)}
          >
            <Truck size={18} />
          </button>
        ))}
      </div>

      <div className="stat-strip">
        <Metric icon={<Truck size={18} />} label="กำลังวิ่ง" value={`${activeJobs.length}`} />
        <Metric icon={<AlertTriangle size={18} />} label="แจ้งเตือน" value={`${alertCount}`} />
        <Metric icon={<Clock3 size={18} />} label="ส่งช้า" value={`${delayedCount}`} />
      </div>

      <div className="job-list">
        {activeJobs.map((job) => (
          <button
            key={job.id}
            className={`job-row ${job.id === selectedJobId ? "selected-job" : ""}`}
            onClick={() => onSelectJob(job.id)}
          >
            <div className="job-row-main">
              <strong>{job.workOrder}</strong>
              <span>{job.driverName} · {job.vehiclePlate}</span>
              <small>{job.pickupLocation} → {job.deliveryLocation}</small>
            </div>
            <div className="job-row-side">
              <span className={job.alerts.length ? "status danger" : "status"}>{statusLabels[job.status]}</span>
              <b>ETA {job.eta}</b>
            </div>
          </button>
        ))}
      </div>
    </section>
  );
}

function JobDetail({
  job,
  canWrite,
  onUpload
}: {
  job: TransportJob;
  canWrite: boolean;
  onUpload: (file: File) => void;
}) {
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
          <p>ล่าสุด {job.currentLocation.updatedAt}</p>
        </article>
        <article>
          <span className="label">POD</span>
          <strong>แนบหลักฐานส่งของ</strong>
          <label className="upload-button">
            <FileImage size={17} />
            เลือกไฟล์
            <input
              type="file"
              accept="image/*,.pdf"
              disabled={!canWrite}
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) {
                  onUpload(file);
                  event.currentTarget.value = "";
                }
              }}
            />
          </label>
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

function toMessage(error: unknown) {
  return error instanceof Error ? error.message : "เกิดข้อผิดพลาด";
}
