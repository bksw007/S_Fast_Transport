import { useEffect, useMemo, useState } from "react";
import { Alert, Image, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Google from "expo-auth-session/providers/google";
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
  getMobileProfile,
  rollbackTrackingStart,
  subscribeDriverJobs,
  updateDriverJobStatus,
  type MobileProfile
} from "./src/transport-repository";

WebBrowser.maybeCompleteAuthSession();

const colors = {
  bg: "#969a9b",
  surface: "#eef0ef",
  surface2: "#dadddd",
  text: "#151718",
  muted: "#656b6d",
  border: "#c0c4c4",
  accent: "#4c5960",
  danger: "#8c615b",
  success: "#477064"
};

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
    if (response?.type !== "success") return;
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

  const selectedJob = useMemo(
    () => jobs.find((job) => job.id === selectedJobId) ?? jobs[0] ?? null,
    [jobs, selectedJobId]
  );

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
        onAction={() => void promptAsync()}
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
        <ScrollView contentContainerStyle={styles.container}>
          <View style={styles.header}>
            <Image source={require("./assets/truck-logo.png")} style={styles.brandMark} resizeMode="contain" />
            <View style={styles.grow}>
              <Text style={styles.brandName}>S Fast Transport</Text>
              <Text style={styles.muted}>{profile.displayName}</Text>
            </View>
            <Pressable accessibilityLabel="ออกจากระบบ" style={styles.iconButton} onPress={() => void logout()}>
              <Ionicons name="log-out-outline" size={21} color={colors.text} />
            </Pressable>
          </View>

          <View style={styles.titleRow}>
            <View>
              <Text style={styles.title}>งานของฉัน</Text>
              <Text style={styles.muted}>{jobs.length} ใบงานที่ได้รับมอบหมาย</Text>
            </View>
            <View style={[styles.livePill, activeSession ? styles.liveActive : styles.standby]}>
              <View style={[styles.liveDot, activeSession ? styles.liveDotActive : null]} />
              <Text style={[styles.liveText, activeSession ? styles.liveTextActive : null]}>{activeSession ? "LIVE" : "STANDBY"}</Text>
            </View>
          </View>

          {jobs.length > 1 && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.jobChips}>
              {jobs.map((job) => (
                <Pressable key={job.id} style={[styles.jobChip, selectedJobId === job.id && styles.jobChipSelected]} onPress={() => setSelectedJobId(job.id)}>
                  <Text style={[styles.jobChipText, selectedJobId === job.id && styles.jobChipTextSelected]}>{job.workOrder}</Text>
                </Pressable>
              ))}
            </ScrollView>
          )}

          {selectedJob ? (
            <>
              <View style={styles.card}>
                <Pressable style={styles.jobCardHeader} onPress={() => setJobExpanded((value) => !value)}>
                  <View style={styles.jobCardIcon}><Ionicons name="briefcase" size={20} color={colors.accent} /></View>
                  <View style={styles.grow}>
                    <Text style={styles.eyebrow}>ใบงาน {selectedJob.workOrder}</Text>
                    <Text style={styles.cardTitle} numberOfLines={1}>{selectedJob.customer}</Text>
                    <Text style={styles.muted} numberOfLines={1}>{selectedJob.vehiclePlate}</Text>
                  </View>
                  <Text style={styles.jobStatus}>{statusLabels[selectedJob.status]}</Text>
                  <Ionicons name={jobExpanded ? "chevron-up" : "chevron-down"} size={21} color={colors.accent} />
                </Pressable>

                {jobExpanded && (
                  <View style={styles.jobDetails}>
                    <Route icon="navigate-circle" label="จุดรับ" value={selectedJob.pickupLocation} />
                    <Route icon="flag" label="จุดส่ง" value={selectedJob.deliveryLocation} />
                    <View style={styles.metrics}>
                      <Metric label="ETA" value={selectedJob.eta} />
                      <Metric label="ความเร็ว" value={`${selectedJob.currentLocation.speed} กม./ชม.`} />
                      <Metric label="GPS" value={selectedJob.currentLocation.accuracy ? `±${Math.round(selectedJob.currentLocation.accuracy)} ม.` : "รอข้อมูล"} />
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
                      style={[styles.actionButton, disabled && styles.disabled, action.id === "completed" && styles.completeButton]}
                      onPress={() => void handleDriverAction(action.nextStatus)}
                    >
                      <Ionicons name={action.id === "completed" ? "checkmark-circle" : "radio-button-on"} size={20} color={action.id === "completed" ? "#ffffff" : colors.accent} />
                      <Text style={[styles.actionText, action.id === "completed" && styles.completeText]}>{action.label}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </>
          ) : (
            <View style={styles.emptyCard}>
              <Ionicons name="file-tray-outline" size={34} color={colors.accent} />
              <Text style={styles.cardTitle}>ยังไม่มีใบงาน</Text>
              <Text style={styles.muted}>ใบงานจะปรากฏเมื่อแอดมินมอบหมายบัญชีนี้เป็นคนขับ</Text>
            </View>
          )}

          <View style={styles.notice}>
            <Ionicons name={activeSession ? "navigate" : "shield-checkmark"} size={23} color={activeSession ? colors.success : colors.accent} />
            <View style={styles.grow}>
              <Text style={styles.noticeTitle}>{activeSession ? "กำลังติดตามเฉพาะงานนี้" : "ยังไม่ได้เก็บตำแหน่ง"}</Text>
              <Text style={styles.muted}>{message}</Text>
            </View>
          </View>
        </ScrollView>
      </SafeAreaView>
    </SafeAreaProvider>
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

function toMessage(error: unknown) {
  return error instanceof Error ? error.message : "เกิดข้อผิดพลาด กรุณาลองใหม่";
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  container: { padding: 18, gap: 16 },
  header: { flexDirection: "row", alignItems: "center", gap: 10 },
  grow: { flex: 1, minWidth: 0 },
  brandMark: { width: 44, height: 44, borderRadius: 12, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  brandName: { color: colors.text, fontWeight: "900", fontSize: 17, letterSpacing: 0.3 },
  muted: { color: colors.muted, fontSize: 13, lineHeight: 19 },
  iconButton: { width: 42, height: 42, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  titleRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  title: { color: colors.text, fontWeight: "900", fontSize: 29, letterSpacing: -0.5 },
  livePill: { flexDirection: "row", alignItems: "center", gap: 7, paddingHorizontal: 11, paddingVertical: 7, borderRadius: 7 },
  liveActive: { backgroundColor: colors.success },
  standby: { backgroundColor: colors.surface2 },
  liveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.muted },
  liveDotActive: { backgroundColor: "#ffffff" },
  liveText: { color: colors.muted, fontWeight: "900", fontSize: 11, letterSpacing: 1 },
  liveTextActive: { color: "#ffffff" },
  jobChips: { gap: 8 },
  jobChip: { paddingHorizontal: 13, paddingVertical: 8, borderRadius: 9, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  jobChipSelected: { backgroundColor: colors.accent, borderColor: colors.accent },
  jobChipText: { color: colors.text, fontWeight: "800" },
  jobChipTextSelected: { color: "#ffffff" },
  card: { overflow: "hidden", borderRadius: 16, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, elevation: 7 },
  jobCardHeader: { minHeight: 82, padding: 12, flexDirection: "row", alignItems: "center", gap: 10 },
  jobCardIcon: { width: 38, height: 38, borderRadius: 11, alignItems: "center", justifyContent: "center", backgroundColor: "#dfe3e3" },
  eyebrow: { color: colors.accent, fontWeight: "900", fontSize: 11 },
  cardTitle: { color: colors.text, fontWeight: "900", fontSize: 18 },
  jobStatus: { maxWidth: 92, color: colors.accent, backgroundColor: "#dfe3e3", paddingHorizontal: 8, paddingVertical: 5, borderRadius: 6, fontWeight: "900", fontSize: 11, overflow: "hidden" },
  jobDetails: { gap: 12, padding: 14, borderTopWidth: 1, borderTopColor: colors.border },
  routeRow: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  label: { color: colors.muted, fontWeight: "800", fontSize: 12 },
  value: { color: colors.text, fontWeight: "800", fontSize: 15 },
  metrics: { flexDirection: "row", gap: 8 },
  metric: { flex: 1, minHeight: 62, padding: 9, borderRadius: 10, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border },
  metricValue: { color: colors.text, fontWeight: "900", marginTop: 3, fontSize: 12 },
  actionGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  actionButton: { width: "48%", minHeight: 58, borderRadius: 12, padding: 11, flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  completeButton: { backgroundColor: colors.success, borderColor: colors.success },
  actionText: { color: colors.text, flex: 1, fontWeight: "900", fontSize: 14 },
  completeText: { color: "#ffffff" },
  disabled: { opacity: 0.45 },
  notice: { flexDirection: "row", gap: 12, padding: 14, borderRadius: 14, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  noticeTitle: { color: colors.text, fontWeight: "900", fontSize: 15 },
  emptyCard: { alignItems: "center", gap: 9, padding: 30, borderRadius: 16, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  centered: { flex: 1, padding: 28, alignItems: "center", justifyContent: "center", gap: 12 },
  loginLogo: { width: 88, height: 88, borderRadius: 20, backgroundColor: colors.surface },
  loginTitle: { color: colors.text, fontSize: 26, fontWeight: "900", textAlign: "center" },
  loginDetail: { maxWidth: 340, color: colors.text, fontSize: 14, lineHeight: 21, textAlign: "center" },
  loginButton: { minWidth: 230, marginTop: 8, paddingHorizontal: 20, paddingVertical: 14, borderRadius: 12, backgroundColor: colors.accent },
  loginButtonText: { color: "#ffffff", fontWeight: "900", textAlign: "center" }
});
