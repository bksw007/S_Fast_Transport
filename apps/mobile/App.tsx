import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { driverActions, sampleJobs, statusLabels } from "@s-fast-transport/shared";

type ThemeName = "light" | "dark";

const palettes = {
  light: {
    bg: "#eef5f3",
    surface: "#ffffff",
    surface2: "#f6faf9",
    text: "#132027",
    muted: "#667883",
    border: "#dce7e4",
    accent: "#0f8f8c",
    warning: "#e69b19"
  },
  dark: {
    bg: "#08111a",
    surface: "#111d28",
    surface2: "#172532",
    text: "#edf7f5",
    muted: "#9db0ba",
    border: "#273947",
    accent: "#37c4bd",
    warning: "#e69b19"
  }
};

export default function App() {
  const [theme, setTheme] = useState<ThemeName>("light");
  const [fontScale, setFontScale] = useState(1);
  const [activeAction, setActiveAction] = useState("start_tracking");
  const colors = palettes[theme];
  const job = sampleJobs[0];
  const styles = createStyles(colors, fontScale);

  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.safe}>
        <ScrollView contentContainerStyle={styles.container}>
          <View style={styles.header}>
            <View style={styles.brandMark}>
              <Text style={styles.brandLetter}>S</Text>
            </View>
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
            <Text style={styles.label}>ลูกค้า</Text>
            <Text style={styles.cardTitle}>{job.customer}</Text>
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
      gap: 14
    },
    header: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10
    },
    brandMark: {
      width: 44,
      height: 44,
      borderRadius: 8,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.accent
    },
    brandLetter: {
      color: "#ffffff",
      fontWeight: "900",
      fontSize: 23 * fontScale
    },
    brandText: {
      flex: 1
    },
    brandName: {
      color: colors.text,
      fontWeight: "900",
      fontSize: 17 * fontScale
    },
    iconButton: {
      width: 42,
      height: 42,
      borderRadius: 8,
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
      fontSize: 27 * fontScale
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
      borderRadius: 999,
      fontWeight: "900",
      overflow: "hidden"
    },
    card: {
      padding: 16,
      borderRadius: 8,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      gap: 12
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
      borderRadius: 8,
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
      borderRadius: 8,
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
      borderColor: colors.accent
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
      borderRadius: 8,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border
    },
    noticeText: {
      flex: 1
    }
  });
}
