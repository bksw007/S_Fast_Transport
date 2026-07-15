"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import {
  AlertTriangle,
  BarChart3,
  Bell,
  Building2,
  CheckCircle2,
  CircleDot,
  Clock3,
  FileImage,
  FilePenLine,
  Gauge,
  ListChecks,
  LogOut,
  MapPin,
  Menu,
  Moon,
  Phone,
  Plus,
  QrCode,
  RotateCcw,
  Save,
  Settings,
  ShieldAlert,
  Share2,
  Sun,
  TextCursorInput,
  Truck,
  UserRoundCog,
  Users,
  X
} from "lucide-react";
import {
  GoogleAuthProvider,
  onAuthStateChanged,
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
import { auth, ensureLocalAuthPersistence } from "@/lib/firebase";
import {
  createJob,
  createTrackingShareLink,
  ensureAccessProfile,
  getUserProfile,
  hasApprovedAccess,
  isMainAdmin,
  subscribeTodayJobs,
  subscribeUserProfiles,
  updateJobStatus,
  updateUserAccess,
  uploadProof,
  type JobDraft,
  type UserAccessUpdate,
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

function createEmptyJobDraft(): JobDraft {
  const today = new Date().toISOString().slice(0, 10);
  return {
    workOrder: `W${Date.now()}`,
    customer: "",
    jobDate: today,
    cargoType: "",
    vehicleType: "",
    tripCount: "1",
    driverName: "",
    driverPhone: "",
    vehiclePlate: "",
    assignedEmployee: "",
    pickupLocation: "",
    pickupDate: today,
    pickupTime: "",
    pickupContact: "",
    deliveryLocation: "",
    deliveryDate: today,
    deliveryTime: "",
    deliveryContact: "",
    eta: "",
    notes: ""
  };
}

type DriverScreen = (typeof driverMenu)[number];
type AdminScreen = (typeof adminMenu)[number];

const googleMapsApiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
let googleMapsLoader: Promise<void> | null = null;

export default function Home() {
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [fontScale, setFontScale] = useState(1);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [jobs, setJobs] = useState<TransportJob[]>([]);
  const [selectedJobId, setSelectedJobId] = useState("");
  const [firebaseMessage, setFirebaseMessage] = useState("กำลังโหลดข้อมูลจาก Firestore...");
  const [busyMessage, setBusyMessage] = useState("");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [driverScreen, setDriverScreen] = useState<DriverScreen>(driverMenu[0]);
  const [adminScreen, setAdminScreen] = useState<AdminScreen>(adminMenu[0]);

  useEffect(() => {
    let active = true;
    let unsubscribe = () => {};

    async function restoreAuthSession() {
      try {
        await ensureLocalAuthPersistence();
      } catch (error) {
        if (active) {
          setFirebaseMessage(`ไม่สามารถเก็บ session ถาวรได้: ${toMessage(error)}`);
        }
      }

      if (!active) return;

      unsubscribe = onAuthStateChanged(auth, async (nextUser) => {
        setUser(nextUser);
        setProfile(null);
        setAuthReady(false);

        if (!nextUser) {
          setJobs([]);
          setFirebaseMessage("ยังไม่ได้ล็อกอิน");
          setAuthReady(true);
          return;
        }

        try {
          await ensureAccessProfile(nextUser.uid, nextUser.email ?? "", nextUser.displayName ?? "");
          const nextProfile = await getUserProfile(nextUser.uid);
          if (!active) return;
          setProfile(nextProfile);
          setFirebaseMessage(nextProfile ? `ล็อกอินเป็น ${nextProfile.role}` : "ล็อกอินแล้ว แต่ยังไม่พบโปรไฟล์");
        } catch (error) {
          if (active) setFirebaseMessage(toMessage(error));
        } finally {
          if (active) setAuthReady(true);
        }
      });
    }

    void restoreAuthSession();

    return () => {
      active = false;
      unsubscribe();
    };
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
  const canWrite = Boolean(profile && hasApprovedAccess(profile));

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

  async function shareSelectedJob() {
    if (!profile || jobs.length === 0) return;
    setBusyMessage("กำลังสร้างลิงก์ติดตาม...");
    try {
      const token = await createTrackingShareLink(selectedJob, profile);
      const url = `${window.location.origin}/track/${token}`;
      await navigator.clipboard.writeText(url);
      setFirebaseMessage("สร้างลิงก์อายุ 7 วันและคัดลอกแล้ว");
    } catch (error) {
      setFirebaseMessage(toMessage(error));
    } finally {
      setBusyMessage("");
    }
  }

  if (!authReady) {
    return <SessionLoadingScreen />;
  }

  if (!user) {
    return <LoginScreen />;
  }

  if (!profile || !hasApprovedAccess(profile)) {
    return <PendingAccessScreen user={user} profile={profile} />;
  }

  const mode = profile.role === "driver" ? "driver" : "admin";

  return (
    <main className={`app-shell ${mode === "driver" ? "driver-shell" : "admin-shell"}`} data-theme={theme} style={{ "--font-scale": fontScale } as React.CSSProperties}>
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
            <button className="font-scale-action" aria-label="ลดขนาดอักษร" onClick={() => setFontScale((value) => Math.max(0.92, value - 0.08))}>
              <TextCursorInput size={18} />
            </button>
            <button aria-label="เปลี่ยนธีม" onClick={() => setTheme(theme === "light" ? "dark" : "light")}>
              {theme === "light" ? <Moon size={18} /> : <Sun size={18} />}
            </button>
            <button
              className="mobile-menu-toggle"
              aria-label={mobileMenuOpen ? "ปิดเมนู" : "เปิดเมนู"}
              aria-expanded={mobileMenuOpen}
              aria-controls="primary-navigation"
              onClick={() => setMobileMenuOpen((current) => !current)}
            >
              {mobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
            </button>
          </div>
        </header>

        {mobileMenuOpen && (
          <button className="mobile-menu-backdrop" aria-label="ปิดเมนู" onClick={() => setMobileMenuOpen(false)} />
        )}

        <SectionMenu
          open={mobileMenuOpen}
          mode={mode}
          user={user}
          profile={profile}
          statusMessage={busyMessage || firebaseMessage}
          driverScreen={driverScreen}
          adminScreen={adminScreen}
          onDriverScreenChange={setDriverScreen}
          onAdminScreenChange={setAdminScreen}
          onNavigate={() => setMobileMenuOpen(false)}
        />

        <div className="mobile-primary-content">
          {mode === "driver" ? (
            <DriverMobileScreen
              screen={driverScreen}
              jobs={activeJobs}
              selectedJob={selectedJob}
              selectedJobId={selectedJob.id}
              canWrite={canWrite && jobs.length > 0}
              onSelectJob={setSelectedJobId}
              onAction={(status) => runAction((actor) => updateJobStatus(selectedJob, status, actor))}
              onUpload={(file) => runAction((actor) => uploadProof(selectedJob, file, actor))}
            />
          ) : (
            <AdminMobileScreen
              profile={profile}
              screen={adminScreen}
              activeJobs={activeJobs}
              selectedJob={selectedJob}
              selectedJobId={selectedJob.id}
              onSelectJob={setSelectedJobId}
              onCreateJob={(draft) => runAction((actor) => createJob(draft, actor))}
              canWrite={canWrite}
            />
          )}
        </div>

      </section>

      {mode === "admin" && (
        <aside className="desktop-panel">
          {adminScreen === "Jobs / ใบงาน" ? <>
            <AdminView
              activeJobs={activeJobs}
              selectedJobId={selectedJob.id}
              onSelectJob={setSelectedJobId}
              onCreateJob={(draft) => runAction((actor) => createJob(draft, actor))}
              canWrite={canWrite}
              compact={false}
            />
            {activeJobs.length > 0 && <JobDetail
              job={selectedJob}
              canWrite={canWrite}
              onShare={shareSelectedJob}
              onUpload={(file) => runAction((actor) => uploadProof(selectedJob, file, actor))}
            />}
          </> : adminScreen === "Live Tracking" ? (
            activeJobs.length > 0
              ? <MapScreen jobs={activeJobs} selectedJob={selectedJob} selectedJobId={selectedJob.id} onSelectJob={setSelectedJobId} />
              : <EmptyState title="ยังไม่มีรถที่กำลังปฏิบัติงาน" description="ตำแหน่งรถจะแสดงเมื่อมีงานที่เปิดการติดตาม" />
          ) : adminScreen === "Dashboard" ? (
            <AdminDashboard activeJobs={jobs} selectedJobId={selectedJob.id} onSelectJob={setSelectedJobId} />
          ) : adminScreen === "User Management" ? (
            <AccessManagementScreen actor={profile} />
          ) : (
            <FeatureOverview screen={adminScreen} />
          )}
        </aside>
      )}
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
  { label: adminMenu[1], description: "สร้างและจัดการงาน", icon: ListChecks },
  { label: adminMenu[2], description: "ติดตามรถแบบสด", icon: MapPin },
  { label: adminMenu[3], description: "ซับคอนแท็ค", icon: Building2, mainOnly: true },
  { label: adminMenu[4], description: "รถและผู้ปฏิบัติงาน", icon: Users },
  { label: adminMenu[5], description: "ลูกค้าและลิงก์ติดตาม", icon: Share2, mainOnly: true },
  { label: adminMenu[6], description: "สรุปประสิทธิภาพ", icon: BarChart3 },
  { label: adminMenu[7], description: "เหตุผิดปกติ", icon: ShieldAlert },
  { label: adminMenu[8], description: "สิทธิ์ Google Login", icon: UserRoundCog, mainOnly: true },
  { label: adminMenu[9], description: "ข้อมูลบริษัท", icon: Settings }
] as const;

function SectionMenu({
  open,
  mode,
  user,
  profile,
  statusMessage,
  driverScreen,
  adminScreen,
  onDriverScreenChange,
  onAdminScreenChange,
  onNavigate
}: {
  open: boolean;
  mode: "driver" | "admin";
  user: User;
  profile: UserProfile;
  statusMessage: string;
  driverScreen: DriverScreen;
  adminScreen: AdminScreen;
  onDriverScreenChange: (screen: DriverScreen) => void;
  onAdminScreenChange: (screen: AdminScreen) => void;
  onNavigate: () => void;
}) {
  const items = mode === "driver"
    ? driverMenuDetails
    : adminMenuDetails.filter((item) => !("mainOnly" in item && item.mainOnly) || isMainAdmin(profile));
  const activeScreen = mode === "driver" ? driverScreen : adminScreen;
  const organizationLogoUrl = profile.organizationType === "main"
    ? "/icons/truck-logo.png"
    : profile.organizationLogoUrl;

  return (
    <nav id="primary-navigation" className={`section-menu ${open ? "mobile-open" : ""}`} aria-label={mode === "driver" ? "เมนูคนขับ" : "เมนูผู้ดูแล"}>
      <div className="menu-account-stack">
        <section className="menu-context-card">
          <span
            className="menu-company-logo"
            style={organizationLogoUrl ? { backgroundImage: `url(${organizationLogoUrl})` } : undefined}
            aria-hidden="true"
          >
            {!organizationLogoUrl && <Building2 size={20} />}
          </span>
          <div>
            <small>{profile.organizationName || "S Fast Transport"}</small>
            <strong>{profile.organizationType === "subcontract" ? "ผู้ดูแลบริษัทซับคอนแท็ค" : mode === "driver" ? "คนขับบริษัทหลัก" : "ผู้ดูแลบริษัทหลัก"}</strong>
          </div>
        </section>

        <section className="menu-profile-card">
          <span
            className="menu-avatar"
            style={user.photoURL ? { backgroundImage: `url(${user.photoURL})` } : undefined}
            aria-hidden="true"
          >
            {!user.photoURL && (profile.displayName || user.email || "U").slice(0, 1).toUpperCase()}
          </span>
          <div className="menu-profile-copy">
            <strong>{profile.displayName || user.displayName || user.email}</strong>
            <span>{user.email}</span>
          </div>
        </section>

        <section className="menu-session-card">
          <div><Bell size={15} /><span>{statusMessage}</span></div>
          <button onClick={() => signOut(auth)}><LogOut size={16} /> ออกจากระบบ</button>
        </section>
      </div>

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
                onNavigate();
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
  if (jobs.length === 0) {
    return <EmptyState title="ยังไม่มีงานที่ได้รับมอบหมาย" description="งานใหม่จะปรากฏที่นี่หลังจากผู้ดูแลมอบหมายให้คุณ" />;
  }

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
  profile,
  screen,
  activeJobs,
  selectedJob,
  selectedJobId,
  onSelectJob,
  onCreateJob,
  canWrite
}: {
  profile: UserProfile;
  screen: AdminScreen;
  activeJobs: TransportJob[];
  selectedJob: TransportJob;
  selectedJobId: string;
  onSelectJob: (jobId: string) => void;
  onCreateJob: (draft: JobDraft) => void;
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
        canWrite={canWrite}
      />
    );
  }

  if (screen === "Live Tracking") {
    return activeJobs.length > 0
      ? <MapScreen jobs={activeJobs} selectedJob={selectedJob} selectedJobId={selectedJobId} onSelectJob={onSelectJob} />
      : <EmptyState title="ยังไม่มีรถที่กำลังปฏิบัติงาน" description="ตำแหน่งรถจะแสดงเมื่อมีงานที่เปิดการติดตาม" />;
  }

  if (screen === "User Management" && isMainAdmin(profile)) {
    return <AccessManagementScreen actor={profile} />;
  }

  return <FeatureOverview screen={screen} />;
}

type AccessDraft = Pick<UserAccessUpdate, "role" | "organizationId" | "organizationType" | "organizationName" | "organizationLogoUrl">;

function AccessManagementScreen({ actor }: { actor: UserProfile }) {
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [drafts, setDrafts] = useState<Record<string, AccessDraft>>({});
  const [message, setMessage] = useState("กำลังโหลดรายชื่อผู้ใช้...");

  useEffect(() => subscribeUserProfiles(
    (nextUsers) => {
      setUsers(nextUsers);
      setMessage(nextUsers.length ? "เลือกบทบาทและบริษัทก่อนอนุมัติ" : "ยังไม่มีคำขอเข้าใช้งาน");
    },
    (error) => setMessage(error)
  ), []);

  function draftFor(user: UserProfile): AccessDraft {
    return drafts[user.uid] ?? {
      role: user.role,
      organizationId: user.organizationId ?? "main",
      organizationType: user.organizationType ?? "main",
      organizationName: user.organizationName || "S Fast Transport",
      organizationLogoUrl: user.organizationLogoUrl || ""
    };
  }

  function updateDraft(user: UserProfile, patch: Partial<AccessDraft>) {
    setDrafts((current) => ({ ...current, [user.uid]: { ...draftFor(user), ...patch } }));
  }

  async function saveAccess(user: UserProfile, suspended = false) {
    const draft = draftFor(user);
    setMessage(`กำลังอัปเดต ${user.displayName}...`);
    try {
      await updateUserAccess(user.uid, {
        ...draft,
        active: !suspended,
        approvalStatus: suspended ? "suspended" : "approved"
      }, actor);
      setMessage(suspended ? "ระงับบัญชีแล้ว" : "อนุมัติสิทธิ์แล้ว");
    } catch (error) {
      setMessage(toMessage(error));
    }
  }

  return (
    <section className="screen access-screen">
      <div className="section-title">
        <div><h1>ผู้ใช้งานและสิทธิ์</h1><p>อนุมัติ Google Login และกำหนดขอบเขตบริษัท</p></div>
        <span className="live-dot">{users.filter((user) => user.approvalStatus === "pending").length} รออนุมัติ</span>
      </div>
      <div className="sync-bar access-message"><UserRoundCog size={16} /><span>{message}</span></div>
      <div className="access-list">
        {users.map((user) => {
          const draft = draftFor(user);
          return (
            <article key={user.uid} className="access-row">
              <div className="access-person">
                <strong>{user.displayName}</strong><span>{user.email}</span>
                <small className={`approval ${user.approvalStatus}`}>{user.approvalStatus}</small>
              </div>
              <select value={draft.role} onChange={(event) => updateDraft(user, { role: event.target.value as UserProfile["role"] })}>
                <option value="driver">คนขับ</option>
                <option value="subcontract_admin">แอดมินซับคอนแท็ค</option>
                <option value="admin">แอดมินบริษัทหลัก</option>
              </select>
              <select
                value={draft.organizationType ?? "main"}
                onChange={(event) => {
                  const organizationType = event.target.value as "main" | "subcontract";
                  updateDraft(user, {
                    organizationType,
                    organizationId: organizationType === "main" ? "main" : draft.organizationId,
                    organizationName: organizationType === "main" ? "S Fast Transport" : draft.organizationName
                  });
                }}
              >
                <option value="main">บริษัทหลัก</option>
                <option value="subcontract">ซับคอนแท็ค</option>
              </select>
              <input value={draft.organizationId ?? ""} onChange={(event) => updateDraft(user, { organizationId: event.target.value })} placeholder="รหัสบริษัท" />
              <input value={draft.organizationName} onChange={(event) => updateDraft(user, { organizationName: event.target.value })} placeholder="ชื่อบริษัท" />
              <input value={draft.organizationLogoUrl} onChange={(event) => updateDraft(user, { organizationLogoUrl: event.target.value })} placeholder="URL โลโก้บริษัท" />
              <div className="access-actions">
                <button onClick={() => saveAccess(user)}>อนุมัติ / บันทึก</button>
                <button className="danger-button" onClick={() => saveAccess(user, true)}>ระงับ</button>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

const featureDetails: Record<string, { title: string; description: string; items: string[] }> = {
  "บริษัทขนส่ง": {
    title: "บริษัทขนส่งซับคอนแท็ค",
    description: "เพิ่มบริษัทคู่สัญญาและกำหนดขอบเขตข้อมูลของแต่ละบริษัท",
    items: ["รายชื่อบริษัทซับคอนแท็ค", "ผู้ดูแลของแต่ละบริษัท", "รถและคนขับในสังกัด", "งานที่มอบหมายให้บริษัท"]
  },
  "รถและคนขับ": {
    title: "รถและคนขับ",
    description: "ข้อมูลทรัพยากรที่อยู่ในขอบเขตบริษัทของคุณ",
    items: ["สถานะรถและ GPS", "ข้อมูลคนขับ", "เอกสารและวันหมดอายุ", "ประวัติการปฏิบัติงาน"]
  },
  "ลูกค้า": {
    title: "ลูกค้าและลิงก์ติดตาม",
    description: "จัดการลูกค้าและแชร์สถานะงานโดยไม่ต้องให้ลูกค้าล็อกอิน",
    items: ["รายชื่อลูกค้า", "งานของลูกค้า", "สร้างลิงก์ติดตามเฉพาะงาน", "กำหนดวันหมดอายุของลิงก์"]
  },
  "Reports": {
    title: "รายงาน",
    description: "สรุปผลงานขนส่งตามบริษัท รถ คนขับ และลูกค้า",
    items: ["อัตราส่งตรงเวลา", "งานสำเร็จและงานล่าช้า", "ประสิทธิภาพรถและคนขับ", "ส่งออก Excel หรือ PDF"]
  },
  "แจ้งเตือน": {
    title: "ศูนย์แจ้งเตือน",
    description: "รวมเหตุผิดปกติที่ต้องตรวจสอบและติดตามการแก้ไข",
    items: ["รถออกนอกเส้นทาง", "GPS ขาดการเชื่อมต่อ", "งานล่าช้า", "สถานะการตรวจสอบเหตุการณ์"]
  },
  "User Management": {
    title: "ผู้ใช้งานและสิทธิ์ Google",
    description: "อนุมัติบัญชี Google และกำหนดบทบาทกับบริษัทก่อนเข้าใช้งาน",
    items: ["คำขอที่รออนุมัติ", "แอดมินบริษัทหลัก", "แอดมินซับคอนแท็ค", "คนขับและบริษัทต้นสังกัด"]
  },
  "Settings": {
    title: "จัดการบริษัท",
    description: "ข้อมูลบริษัท รูปแบบงาน และค่าระบบที่ใช้ภายในขอบเขตของคุณ",
    items: ["ข้อมูลและโลโก้บริษัท", "รูปแบบเลขที่งาน", "การแจ้งเตือน", "ข้อมูลติดต่อผู้ดูแล"]
  }
};

function FeatureOverview({ screen }: { screen: AdminScreen }) {
  const feature = featureDetails[screen] ?? featureDetails.Settings;

  return (
    <section className="screen feature-screen">
      <div className="feature-hero">
        <span className="eyebrow">WORKSPACE</span>
        <h1>{feature.title}</h1>
        <p>{feature.description}</p>
      </div>
      <div className="feature-list">
        {feature.items.map((item, index) => (
          <article key={item}>
            <span>{String(index + 1).padStart(2, "0")}</span>
            <strong>{item}</strong>
          </article>
        ))}
      </div>
    </section>
  );
}

function EmptyState({ title, description }: { title: string; description: string }) {
  return (
    <section className="screen empty-state">
      <div className="empty-state-icon"><ListChecks size={28} /></div>
      <h1>{title}</h1>
      <p>{description}</p>
    </section>
  );
}

function SessionLoadingScreen() {
  return (
    <main className="login-shell" aria-busy="true" aria-live="polite">
      <div className="login-backdrop" aria-hidden="true" />
      <section className="login-card session-loading-card">
        <Image className="login-logo" src="/icons/truck-logo.png" alt="S Fast Transport" width={72} height={72} priority />
        <span className="session-loading-indicator" aria-hidden="true" />
        <div className="login-copy">
          <h1>กำลังเปิดระบบ</h1>
          <p>กำลังตรวจสอบการเข้าสู่ระบบที่บันทึกไว้...</p>
        </div>
      </section>
    </main>
  );
}

function LoginScreen() {
  const [message, setMessage] = useState("");
  const [signingIn, setSigningIn] = useState(false);

  async function signInWithGoogle() {
    if (signingIn) return;

    setSigningIn(true);
    setMessage("กำลังเปิด Google...");
    try {
      await ensureLocalAuthPersistence();
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: "select_account" });
      const credential = await signInWithPopup(auth, provider);
      await ensureAccessProfile(
        credential.user.uid,
        credential.user.email ?? "",
        credential.user.displayName ?? credential.user.email ?? ""
      );
      setMessage("สำเร็จ");
    } catch (error) {
      setMessage(toMessage(error));
    } finally {
      setSigningIn(false);
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
          <h1>เข้าสู่ระบบด้วย Google</h1>
          <p>บัญชีและสิทธิ์ใช้งานควบคุมโดยผู้ดูแล S Fast Transport</p>
        </div>

        <div className="login-form">
          <button className="google-button" type="button" onClick={signInWithGoogle} disabled={signingIn}>
            <GoogleLogo />
            {signingIn ? "กำลังเข้าสู่ระบบ..." : "เข้าสู่ระบบด้วย Google"}
          </button>
        </div>

        <div className="login-footnote">
          {message || "บัญชีใหม่ต้องรอแอดมินบริษัทหลักอนุมัติก่อนเข้าใช้งาน"}
        </div>
      </section>
    </main>
  );
}

function PendingAccessScreen({ user, profile }: { user: User; profile: UserProfile | null }) {
  const suspended = profile?.approvalStatus === "suspended";

  return (
    <main className="login-shell">
      <section className="login-card pending-card">
        <div className="pending-icon"><UserRoundCog size={30} /></div>
        <div className="login-copy">
          <span className="eyebrow">GOOGLE ACCESS CONTROL</span>
          <h1>{suspended ? "บัญชีถูกระงับการใช้งาน" : "กำลังรออนุมัติสิทธิ์"}</h1>
          <p>{user.email}</p>
          <p>{suspended ? "กรุณาติดต่อแอดมินบริษัทหลักเพื่อเปิดใช้งานบัญชี" : "แอดมินบริษัทหลักจะกำหนดบริษัทและบทบาทให้บัญชีนี้"}</p>
        </div>
        <button className="login-secondary pending-signout" onClick={() => signOut(auth)}><LogOut size={17} /> ออกจากระบบ</button>
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
  canWrite,
  compact = true
}: {
  activeJobs: TransportJob[];
  selectedJobId: string;
  onSelectJob: (jobId: string) => void;
  onCreateJob: (draft: JobDraft) => void;
  canWrite: boolean;
  compact?: boolean;
}) {
  const [draft, setDraft] = useState<JobDraft>(createEmptyJobDraft);
  const [showForm, setShowForm] = useState(false);
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
      eta: draft.deliveryTime || draft.eta || "วันนี้"
    };
    onCreateJob(nextDraft);
    setDraft(createEmptyJobDraft());
    setShowForm(false);
  }

  return (
    <section className={compact ? "screen" : "admin-wide"}>
      <div className="section-title">
        <div>
          <h1>Jobs / ใบงาน</h1>
          <p>สร้าง มอบหมาย และติดตามใบงานขนส่ง</p>
        </div>
        <button className={`icon-text ${showForm ? "active" : ""}`} onClick={() => setShowForm((current) => !current)} disabled={!canWrite}>
          <Plus size={17} />
          Jobs
        </button>
      </div>

      {showForm && (
        <form className="dispatch-form" onSubmit={(event) => { event.preventDefault(); submitJob(); }}>
          <header className="dispatch-form-hero">
            <div><span>DISPATCH CENTER</span><h2>ฟอร์มแจ้งงาน</h2><p>สร้างใบแจ้งงานและบันทึกเข้าระบบ</p></div>
            <FilePenLine size={24} />
          </header>

          <div className="dispatch-form-body">
            <div className="dispatch-general-grid">
              <DispatchField label="เลขที่ใบส่งงาน"><input value={draft.workOrder} onChange={(event) => updateDraft("workOrder", event.target.value)} required /></DispatchField>
              <DispatchField label="บริษัทผู้ว่าจ้าง" add><input value={draft.customer} onChange={(event) => updateDraft("customer", event.target.value)} placeholder="เลือกบริษัทผู้ว่าจ้าง" required /></DispatchField>
              <DispatchField label="วันที่รับงานจากผู้ว่าจ้าง"><input type="date" value={draft.jobDate} onChange={(event) => updateDraft("jobDate", event.target.value)} /></DispatchField>
              <DispatchField label="ประเภทสินค้า" add><input value={draft.cargoType} onChange={(event) => updateDraft("cargoType", event.target.value)} placeholder="เลือกประเภทสินค้า" /></DispatchField>
              <DispatchField label="ประเภทรถ" add><input value={draft.vehicleType} onChange={(event) => updateDraft("vehicleType", event.target.value)} placeholder="เลือกประเภทรถ" /></DispatchField>
              <DispatchField label="จำนวนรอบ"><input type="number" min="1" value={draft.tripCount} onChange={(event) => updateDraft("tripCount", event.target.value)} /></DispatchField>
            </div>

            <div className="dispatch-stops">
              <DispatchStop
                title="รับงาน"
                location={draft.pickupLocation}
                date={draft.pickupDate}
                time={draft.pickupTime}
                contact={draft.pickupContact}
                onChange={updateDraft}
                fields={{ location: "pickupLocation", date: "pickupDate", time: "pickupTime", contact: "pickupContact" }}
              />
              <DispatchStop
                title="ส่งงาน"
                location={draft.deliveryLocation}
                date={draft.deliveryDate}
                time={draft.deliveryTime}
                contact={draft.deliveryContact}
                onChange={updateDraft}
                fields={{ location: "deliveryLocation", date: "deliveryDate", time: "deliveryTime", contact: "deliveryContact" }}
              />
            </div>

            <div className="dispatch-general-grid assignment-grid">
              <DispatchField label="มอบหมายพนักงาน (แอพ)"><input value={draft.assignedEmployee} onChange={(event) => updateDraft("assignedEmployee", event.target.value)} placeholder="เลือกผู้รับงาน" /></DispatchField>
              <DispatchField label="พนักงานขับรถ" add><input value={draft.driverName} onChange={(event) => updateDraft("driverName", event.target.value)} placeholder="เลือกพนักงานขับรถ" /></DispatchField>
              <DispatchField label="เบอร์ติดต่อ"><input type="tel" value={draft.driverPhone} onChange={(event) => updateDraft("driverPhone", event.target.value)} placeholder="080-123-4567" /></DispatchField>
              <DispatchField label="ทะเบียนรถ" add><input value={draft.vehiclePlate} onChange={(event) => updateDraft("vehiclePlate", event.target.value)} placeholder="เลือกทะเบียนรถ" /></DispatchField>
              <DispatchField label="หมายเหตุ" wide><textarea value={draft.notes} onChange={(event) => updateDraft("notes", event.target.value)} rows={4} placeholder="รายละเอียดเพิ่มเติมสำหรับงานนี้" /></DispatchField>
            </div>

            <div className="dispatch-form-actions">
              <button className="save-job-button" type="submit" disabled={!canWrite}><Save size={17} /> บันทึกงาน</button>
              <button type="button" onClick={() => setDraft(createEmptyJobDraft())}><RotateCcw size={17} /> ล้างข้อมูล</button>
            </div>
          </div>
        </form>
      )}

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

function DispatchField({ label, add = false, wide = false, children }: { label: string; add?: boolean; wide?: boolean; children: React.ReactNode }) {
  return (
    <label className={`dispatch-field ${wide ? "wide" : ""}`}>
      <span>{label}</span>
      <div>{children}{add && <b aria-hidden="true">+</b>}</div>
    </label>
  );
}

function DispatchStop({
  title,
  location,
  date,
  time,
  contact,
  onChange,
  fields
}: {
  title: string;
  location: string;
  date: string;
  time: string;
  contact: string;
  onChange: (field: keyof JobDraft, value: string) => void;
  fields: { location: keyof JobDraft; date: keyof JobDraft; time: keyof JobDraft; contact: keyof JobDraft };
}) {
  return (
    <fieldset className="dispatch-stop">
      <legend>{title}</legend>
      <DispatchField label="สถานที่" add><input value={location} onChange={(event) => onChange(fields.location, event.target.value)} placeholder={`พิมพ์ค้นหาสถานที่${title === "รับงาน" ? "รับ" : "ส่ง"}`} /></DispatchField>
      <DispatchField label="วันที่"><input type="date" value={date} onChange={(event) => onChange(fields.date, event.target.value)} /></DispatchField>
      <DispatchField label="เวลา"><input type="time" value={time} onChange={(event) => onChange(fields.time, event.target.value)} /></DispatchField>
      <DispatchField label="ติดต่อ" add><input value={contact} onChange={(event) => onChange(fields.contact, event.target.value)} placeholder="เลือกผู้ติดต่อ" /></DispatchField>
    </fieldset>
  );
}

function JobDetail({
  job,
  canWrite,
  onShare,
  onUpload
}: {
  job: TransportJob;
  canWrite: boolean;
  onShare: () => void;
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
          <button onClick={onShare}><Share2 size={18} /> Share</button>
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
