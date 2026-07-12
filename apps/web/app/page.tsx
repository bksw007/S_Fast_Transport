"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
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

type DriverScreen = (typeof driverMenu)[number];
type AdminScreen = (typeof adminMenu)[number];

const googleMapsApiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
let googleMapsLoader: Promise<void> | null = null;

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
  const [driverScreen, setDriverScreen] = useState<DriverScreen>(driverMenu[1]);
  const [adminScreen, setAdminScreen] = useState<AdminScreen>(adminMenu[1]);

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
            <Image className="brand-logo" src="/icons/truck-logo.png" alt="S Fast Transport" width={48} height={48} />
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

        <SectionMenu
          mode={mode}
          driverScreen={driverScreen}
          adminScreen={adminScreen}
          onDriverScreenChange={setDriverScreen}
          onAdminScreenChange={setAdminScreen}
        />

        {mode === "driver" ? (
          <DriverMobileScreen
            screen={driverScreen}
            jobs={activeJobs}
            selectedJob={selectedJob}
            selectedJobId={selectedJob.id}
            canWrite={canWrite}
            onSelectJob={setSelectedJobId}
            onAction={(status) => runAction((actor) => updateJobStatus(selectedJob, status, actor))}
            onUpload={(file) => runAction((actor) => uploadProof(selectedJob, file, actor))}
          />
        ) : (
          <AdminMobileScreen
            screen={adminScreen}
            activeJobs={activeJobs}
            selectedJob={selectedJob}
            selectedJobId={selectedJob.id}
            onSelectJob={setSelectedJobId}
            onCreateJob={(draft) => runAction((actor) => createJob(draft, actor))}
            onSeed={() => runAction(seedSampleJobs)}
            canWrite={canWrite}
          />
        )}

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

const driverMenuDetails = [
  { label: driverMenu[0], description: "รายการใบงาน", icon: ListChecks },
  { label: driverMenu[1], description: "สถานะงานปัจจุบัน", icon: Truck },
  { label: driverMenu[2], description: "ตำแหน่งและเส้นทาง", icon: MapPin },
  { label: driverMenu[3], description: "รูปและเอกสาร POD", icon: FileImage }
] as const;

const adminMenuDetails = [
  { label: adminMenu[0], description: "ภาพรวมวันนี้", icon: Gauge },
  { label: adminMenu[1], description: "ติดตามรถแบบสด", icon: MapPin },
  { label: adminMenu[2], description: "สร้างและจัดการงาน", icon: ListChecks },
  { label: adminMenu[3], description: "ดูรถทั้งหมดบนแผนที่", icon: Route }
] as const;

function SectionMenu({
  mode,
  driverScreen,
  adminScreen,
  onDriverScreenChange,
  onAdminScreenChange
}: {
  mode: "driver" | "admin";
  driverScreen: DriverScreen;
  adminScreen: AdminScreen;
  onDriverScreenChange: (screen: DriverScreen) => void;
  onAdminScreenChange: (screen: AdminScreen) => void;
}) {
  const items = mode === "driver" ? driverMenuDetails : adminMenuDetails;
  const activeScreen = mode === "driver" ? driverScreen : adminScreen;

  return (
    <nav className="section-menu" aria-label={mode === "driver" ? "เมนูคนขับ" : "เมนูผู้ดูแล"}>
      <div className="section-menu-heading">
        <span>เมนูหลัก</span>
        <small>{mode === "driver" ? "สำหรับคนขับ" : "สำหรับผู้ดูแล"}</small>
      </div>
      <div className="section-menu-grid">
        {items.map((item) => {
          const Icon = item.icon;
          const selected = activeScreen === item.label;

          return (
            <button
              key={item.label}
              className={selected ? "selected" : ""}
              aria-current={selected ? "page" : undefined}
              onClick={() => {
                if (mode === "driver") {
                  onDriverScreenChange(item.label as DriverScreen);
                } else {
                  onAdminScreenChange(item.label as AdminScreen);
                }
              }}
            >
              <span className="section-menu-icon"><Icon size={19} /></span>
              <span className="section-menu-copy">
                <strong>{item.label}</strong>
                <small>{item.description}</small>
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}

function DriverMobileScreen({
  screen,
  jobs,
  selectedJob,
  selectedJobId,
  canWrite,
  onSelectJob,
  onAction,
  onUpload
}: {
  screen: DriverScreen;
  jobs: TransportJob[];
  selectedJob: TransportJob;
  selectedJobId: string;
  canWrite: boolean;
  onSelectJob: (jobId: string) => void;
  onAction: (status: JobStatus) => void;
  onUpload: (file: File) => void;
}) {
  if (screen === "งานวันนี้") {
    return <TodayJobs jobs={jobs} selectedJobId={selectedJobId} onSelectJob={onSelectJob} />;
  }

  if (screen === "แผนที่งานของฉัน") {
    return <MapScreen jobs={jobs} selectedJob={selectedJob} selectedJobId={selectedJobId} onSelectJob={onSelectJob} />;
  }

  if (screen === "อัปเดตหลักฐาน") {
    return <ProofScreen job={selectedJob} canWrite={canWrite} onUpload={onUpload} />;
  }

  return <DriverView job={selectedJob} canWrite={canWrite} onAction={onAction} />;
}

function AdminMobileScreen({
  screen,
  activeJobs,
  selectedJob,
  selectedJobId,
  onSelectJob,
  onCreateJob,
  onSeed,
  canWrite
}: {
  screen: AdminScreen;
  activeJobs: TransportJob[];
  selectedJob: TransportJob;
  selectedJobId: string;
  onSelectJob: (jobId: string) => void;
  onCreateJob: (draft: JobDraft) => void;
  onSeed: () => void;
  canWrite: boolean;
}) {
  if (screen === "Dashboard") {
    return <AdminDashboard activeJobs={activeJobs} selectedJobId={selectedJobId} onSelectJob={onSelectJob} />;
  }

  if (screen === "Jobs / ใบงาน") {
    return (
      <AdminView
        activeJobs={activeJobs}
        selectedJobId={selectedJobId}
        onSelectJob={onSelectJob}
        onCreateJob={onCreateJob}
        onSeed={onSeed}
        canWrite={canWrite}
      />
    );
  }

  return <MapScreen jobs={activeJobs} selectedJob={selectedJob} selectedJobId={selectedJobId} onSelectJob={onSelectJob} />;
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
      <div className="login-backdrop" aria-hidden="true" />
      <section className="login-card">
        <div className="login-brand">
          <Image className="login-logo" src="/icons/truck-logo.png" alt="S Fast Transport" width={72} height={72} priority />
          <div>
            <strong>S Fast Transport</strong>
            <span>Transport Control Center</span>
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
            <button className="login-primary" type="button" onClick={() => submit("login")}>เข้าสู่ระบบ</button>
            <button className="login-secondary" type="button" onClick={() => submit("signup")}>สมัคร driver</button>
          </div>
          <button className="google-button" type="button" onClick={signInWithGoogle}>
            <GoogleLogo />
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

function GoogleLogo() {
  return (
    <svg className="google-logo" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.1c-.22-.66-.35-1.36-.35-2.1s.13-1.44.35-2.1V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l3.66-2.84z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06L5.84 9.9C6.71 7.3 9.14 5.38 12 5.38z"
      />
    </svg>
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

function TodayJobs({
  jobs,
  selectedJobId,
  onSelectJob
}: {
  jobs: TransportJob[];
  selectedJobId: string;
  onSelectJob: (jobId: string) => void;
}) {
  return (
    <section className="screen">
      <div className="section-title">
        <div>
          <h1>งานวันนี้</h1>
          <p>เลือกใบงานเพื่อดูรายละเอียดและอัปเดตสถานะ</p>
        </div>
        <span className="live-dot">{jobs.length} งาน</span>
      </div>

      <div className="job-list">
        {jobs.map((job) => (
          <button
            key={job.id}
            className={`job-row ${job.id === selectedJobId ? "selected-job" : ""}`}
            onClick={() => onSelectJob(job.id)}
          >
            <div className="job-row-main">
              <strong>{job.workOrder}</strong>
              <span>{job.customer}</span>
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

function MapScreen({
  jobs,
  selectedJob,
  selectedJobId,
  onSelectJob
}: {
  jobs: TransportJob[];
  selectedJob: TransportJob;
  selectedJobId: string;
  onSelectJob: (jobId: string) => void;
}) {
  return (
    <section className="screen">
      <div className="section-title">
        <div>
          <h1>Live Tracking</h1>
          <p>{selectedJob.workOrder} · {selectedJob.vehiclePlate}</p>
        </div>
        <span className={selectedJob.alerts.length ? "status danger" : "status"}>{statusLabels[selectedJob.status]}</span>
      </div>

      <GoogleLiveMap jobs={jobs} selectedJobId={selectedJobId} onSelectJob={onSelectJob} />

      <article className="job-card">
        <div className="job-card-head">
          <div>
            <span className="label">ตำแหน่งล่าสุด</span>
            <h2>{selectedJob.driverName}</h2>
          </div>
          <strong>{selectedJob.currentLocation.speed} กม./ชม.</strong>
        </div>
        <div className="route-block">
          <RoutePoint title="รับสินค้า" value={selectedJob.pickupLocation} />
          <RoutePoint title="ส่งสินค้า" value={selectedJob.deliveryLocation} />
        </div>
      </article>
    </section>
  );
}

function ProofScreen({
  job,
  canWrite,
  onUpload
}: {
  job: TransportJob;
  canWrite: boolean;
  onUpload: (file: File) => void;
}) {
  return (
    <section className="screen">
      <div className="section-title">
        <div>
          <h1>อัปเดตหลักฐาน</h1>
          <p>{job.workOrder} · {job.customer}</p>
        </div>
        <span className="status">{statusLabels[job.status]}</span>
      </div>

      <article className="job-card proof-card">
        <FileImage size={28} />
        <div>
          <span className="label">POD / รูปหน้างาน</span>
          <h2>แนบไฟล์หลักฐานส่งของ</h2>
          <p>รองรับรูปภาพและ PDF สำหรับใบงานที่เลือกอยู่</p>
        </div>
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

      <article className="privacy-card">
        <CheckCircle2 size={20} />
        <div>
          <strong>ไฟล์จะถูกผูกกับใบงานนี้</strong>
          <p>เลือกงานอื่นจากเมนูงานวันนี้ก่อน หากต้องการอัปโหลดให้ใบงานอื่น</p>
        </div>
      </article>
    </section>
  );
}

function AdminDashboard({
  activeJobs,
  selectedJobId,
  onSelectJob
}: {
  activeJobs: TransportJob[];
  selectedJobId: string;
  onSelectJob: (jobId: string) => void;
}) {
  const alertCount = activeJobs.reduce((count, job) => count + job.alerts.length, 0);
  const completedCount = activeJobs.filter((job) => job.status === "completed").length;

  return (
    <section className="screen">
      <div className="section-title">
        <div>
          <h1>Dashboard</h1>
          <p>ภาพรวมงานขนส่งวันนี้</p>
        </div>
        <span className="live-dot">Today</span>
      </div>

      <div className="stat-strip dashboard-stats">
        <Metric icon={<Truck size={18} />} label="งาน active" value={`${activeJobs.length}`} />
        <Metric icon={<AlertTriangle size={18} />} label="แจ้งเตือน" value={`${alertCount}`} />
        <Metric icon={<CheckCircle2 size={18} />} label="ปิดงานแล้ว" value={`${completedCount}`} />
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
              <small>{job.customer}</small>
            </div>
            <div className="job-row-side">
              <span className={job.alerts.length ? "status danger" : "status"}>{statusLabels[job.status]}</span>
              <b>{job.lastUpdatedMinutes} นาที</b>
            </div>
          </button>
        ))}
      </div>
    </section>
  );
}

function GoogleLiveMap({
  jobs,
  selectedJobId,
  onSelectJob
}: {
  jobs: TransportJob[];
  selectedJobId: string;
  onSelectJob: (jobId: string) => void;
}) {
  const mapElementRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const markersRef = useRef<google.maps.Marker[]>([]);
  const [mapMessage, setMapMessage] = useState("");

  const validJobs = useMemo(
    () => jobs.filter((job) => Number.isFinite(job.currentLocation.lat) && Number.isFinite(job.currentLocation.lng)),
    [jobs]
  );

  useEffect(() => {
    if (!googleMapsApiKey || !mapElementRef.current) {
      return;
    }

    let cancelled = false;

    loadGoogleMaps(googleMapsApiKey)
      .then(() => {
        if (cancelled || !mapElementRef.current) {
          return;
        }

        const mapsApi = window.google;
        const center = getMapCenter(validJobs);

        if (!mapRef.current) {
          mapRef.current = new mapsApi.maps.Map(mapElementRef.current, {
            center,
            zoom: validJobs.length > 1 ? 10 : 13,
            mapTypeControl: false,
            streetViewControl: false,
            fullscreenControl: false,
            clickableIcons: false
          });
        } else {
          mapRef.current.setCenter(center);
        }

        markersRef.current.forEach((marker) => marker.setMap(null));
        markersRef.current = validJobs.map((job) => {
          const marker = new mapsApi.maps.Marker({
            map: mapRef.current,
            position: { lat: job.currentLocation.lat, lng: job.currentLocation.lng },
            title: `${job.workOrder} · ${job.driverName}`,
            label: {
              text: job.alerts.length ? "!" : "T",
              color: "#ffffff",
              fontWeight: "900"
            },
            icon: {
              path: mapsApi.maps.SymbolPath.CIRCLE,
              scale: job.id === selectedJobId ? 15 : 12,
              fillColor: job.alerts.length ? "#e69b19" : "#0f8f8c",
              fillOpacity: 1,
              strokeColor: "#ffffff",
              strokeWeight: 3
            }
          });

          marker.addListener("click", () => onSelectJob(job.id));
          return marker;
        });

        if (validJobs.length > 1) {
          const bounds = new mapsApi.maps.LatLngBounds();
          validJobs.forEach((job) => bounds.extend({ lat: job.currentLocation.lat, lng: job.currentLocation.lng }));
          mapRef.current.fitBounds(bounds, 56);
        }
      })
      .catch((error) => setMapMessage(toMessage(error)));

    return () => {
      cancelled = true;
    };
  }, [validJobs, selectedJobId, onSelectJob]);

  if (!googleMapsApiKey) {
    return (
      <FallbackMap jobs={jobs} onSelectJob={onSelectJob} message="เพิ่ม NEXT_PUBLIC_GOOGLE_MAPS_API_KEY เพื่อเปิด Google Maps จริง" />
    );
  }

  return (
    <div className="map-card has-real-map">
      <div ref={mapElementRef} className="google-map" />
      {mapMessage && <div className="map-message">{mapMessage}</div>}
    </div>
  );
}

function FallbackMap({
  jobs,
  onSelectJob,
  message
}: {
  jobs: TransportJob[];
  onSelectJob: (jobId: string) => void;
  message: string;
}) {
  return (
    <div className="map-card">
      <div className="map-grid" />
      <div className="map-message">{message}</div>
      {jobs.slice(0, 3).map((job, index) => (
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

      <GoogleLiveMap jobs={activeJobs} selectedJobId={selectedJobId} onSelectJob={onSelectJob} />

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

function getMapCenter(jobs: TransportJob[]) {
  if (!jobs.length) {
    return { lat: 13.7563, lng: 100.5018 };
  }

  return {
    lat: jobs.reduce((sum, job) => sum + job.currentLocation.lat, 0) / jobs.length,
    lng: jobs.reduce((sum, job) => sum + job.currentLocation.lng, 0) / jobs.length
  };
}

function loadGoogleMaps(apiKey: string) {
  if (window.google?.maps) {
    return Promise.resolve();
  }

  if (googleMapsLoader) {
    return googleMapsLoader;
  }

  googleMapsLoader = new Promise<void>((resolve, reject) => {
    const existingScript = document.querySelector<HTMLScriptElement>("script[data-google-maps]");
    if (existingScript) {
      existingScript.addEventListener("load", () => resolve(), { once: true });
      existingScript.addEventListener("error", () => reject(new Error("โหลด Google Maps ไม่สำเร็จ")), { once: true });
      return;
    }

    const script = document.createElement("script");
    script.dataset.googleMaps = "true";
    script.async = true;
    script.defer = true;
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&v=weekly`;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("โหลด Google Maps ไม่สำเร็จ"));
    document.head.appendChild(script);
  });

  return googleMapsLoader;
}
