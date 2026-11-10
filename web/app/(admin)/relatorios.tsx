import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { DateField } from "../../components/DateTimeField";
import { showAlert } from "../../services/feedback";
import {
  AdminAppointmentsReportApi,
  downloadReportFile,
  getAdminAppointmentsReport,
  getMe,
  getProfessionalsByClinic,
  ReportPeriodQuery,
} from "../../services/api";
import { ThemeColors } from "../../constants/theme-palettes";
import { useTheme } from "../../contexts/ThemeContext";

const MAX_WIDTH = 1120;

const CARD_SHADOW = {
  shadowColor: "#1f5442",
  shadowOpacity: 0.05,
  shadowRadius: 14,
  shadowOffset: { width: 0, height: 6 },
  elevation: 2,
} as const;

export default function AdminReportsScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [report, setReport] = useState<AdminAppointmentsReportApi | null>(null);
  const [professionals, setProfessionals] = useState<any[]>([]);
  const [professionalId, setProfessionalId] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState<"pdf" | "excel" | null>(null);

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(24)).current;

  const params = useMemo<ReportPeriodQuery>(
    () => ({
      start_date: startDate.trim(),
      end_date: endDate.trim(),
      professional_id: professionalId,
    }),
    [endDate, professionalId, startDate],
  );

  const loadReport = async () => {
    setLoading(true);
    const result = await getAdminAppointmentsReport(params);
    if (result.ok && result.data) {
      setReport(result.data);
    } else {
      showAlert("Erro", result.error || "Não foi possível carregar o relatório.");
    }
    setLoading(false);
  };

  useEffect(() => {
    const init = async () => {
      setLoading(true);
      const me = await getMe();
      if (me.ok && me.data?.clinic) {
        const profs = await getProfessionalsByClinic(me.data.clinic);
        if (profs.ok && Array.isArray(profs.data)) setProfessionals(profs.data);
      }
      const result = await getAdminAppointmentsReport(params);
      if (result.ok && result.data) {
        setReport(result.data);
      } else {
        showAlert("Erro", result.error || "Não foi possível carregar o relatório.");
      }
      setLoading(false);
    };

    void init();
  }, []);

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 500, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 0, duration: 500, useNativeDriver: true }),
    ]).start();
  }, [fadeAnim, slideAnim]);

  const exportReport = async (kind: "pdf" | "excel") => {
    setExporting(kind);
    const extension = kind === "pdf" ? "pdf" : "xlsx";
    const result = await downloadReportFile(
      `/reports/admin/appointments/${kind === "pdf" ? "pdf" : "excel"}/`,
      params,
      `relatorio-admin-consultas.${extension}`,
    );
    if (!result.ok) showAlert("Exportação", result.error || "Falha ao exportar.");
    setExporting(null);
  };

  return (
    <View style={styles.screen}>
      <StatusBar barStyle="light-content" backgroundColor={colors.primary} />

      <View style={styles.header}>
        <View style={styles.headerInner}>
          <TouchableOpacity style={styles.iconBtn} onPress={() => router.back()}>
            <Ionicons name="arrow-back-outline" size={22} color={colors.white} />
          </TouchableOpacity>
          <View style={styles.headerTextBox}>
            <Text style={styles.headerTitle}>Relatórios</Text>
          </View>
          <TouchableOpacity style={styles.iconBtn} onPress={() => router.replace("/(admin)")}>
            <Ionicons name="home-outline" size={20} color={colors.white} />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={styles.loadingText}>Carregando relatório...</Text>
          </View>
        ) : (
          <Animated.View style={{ opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}>
            <View style={styles.heroCard}>
              <Text style={styles.heroTitle}>Consultas da clínica</Text>
              <Text style={styles.heroSubtitle}>
                Acompanhe volume, status, profissionais e histórico operacional.
              </Text>
            </View>

            <View style={styles.filterCard}>
              <Text style={styles.sectionTitle}>Filtros</Text>
              <View style={styles.inputRow}>
                <View style={styles.dateField}>
                  <Text style={styles.inputLabel}>Início</Text>
                  <DateField
                    value={startDate}
                    onChange={setStartDate}
                    max={endDate || undefined}
                  />
                </View>
                <View style={styles.dateField}>
                  <Text style={styles.inputLabel}>Fim</Text>
                  <DateField
                    value={endDate}
                    onChange={setEndDate}
                    min={startDate || undefined}
                  />
                </View>
              </View>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.profScroll}>
                <TouchableOpacity
                  style={[styles.profChip, !professionalId && styles.profChipActive]}
                  onPress={() => setProfessionalId("")}
                >
                  <Text style={[styles.profChipText, !professionalId && styles.profChipTextActive]}>
                    Todos
                  </Text>
                </TouchableOpacity>
                {professionals.map((prof) => (
                  <TouchableOpacity
                    key={prof.id}
                    style={[styles.profChip, professionalId === prof.id && styles.profChipActive]}
                    onPress={() => setProfessionalId(prof.id)}
                  >
                    <Text
                      style={[
                        styles.profChipText,
                        professionalId === prof.id && styles.profChipTextActive,
                      ]}
                    >
                      {prof.user?.full_name ?? prof.full_name ?? "Profissional"}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
              <TouchableOpacity style={styles.applyBtn} onPress={() => void loadReport()}>
                <Ionicons name="filter-outline" size={17} color={colors.white} />
                <Text style={styles.applyBtnText}>Aplicar filtros</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.actionRow}>
              <TouchableOpacity style={styles.exportBtn} onPress={() => void exportReport("pdf")}>
                {exporting === "pdf" ? (
                  <ActivityIndicator color={colors.primary} />
                ) : (
                  <Ionicons name="document-text-outline" size={18} color={colors.primary} />
                )}
                <Text style={styles.exportBtnText}>PDF</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.exportBtn} onPress={() => void exportReport("excel")}>
                {exporting === "excel" ? (
                  <ActivityIndicator color={colors.primary} />
                ) : (
                  <Ionicons name="grid-outline" size={18} color={colors.primary} />
                )}
                <Text style={styles.exportBtnText}>Excel</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.metricsGrid}>
              <Metric label="Consultas" value={report?.summary.total_appointments ?? 0} />
              <Metric label="Realizadas" value={report?.summary.completed ?? 0} />
              <Metric label="Cancelamento" value={`${report?.summary.cancellation_rate_percent ?? 0}%`} />
            </View>

            <Text style={styles.sectionTitle}>Por profissional</Text>
            {(report?.consultations_by_professional ?? []).slice(0, 10).map((item) => (
              <View key={item.professional_id} style={styles.professionalCard}>
                <View>
                  <Text style={styles.cardTitle}>{item.professional_name}</Text>
                  <Text style={styles.cardMeta}>
                    {item.unique_patients} pacientes • {item.total_appointments} consultas
                  </Text>
                </View>
                <Text style={styles.valuePill}>{item.completed}</Text>
              </View>
            ))}

            <Text style={styles.sectionTitle}>Histórico recente</Text>
            {(report?.appointments ?? []).slice(0, 10).map((item) => (
              <View key={item.id} style={styles.appointmentCard}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.cardTitle}>{item.patient_name}</Text>
                  <Text style={styles.cardMeta}>
                    {item.professional_name} • {new Date(item.scheduled_at).toLocaleString("pt-BR")}
                  </Text>
                </View>
                <Text style={styles.statusPill}>{item.status_label}</Text>
              </View>
            ))}
          </Animated.View>
        )}
      </ScrollView>
    </View>
  );
}

const Metric = ({ label, value }: { label: string; value: number | string }) => {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <View style={styles.metricCard}>
      <View style={styles.metricIcon}>
        <Ionicons name="stats-chart-outline" size={19} color={colors.primary} />
      </View>
      <Text style={styles.metricValue}>{value}</Text>
      <Text style={styles.metricLabel}>{label}</Text>
    </View>
  );
};

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.pageBg },
  header: { backgroundColor: colors.primary, paddingTop: 52, paddingBottom: 20 },
  headerInner: {
    width: "100%", maxWidth: MAX_WIDTH, alignSelf: "center", paddingHorizontal: 20,
    flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12,
  },
  iconBtn: { width: 42, height: 42, borderRadius: 12, backgroundColor: "rgba(255,255,255,0.14)", alignItems: "center", justifyContent: "center" },
  headerTextBox: { flex: 1 },
  headerTitle: { color: colors.white, fontSize: 21, fontWeight: "800", letterSpacing: -0.3 },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 20, paddingTop: 22, paddingBottom: 44, maxWidth: MAX_WIDTH, alignSelf: "center" as const, width: "100%" as const },
  loadingContainer: { minHeight: 360, alignItems: "center", justifyContent: "center", gap: 12 },
  loadingText: { color: colors.primary, fontWeight: "700" },
  heroCard: { backgroundColor: colors.white, borderRadius: 18, borderWidth: 1, borderColor: colors.border, padding: 20, marginBottom: 16, ...CARD_SHADOW },
  heroTitle: { fontSize: 22, fontWeight: "800", color: colors.textDark },
  heroSubtitle: { marginTop: 8, fontSize: 14, lineHeight: 21, color: "#5d7a6e" },
  filterCard: { backgroundColor: colors.white, borderRadius: 16, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: colors.border, ...CARD_SHADOW },
  sectionTitle: { fontSize: 16, fontWeight: "800", color: colors.textDark, marginBottom: 12, marginTop: 4, letterSpacing: -0.2 },
  inputRow: { flexDirection: "row", gap: 10 },
  dateField: { flex: 1, gap: 6 },
  inputLabel: { fontSize: 12, fontWeight: "700", color: "#6c8c80", marginLeft: 2 },
  profScroll: { marginTop: 12 },
  profChip: { height: 36, borderRadius: 10, backgroundColor: colors.primaryTint, paddingHorizontal: 12, alignItems: "center", justifyContent: "center", marginRight: 8 },
  profChipActive: { backgroundColor: colors.primary },
  profChipText: { color: colors.primary, fontWeight: "800", fontSize: 12 },
  profChipTextActive: { color: colors.white },
  applyBtn: { marginTop: 12, height: 46, borderRadius: 12, backgroundColor: colors.primary, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  applyBtnText: { color: colors.white, fontWeight: "800" },
  actionRow: { flexDirection: "row", gap: 10, marginBottom: 16 },
  exportBtn: { flex: 1, height: 46, borderRadius: 12, backgroundColor: colors.primaryTint, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  exportBtnText: { color: colors.primary, fontWeight: "800" },
  metricsGrid: { flexDirection: "row", gap: 10, marginBottom: 22 },
  metricCard: { flex: 1, backgroundColor: colors.white, borderRadius: 16, borderWidth: 1, borderColor: colors.border, padding: 14, minHeight: 122, ...CARD_SHADOW },
  metricIcon: { width: 38, height: 38, borderRadius: 12, backgroundColor: colors.primaryTint, alignItems: "center", justifyContent: "center", marginBottom: 10 },
  metricValue: { fontSize: 22, fontWeight: "800", color: colors.textDark },
  metricLabel: { fontSize: 12, color: "#6c8c80", fontWeight: "700", marginTop: 2 },
  professionalCard: { backgroundColor: colors.white, borderRadius: 16, borderWidth: 1, borderColor: colors.border, padding: 16, marginBottom: 10, flexDirection: "row", alignItems: "center", justifyContent: "space-between", ...CARD_SHADOW },
  appointmentCard: { backgroundColor: colors.white, borderRadius: 16, borderWidth: 1, borderColor: colors.border, padding: 16, marginBottom: 10, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12, ...CARD_SHADOW },
  cardTitle: { fontSize: 14, color: colors.textDark, fontWeight: "800" },
  cardMeta: { marginTop: 3, fontSize: 12, color: "#7a9d8f", fontWeight: "600" },
  valuePill: { minWidth: 34, textAlign: "center", color: colors.primary, backgroundColor: colors.primaryTint, overflow: "hidden", borderRadius: 8, paddingHorizontal: 9, paddingVertical: 6, fontSize: 12, fontWeight: "800" },
  statusPill: { color: colors.primary, backgroundColor: colors.primaryTint, overflow: "hidden", borderRadius: 8, paddingHorizontal: 9, paddingVertical: 5, fontSize: 11, fontWeight: "800" },
});
