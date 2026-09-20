import { useEffect, useMemo, useState } from "react";
import { Alert, Image, Linking, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Google from "expo-auth-session/providers/google";
import * as Location from "expo-location";
import * as WebBrowser from "expo-web-browser";
import {
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithCredential,
  signOut,
  type User
} from "firebase/auth";
import {
  driverActions,
  statusLabels,
  type JobStatus,
  type TransportJob
} from "@s-fast-transport/shared";
import { auth } from "./src/firebase";
import {
  flushPendingPoints,
  getActiveTrackingSession,
  startJobTracking,
  stopJobTracking,
  type TrackingSession
} from "./src/location-tracking";
import {
  ensureMobileProfile,
  getMobileProfile,
  rollbackTrackingStart,
  subscribeDriverJobs,
  updateDriverJobStatus,
  type MobileProfile
} from "./src/transport-repository";

WebBrowser.maybeCompleteAuthSession();

const colors = {
  bg: "#f3f5f7",
  surface: "#ffffff",
  surface2: "#e9eef2",
  text: "#102235",
  muted: "#657486",
  border: "#d8e0e7",
  accent: "#0d2b45",
  orange: "#f59e0b",
  orangeSoft: "#fff3d6",
  danger: "#b5473f",
  success: "#17745b"
};

type AppTab = "home" | "jobs" | "account";

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<MobileProfile | null>(null);
  const [jobs, setJobs] = useState<TransportJob[]>([]);
  const [selectedJobId, setSelectedJobId] = useState("");
  const [activeSession, setActiveSession] = useState<TrackingSession | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [message, setMessage] = useState("กำลังเชื่อมต่อระบบ...");
  const [busy, setBusy] = useState(false);
  const [jobExpanded, setJobExpanded] = useState(true);
  const [activeTab, setActiveTab] = useState<AppTab>("home");
  const [locationPermission, setLocationPermission] = useState({
    servicesEnabled: false,
    foreground: "undetermined",
    background: "undetermined"
  });
  const googleClientId = Platform.select({
    android: process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID,
    ios: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID,
    default: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID
  });

  const [request, response, promptAsync] = Google.useAuthRequest({
    clientId: googleClientId || "missing-google-oauth-client-id",
    webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
    androidClientId: process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID,
    iosClientId: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID
  });

  useEffect(() => onAuthStateChanged(auth, async (nextUser) => {
    setUser(nextUser);
    setProfile(null);
    setJobs([]);
    if (!nextUser) {
      setMessage("กรุณาเข้าสู่ระบบด้วยบัญชีที่แอดมินอนุมัติ");
      setAuthReady(true);
      return;
    }

    try {
      await ensureMobileProfile(
        nextUser.uid,
        nextUser.email ?? "",
        nextUser.displayName ?? "",
        nextUser.photoURL ?? ""
      );
      const nextProfile = await getMobileProfile(nextUser.uid);
      setProfile(nextProfile);
      setMessage(nextProfile?.active && nextProfile.approvalStatus === "approved"
        ? "พร้อมรับตำแหน่งจาก GPS"
        : "บัญชีนี้ยังไม่ได้รับอนุมัติ");
      setActiveSession(await getActiveTrackingSession());
      await flushPendingPoints();
    } catch (error) {
      setMessage(toMessage(error));
    } finally {
      setAuthReady(true);
    }
  }), []);

  useEffect(() => {
    if (!response) return;
    if (response.type === "cancel" || response.type === "dismiss") {
      setMessage("ยกเลิกการเข้าสู่ระบบแล้ว กรุณากดเข้าสู่ระบบอีกครั้ง");
      setBusy(false);
      return;
    }
    if (response.type === "error") {
      setMessage(response.params.error_description || response.error?.message || "Google ไม่อนุญาตให้เข้าสู่ระบบ");
      setBusy(false);
      return;
    }
    if (response.type !== "success") return;
    const idToken = response.authentication?.idToken ?? response.params.id_token;
    const accessToken = response.authentication?.accessToken ?? response.params.access_token;
    if (!idToken && !accessToken) {
      setMessage("Google ไม่ได้ส่งโทเคนสำหรับเข้าสู่ระบบ");
      return;
    }
    setBusy(true);
    signInWithCredential(auth, GoogleAuthProvider.credential(idToken, accessToken))
      .catch((error) => setMessage(toMessage(error)))
      .finally(() => setBusy(false));
  }, [response]);

  useEffect(() => {
    if (!profile?.active || profile.approvalStatus !== "approved" || profile.role !== "driver") return;
    return subscribeDriverJobs(
      profile.uid,
      (nextJobs) => {
        setJobs(nextJobs);
        setSelectedJobId((current) => nextJobs.some((job) => job.id === current) ? current : nextJobs[0]?.id ?? "");
      },
      (error) => setMessage(`อ่านใบงานไม่สำเร็จ: ${error}`)
    );
  }, [profile]);

  useEffect(() => {
    if (!user) return;
    void refreshLocationPermission();
  }, [user, activeSession]);

  const selectedJob = useMemo(
    () => jobs.find((job) => job.id === selectedJobId) ?? jobs[0] ?? null,
    [jobs, selectedJobId]
  );

  const activeJobs = useMemo(
    () => jobs.filter((job) => !["completed", "cancelled"].includes(job.status)),
    [jobs]
  );
  const completedJobs = useMemo(
    () => jobs.filter((job) => job.status === "completed"),
    [jobs]
  );

  async function refreshLocationPermission() {
    const [servicesEnabled, foreground, background] = await Promise.all([
      Location.hasServicesEnabledAsync(),
      Location.getForegroundPermissionsAsync(),
      Location.getBackgroundPermissionsAsync()
    ]);
    setLocationPermission({
      servicesEnabled,
      foreground: foreground.status,
      background: background.status
    });
  }

  async function handleDriverAction(status: JobStatus) {
    if (!selectedJob || !profile) return;
    const isStart = status === "accepted";
    const isComplete = status === "completed";
    if (activeSession && activeSession.jobId !== selectedJob.id) {
      Alert.alert("มีงานที่กำลังติดตามอยู่", `กรุณาจบงาน ${activeSession.workOrder} ก่อนเริ่มงานใหม่`);
      return;
    }

    setBusy(true);
    try {
      if (isComplete) {
        await stopJobTracking();
        await updateDriverJobStatus(selectedJob, status, profile);
        setActiveSession(null);
        setMessage("จบงานและหยุดแชร์ตำแหน่งแล้ว");
        return;
      }

      await updateDriverJobStatus(selectedJob, status, profile);
      if (isStart && !activeSession) {
        const session: TrackingSession = {
          jobId: selectedJob.id,
          driverUid: profile.uid,
          organizationId: selectedJob.organizationId ?? profile.organizationId ?? "main",
          workOrder: selectedJob.workOrder
        };
        await startJobTracking(session);
        setActiveSession(session);
        setMessage("กำลังแชร์ตำแหน่ง แม้สลับไปใช้ Google Maps");
      } else {
        setMessage(`อัปเดตเป็น “${statusLabels[status]}” แล้ว`);
      }
    } catch (error) {
      if (isStart && !activeSession && !selectedJob.trackingEnabled) {
        try {
          await stopJobTracking();
          await rollbackTrackingStart(selectedJob.id);
        } catch {
          // Preserve the original permission/tracking error for the driver.
        }
      }
      setMessage(toMessage(error));
      Alert.alert("ดำเนินการไม่สำเร็จ", toMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function logout() {
    if (activeSession) {
      Alert.alert("ยังมีงานที่กำลังติดตาม", "กรุณากดจบงานก่อนออกจากระบบ");
      return;
    }
    await signOut(auth);
  }

  if (!authReady) return <CenteredState icon="sync" title="กำลังเปิดระบบติดตาม" detail={message} />;
  if (!user) {
    const missingClientId = !googleClientId;
    return (
      <CenteredState
        icon="navigate-circle"
        title="S Fast Transport"
        detail={missingClientId ? "ยังไม่ได้ตั้งค่า Google OAuth Client ID สำหรับแอปคนขับ" : message}
        actionLabel="เข้าสู่ระบบด้วย Google"
        actionDisabled={!request || busy || missingClientId}
        onAction={() => {
          setBusy(true);
          setMessage("กำลังเปิดหน้าลงชื่อเข้าใช้ Google...");
          void promptAsync().catch((error) => {
            setMessage(toMessage(error));
            setBusy(false);
          });
        }}
      />
    );
  }
  if (!profile?.active || profile.approvalStatus !== "approved") {
    return <CenteredState icon="time" title="กำลังรออนุมัติบัญชี" detail={message} actionLabel="ออกจากระบบ" onAction={() => void logout()} />;
  }
  if (profile.role !== "driver") {
    return <CenteredState icon="shield" title="แอปนี้สำหรับพนักงานขับรถ" detail={`บัญชีปัจจุบันมีสิทธิ์ ${profile.role}`} actionLabel="ออกจากระบบ" onAction={() => void logout()} />;
  }

  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.safe}>
        <View style={styles.appShell}>
          <AppHeader
            name={profile.displayName}
            photoURL={safeGooglePhotoUrl(user.photoURL)}
            live={Boolean(activeSession)}
            onAccount={() => setActiveTab("account")}
          />

          <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
            {activeTab === "home" && (
              <>
                <View>
                  <Text style={styles.kicker}>ศูนย์งานคนขับ</Text>
                  <Text style={styles.title}>สวัสดี, {firstName(profile.displayName)}</Text>
                  <Text style={styles.muted}>ตรวจงานและสถานะการแชร์ตำแหน่งได้จากหน้านี้</Text>
                </View>

                <View style={styles.summaryRow}>
                  <SummaryCard icon="briefcase-outline" label="งานที่ต้องทำ" value={String(activeJobs.length)} tone="navy" />
                  <SummaryCard icon="checkmark-done-outline" label="เสร็จแล้ว" value={String(completedJobs.length)} tone="orange" />
                </View>

                {selectedJob ? (
                  <JobPanel
                    job={selectedJob}
                    expanded={jobExpanded}
                    busy={busy}
                    activeSession={activeSession}
                    onToggle={() => setJobExpanded((value) => !value)}
                    onAction={(status) => void handleDriverAction(status)}
                  />
                ) : (
                  <EmptyJobs onOpenJobs={() => setActiveTab("jobs")} />
                )}

                <Pressable style={styles.statusCard} onPress={() => setActiveTab("account")}>
                  <View style={[styles.statusIcon, activeSession && styles.statusIconLive]}>
                    <Ionicons name={activeSession ? "navigate" : "shield-checkmark-outline"} size={24} color={activeSession ? "#ffffff" : colors.accent} />
                  </View>
                  <View style={styles.grow}>
                    <Text style={styles.noticeTitle}>{activeSession ? `กำลังแชร์ตำแหน่ง ${activeSession.workOrder}` : "ระบบติดตามยังไม่ทำงาน"}</Text>
                    <Text style={styles.muted}>{message}</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={20} color={colors.muted} />
                </Pressable>
              </>
            )}

            {activeTab === "jobs" && (
              <>
                <View style={styles.sectionHeading}>
                  <View>
                    <Text style={styles.kicker}>รายการขนส่ง</Text>
                    <Text style={styles.title}>ใบงานของฉัน</Text>
                    <Text style={styles.muted}>{jobs.length} ใบงานที่บัญชีนี้ได้รับมอบหมาย</Text>
                  </View>
                  <View style={styles.countBadge}><Text style={styles.countBadgeText}>{jobs.length}</Text></View>
                </View>

                {jobs.length ? jobs.map((job) => (
                  <Pressable
                    key={job.id}
                    style={[styles.jobListCard, selectedJobId === job.id && styles.jobListCardSelected]}
                    onPress={() => {
                      setSelectedJobId(job.id);
                      setJobExpanded(true);
                      setActiveTab("home");
                    }}
                  >
                    <View style={styles.jobListTop}>
                      <Text style={styles.workOrder}>{job.workOrder}</Text>
                      <Text style={[styles.jobStatus, job.status === "completed" && styles.jobStatusComplete]}>{statusLabels[job.status]}</Text>
                    </View>
                    <Text style={styles.cardTitle}>{job.customer}</Text>
                    <View style={styles.routeCompact}>
                      <Ionicons name="radio-button-on" size={15} color={colors.orange} />
                      <Text style={styles.routeCompactText} numberOfLines={1}>{job.pickupLocation}</Text>
                    </View>
                    <View style={styles.routeCompact}>
                      <Ionicons name="location" size={15} color={colors.accent} />
                      <Text style={styles.routeCompactText} numberOfLines={1}>{job.deliveryLocation}</Text>
                    </View>
                    <View style={styles.jobListFooter}>
                      <Text style={styles.vehicleText}>{job.vehiclePlate}</Text>
                      <Text style={styles.openJobText}>เปิดใบงาน <Ionicons name="arrow-forward" size={13} /></Text>
                    </View>
                  </Pressable>
                )) : (
                  <EmptyJobs onOpenJobs={() => setActiveTab("account")} accountMode />
                )}
              </>
            )}

            {activeTab === "account" && (
              <>
                <View>
                  <Text style={styles.kicker}>บัญชีและอุปกรณ์</Text>
                  <Text style={styles.title}>ตั้งค่าคนขับ</Text>
                  <Text style={styles.muted}>ตรวจสิทธิ์ GPS และข้อมูลบัญชีที่กำลังใช้งาน</Text>
                </View>

                <View style={styles.profileCard}>
                  <ProfileAvatar name={profile.displayName} photoURL={safeGooglePhotoUrl(user.photoURL)} size="large" />
                  <View style={styles.grow}>
                    <Text style={styles.cardTitle}>{profile.displayName}</Text>
                    <Text style={styles.muted}>{user.email}</Text>
                    <View style={styles.approvedBadge}><Ionicons name="checkmark-circle" size={14} color={colors.success} /><Text style={styles.approvedText}>อนุมัติแล้ว · คนขับ</Text></View>
                  </View>
                </View>

                <View style={styles.settingsCard}>
                  <Text style={styles.settingsTitle}>ตำแหน่งและ GPS</Text>
                  <PermissionRow label="บริการ GPS" ok={locationPermission.servicesEnabled} detail={locationPermission.servicesEnabled ? "เปิดใช้งาน" : "ปิดอยู่"} />
                  <PermissionRow label="ตำแหน่งขณะใช้งาน" ok={locationPermission.foreground === "granted"} detail={permissionLabel(locationPermission.foreground)} />
                  <PermissionRow label="ตำแหน่งเบื้องหลัง" ok={locationPermission.background === "granted"} detail={permissionLabel(locationPermission.background)} />
                  <View style={styles.settingsActions}>
                    <Pressable style={styles.secondaryButton} onPress={() => void refreshLocationPermission()}>
                      <Ionicons name="refresh" size={18} color={colors.accent} />
                      <Text style={styles.secondaryButtonText}>ตรวจอีกครั้ง</Text>
                    </Pressable>
                    <Pressable style={styles.primaryButton} onPress={() => void Linking.openSettings()}>
                      <Ionicons name="settings-outline" size={18} color="#ffffff" />
                      <Text style={styles.primaryButtonText}>เปิดการตั้งค่า</Text>
                    </Pressable>
                  </View>
                </View>

                <View style={styles.settingsCard}>
                  <Text style={styles.settingsTitle}>ข้อมูลการทำงาน</Text>
                  <InfoRow label="องค์กร" value={profile.organizationId ?? "บัญชีหลัก"} />
                  <InfoRow label="สถานะบัญชี" value="พร้อมรับงาน" />
                  <InfoRow label="งานที่กำลังติดตาม" value={activeSession?.workOrder ?? "ไม่มี"} />
                </View>

                <Pressable style={styles.logoutButton} onPress={() => void logout()}>
                  <Ionicons name="log-out-outline" size={20} color={colors.danger} />
                  <Text style={styles.logoutText}>ออกจากระบบ</Text>
                </Pressable>
              </>
            )}
          </ScrollView>

          <BottomNavigation active={activeTab} onChange={setActiveTab} jobCount={activeJobs.length} />
        </View>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

function AppHeader({ name, photoURL, live, onAccount }: { name: string; photoURL: string; live: boolean; onAccount: () => void }) {
  return (
    <View style={styles.header}>
      <Image source={require("./assets/truck-logo.png")} style={styles.brandMark} resizeMode="contain" />
      <View style={styles.grow}>
        <Text style={styles.brandName}>S FAST TRANSPORT</Text>
        <Text style={styles.headerSub} numberOfLines={1}>{name}</Text>
      </View>
      <View style={[styles.headerLive, live && styles.headerLiveActive]}>
        <View style={[styles.headerLiveDot, live && styles.headerLiveDotActive]} />
        <Text style={[styles.headerLiveText, live && styles.headerLiveTextActive]}>{live ? "LIVE" : "พร้อมรับงาน"}</Text>
      </View>
      <Pressable accessibilityLabel="เปิดบัญชี" style={styles.headerAccount} onPress={onAccount}>
        <ProfileAvatar name={name} photoURL={photoURL} size="small" />
      </Pressable>
    </View>
  );
}

function ProfileAvatar({ name, photoURL, size }: { name: string; photoURL: string; size: "small" | "large" }) {
  const large = size === "large";
  const avatarStyle = large ? styles.avatarLarge : styles.avatarSmall;
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [photoURL]);
  if (photoURL && !failed) {
    return <Image accessibilityLabel={`รูปโปรไฟล์ของ ${name}`} source={{ uri: photoURL }} style={avatarStyle} resizeMode="cover" onError={() => setFailed(true)} />;
  }
  return (
    <View style={[avatarStyle, styles.avatarFallback]}>
      <Text style={large ? styles.avatarTextLarge : styles.avatarTextSmall}>{initials(name)}</Text>
    </View>
  );
}

function SummaryCard({ icon, label, value, tone }: { icon: keyof typeof Ionicons.glyphMap; label: string; value: string; tone: "navy" | "orange" }) {
  return (
    <View style={[styles.summaryCard, tone === "orange" && styles.summaryOrange]}>
      <View>
        <Text style={[styles.summaryValue, tone === "orange" && styles.summaryValueOrange]}>{value}</Text>
        <Text style={[styles.summaryLabel, tone === "orange" && styles.summaryLabelOrange]}>{label}</Text>
      </View>
      <Ionicons name={icon} size={27} color={tone === "orange" ? colors.orange : "#ffffff"} />
    </View>
  );
}

function JobPanel({
  job,
  expanded,
  busy,
  activeSession,
  onToggle,
  onAction
}: {
  job: TransportJob;
  expanded: boolean;
  busy: boolean;
  activeSession: TrackingSession | null;
  onToggle: () => void;
  onAction: (status: JobStatus) => void;
}) {
  return (
    <>
      <View style={styles.card}>
        <Pressable style={styles.jobCardHeader} onPress={onToggle}>
          <View style={styles.jobCardIcon}><Ionicons name="cube-outline" size={22} color={colors.orange} /></View>
          <View style={styles.grow}>
            <Text style={styles.eyebrow}>ใบงาน {job.workOrder}</Text>
            <Text style={styles.cardTitle} numberOfLines={1}>{job.customer}</Text>
            <Text style={styles.muted} numberOfLines={1}>{job.vehiclePlate}</Text>
          </View>
          <Text style={styles.jobStatus}>{statusLabels[job.status]}</Text>
          <Ionicons name={expanded ? "chevron-up" : "chevron-down"} size={20} color={colors.muted} />
        </Pressable>

        {expanded && (
          <View style={styles.jobDetails}>
            <Route icon="radio-button-on" label="จุดรับ" value={job.pickupLocation} />
            <View style={styles.routeLine} />
            <Route icon="location" label="จุดส่ง" value={job.deliveryLocation} />
            {[["ผู้ติดต่อจุดรับ", job.pickupContact, job.pickupContactPhone, job.pickupContactNotes], ["ผู้ติดต่อจุดส่ง", job.deliveryContact, job.deliveryContactPhone, job.deliveryContactNotes]].map(([label, name, phone, notes]) => <View key={label} style={{ marginTop: 12, gap: 6 }}><Text style={styles.muted}>{label}</Text><Text>{name || "ยังไม่ระบุผู้ติดต่อ"}</Text>{phone && <Pressable accessibilityRole="link" accessibilityLabel={`โทร ${name || label} ${phone}`} style={{ minHeight: 44, justifyContent: "center" }} onPress={() => { void Linking.openURL(`tel:${phone.replace(/[^+\d]/g, "")}`).catch(() => Alert.alert("โทรไม่สำเร็จ", `กรุณาโทร ${phone}`)); }}><Text style={{ color: colors.orange }}>โทร {phone}</Text></Pressable>}{notes && <Text style={styles.muted}>{notes}</Text>}</View>)}
            <View style={styles.metrics}>
              <Metric label="ETA" value={job.eta} />
              <Metric label="ความเร็ว" value={`${job.currentLocation.speed} กม./ชม.`} />
              <Metric label="GPS" value={job.currentLocation.accuracy ? `±${Math.round(job.currentLocation.accuracy)} ม.` : "รอข้อมูล"} />
            </View>
          </View>
        )}
      </View>
      <View style={styles.actionGrid}>
        {driverActions.map((action) => {
          const disabled = busy || (action.id === "start_tracking" && Boolean(activeSession));
          return (
            <Pressable
              key={action.id}
              disabled={disabled}
              style={[styles.actionButton, disabled && styles.disabled, action.id === "start_tracking" && styles.startButton, action.id === "completed" && styles.completeButton]}
              onPress={() => onAction(action.nextStatus)}
            >
              <Ionicons
                name={action.id === "start_tracking" ? "navigate" : action.id === "completed" ? "checkmark-circle" : "radio-button-on"}
                size={19}
                color={["start_tracking", "completed"].includes(action.id) ? "#ffffff" : colors.accent}
              />
              <Text style={[styles.actionText, ["start_tracking", "completed"].includes(action.id) && styles.completeText]}>{action.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </>
  );
}

function EmptyJobs({ onOpenJobs, accountMode = false }: { onOpenJobs: () => void; accountMode?: boolean }) {
  return (
    <View style={styles.emptyCard}>
      <View style={styles.emptyIllustration}>
        <Ionicons name="file-tray-outline" size={40} color={colors.accent} />
        <View style={styles.emptyBadge}><Text style={styles.emptyBadgeText}>0</Text></View>
      </View>
      <Text style={styles.emptyTitle}>วันนี้ยังไม่มีใบงาน</Text>
      <Text style={styles.emptyDetail}>เมื่อแอดมินมอบหมายงานให้บัญชีนี้ รายละเอียดจุดรับ–ส่งและปุ่มเริ่มแชร์ตำแหน่งจะแสดงที่นี่ทันที</Text>
      <Pressable style={styles.emptyAction} onPress={onOpenJobs}>
        <Text style={styles.emptyActionText}>{accountMode ? "ตรวจบัญชีและ GPS" : "เปิดรายการใบงาน"}</Text>
        <Ionicons name="arrow-forward" size={17} color={colors.accent} />
      </Pressable>
    </View>
  );
}

function PermissionRow({ label, ok, detail }: { label: string; ok: boolean; detail: string }) {
  return (
    <View style={styles.permissionRow}>
      <View style={[styles.permissionDot, ok && styles.permissionDotOk]}><Ionicons name={ok ? "checkmark" : "alert"} size={13} color="#ffffff" /></View>
      <Text style={styles.permissionLabel}>{label}</Text>
      <Text style={[styles.permissionValue, ok && styles.permissionValueOk]}>{detail}</Text>
    </View>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return <View style={styles.infoRow}><Text style={styles.infoLabel}>{label}</Text><Text style={styles.infoValue}>{value}</Text></View>;
}

function BottomNavigation({ active, onChange, jobCount }: { active: AppTab; onChange: (tab: AppTab) => void; jobCount: number }) {
  const items: Array<{ id: AppTab; label: string; icon: keyof typeof Ionicons.glyphMap }> = [
    { id: "home", label: "หน้าแรก", icon: "home-outline" },
    { id: "jobs", label: "ใบงาน", icon: "briefcase-outline" },
    { id: "account", label: "บัญชี", icon: "person-outline" }
  ];
  return (
    <View style={styles.bottomNav}>
      {items.map((item) => (
        <Pressable key={item.id} accessibilityRole="tab" accessibilityState={{ selected: active === item.id }} style={styles.navItem} onPress={() => onChange(item.id)}>
          <View style={[styles.navIcon, active === item.id && styles.navIconActive]}>
            <Ionicons name={item.icon} size={21} color={active === item.id ? "#ffffff" : colors.muted} />
            {item.id === "jobs" && jobCount > 0 && <View style={styles.navBadge}><Text style={styles.navBadgeText}>{jobCount}</Text></View>}
          </View>
          <Text style={[styles.navLabel, active === item.id && styles.navLabelActive]}>{item.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

function Route({ icon, label, value }: { icon: keyof typeof Ionicons.glyphMap; label: string; value: string }) {
  return <View style={styles.routeRow}><Ionicons name={icon} size={22} color={colors.accent} /><View style={styles.grow}><Text style={styles.label}>{label}</Text><Text style={styles.value}>{value}</Text></View></View>;
}

function Metric({ label, value }: { label: string; value: string }) {
  return <View style={styles.metric}><Text style={styles.label}>{label}</Text><Text style={styles.metricValue}>{value}</Text></View>;
}

function CenteredState({
  icon,
  title,
  detail,
  actionLabel,
  actionDisabled,
  onAction
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  detail: string;
  actionLabel?: string;
  actionDisabled?: boolean;
  onAction?: () => void;
}) {
  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.safe}>
        <View style={styles.centered}>
          <Image source={require("./assets/truck-logo.png")} style={styles.loginLogo} resizeMode="contain" />
          <Ionicons name={icon} size={32} color={colors.accent} />
          <Text style={styles.loginTitle}>{title}</Text>
          <Text style={styles.loginDetail}>{detail}</Text>
          {actionLabel && <Pressable disabled={actionDisabled} style={[styles.loginButton, actionDisabled && styles.disabled]} onPress={onAction}><Text style={styles.loginButtonText}>{actionLabel}</Text></Pressable>}
        </View>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

function firstName(name: string) {
  return name.trim().split(/\s+/)[0] || "คนขับ";
}

function safeGooglePhotoUrl(photoURL: string | null) {
  if (!photoURL) return "";
  return /^https:\/\/lh3\.googleusercontent\.com\//.test(photoURL) ? photoURL : "";
}

function initials(name: string) {
  return name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase() || "DR";
}

function permissionLabel(status: string) {
  if (status === "granted") return "อนุญาตแล้ว";
  if (status === "denied") return "ยังไม่อนุญาต";
  return "ยังไม่ได้ตั้งค่า";
}

function toMessage(error: unknown) {
  return error instanceof Error ? error.message : "เกิดข้อผิดพลาด กรุณาลองใหม่";
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  appShell: { flex: 1 },
  container: { padding: 18, paddingBottom: 28, gap: 18 },
  header: { minHeight: 76, paddingHorizontal: 16, flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: colors.accent, borderBottomWidth: 3, borderBottomColor: colors.orange },
  grow: { flex: 1, minWidth: 0 },
  brandMark: { width: 43, height: 43, borderRadius: 12, backgroundColor: "#ffffff" },
  brandName: { color: "#ffffff", fontWeight: "800", fontSize: 15, letterSpacing: 0.7 },
  headerSub: { color: "#b9c8d5", fontSize: 12, marginTop: 2 },
  headerLive: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 9, paddingVertical: 6, borderRadius: 20, backgroundColor: "#183b58" },
  headerLiveActive: { backgroundColor: colors.success },
  headerLiveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: "#8093a4" },
  headerLiveDotActive: { backgroundColor: "#ffffff" },
  headerLiveText: { color: "#c8d2dc", fontWeight: "700", fontSize: 10 },
  headerLiveTextActive: { color: "#ffffff" },
  headerAccount: { width: 40, height: 40, borderRadius: 14, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "#49677f", overflow: "hidden" },
  avatarSmall: { width: 36, height: 36, borderRadius: 12 },
  avatarLarge: { width: 58, height: 58, borderRadius: 19 },
  avatarFallback: { backgroundColor: colors.accent, alignItems: "center", justifyContent: "center" },
  avatarTextSmall: { color: "#ffffff", fontSize: 11, fontWeight: "800" },
  avatarTextLarge: { color: "#ffffff", fontSize: 19, fontWeight: "800" },
  kicker: { color: colors.orange, fontSize: 11, fontWeight: "800", letterSpacing: 1.2, textTransform: "uppercase", marginBottom: 3 },
  muted: { color: colors.muted, fontSize: 13, lineHeight: 19 },
  title: { color: colors.text, fontWeight: "800", fontSize: 27, letterSpacing: -0.4 },
  sectionHeading: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  countBadge: { minWidth: 42, height: 42, borderRadius: 14, backgroundColor: colors.orangeSoft, alignItems: "center", justifyContent: "center" },
  countBadgeText: { color: "#9a5d00", fontSize: 18, fontWeight: "800" },
  summaryRow: { flexDirection: "row", gap: 11 },
  summaryCard: { flex: 1, minHeight: 104, borderRadius: 18, padding: 15, flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", backgroundColor: colors.accent, elevation: 2 },
  summaryOrange: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  summaryValue: { color: "#ffffff", fontWeight: "800", fontSize: 31, lineHeight: 34 },
  summaryValueOrange: { color: colors.text },
  summaryLabel: { color: "#b9c8d5", fontSize: 12, fontWeight: "600", marginTop: 5 },
  summaryLabelOrange: { color: colors.muted },
  card: { overflow: "hidden", borderRadius: 19, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, elevation: 3 },
  jobCardHeader: { minHeight: 92, padding: 14, flexDirection: "row", alignItems: "center", gap: 10 },
  jobCardIcon: { width: 43, height: 43, borderRadius: 13, alignItems: "center", justifyContent: "center", backgroundColor: colors.orangeSoft },
  eyebrow: { color: colors.orange, fontWeight: "800", fontSize: 11, marginBottom: 2 },
  cardTitle: { color: colors.text, fontWeight: "700", fontSize: 17 },
  jobStatus: { maxWidth: 92, color: colors.accent, backgroundColor: colors.surface2, paddingHorizontal: 8, paddingVertical: 5, borderRadius: 7, fontWeight: "700", fontSize: 10, overflow: "hidden" },
  jobStatusComplete: { color: colors.success, backgroundColor: "#e3f3ee" },
  jobDetails: { gap: 10, padding: 15, borderTopWidth: 1, borderTopColor: colors.border },
  routeRow: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  routeLine: { width: 2, height: 13, marginLeft: 10, marginVertical: -5, backgroundColor: colors.border },
  label: { color: colors.muted, fontWeight: "600", fontSize: 11 },
  value: { color: colors.text, fontWeight: "600", fontSize: 14, lineHeight: 19 },
  metrics: { flexDirection: "row", gap: 8 },
  metric: { flex: 1, minHeight: 62, padding: 9, borderRadius: 11, backgroundColor: colors.bg, borderWidth: 1, borderColor: colors.border },
  metricValue: { color: colors.text, fontWeight: "700", marginTop: 3, fontSize: 12 },
  actionGrid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", rowGap: 10 },
  actionButton: { width: "48.5%", minHeight: 56, borderRadius: 14, padding: 11, flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  startButton: { backgroundColor: colors.orange, borderColor: colors.orange },
  completeButton: { backgroundColor: colors.success, borderColor: colors.success },
  actionText: { color: colors.text, flex: 1, fontWeight: "700", fontSize: 13 },
  completeText: { color: "#ffffff" },
  disabled: { opacity: 0.45 },
  statusCard: { flexDirection: "row", alignItems: "center", gap: 12, padding: 14, borderRadius: 17, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  statusIcon: { width: 43, height: 43, borderRadius: 14, backgroundColor: colors.surface2, alignItems: "center", justifyContent: "center" },
  statusIconLive: { backgroundColor: colors.success },
  noticeTitle: { color: colors.text, fontWeight: "700", fontSize: 14 },
  emptyCard: { alignItems: "center", gap: 10, padding: 24, borderRadius: 20, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  emptyIllustration: { width: 78, height: 70, borderRadius: 22, backgroundColor: colors.surface2, alignItems: "center", justifyContent: "center", marginBottom: 4 },
  emptyBadge: { position: "absolute", right: -5, top: -5, width: 27, height: 27, borderRadius: 14, backgroundColor: colors.orange, alignItems: "center", justifyContent: "center", borderWidth: 3, borderColor: colors.surface },
  emptyBadgeText: { color: "#ffffff", fontWeight: "800", fontSize: 11 },
  emptyTitle: { color: colors.text, fontSize: 19, fontWeight: "800" },
  emptyDetail: { maxWidth: 330, color: colors.muted, fontSize: 13, lineHeight: 20, textAlign: "center" },
  emptyAction: { marginTop: 5, flexDirection: "row", alignItems: "center", gap: 7, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 12, backgroundColor: colors.orangeSoft },
  emptyActionText: { color: colors.accent, fontWeight: "700", fontSize: 13 },
  jobListCard: { gap: 8, padding: 15, borderRadius: 18, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  jobListCardSelected: { borderColor: colors.orange, borderWidth: 2 },
  jobListTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  workOrder: { color: colors.orange, fontSize: 12, fontWeight: "800", letterSpacing: 0.4 },
  routeCompact: { flexDirection: "row", alignItems: "center", gap: 7 },
  routeCompactText: { flex: 1, color: colors.muted, fontSize: 12 },
  jobListFooter: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingTop: 9, marginTop: 3, borderTopWidth: 1, borderTopColor: colors.border },
  vehicleText: { color: colors.text, fontSize: 12, fontWeight: "600" },
  openJobText: { color: colors.accent, fontSize: 12, fontWeight: "700" },
  profileCard: { flexDirection: "row", alignItems: "center", gap: 13, padding: 16, borderRadius: 19, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  approvedBadge: { alignSelf: "flex-start", flexDirection: "row", alignItems: "center", gap: 4, marginTop: 5, paddingHorizontal: 7, paddingVertical: 3, borderRadius: 8, backgroundColor: "#e3f3ee" },
  approvedText: { color: colors.success, fontSize: 10, fontWeight: "700" },
  settingsCard: { padding: 16, gap: 13, borderRadius: 19, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  settingsTitle: { color: colors.text, fontSize: 16, fontWeight: "800", paddingBottom: 2 },
  permissionRow: { minHeight: 35, flexDirection: "row", alignItems: "center", gap: 9 },
  permissionDot: { width: 21, height: 21, borderRadius: 7, backgroundColor: colors.danger, alignItems: "center", justifyContent: "center" },
  permissionDotOk: { backgroundColor: colors.success },
  permissionLabel: { flex: 1, color: colors.text, fontSize: 13, fontWeight: "600" },
  permissionValue: { color: colors.danger, fontSize: 12, fontWeight: "700" },
  permissionValueOk: { color: colors.success },
  settingsActions: { flexDirection: "row", gap: 9, paddingTop: 3 },
  secondaryButton: { flex: 1, minHeight: 45, flexDirection: "row", gap: 7, alignItems: "center", justifyContent: "center", borderRadius: 13, backgroundColor: colors.surface2 },
  secondaryButtonText: { color: colors.accent, fontSize: 12, fontWeight: "700" },
  primaryButton: { flex: 1, minHeight: 45, flexDirection: "row", gap: 7, alignItems: "center", justifyContent: "center", borderRadius: 13, backgroundColor: colors.accent },
  primaryButtonText: { color: "#ffffff", fontSize: 12, fontWeight: "700" },
  infoRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", minHeight: 30 },
  infoLabel: { color: colors.muted, fontSize: 13 },
  infoValue: { maxWidth: "58%", color: colors.text, fontSize: 13, fontWeight: "700", textAlign: "right" },
  logoutButton: { minHeight: 51, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderRadius: 15, borderWidth: 1, borderColor: "#edcbc8", backgroundColor: "#fff7f6" },
  logoutText: { color: colors.danger, fontSize: 14, fontWeight: "700" },
  bottomNav: { minHeight: 70, paddingHorizontal: 22, paddingTop: 8, paddingBottom: 7, flexDirection: "row", justifyContent: "space-around", backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.border, elevation: 14 },
  navItem: { width: 76, alignItems: "center", gap: 3 },
  navIcon: { width: 38, height: 31, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  navIconActive: { backgroundColor: colors.accent },
  navLabel: { color: colors.muted, fontSize: 10, fontWeight: "600" },
  navLabelActive: { color: colors.accent, fontWeight: "800" },
  navBadge: { position: "absolute", right: -7, top: -5, minWidth: 18, height: 18, paddingHorizontal: 4, borderRadius: 9, backgroundColor: colors.orange, borderWidth: 2, borderColor: colors.surface, alignItems: "center", justifyContent: "center" },
  navBadgeText: { color: "#ffffff", fontSize: 8, fontWeight: "800" },
  centered: { flex: 1, padding: 28, alignItems: "center", justifyContent: "center", gap: 12 },
  loginLogo: { width: 88, height: 88, borderRadius: 20, backgroundColor: colors.surface },
  loginTitle: { color: colors.text, fontSize: 26, fontWeight: "800", textAlign: "center" },
  loginDetail: { maxWidth: 340, color: colors.text, fontSize: 14, lineHeight: 21, textAlign: "center" },
  loginButton: { minWidth: 230, marginTop: 8, paddingHorizontal: 20, paddingVertical: 14, borderRadius: 14, backgroundColor: colors.accent },
  loginButtonText: { color: "#ffffff", fontWeight: "800", textAlign: "center" }
});
