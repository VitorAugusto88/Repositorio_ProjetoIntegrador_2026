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
import { ThemeColors } from "../../constants/theme-palettes";
import { useTheme } from "../../contexts/ThemeContext";
import { showAlert } from "../../services/feedback";
import {
  downloadReportFile,
  getMe,
  getPatientProfile,
  getPatientReport,
  PatientReportApi,
  ReportPeriodQuery,
  ReportSummary,
} from "../../services/api";

const BLUE_LIGHT = "#eaf1ff";
const ORANGE_LIGHT = "#fef3e8";

const formatNumber = (value?: number) => String(value ?? 0);
const formatPercent = (value?: number) => `${value ?? 0}%`;

const buildSummaryCards = (colors: ThemeColors, summary?: ReportSummary) => [
  {
    label: "Consultas",
    value: formatNumber(summary?.total_appointments),
    icon: "calendar-outline",
    color: colors.primary,
    bg: colors.primaryTint,
  },
  {
    label: "Realizadas",
    value: formatNumber(summary?.completed),
    icon: "checkmark-circle-outline",
    color: "#2d6cdf",
    bg: BLUE_LIGHT,
  },
  {
    label: "Presenca",
    value: formatPercent(summary?.attendance_rate_percent),
    icon: "pulse-outline",
    color: "#c46a1a",
    bg: ORANGE_LIGHT,
  },
];

// Componentes no escopo do módulo (não dentro do componente principal) para
// não perder identidade/estado dos campos de data a cada re-render do pai —
// cada um lê a paleta da clínica direto via useTheme().
const DecorativeBackground = () => {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <>
      <View style={styles.circle1} />
      <View style={styles.circle2} />
    </>
  );
};

const PeriodPicker = ({
  startDate,
  endDate,
  onStartChange,
  onEndChange,
  onApply,
}: {
  startDate: string;
  endDate: string;
  onStartChange: (value: string) => void;
  onEndChange: (value: string) => void;
  onApply: () => void;
}) => {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <View style={styles.filterCard}>
      <Text style={styles.sectionTitle}>Período</Text>
      <View style={styles.inputRow}>
        <View style={styles.inputBox}>
          <Text style={styles.inputLabel}>Início</Text>
          <DateField value={startDate} onChange={onStartChange} max={endDate || undefined} />
        </View>
        <View style={styles.inputBox}>
          <Text style={styles.inputLabel}>Fim</Text>
          <DateField value={endDate} onChange={onEndChange} min={startDate || undefined} />
        </View>
      </View>
      <TouchableOpacity style={styles.applyBtn} onPress={onApply} activeOpacity={0.85}>
        <Ionicons name="filter-outline" size={17} color={colors.white} />
        <Text style={styles.applyBtnText}>Aplicar filtros</Text>
      </TouchableOpacity>
    </View>
  );
};

export default function PatientReportsScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [report, setReport] = useState<PatientReportApi | null>(null);
  const [patientProfileId, setPatientProfileId] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(24)).current;

  const period = useMemo<ReportPeriodQuery>(
    () => ({ start_date: startDate.trim(), end_date: endDate.trim() }),
    [startDate, endDate],
  );

  const loadReport = async (profileId = patientProfileId) => {
    if (!profileId) return;
    setLoading(true);
    const result = await getPatientReport(profileId, period);
    if (result.ok && result.data) {
      setReport(result.data);
    } else {
      showAlert("Erro", result.error || "Nao foi possivel carregar o relatorio.");
    }
    setLoading(false);
  };

  useEffect(() => {
    const init = async () => {
      setLoading(true);
      const me = await getMe();
      if (!me.ok || !me.data?.id) {
        showAlert("Erro", me.error || "Nao foi possivel carregar seu perfil.");
        setLoading(false);
        return;
      }

      const profile = await getPatientProfile(me.data.id);
      if (!profile.ok || !profile.data?.id) {
        showAlert("Erro", profile.error || "Perfil de paciente nao encontrado.");
        setLoading(false);
        return;
      }

      setPatientProfileId(profile.data.id);
      const reportResult = await getPatientReport(profile.data.id, period);
      if (reportResult.ok && reportResult.data) {
        setReport(reportResult.data);
      } else {
        showAlert(
          "Erro",
          reportResult.error || "Nao foi possivel carregar o relatorio.",
        );
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

  const handleExportPdf = async () => {
    if (!patientProfileId) return;
    setExporting(true);
    const result = await downloadReportFile(
      `/reports/patients/${encodeURIComponent(patientProfileId)}/pdf/`,
      period,
      "relatorio-paciente.pdf",
    );
    if (!result.ok) showAlert("Exportacao", result.error || "Falha ao exportar.");
    setExporting(false);
  };

  return (
    <View style={styles.screen}>
      <StatusBar barStyle="light-content" backgroundColor={colors.primary} />
      <DecorativeBackground />

      <View style={styles.header}>
        <TouchableOpacity style={styles.iconBtn} onPress={() => router.back()}>
          <Ionicons name="arrow-back-outline" size={22} color={colors.white} />
        </TouchableOpacity>
        <View style={styles.headerTextBox}>
          <Text style={styles.headerEyebrow}>Area do paciente</Text>
          <Text style={styles.headerTitle}>Relatorios</Text>
        </View>
        <TouchableOpacity
          style={[styles.iconBtn, exporting && styles.iconBtnDisabled]}
          onPress={handleExportPdf}
          disabled={exporting || !report}
        >
          {exporting ? (
            <ActivityIndicator color={colors.white} />
          ) : (
            <Ionicons name="download-outline" size={22} color={colors.white} />
          )}
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={styles.loadingText}>Carregando relatorio...</Text>
          </View>
        ) : (
          <Animated.View style={{ opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}>
            <View style={styles.heroCard}>
              <Text style={styles.heroTitle}>
                {report?.patient?.full_name || "Meu acompanhamento"}
              </Text>
              <Text style={styles.heroSubtitle}>
                Historico de consultas, presenca e evolucao mensal em um unico painel.
              </Text>
            </View>

            <PeriodPicker
              startDate={startDate}
              endDate={endDate}
              onStartChange={setStartDate}
              onEndChange={setEndDate}
              onApply={() => void loadReport()}
            />

            <View style={styles.metricsGrid}>
              {buildSummaryCards(colors, report?.summary).map((item) => (
                <View key={item.label} style={styles.metricCard}>
                  <View style={[styles.metricIcon, { backgroundColor: item.bg }]}>
                    <Ionicons name={item.icon as any} size={20} color={item.color} />
                  </View>
                  <Text style={styles.metricValue}>{item.value}</Text>
                  <Text style={styles.metricLabel}>{item.label}</Text>
                </View>
              ))}
            </View>

            <Text style={styles.sectionTitle}>Status das consultas</Text>
            <View style={styles.tableCard}>
              {(report?.status_counts ?? []).map((item) => (
                <View key={item.status} style={styles.row}>
                  <Text style={styles.rowLabel}>{item.label}</Text>
                  <Text style={styles.rowValue}>{item.total}</Text>
                </View>
              ))}
            </View>

            <Text style={styles.sectionTitle}>Historico recente</Text>
            {(report?.appointment_history ?? []).slice(0, 8).map((item) => (
              <View key={item.id} style={styles.appointmentCard}>
                <View>
                  <Text style={styles.appointmentTitle}>{item.professional_name}</Text>
                  <Text style={styles.appointmentMeta}>
                    {new Date(item.scheduled_at).toLocaleString("pt-BR")}
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

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.authBg },
  circle1: {
    position: "absolute",
    width: 280,
    height: 280,
    borderRadius: 140,
    backgroundColor: "#27795f",
    top: -110,
    right: -70,
    opacity: 0.45,
  },
  circle2: {
    position: "absolute",
    width: 180,
    height: 180,
    borderRadius: 90,
    backgroundColor: colors.primaryStrong,
    top: -55,
    left: -70,
    opacity: 0.28,
  },
  header: {
    paddingTop: 56,
    paddingBottom: 24,
    paddingHorizontal: 24,
    backgroundColor: colors.primary,
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },
  iconBtn: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.15)",
    alignItems: "center",
    justifyContent: "center",
  },
  iconBtnDisabled: { opacity: 0.6 },
  headerTextBox: { flex: 1 },
  headerEyebrow: { color: "#bce3d5", fontSize: 13, fontWeight: "700" },
  headerTitle: { color: colors.white, fontSize: 24, fontWeight: "800", marginTop: 2 },
  scroll: { flex: 1 },
  scrollContent: { padding: 22, paddingBottom: 40, maxWidth: 960, alignSelf: 'center' as const, width: '100%' as const },
  loadingContainer: { minHeight: 360, alignItems: "center", justifyContent: "center", gap: 12 },
  loadingText: { color: colors.primary, fontWeight: "700" },
  heroCard: {
    backgroundColor: colors.white,
    borderRadius: 22,
    padding: 22,
    marginBottom: 16,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.08,
    shadowRadius: 18,
    elevation: 4,
  },
  heroTitle: { fontSize: 22, fontWeight: "800", color: "#173d31" },
  heroSubtitle: { marginTop: 8, fontSize: 14, lineHeight: 21, color: "#5d7a6e" },
  filterCard: {
    backgroundColor: colors.white,
    borderRadius: 18,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#ddf0e8",
  },
  sectionTitle: { fontSize: 17, fontWeight: "800", color: "#173d31", marginBottom: 12 },
  inputRow: { flexDirection: "row", gap: 10 },
  inputBox: { flex: 1 },
  inputLabel: { fontSize: 12, color: "#6c8c80", fontWeight: "700", marginBottom: 6 },
  applyBtn: {
    marginTop: 12,
    height: 46,
    borderRadius: 12,
    backgroundColor: colors.primary,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  applyBtnText: { color: colors.white, fontWeight: "800" },
  metricsGrid: { flexDirection: "row", gap: 10, marginBottom: 22 },
  metricCard: {
    flex: 1,
    backgroundColor: colors.white,
    borderRadius: 18,
    padding: 14,
    minHeight: 126,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.07,
    shadowRadius: 14,
    elevation: 3,
  },
  metricIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 10,
  },
  metricValue: { fontSize: 22, fontWeight: "800", color: "#173d31" },
  metricLabel: { fontSize: 12, color: "#6c8c80", fontWeight: "700", marginTop: 2 },
  tableCard: {
    backgroundColor: colors.white,
    borderRadius: 18,
    padding: 16,
    marginBottom: 22,
  },
  row: {
    minHeight: 38,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomWidth: 1,
    borderBottomColor: "#edf5f1",
  },
  rowLabel: { color: "#557366", fontWeight: "700" },
  rowValue: { color: "#173d31", fontWeight: "800" },
  appointmentCard: {
    backgroundColor: colors.white,
    borderRadius: 16,
    padding: 16,
    marginBottom: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  appointmentTitle: { fontSize: 14, color: "#173d31", fontWeight: "800" },
  appointmentMeta: { marginTop: 3, fontSize: 12, color: "#7a9d8f", fontWeight: "600" },
  statusPill: {
    color: colors.primary,
    backgroundColor: colors.primaryTint,
    overflow: "hidden",
    borderRadius: 8,
    paddingHorizontal: 9,
    paddingVertical: 5,
    fontSize: 11,
    fontWeight: "800",
  },
});
