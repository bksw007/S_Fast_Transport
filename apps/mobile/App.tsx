import { useState } from "react";
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { driverActions, sampleJobs, statusLabels } from "@s-fast-transport/shared";

type ThemeName = "light" | "dark";

const palettes = {
  light: {
    bg: "#969a9b",
    surface: "#eef0ef",
    surface2: "#dadddd",
    text: "#151718",
    muted: "#656b6d",
    border: "#c0c4c4",
    accent: "#4c5960",
    warning: "#796865"
  },
  dark: {
    bg: "#0e1011",
    surface: "#181b1d",
    surface2: "#23272a",
    text: "#f0f2f1",
    muted: "#9ca3a5",
    border: "#343a3d",
    accent: "#bdc6c9",
    warning: "#9b8580"
  }
};

export default function App() {
  const [theme, setTheme] = useState<ThemeName>("light");
  const [fontScale, setFontScale] = useState(1);
  const [activeAction, setActiveAction] = useState("start_tracking");
  const [jobExpanded, setJobExpanded] = useState(false);
  const colors = palettes[theme];
  const job = sampleJobs[0];
  const styles = createStyles(colors, fontScale);

  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.safe}>
        <ScrollView contentContainerStyle={styles.container}>
          <View style={styles.header}>
            <Image source={require("./assets/truck-logo.png")} style={styles.brandMark} resizeMode="contain" />
            <View style={styles.brandText}>
              <Text style={styles.brandName}>S Fast Transport</Text>
              <Text style={styles.muted}>Driver mobile</Text>
            </View>
            <Pressable style={styles.iconButton} onPress={() => setFontScale((value) => Math.min(1.18, value + 0.08))}>
              <Ionicons name="text" size={20} color={colors.text} />
            </Pressable>
            <Pressable style={styles.iconButton} onPress={() => setTheme(theme === "light" ? "dark" : "light")}>
              <Ionicons name={theme === "light" ? "moon" : "sunny"} size={20} color={colors.text} />
            </Pressable>
          </View>

          <View style={styles.titleRow}>
            <View>
              <Text style={styles.title}>กำลังขนส่ง</Text>
              <Text style={styles.muted}>{job.workOrder} · {job.vehiclePlate}</Text>
            </View>
            <Text style={styles.livePill}>Live</Text>
          </View>

          <View style={styles.card}>
            <Pressable
              style={styles.jobCardHeader}
              accessibilityRole="button"
              accessibilityState={{ expanded: jobExpanded }}
              onPress={() => setJobExpanded((value) => !value)}
            >
              <View style={styles.jobCardIcon}>
                <Ionicons name="briefcase" size={20} color={colors.accent} />
              </View>
              <View style={styles.jobCardSummary}>
                <Text style={styles.jobCardEyebrow}>ใบงาน {job.workOrder}</Text>
                <Text style={styles.cardTitle} numberOfLines={1}>{job.customer}</Text>
                <Text style={styles.muted} numberOfLines={1}>{job.pickupLocation} → {job.deliveryLocation}</Text>
              </View>
              <Text style={styles.jobStatus}>{statusLabels[job.status]}</Text>
              <Ionicons name={jobExpanded ? "chevron-up" : "chevron-down"} size={21} color={colors.accent} />
            </Pressable>

            {jobExpanded && (
              <View style={styles.jobCardDetails}>
                <View style={styles.routeRow}>
                  <Ionicons name="navigate-circle" size={22} color={colors.accent} />
                  <View>
                    <Text style={styles.label}>จุดรับ</Text>
                    <Text style={styles.value}>{job.pickupLocation}</Text>
                  </View>
                </View>
                <View style={styles.routeRow}>
                  <Ionicons name="flag" size={22} color={colors.accent} />
                  <View>
                    <Text style={styles.label}>จุดส่ง</Text>
                    <Text style={styles.value}>{job.deliveryLocation}</Text>
                  </View>
                </View>
                <View style={styles.metrics}>
                  <Metric label="ETA" value={job.eta} styles={styles} />
                  <Metric label="Speed" value={`${job.currentLocation.speed} กม./ชม.`} styles={styles} />
                  <Metric label="สถานะ" value={statusLabels[job.status]} styles={styles} />
                </View>
              </View>
            )}
          </View>

          <View style={styles.actionGrid}>
            {driverActions.map((action) => (
              <Pressable
                key={action.id}
                style={[styles.actionButton, activeAction === action.id && styles.actionActive]}
                onPress={() => setActiveAction(action.id)}
              >
                <Ionicons
                  name={action.id === "completed" ? "checkmark-circle" : "radio-button-on"}
                  size={20}
                  color={activeAction === action.id ? "#ffffff" : colors.accent}
                />
                <Text style={[styles.actionText, activeAction === action.id && styles.actionTextActive]}>{action.label}</Text>
              </Pressable>
            ))}
          </View>

          <View style={styles.notice}>
            <Ionicons name="shield-checkmark" size={22} color={colors.accent} />
            <View style={styles.noticeText}>
              <Text style={styles.value}>ติดตามเฉพาะตอนมีงาน</Text>
              <Text style={styles.muted}>หยุด tracking ทันทีเมื่อกดจบงาน และ sync ข้อมูล offline เมื่อเน็ตกลับมา</Text>
            </View>
          </View>
        </ScrollView>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

function Metric({
  label,
  value,
  styles
}: {
  label: string;
  value: string;
  styles: ReturnType<typeof createStyles>;
}) {
  return (
    <View style={styles.metric}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.metricValue}>{value}</Text>
    </View>
  );
}

function createStyles(colors: typeof palettes.light, fontScale: number) {
  return StyleSheet.create({
    safe: {
      flex: 1,
      backgroundColor: colors.bg
    },
    container: {
      padding: 18,
      gap: 16
    },
    header: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10
    },
    brandMark: {
      width: 44,
      height: 44,
      borderRadius: 12,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border
    },
    brandText: {
      flex: 1
    },
    brandName: {
      color: colors.text,
      fontWeight: "900",
      fontSize: 17 * fontScale,
      letterSpacing: 0.3
    },
    iconButton: {
      width: 42,
      height: 42,
      borderRadius: 12,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border
    },
    titleRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center"
    },
    title: {
      color: colors.text,
      fontWeight: "900",
      fontSize: 29 * fontScale,
      letterSpacing: -0.5
    },
    muted: {
      color: colors.muted,
      fontSize: 13 * fontScale,
      lineHeight: 19 * fontScale
    },
    livePill: {
      color: colors.accent,
      backgroundColor: `${colors.accent}22`,
      paddingHorizontal: 12,
      paddingVertical: 7,
      borderRadius: 6,
      fontWeight: "900",
      overflow: "hidden",
      letterSpacing: 1.1,
      textTransform: "uppercase"
    },
    card: {
      overflow: "hidden",
      borderRadius: 16,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      shadowColor: "#000000",
      shadowOffset: { width: 0, height: 14 },
      shadowOpacity: themeShadowOpacity(colors.bg),
      shadowRadius: 28,
      elevation: 7
    },
    jobCardHeader: {
      minHeight: 76,
      padding: 12,
      flexDirection: "row",
      alignItems: "center",
      gap: 10
    },
    jobCardIcon: {
      width: 38,
      height: 38,
      borderRadius: 11,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: `${colors.accent}18`
    },
    jobCardSummary: {
      flex: 1,
      minWidth: 0
    },
    jobCardEyebrow: {
      color: colors.accent,
      fontWeight: "900",
      fontSize: 11 * fontScale
    },
    jobStatus: {
      maxWidth: 96,
      overflow: "hidden",
      color: colors.accent,
      backgroundColor: `${colors.accent}18`,
      paddingHorizontal: 8,
      paddingVertical: 5,
      borderRadius: 6,
      fontWeight: "900",
      fontSize: 11 * fontScale
    },
    jobCardDetails: {
      gap: 12,
      padding: 14,
      borderTopWidth: 1,
      borderTopColor: colors.border
    },
    label: {
      color: colors.muted,
      fontWeight: "800",
      fontSize: 12 * fontScale
    },
    cardTitle: {
      color: colors.text,
      fontWeight: "900",
      fontSize: 19 * fontScale
    },
    routeRow: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: 10
    },
    value: {
      color: colors.text,
      fontWeight: "800",
      fontSize: 15 * fontScale
    },
    metrics: {
      flexDirection: "row",
      gap: 8
    },
    metric: {
      flex: 1,
      minHeight: 62,
      padding: 10,
      borderRadius: 10,
      backgroundColor: colors.surface2,
      borderWidth: 1,
      borderColor: colors.border
    },
    metricValue: {
      color: colors.text,
      fontWeight: "900",
      marginTop: 3,
      fontSize: 13 * fontScale
    },
    actionGrid: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 10
    },
    actionButton: {
      width: "48%",
      minHeight: 58,
      borderRadius: 12,
      padding: 11,
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border
    },
    actionActive: {
      backgroundColor: colors.accent,
      borderColor: colors.accent,
      shadowColor: colors.accent,
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.22,
      shadowRadius: 14,
      elevation: 4
    },
    actionText: {
      color: colors.text,
      flex: 1,
      fontWeight: "900",
      fontSize: 14 * fontScale
    },
    actionTextActive: {
      color: "#ffffff"
    },
    notice: {
      flexDirection: "row",
      gap: 12,
      padding: 14,
      borderRadius: 14,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border
    },
    noticeText: {
      flex: 1
    }
  });
}

function themeShadowOpacity(background: string) {
  return background === palettes.dark.bg ? 0.34 : 0.16;
}
