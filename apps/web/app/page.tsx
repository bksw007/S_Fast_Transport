"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  Bell,
  Building2,
  Camera,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
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
  Power,
  QrCode,
  RotateCcw,
  Save,
  Settings,
  ShieldAlert,
  Share2,
  Sun,
  TextCursorInput,
  Truck,
  UserRound,
  UserRoundCog,
  Users,
  Download,
  Upload,
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
import { ListManagerComboBox } from "@/app/components/ListManagerComboBox";
import { FleetAndDriversScreen, SubcontractCompaniesScreen } from "@/app/components/ResourceManagementScreens";
import { subscribeSubcontractOrganizations, type SubcontractOrganization } from "@/lib/resource-repository";
import {
  downloadPrivateDocument,
  driverLicenseTypes,
  formatPhoneNumber,
  getPrivateDocumentPreviewURL,
  nameTitles,
  updateOwnProfile,
  uploadPersonalDocument,
  uploadProfilePhoto,
  type NameTitle,
  type PersonalProfileDraft
} from "@/lib/profile-repository";
import {
  createJob,
  createTrackingShareLink,
  ensureAccessProfile,
  getUserProfile,
  hasApprovedAccess,
  isMainAdmin,
  submitAccessRequest,
  subscribePendingAccessRequestCount,
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
  const [pendingAccessCount, setPendingAccessCount] = useState(0);

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
          await ensureAccessProfile(
            nextUser.uid,
            nextUser.email ?? "",
            nextUser.displayName ?? "",
            nextUser.photoURL ?? ""
          );
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

  useEffect(() => {
    if (!profile || !hasApprovedAccess(profile) || !isMainAdmin(profile)) return;
    return subscribePendingAccessRequestCount(
      setPendingAccessCount,
      (message) => setFirebaseMessage(`อ่านคำขอสิทธิ์ไม่สำเร็จ: ${message}`)
    );
  }, [profile]);

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

  async function refreshCurrentProfile() {
    if (!user) return;
    const nextProfile = await getUserProfile(user.uid);
    if (nextProfile) setProfile(nextProfile);
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
            {mode === "admin" && isMainAdmin(profile) && (
              <button
                className="notification-action"
                aria-label={`คำขอสิทธิ์ใหม่ ${pendingAccessCount} รายการ`}
                title="คำขอสิทธิ์ใหม่"
                onClick={() => { setAdminScreen("User Management" as AdminScreen); setMobileMenuOpen(false); }}
              >
                <Bell size={18} />
                {pendingAccessCount > 0 && <span>{pendingAccessCount > 99 ? "99+" : pendingAccessCount}</span>}
              </button>
            )}
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
          pendingAccessCount={pendingAccessCount}
          driverScreen={driverScreen}
          adminScreen={adminScreen}
          onDriverScreenChange={setDriverScreen}
          onAdminScreenChange={setAdminScreen}
          onNavigate={() => setMobileMenuOpen(false)}
        />

        <div className="mobile-primary-content">
          {mode === "driver" ? (
            <DriverMobileScreen
              profile={profile}
              screen={driverScreen}
              jobs={activeJobs}
              selectedJob={selectedJob}
              selectedJobId={selectedJob.id}
              canWrite={canWrite && jobs.length > 0}
              onSelectJob={setSelectedJobId}
              onAction={(status) => runAction((actor) => updateJobStatus(selectedJob, status, actor))}
              onUpload={(file) => runAction((actor) => uploadProof(selectedJob, file, actor))}
              onProfileUpdated={refreshCurrentProfile}
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
              onProfileUpdated={refreshCurrentProfile}
            />
          )}
        </div>

      </section>

      {mode === "admin" && (
        <aside className="desktop-panel">
          {adminScreen === "Jobs / ใบงาน" ? <>
            <AdminView
              profile={profile}
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
          ) : adminScreen === "บริษัทขนส่ง" && isMainAdmin(profile) ? (
            <SubcontractCompaniesScreen actor={profile} />
          ) : adminScreen === "รถและคนขับ" ? (
            <FleetAndDriversScreen actor={profile} />
          ) : adminScreen === "User Management" ? (
            <AccessManagementScreen actor={profile} />
          ) : adminScreen === "โปรไฟล์" ? (
            <ProfileScreen profile={profile} onProfileUpdated={refreshCurrentProfile} />
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
  { label: driverMenu[3], description: "รูปและเอกสาร POD", icon: FileImage },
  { label: driverMenu[4], description: "งานที่ดำเนินการแล้ว", icon: Clock3 },
  { label: driverMenu[5], description: "ชื่อ รูป และเอกสารส่วนตัว", icon: UserRound }
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
  { label: adminMenu[9], description: "ชื่อ รูป และเอกสารส่วนตัว", icon: UserRound },
  { label: adminMenu[10], description: "ข้อมูลบริษัท", icon: Settings }
] as const;

function SectionMenu({
  open,
  mode,
  user,
  profile,
  statusMessage,
  pendingAccessCount,
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
  pendingAccessCount: number;
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
            style={profile.photoURL ? { backgroundImage: `url(${profile.photoURL})` } : undefined}
            aria-hidden="true"
          >
            {!profile.photoURL && <UserRound size={21} />}
          </span>
          <div className="menu-profile-copy">
            <strong>{profile.fullName || profile.displayName || user.displayName || user.email}</strong>
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
              {item.label === "User Management" && pendingAccessCount > 0 && <span className="menu-notification-badge">{pendingAccessCount}</span>}
            </button>
          );
        })}
      </div>
    </nav>
  );
}

function DriverMobileScreen({
  profile,
  screen,
  jobs,
  selectedJob,
  selectedJobId,
  canWrite,
  onSelectJob,
  onAction,
  onUpload,
  onProfileUpdated
}: {
  profile: UserProfile;
  screen: DriverScreen;
  jobs: TransportJob[];
  selectedJob: TransportJob;
  selectedJobId: string;
  canWrite: boolean;
  onSelectJob: (jobId: string) => void;
  onAction: (status: JobStatus) => void;
  onUpload: (file: File) => void;
  onProfileUpdated: () => Promise<void>;
}) {
  if (screen === "โปรไฟล์") {
    return <ProfileScreen profile={profile} onProfileUpdated={onProfileUpdated} />;
  }

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

  if (screen === "ประวัติงาน") {
    return <EmptyState title="ยังไม่มีประวัติงาน" description="งานที่ปิดแล้วจะแสดงในส่วนนี้" />;
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
  canWrite,
  onProfileUpdated
}: {
  profile: UserProfile;
  screen: AdminScreen;
  activeJobs: TransportJob[];
  selectedJob: TransportJob;
  selectedJobId: string;
  onSelectJob: (jobId: string) => void;
  onCreateJob: (draft: JobDraft) => void;
  canWrite: boolean;
  onProfileUpdated: () => Promise<void>;
}) {
  if (screen === "Dashboard") {
    return <AdminDashboard activeJobs={activeJobs} selectedJobId={selectedJobId} onSelectJob={onSelectJob} />;
  }

  if (screen === "Jobs / ใบงาน") {
    return (
      <AdminView
        profile={profile}
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

  if (screen === "บริษัทขนส่ง" && isMainAdmin(profile)) {
    return <SubcontractCompaniesScreen actor={profile} />;
  }

  if (screen === "รถและคนขับ") {
    return <FleetAndDriversScreen actor={profile} />;
  }

  if (screen === "User Management" && isMainAdmin(profile)) {
    return <AccessManagementScreen actor={profile} />;
  }

  if (screen === "โปรไฟล์") {
    return <ProfileScreen profile={profile} onProfileUpdated={onProfileUpdated} />;
  }

  return <FeatureOverview screen={screen} />;
}

type AccessDraft = Pick<UserAccessUpdate, "role" | "organizationId">;

function AccessManagementScreen({ actor }: { actor: UserProfile }) {
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [organizations, setOrganizations] = useState<SubcontractOrganization[]>([]);
  const [drafts, setDrafts] = useState<Record<string, AccessDraft>>({});
  const [filter, setFilter] = useState<"pending" | "all">("pending");
  const [busyUid, setBusyUid] = useState("");
  const [message, setMessage] = useState("กำลังโหลดรายชื่อผู้ใช้...");

  useEffect(() => subscribeUserProfiles(
    (nextUsers) => {
      setUsers(nextUsers);
      setMessage(nextUsers.length ? "เลือกบทบาทและบริษัทก่อนอนุมัติ" : "ยังไม่มีคำขอเข้าใช้งาน");
    },
    (error) => setMessage(error)
  ), []);

  useEffect(() => subscribeSubcontractOrganizations(
    setOrganizations,
    (error) => setMessage(`โหลดรายชื่อบริษัทไม่สำเร็จ: ${error}`)
  ), []);

  function draftFor(user: UserProfile): AccessDraft {
    return drafts[user.uid] ?? {
      role: user.role,
      organizationId: user.organizationId ?? "main"
    };
  }

  function updateDraft(user: UserProfile, patch: Partial<AccessDraft>) {
    setDrafts((current) => ({ ...current, [user.uid]: { ...draftFor(user), ...patch } }));
  }

  async function saveAccess(user: UserProfile, suspended = false) {
    const draft = draftFor(user);
    const selectedOrganization = draft.organizationId === "main"
      ? null
      : organizations.find((item) => item.id === draft.organizationId);
    if (draft.organizationId !== "main" && !selectedOrganization) {
      setMessage("กรุณาเลือกบริษัทที่ถูกต้อง");
      return;
    }

    setBusyUid(user.uid);
    setMessage(`กำลังอัปเดต ${user.accessRequestName || user.displayName}...`);
    try {
      await updateUserAccess(user.uid, {
        role: draft.role,
        organizationId: draft.organizationId,
        organizationType: draft.organizationId === "main" ? "main" : "subcontract",
        organizationName: draft.organizationId === "main" ? "S Fast Transport" : selectedOrganization?.name ?? "",
        organizationLogoUrl: draft.organizationId === "main" ? "" : selectedOrganization?.logoUrl ?? "",
        active: !suspended,
        approvalStatus: suspended ? "suspended" : "approved"
      }, actor);
      setMessage(suspended ? "ระงับบัญชีแล้ว" : "อนุมัติสิทธิ์แล้ว");
    } catch (error) {
      setMessage(toMessage(error));
    } finally {
      setBusyUid("");
    }
  }

  function changeOrganization(user: UserProfile, organizationId: string) {
    const current = draftFor(user);
    const mainRoles: UserProfile["role"][] = ["owner", "admin", "dispatcher"];
    const role = organizationId === "main"
      ? current.role === "subcontract_admin" ? "dispatcher" : current.role
      : mainRoles.includes(current.role) ? "subcontract_admin" : current.role;
    updateDraft(user, { organizationId, role });
  }

  const pendingCount = users.filter((user) => user.approvalStatus === "pending" && user.accessRequestSubmittedAt).length;
  const shownUsers = [...users]
    .filter((user) => filter === "all" || (user.approvalStatus === "pending" && user.accessRequestSubmittedAt))
    .sort((a, b) => {
      if (a.approvalStatus === "pending" && b.approvalStatus !== "pending") return -1;
      if (a.approvalStatus !== "pending" && b.approvalStatus === "pending") return 1;
      return (a.accessRequestName || a.displayName).localeCompare(b.accessRequestName || b.displayName, "th");
    });

  return (
    <section className="screen access-screen">
      <div className="access-page-head">
        <div><span className="eyebrow">ACCESS INBOX</span><h1>ผู้ใช้งานและสิทธิ์</h1><p>อ่านข้อความแนะนำตัว แล้วเลือกเพียงบทบาทและบริษัท</p></div>
        <span className="access-pending-count"><Bell size={16} /> {pendingCount} รออนุมัติ</span>
      </div>
      <div className="access-toolbar">
        <div className="access-filter"><button className={filter === "pending" ? "selected" : ""} onClick={() => setFilter("pending")}>คำขอใหม่ <span>{pendingCount}</span></button><button className={filter === "all" ? "selected" : ""} onClick={() => setFilter("all")}>ผู้ใช้ทั้งหมด <span>{users.length}</span></button></div>
        <div className="access-message" role="status"><UserRoundCog size={15} /><span>{message}</span></div>
      </div>
      <div className="access-card-list">
        {shownUsers.map((user) => {
          const draft = draftFor(user);
          const isPending = user.approvalStatus === "pending";
          const roleOptions = draft.organizationId === "main"
            ? [
                { value: "driver", label: "คนขับบริษัทหลัก" },
                { value: "dispatcher", label: "เจ้าหน้าที่จัดงาน" },
                { value: "admin", label: "แอดมินบริษัทหลัก" },
                { value: "owner", label: "เจ้าของระบบ" }
              ]
            : [
                { value: "driver", label: "คนขับบริษัทรอง" },
                { value: "subcontract_admin", label: "แอดมินบริษัทรอง" }
              ];
          return (
            <article key={user.uid} className={`access-card ${isPending ? "pending" : ""}`}>
              <header className="access-card-identity">
                <ProfileAvatar profile={user} className="access-avatar" />
                <div>
                  <small>{isPending ? "ผู้ขอใช้งาน" : "ผู้ใช้งาน"}</small>
                  <h2>{user.fullName || user.accessRequestName || user.displayName || "ยังไม่ได้แจ้งชื่อ"}</h2>
                  <span>{user.email}</span>
                </div>
                <span className={`approval ${user.approvalStatus}`}>{user.approvalStatus === "pending" ? "รออนุมัติ" : user.approvalStatus === "approved" ? "ใช้งานอยู่" : "ระงับ"}</span>
              </header>

              <div className={`access-request-copy ${user.accessRequestMessage ? "has-message" : ""}`}>
                <span>{user.accessRequestSubmittedAt ? "ข้อความจากผู้ขอใช้งาน" : "ยังไม่ได้ส่งข้อมูลแนะนำตัว"}</span>
                <p>{user.accessRequestMessage || (user.accessRequestName ? `แจ้งชื่อว่า ${user.accessRequestName}` : "ระบบจะแจ้งเตือนอีกครั้งเมื่อผู้ใช้กรอกชื่อ–สกุลและส่งคำขอ")}</p>
                {user.accessRequestSubmittedAt && <small>ส่งเมื่อ {new Date(user.accessRequestSubmittedAt).toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short" })}</small>}
              </div>

              <div className="access-decision-grid">
                <label><span>บริษัท</span><select value={draft.organizationId ?? "main"} onChange={(event) => changeOrganization(user, event.target.value)}><option value="main">S Fast Transport · บริษัทหลัก</option>{organizations.map((item) => <option key={item.id} value={item.id} disabled={!item.active}>{item.name}{item.active ? "" : " · ระงับ"}</option>)}</select></label>
                <label><span>บทบาท</span><select value={draft.role} onChange={(event) => updateDraft(user, { role: event.target.value as UserProfile["role"] })}>{roleOptions.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
              </div>
              <div className="access-card-actions">
                <button disabled={busyUid === user.uid} onClick={() => void saveAccess(user)}><Save size={15} /> {isPending ? "อนุมัติสิทธิ์" : "บันทึกการเปลี่ยนแปลง"}</button>
                <button className="danger-button" disabled={busyUid === user.uid || actor.uid === user.uid} onClick={() => void saveAccess(user, true)}><Power size={15} /> ระงับบัญชี</button>
              </div>
            </article>
          );
        })}
        {!shownUsers.length && <div className="access-empty"><UserRoundCog size={26} /><strong>{filter === "pending" ? "ไม่มีคำขอใหม่" : "ยังไม่มีผู้ใช้งาน"}</strong><span>รายการใหม่จะแสดงอัตโนมัติแบบ real-time</span></div>}
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
        credential.user.displayName ?? credential.user.email ?? "",
        credential.user.photoURL ?? ""
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
  const [title, setTitle] = useState<NameTitle | "">((profile?.title as NameTitle) || "");
  const [firstName, setFirstName] = useState(profile?.firstName || "");
  const [lastName, setLastName] = useState(profile?.lastName || "");
  const [requestMessage, setRequestMessage] = useState(profile?.accessRequestMessage || "");
  const [submitted, setSubmitted] = useState(Boolean(profile?.accessRequestSubmittedAt));
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  async function sendRequest(event: React.FormEvent) {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    setMessage("กำลังส่งคำขอ...");
    try {
      await submitAccessRequest(user.uid, title, firstName, lastName, requestMessage);
      setSubmitted(true);
      setMessage("");
    } catch (error) {
      setMessage(toMessage(error));
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="login-shell">
      <section className="login-card pending-card">
        <div className="pending-head">
          {profile ? <ProfileAvatar profile={profile} className="pending-profile-avatar" /> : <div className="pending-icon"><UserRoundCog size={30} /></div>}
          <div className="login-copy">
            <span className="eyebrow">ACCESS REQUEST</span>
            <h1>{suspended ? "บัญชีถูกระงับการใช้งาน" : submitted ? "ส่งคำขอแล้ว" : "แนะนำตัวกับแอดมิน"}</h1>
            <p>{user.email}</p>
          </div>
        </div>

        {suspended ? (
          <div className="pending-notice danger">กรุณาติดต่อแอดมินบริษัทหลักเพื่อเปิดใช้งานบัญชีอีกครั้ง</div>
        ) : submitted ? (
          <div className="pending-submitted" role="status">
            <span><CheckCircle2 size={24} /></span>
            <div>
              <strong>ส่งข้อมูลให้แอดมินแล้ว</strong>
              <p>ระบบได้รับชื่อจริงและข้อมูลบริษัทต้นสังกัดของคุณแล้ว กรุณารอแอดมินตรวจสอบและอนุมัติสิทธิ์</p>
            </div>
          </div>
        ) : (
          <form className="access-request-form" onSubmit={sendRequest}>
            <div className="access-name-grid">
              <label><span>คำนำหน้าชื่อ *</span><select required value={title} onChange={(event) => setTitle(event.target.value as NameTitle)}><option value="">เลือก</option>{nameTitles.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
              <label><span>ชื่อจริง *</span><input required maxLength={50} value={firstName} placeholder="ชื่อจริง" autoComplete="given-name" onChange={(event) => setFirstName(event.target.value)} /></label>
              <label><span>นามสกุลจริง *</span><input required maxLength={50} value={lastName} placeholder="นามสกุลจริง" autoComplete="family-name" onChange={(event) => setLastName(event.target.value)} /></label>
            </div>
            <label><span>ข้อความถึงแอดมิน *</span><textarea required maxLength={500} rows={3} value={requestMessage} placeholder="ระบุบริษัทต้นสังกัด เช่น บริษัท ABC Transport และหน้าที่ของคุณ" onChange={(event) => setRequestMessage(event.target.value)} /></label>
            <button className="login-primary access-request-submit" disabled={saving}>{saving ? "กำลังส่ง..." : "ส่งข้อมูลให้แอดมิน"}</button>
            {message && <div className="pending-notice" role="alert">{message}</div>}
          </form>
        )}

        <button className="login-secondary pending-signout" onClick={() => signOut(auth)}><LogOut size={17} /> ออกจากระบบ</button>
      </section>
    </main>
  );
}

function ProfileAvatar({ profile, className }: { profile: UserProfile; className: string }) {
  return (
    <span
      className={`${className} ${profile.photoURL ? "has-photo" : "is-default"}`}
      style={profile.photoURL ? { backgroundImage: `url(${profile.photoURL})` } : undefined}
      role="img"
      aria-label={profile.photoURL ? `รูปโปรไฟล์ของ ${profile.fullName || profile.displayName}` : "รูปโปรไฟล์เริ่มต้น"}
    >
      {!profile.photoURL && <UserRound size={22} />}
    </span>
  );
}

function ProfileScreen({ profile, onProfileUpdated }: { profile: UserProfile; onProfileUpdated: () => Promise<void> }) {
  const [draft, setDraft] = useState<PersonalProfileDraft>({
    title: (nameTitles.includes(profile.title as NameTitle) ? profile.title : "") as NameTitle | "",
    firstName: profile.firstName,
    lastName: profile.lastName,
    phone: formatPhoneNumber(profile.phone),
    licenseNumber: profile.licenseNumber,
    licenseType: profile.licenseType,
    licenseExpiry: profile.licenseExpiry
  });
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [idCardFile, setIdCardFile] = useState<File | null>(null);
  const [licenseFile, setLicenseFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("ข้อมูลเอกสารส่วนตัวจะเห็นได้เฉพาะคุณและแอดมินที่มีสิทธิ์");

  async function saveProfile(event: React.FormEvent) {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    setMessage("กำลังบีบอัดรูปและบันทึกโปรไฟล์...");
    let generalProfileSaved = false;
    try {
      await updateOwnProfile(profile.uid, draft);
      generalProfileSaved = true;
      await onProfileUpdated();
      // Process large camera photos one at a time to avoid exhausting memory on mobile browsers.
      const photo = photoFile ? await uploadProfilePhoto(profile.uid, photoFile) : null;
      const idCard = idCardFile ? await uploadPersonalDocument(profile.uid, "id-card-front", idCardFile) : null;
      const driverLicense = licenseFile ? await uploadPersonalDocument(profile.uid, "driver-license-front", licenseFile) : null;
      if (photo || idCard || driverLicense) {
        await updateOwnProfile(profile.uid, draft, {
          ...(photo ? { photoURL: photo.photoURL, profilePhotoPath: photo.storagePath } : {}),
          ...(idCard ? { idCardFrontPath: idCard.storagePath, idCardFrontFileName: idCard.fileName } : {}),
          ...(driverLicense ? { driverLicenseFrontPath: driverLicense.storagePath, driverLicenseFrontFileName: driverLicense.fileName } : {})
        });
        await onProfileUpdated();
      }
      setPhotoFile(null);
      setIdCardFile(null);
      setLicenseFile(null);
      setMessage("บันทึกโปรไฟล์เรียบร้อย ข้อมูลเชื่อมกับหน้ารถและคนขับแล้ว");
    } catch (error) {
      setMessage(generalProfileSaved ? `บันทึกข้อมูลทั่วไปแล้ว แต่แนบไฟล์ไม่สำเร็จ: ${toMessage(error)}` : toMessage(error));
    } finally {
      setSaving(false);
    }
  }

  async function downloadDocument(path: string, fileName: string) {
    try {
      setMessage("กำลังเปิดเอกสารส่วนตัว...");
      await downloadPrivateDocument(path, fileName);
      setMessage("ดาวน์โหลดเอกสารแล้ว");
    } catch (error) {
      setMessage(toMessage(error));
    }
  }

  return (
    <section className="screen profile-screen">
      <div className="profile-page-head">
        <div><span className="eyebrow">PERSONAL PROFILE</span><h1>โปรไฟล์ของฉัน</h1><p>ข้อมูลนี้ใช้ระบุตัวตนและมอบหมายงานในระบบ</p></div>
        <ProfileAvatar profile={profile} className="profile-hero-avatar" />
      </div>

      <form className="profile-form" onSubmit={saveProfile}>
        <section className="profile-panel">
          <header><Camera size={20} /><div><h2>รูปและชื่อจริง</h2><p>หากไม่อัปโหลดรูป ระบบจะใช้รูปจากบัญชี Google หรือรูปเริ่มต้น</p></div></header>
          <label className="profile-upload-row"><span><Upload size={17} /> รูปโปรไฟล์</span><input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => setPhotoFile(event.target.files?.[0] ?? null)} /><small>{photoFile?.name || (profile.profilePhotoPath ? "ใช้รูปที่อัปโหลดเอง" : profile.photoURL ? "ใช้รูปจาก Google" : "ยังไม่มีรูป")} · ระบบบีบอัดรูปให้ไม่เกิน 1 MB</small>{photoFile && <FilePreview key={`${photoFile.name}-${photoFile.lastModified}`} file={photoFile} alt="ตัวอย่างรูปโปรไฟล์" compact />}</label>
          <div className="profile-field-grid name-fields">
            <label><span>คำนำหน้าชื่อ *</span><select required value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value as NameTitle })}><option value="">เลือก</option>{nameTitles.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
            <label><span>ชื่อจริง *</span><input required maxLength={50} autoComplete="given-name" value={draft.firstName} onChange={(event) => setDraft({ ...draft, firstName: event.target.value })} /></label>
            <label><span>นามสกุลจริง *</span><input required maxLength={50} autoComplete="family-name" value={draft.lastName} onChange={(event) => setDraft({ ...draft, lastName: event.target.value })} /></label>
            <label><span>เบอร์ติดต่อ</span><input type="tel" inputMode="numeric" maxLength={12} pattern="[0-9]{3}-[0-9]{3}-[0-9]{4}" autoComplete="tel" value={draft.phone} placeholder="080-000-0000" onChange={(event) => setDraft({ ...draft, phone: formatPhoneNumber(event.target.value) })} /></label>
          </div>
        </section>

        <section className="profile-panel">
          <header><FileImage size={20} /><div><h2>ข้อมูลและเอกสารส่วนตัว</h2><p>รูปต้นฉบับไม่เกิน 20 MB จะถูกบีบอัดเหลือไม่เกิน 1 MB · PDF ไม่เกิน 5 MB</p></div></header>
          <div className="profile-field-grid">
            <label><span>เลขที่ใบขับขี่</span><input maxLength={50} value={draft.licenseNumber} onChange={(event) => setDraft({ ...draft, licenseNumber: event.target.value })} /></label>
            <label><span>ประเภทใบขับขี่</span><select value={draft.licenseType} onChange={(event) => setDraft({ ...draft, licenseType: event.target.value })}><option value="">เลือกประเภทใบขับขี่</option>{driverLicenseTypes.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
            <label><span>ใบขับขี่หมดอายุ</span><input type="date" value={draft.licenseExpiry} onChange={(event) => setDraft({ ...draft, licenseExpiry: event.target.value })} /></label>
          </div>
          <div className="personal-document-grid">
            <DocumentUpload label="บัตรประชาชน (ด้านหน้า)" currentName={profile.idCardFrontFileName} currentPath={profile.idCardFrontPath} selectedFile={idCardFile} onChange={setIdCardFile} onDownload={profile.idCardFrontPath ? () => downloadDocument(profile.idCardFrontPath, profile.idCardFrontFileName) : undefined} />
            <DocumentUpload label="ใบขับขี่ (ด้านหน้า)" currentName={profile.driverLicenseFrontFileName} currentPath={profile.driverLicenseFrontPath} selectedFile={licenseFile} onChange={setLicenseFile} onDownload={profile.driverLicenseFrontPath ? () => downloadDocument(profile.driverLicenseFrontPath, profile.driverLicenseFrontFileName) : undefined} />
          </div>
        </section>

        <div className="profile-save-bar"><span role="status">{message}</span><button disabled={saving}><Save size={17} /> {saving ? "กำลังบันทึก..." : "บันทึกโปรไฟล์"}</button></div>
      </form>
    </section>
  );
}

function DocumentUpload({ label, currentName, currentPath, selectedFile, onChange, onDownload }: { label: string; currentName: string; currentPath: string; selectedFile: File | null; onChange: (file: File | null) => void; onDownload?: () => void }) {
  return (
    <article className="document-upload-card">
      <div><FileImage size={20} /><span><strong>{label}</strong><small>{selectedFile?.name || currentName || "ยังไม่ได้แนบเอกสาร"}</small></span></div>
      {selectedFile && <FilePreview key={`${selectedFile.name}-${selectedFile.lastModified}`} file={selectedFile} alt={`ตัวอย่าง${label}`} />}
      {!selectedFile && currentPath && <StoredFilePreview storagePath={currentPath} fileName={currentName} alt={`ตัวอย่าง${label}`} />}
      <label><Upload size={15} /> {currentName ? "เปลี่ยนไฟล์" : "เลือกไฟล์"}<input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" onChange={(event) => onChange(event.target.files?.[0] ?? null)} /></label>
      {onDownload && <button type="button" onClick={onDownload}><Download size={15} /> ดาวน์โหลดไฟล์เดิม</button>}
    </article>
  );
}

function StoredFilePreview({ storagePath, fileName, alt }: { storagePath: string; fileName: string; alt: string }) {
  const isPdf = /\.pdf$/i.test(fileName);
  const [retryKey, setRetryKey] = useState(0);
  const [preview, setPreview] = useState<{ status: "loading" | "image" | "error"; url: string }>({ status: "loading", url: "" });

  useEffect(() => {
    let cancelled = false;
    if (isPdf) return;

    getPrivateDocumentPreviewURL(storagePath)
      .then((url) => {
        if (!cancelled) setPreview({ status: "image", url });
      })
      .catch(() => {
        if (!cancelled) setPreview({ status: "error", url: "" });
      });

    return () => {
      cancelled = true;
    };
  }, [isPdf, retryKey, storagePath]);

  if (isPdf) {
    return <div className="file-preview pdf"><FileImage size={24} /><span>ไฟล์ PDF ที่บันทึกไว้</span></div>;
  }

  if (preview.status === "image") {
    return <Image className="file-preview" src={preview.url} alt={alt} width={900} height={600} onError={() => setPreview({ status: "error", url: "" })} unoptimized />;
  }

  if (preview.status === "error") {
    return <div className="file-preview pdf error"><FileImage size={24} /><span>โหลดรูปไม่สำเร็จ</span><small>{fileName || "กรุณาดาวน์โหลดไฟล์เดิม"}</small><button className="file-preview-retry" type="button" onClick={() => { setPreview({ status: "loading", url: "" }); setRetryKey((value) => value + 1); }}>ลองโหลดอีกครั้ง</button></div>;
  }

  return <div className="file-preview pdf loading" aria-live="polite"><span>กำลังโหลดรูปเอกสาร...</span></div>;
}

function FilePreview({ file, alt, compact = false }: { file: File; alt: string; compact?: boolean }) {
  const [previewURL, setPreviewURL] = useState("");

  useEffect(() => {
    if (!file.type.startsWith("image/")) return;
    const reader = new FileReader();
    reader.onload = () => setPreviewURL(typeof reader.result === "string" ? reader.result : "");
    reader.readAsDataURL(file);
    return () => reader.abort();
  }, [file]);

  if (!previewURL) {
    return <div className={`file-preview pdf ${compact ? "compact" : ""}`}><FileImage size={24} /><span>ไฟล์ PDF พร้อมอัปโหลด</span></div>;
  }

  return <Image className={`file-preview ${compact ? "compact" : ""}`} src={previewURL} alt={alt} width={900} height={600} unoptimized />;
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

      <CompactJobCard
        className="primary"
        eyebrow={`ใบงาน ${job.workOrder}`}
        title={job.customer}
        subtitle={`${job.pickupLocation} → ${job.deliveryLocation}`}
        status={statusLabels[job.status]}
      >
        <div className="job-card-head job-card-actions-head">
          <span className="label">รายละเอียดเส้นทางและการติดต่อ</span>
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
      </CompactJobCard>

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
          <JobSummaryCard
            key={job.id}
            job={job}
            selected={job.id === selectedJobId}
            onSelect={onSelectJob}
          />
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

      <CompactJobCard
        eyebrow={`ตำแหน่งล่าสุด · ${selectedJob.workOrder}`}
        title={selectedJob.driverName}
        subtitle={selectedJob.vehiclePlate}
        status={`${selectedJob.currentLocation.speed} กม./ชม.`}
      >
        <div className="route-block">
          <RoutePoint title="รับสินค้า" value={selectedJob.pickupLocation} />
          <RoutePoint title="ส่งสินค้า" value={selectedJob.deliveryLocation} />
        </div>
      </CompactJobCard>
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

      <CompactJobCard
        className="proof-card"
        eyebrow={`POD / รูปหน้างาน · ${job.workOrder}`}
        title="แนบไฟล์หลักฐานส่งของ"
        subtitle={job.customer}
        status={statusLabels[job.status]}
        icon={<FileImage size={22} />}
      >
        <div className="proof-card-content">
          <p>รูปต้นฉบับจะถูกบีบอัดเหลือไม่เกิน 1 MB · PDF ไม่เกิน 10 MB</p>
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
        </div>
      </CompactJobCard>

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
          <JobSummaryCard
            key={job.id}
            job={job}
            selected={job.id === selectedJobId}
            onSelect={onSelectJob}
          />
        ))}
      </div>
    </section>
  );
}

function formatDriverPhone(phone: string) {
  let digits = phone.replace(/\D/g, "");

  if (digits.length === 11 && digits.startsWith("66")) {
    digits = `0${digits.slice(2)}`;
  }

  if (digits.length === 10) {
    return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
  }

  return phone.trim() || "ไม่ระบุเบอร์โทร";
}

function CompactJobCard({
  eyebrow,
  title,
  subtitle,
  status,
  icon,
  className = "",
  children
}: {
  eyebrow: string;
  title: string;
  subtitle: string;
  status: string;
  icon?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <article className={`job-card compact-job-card ${className} ${expanded ? "expanded" : ""}`.trim()}>
      <button
        className="compact-job-toggle"
        type="button"
        aria-expanded={expanded}
        onClick={() => setExpanded((current) => !current)}
      >
        <span className="compact-job-icon" aria-hidden="true">{icon ?? <Truck size={20} />}</span>
        <span className="compact-job-copy">
          <small>{eyebrow}</small>
          <strong>{title}</strong>
          <span>{subtitle}</span>
        </span>
        <span className="compact-job-status">{status}</span>
        <span className="compact-job-chevron" aria-hidden="true">
          {expanded ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
        </span>
      </button>
      {expanded && <div className="compact-job-details">{children}</div>}
    </article>
  );
}

function JobSummaryCard({
  job,
  selected,
  onSelect
}: {
  job: TransportJob;
  selected: boolean;
  onSelect: (jobId: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const phone = formatDriverPhone(job.driverPhone);
  const phoneDigits = job.driverPhone.replace(/\D/g, "");

  function toggleDetails() {
    onSelect(job.id);
    setExpanded((current) => !current);
  }

  return (
    <article className={`job-summary-card ${selected ? "selected-job" : ""} ${expanded ? "expanded" : ""}`}>
      <button className="job-summary-toggle" type="button" aria-expanded={expanded} onClick={toggleDetails}>
        <span className="job-summary-toggle-icon"><MapPin size={19} /></span>
        <span className="job-summary-toggle-copy">
          <small>ใบงาน {job.workOrder}</small>
          <strong>
            <span>{job.pickupLocation}</span>
            <ArrowRight size={16} aria-hidden="true" />
            <span>{job.deliveryLocation}</span>
          </strong>
        </span>
        <span className={job.alerts.length ? "status danger" : "status"}>{statusLabels[job.status]}</span>
        <span className="job-summary-toggle-chevron" aria-hidden="true">
          {expanded ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
        </span>
      </button>

      {expanded && (
        <div className="job-summary-expanded">
          <div className="job-summary-meta">
            <div className="job-driver">
              <UserRound size={18} />
              <span><small>คนขับ</small><strong>{job.driverName || "ยังไม่ระบุคนขับ"}</strong></span>
            </div>
            {phoneDigits ? (
              <a className="job-phone" href={`tel:${phoneDigits}`} aria-label={`โทรหาคนขับ ${phone}`}>
                <Phone size={17} /> {phone}
              </a>
            ) : (
              <span className="job-phone"><Phone size={17} /> {phone}</span>
            )}
            <span className="vehicle-plate"><Truck size={17} /> {job.vehiclePlate || "ไม่ระบุทะเบียน"}</span>
          </div>
          <div className="job-summary-details">
            <div><small>ลูกค้า</small><strong>{job.customer}</strong></div>
            <div><small>ETA</small><strong>{job.eta}</strong></div>
            <div><small>อัปเดตล่าสุด</small><strong>{job.lastUpdatedMinutes} นาทีที่แล้ว</strong></div>
            <div><small>การแจ้งเตือน</small><strong>{job.alerts.length ? `${job.alerts.length} รายการ` : "ไม่มี"}</strong></div>
          </div>
        </div>
      )}
    </article>
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
              fillColor: job.alerts.length ? "#8c615b" : "#4c5960",
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
  profile,
  activeJobs,
  selectedJobId,
  onSelectJob,
  onCreateJob,
  canWrite,
  compact = true
}: {
  profile: UserProfile;
  activeJobs: TransportJob[];
  selectedJobId: string;
  onSelectJob: (jobId: string) => void;
  onCreateJob: (draft: JobDraft) => void;
  canWrite: boolean;
  compact?: boolean;
}) {
  const [draft, setDraft] = useState<JobDraft>(createEmptyJobDraft);
  const alertCount = activeJobs.reduce((count, job) => count + job.alerts.length, 0);
  const delayedCount = activeJobs.filter((job) => job.alerts.some((alert) => alert.includes("ไม่อัปเดต"))).length;
  const organizationId = profile.organizationId ?? "main";

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
  }

  return (
    <section className={compact ? "screen" : "admin-wide"}>
      <div className="section-title">
        <div>
          <h1>Jobs / ใบงาน</h1>
          <p>สร้าง มอบหมาย และติดตามใบงานขนส่ง</p>
        </div>
      </div>

      <form className="dispatch-form" onSubmit={(event) => { event.preventDefault(); submitJob(); }}>
          <header className="dispatch-form-hero">
            <div><span>DISPATCH CENTER</span><h2>ฟอร์มแจ้งงาน</h2><p>สร้างใบแจ้งงานและบันทึกเข้าระบบ</p></div>
            <FilePenLine size={24} />
          </header>

          <div className="dispatch-form-body">
            <div className="dispatch-general-grid">
              <DispatchField label="เลขที่ใบส่งงาน"><input value={draft.workOrder} onChange={(event) => updateDraft("workOrder", event.target.value)} required /></DispatchField>
              <DispatchField label="บริษัทผู้ว่าจ้าง"><ListManagerComboBox field="customer" value={draft.customer} onChange={(value) => updateDraft("customer", value)} placeholder="ค้นหาหรือเพิ่มบริษัทผู้ว่าจ้าง" organizationId={organizationId} actor={profile} required /></DispatchField>
              <DispatchField label="วันที่รับงานจากผู้ว่าจ้าง"><input type="date" value={draft.jobDate} onChange={(event) => updateDraft("jobDate", event.target.value)} /></DispatchField>
              <DispatchField label="ประเภทสินค้า"><ListManagerComboBox field="cargo_type" value={draft.cargoType} onChange={(value) => updateDraft("cargoType", value)} placeholder="ค้นหาหรือเพิ่มประเภทสินค้า" organizationId={organizationId} actor={profile} /></DispatchField>
              <DispatchField label="ประเภทรถ"><ListManagerComboBox field="vehicle_type" value={draft.vehicleType} onChange={(value) => updateDraft("vehicleType", value)} placeholder="ค้นหาหรือเพิ่มประเภทรถ" organizationId={organizationId} actor={profile} /></DispatchField>
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
                organizationId={organizationId}
                actor={profile}
              />
              <DispatchStop
                title="ส่งงาน"
                location={draft.deliveryLocation}
                date={draft.deliveryDate}
                time={draft.deliveryTime}
                contact={draft.deliveryContact}
                onChange={updateDraft}
                fields={{ location: "deliveryLocation", date: "deliveryDate", time: "deliveryTime", contact: "deliveryContact" }}
                organizationId={organizationId}
                actor={profile}
              />
            </div>

            <div className="dispatch-general-grid assignment-grid">
              <DispatchField label="มอบหมายพนักงาน (แอพ)"><ListManagerComboBox field="employee" value={draft.assignedEmployee} onChange={(value) => updateDraft("assignedEmployee", value)} placeholder="ค้นหาหรือเพิ่มผู้รับงาน" organizationId={organizationId} actor={profile} /></DispatchField>
              <DispatchField label="พนักงานขับรถ"><ListManagerComboBox field="driver" value={draft.driverName} onChange={(value) => updateDraft("driverName", value)} placeholder="ค้นหาหรือเพิ่มพนักงานขับรถ" organizationId={organizationId} actor={profile} /></DispatchField>
              <DispatchField label="เบอร์ติดต่อ"><input type="tel" value={draft.driverPhone} onChange={(event) => updateDraft("driverPhone", event.target.value)} placeholder="080-123-4567" /></DispatchField>
              <DispatchField label="ทะเบียนรถ"><ListManagerComboBox field="vehicle_plate" value={draft.vehiclePlate} onChange={(value) => updateDraft("vehiclePlate", value)} placeholder="ค้นหาหรือเพิ่มทะเบียนรถ" organizationId={organizationId} actor={profile} /></DispatchField>
              <DispatchField label="หมายเหตุ" wide><textarea value={draft.notes} onChange={(event) => updateDraft("notes", event.target.value)} rows={4} placeholder="รายละเอียดเพิ่มเติมสำหรับงานนี้" /></DispatchField>
            </div>

            <div className="dispatch-form-actions">
              <button className="save-job-button" type="submit" disabled={!canWrite}><Save size={17} /> บันทึกงาน</button>
              <button type="button" onClick={() => setDraft(createEmptyJobDraft())}><RotateCcw size={17} /> ล้างข้อมูล</button>
            </div>
          </div>
      </form>

      <div className="stat-strip">
        <Metric icon={<Truck size={18} />} label="กำลังวิ่ง" value={`${activeJobs.length}`} />
        <Metric icon={<AlertTriangle size={18} />} label="แจ้งเตือน" value={`${alertCount}`} />
        <Metric icon={<Clock3 size={18} />} label="ส่งช้า" value={`${delayedCount}`} />
      </div>

      <div className="job-list">
        {activeJobs.map((job) => (
          <JobSummaryCard
            key={job.id}
            job={job}
            selected={job.id === selectedJobId}
            onSelect={onSelectJob}
          />
        ))}
      </div>
    </section>
  );
}

function DispatchField({ label, wide = false, children }: { label: string; wide?: boolean; children: React.ReactNode }) {
  return (
    <div className={`dispatch-field ${wide ? "wide" : ""}`}>
      <span>{label}</span>
      <div>{children}</div>
    </div>
  );
}

function DispatchStop({
  title,
  location,
  date,
  time,
  contact,
  onChange,
  fields,
  organizationId,
  actor
}: {
  title: string;
  location: string;
  date: string;
  time: string;
  contact: string;
  onChange: (field: keyof JobDraft, value: string) => void;
  fields: { location: keyof JobDraft; date: keyof JobDraft; time: keyof JobDraft; contact: keyof JobDraft };
  organizationId: string;
  actor: UserProfile;
}) {
  return (
    <fieldset className="dispatch-stop">
      <legend>{title}</legend>
      <DispatchField label="สถานที่"><ListManagerComboBox field="location" value={location} onChange={(value) => onChange(fields.location, value)} placeholder={`ค้นหาหรือเพิ่มสถานที่${title === "รับงาน" ? "รับ" : "ส่ง"}`} organizationId={organizationId} actor={actor} /></DispatchField>
      <DispatchField label="วันที่"><input type="date" value={date} onChange={(event) => onChange(fields.date, event.target.value)} /></DispatchField>
      <DispatchField label="เวลา"><input type="time" value={time} onChange={(event) => onChange(fields.time, event.target.value)} /></DispatchField>
      <DispatchField label="ติดต่อ"><ListManagerComboBox field="contact" value={contact} onChange={(value) => onChange(fields.contact, value)} placeholder="ค้นหาหรือเพิ่มผู้ติดต่อ" organizationId={organizationId} actor={actor} /></DispatchField>
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
          <p>รูปจะถูกบีบอัดเหลือไม่เกิน 1 MB</p>
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
