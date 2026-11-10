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
  downloadReportFile,
  getProfessionalPatientReport,
  getProfessionalSummaryReport,
  PatientReportApi,
  ProfessionalSummaryReportApi,
  ReportPeriodQuery,
} from "../../services/api";
import { ThemeColors } from "../../constants/theme-palettes";
import { useTheme } from "../../contexts/ThemeContext";

export default function ProfessionalReportsScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [report, setReport] = useState<ProfessionalSummaryReportApi | null>(null);
  const [patientReport, setPatientReport] = useState<PatientReportApi | null>(null);
  const [selectedPatientId, setSelectedPatientId] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadingPatient, setLoadingPatient] = useState(false);
  const [exporting, setExporting] = useState<"pdf" | "excel" | "patient" | null>(null);

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(24)).current;

  const period = useMemo<ReportPeriodQuery>(
    () => ({ start_date: startDate.trim(), end_date: endDate.trim() }),
    [startDate, endDate],
  );

  const loadReport = async () => {
    setLoading(true);
    const result = await getProfessionalSummaryReport(period);
    if (result.ok && result.data) {
      setReport(result.data);
    } else {
      showAlert("Erro", result.error || "Nao foi possivel carregar o relatorio.");
    }
    setLoading(false);
  };

  useEffect(() => {
    void loadReport();
  }, []);

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 500, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 0, duration: 500, useNativeDriver: true }),
    ]).start();
  }, [fadeAnim, slideAnim]);

  const openPatientReport = async (patientId: string) => {
    setSelectedPatientId(patientId);
    setLoadingPatient(true);
    const result = await getProfessionalPatientReport(patientId, period);
    if (result.ok && result.data) {
      setPatientReport(result.data);
    } else {
      showAlert("Erro", result.error || "Nao foi possivel carregar o paciente.");
    }
    setLoadingPatient(false);
  };

  const exportSummary = async (kind: "pdf" | "excel") => {
    setExporting(kind);
    const extension = kind === "pdf" ? "pdf" : "xlsx";
    const result = await downloadReportFile(
      `/reports/professionals/summary/${kind === "pdf" ? "pdf" : "excel"}/`,
      period,
      `relatorio-profissional.${extension}`,
    );
    if (!result.ok) showAlert("Exportacao", result.error || "Falha ao exportar.");
    setExporting(null);
  };

  const exportPatient = async () => {
    if (!selectedPatientId) return;
    setExporting("patient");
    const result = await downloadReportFile(
      `/reports/professionals/patients/${encodeURIComponent(selectedPatientId)}/pdf/`,
      period,
      "relatorio-paciente.pdf",
    );
    if (!result.ok) showAlert("Exportacao", result.error || "Falha ao exportar.");
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
        </View>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={styles.loadingText}>Carregando relatorios...</Text>
          </View>
        ) : (
          <Animated.View style={{ opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}>
            <View style={styles.heroCard}>
              <Text style={styles.heroTitle}>
                {report?.professional?.full_name || "Resumo profissional"}
              </Text>
              <Text style={styles.heroSubtitle}>
                Indicadores de atendimento, pacientes acompanhados e historico do periodo.
              </Text>
            </View>

            <View style={styles.filterCard}>
              <Text style={styles.sectionTitle}>Período</Text>
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
              <TouchableOpacity style={styles.applyBtn} onPress={() => void loadReport()}>
                <Ionicons name="filter-outline" size={17} color={colors.white} />
                <Text style={styles.applyBtnText}>Aplicar filtros</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.actionRow}>
              <TouchableOpacity style={styles.exportBtn} onPress={() => void exportSummary("pdf")}>
                {exporting === "pdf" ? (
                  <ActivityIndicator color={colors.primary} />
                ) : (
                  <Ionicons name="document-text-outline" size={18} color={colors.primary} />
                )}
                <Text style={styles.exportBtnText}>PDF</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.exportBtn} onPress={() => void exportSummary("excel")}>
                {exporting === "excel" ? (
                  <ActivityIndicator color={colors.primary} />
                ) : (
                  <Ionicons name="grid-outline" size={18} color={colors.primary} />
                )}
                <Text style={styles.exportBtnText}>Excel</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.metricsGrid}>
              <Metric styles={styles} color={colors.primary} label="Consultas" value={report?.summary.total_appointments ?? 0} />
              <Metric styles={styles} color={colors.primary} label="Pacientes" value={report?.summary.unique_patients ?? 0} />
              <Metric styles={styles} color={colors.primary} label="Cancel." value={`${report?.summary.cancellation_rate_percent ?? 0}%`} />
            </View>

            <Text style={styles.sectionTitle}>Pacientes atendidos</Text>
            {(report?.patients ?? []).slice(0, 12).map((patient) => (
              <TouchableOpacity
                key={patient.patient_id}
                style={[
                  styles.patientCard,
                  selectedPatientId === patient.patient_id && styles.patientCardActive,
                ]}
                onPress={() => void openPatientReport(patient.patient_id)}
                activeOpacity={0.85}
              >
                <View>
                  <Text style={styles.patientName}>{patient.patient_name}</Text>
                  <Text style={styles.patientMeta}>
                    {patient.total_appointments} consultas • {patient.completed} realizadas
                  </Text>
                </View>
                <Ionicons name="analytics-outline" size={21} color={colors.primary} />
              </TouchableOpacity>
            ))}

            {loadingPatient ? (
              <View style={styles.patientReportCard}>
                <ActivityIndicator color={colors.primary} />
              </View>
            ) : patientReport ? (
              <View style={styles.patientReportCard}>
                <View style={styles.patientReportHeader}>
                  <View>
                    <Text style={styles.sectionTitle}>{patientReport.patient?.full_name}</Text>
                    <Text style={styles.patientMeta}>Relatorio individual</Text>
                  </View>
                  <TouchableOpacity style={styles.smallExportBtn} onPress={exportPatient}>
                    {exporting === "patient" ? (
                      <ActivityIndicator color={colors.primary} />
                    ) : (
                      <Ionicons name="download-outline" size={18} color={colors.primary} />
                    )}
                  </TouchableOpacity>
                </View>
                <View style={styles.row}>
                  <Text style={styles.rowLabel}>Total</Text>
                  <Text style={styles.rowValue}>{patientReport.summary.total_appointments}</Text>
                </View>
                <View style={styles.row}>
                  <Text style={styles.rowLabel}>Presenca</Text>
                  <Text style={styles.rowValue}>
                    {patientReport.summary.attendance_rate_percent ?? 0}%
                  </Text>
                </View>
              </View>
            ) : null}
          </Animated.View>
        )}
      </ScrollView>
    </View>
  );
}

const Metric = ({
  label,
  value,
  color,
  styles,
}: {
  label: string;
  value: number | string;
  color: string;
  styles: ReturnType<typeof createStyles>;
}) => (
  <View style={styles.metricCard}>
    <View style={styles.metricIcon}>
      <Ionicons name="stats-chart-outline" size={19} color={color} />
    </View>
    <Text style={styles.metricValue}>{value}</Text>
    <Text style={styles.metricLabel}>{label}</Text>
  </View>
);

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.pageBg },
    header: { backgroundColor: colors.primary, paddingTop: 52, paddingBottom: 20 },
    headerInner: { width: "100%", maxWidth: 1120, alignSelf: "center", paddingHorizontal: 20, flexDirection: "row", alignItems: "center", gap: 14 },
    iconBtn: { width: 42, height: 42, borderRadius: 12, backgroundColor: "rgba(255,255,255,0.14)", alignItems: "center", justifyContent: "center" },
    headerTextBox: { flex: 1 },
    headerTitle: { color: colors.white, fontSize: 21, fontWeight: "800", letterSpacing: -0.3 },
    scroll: { flex: 1 },
    scrollContent: { paddingHorizontal: 20, paddingTop: 22, paddingBottom: 40, maxWidth: 1120, alignSelf: 'center' as const, width: '100%' as const },
    loadingContainer: { minHeight: 360, alignItems: "center", justifyContent: "center", gap: 12 },
    loadingText: { color: colors.primary, fontWeight: "700" },
    heroCard: { backgroundColor: colors.white, borderRadius: 18, borderWidth: 1, borderColor: colors.border, padding: 20, marginBottom: 16, shadowColor: "#1f5442", shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.05, shadowRadius: 14, elevation: 2 },
    heroTitle: { fontSize: 22, fontWeight: "800", color: colors.textDark },
    heroSubtitle: { marginTop: 8, fontSize: 14, lineHeight: 21, color: colors.textMuted },
    filterCard: { backgroundColor: colors.white, borderRadius: 16, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: colors.border },
    sectionTitle: { fontSize: 17, fontWeight: "800", color: colors.textDark, marginBottom: 12 },
    inputRow: { flexDirection: "row", gap: 10 },
    dateField: { flex: 1, gap: 6 },
    inputLabel: { fontSize: 12, fontWeight: "700", color: colors.textMuted, marginLeft: 2 },
    applyBtn: { marginTop: 12, height: 46, borderRadius: 12, backgroundColor: colors.primary, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
    applyBtnText: { color: colors.white, fontWeight: "800" },
    actionRow: { flexDirection: "row", gap: 10, marginBottom: 16 },
    exportBtn: { flex: 1, height: 46, borderRadius: 12, backgroundColor: colors.primaryTint, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
    exportBtnText: { color: colors.primary, fontWeight: "800" },
    metricsGrid: { flexDirection: "row", gap: 10, marginBottom: 22 },
    metricCard: { flex: 1, backgroundColor: colors.white, borderRadius: 16, borderWidth: 1, borderColor: colors.border, padding: 14, minHeight: 122, shadowColor: "#1f5442", shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.05, shadowRadius: 14, elevation: 2 },
    metricIcon: { width: 38, height: 38, borderRadius: 12, backgroundColor: colors.primaryTint, alignItems: "center", justifyContent: "center", marginBottom: 10 },
    metricValue: { fontSize: 22, fontWeight: "800", color: colors.textDark },
    metricLabel: { fontSize: 12, color: colors.textMuted, fontWeight: "700", marginTop: 2 },
    patientCard: { backgroundColor: colors.white, borderRadius: 16, padding: 16, marginBottom: 10, flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderWidth: 1, borderColor: colors.border },
    patientCardActive: { borderColor: colors.primary, backgroundColor: "#f6faf8" },
    patientName: { fontSize: 15, fontWeight: "800", color: colors.textDark },
    patientMeta: { marginTop: 3, fontSize: 12, color: "#7a9d8f", fontWeight: "600" },
    patientReportCard: { backgroundColor: colors.white, borderRadius: 16, borderWidth: 1, borderColor: colors.border, padding: 16, marginTop: 10 },
    patientReportHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
    smallExportBtn: { width: 42, height: 42, borderRadius: 12, backgroundColor: colors.primaryTint, alignItems: "center", justifyContent: "center" },
    row: { minHeight: 38, flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderTopWidth: 1, borderTopColor: "#edf5f1" },
    rowLabel: { color: "#557366", fontWeight: "700" },
    rowValue: { color: colors.textDark, fontWeight: "800" },
  });
