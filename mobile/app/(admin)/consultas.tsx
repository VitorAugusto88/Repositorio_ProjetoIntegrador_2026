import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
    ActivityIndicator,
    Animated,
    Modal,
    RefreshControl,
    ScrollView,
    StatusBar,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    useWindowDimensions,
    View,
} from "react-native";
import { showAlert } from "../../services/feedback";
import {
    AppointmentApiItem,
    cancelAppointment,
    getAppointments,
    getPsychologists,
    isAppointmentOverdue,
    OVERDUE_STATUS_LABEL,
    updateAppointmentStatus,
} from "../../services/api";
import { partsToISO, toInputParts, todayISODate } from "../../services/dateInput";
import { resolveAppointmentRoomName } from "../../services/rooms";
import { DateField, TimeField } from "../../components/DateTimeField";
import { ThemeColors } from "../../constants/theme-palettes";
import { useTheme } from "../../contexts/ThemeContext";

// ─── Cores semânticas fixas (categorias de status, não mudam com a paleta) ───

const BLUE = "#2d6cdf";
const ORANGE = "#c46a1a";
const RED = "#d95c5c";

const MAX_WIDTH = 1120;
const DESKTOP_BREAKPOINT = 900;

const CARD_SHADOW = {
  shadowColor: "#1f5442",
  shadowOpacity: 0.05,
  shadowRadius: 14,
  shadowOffset: { width: 0, height: 6 },
  elevation: 2,
} as const;

// ─── Tipos ────────────────────────────────────────────────────────────────────

type StatusFilter = "all" | "scheduled" | "completed" | "cancelled" | "no_show";
type AppointmentStatus = "completed" | "rescheduled" | "scheduled" | "no_show";

interface NormalizedAppointment {
  id: string;
  patientName: string;
  professionalName: string;
  specialty: string;
  dateTime: string;
  dateFormatted: string;
  status: string;
  durationMinutes?: number;
  // Sala e opcional: `null` quando a consulta nao tem sala vinculada.
  roomName: string | null;
}

interface StatusConfig {
  label: string;
  color: string;
  bg: string;
  icon: string;
}

const buildStatusMap = (
  green: string,
  greenLight: string,
): Record<string, StatusConfig> => ({
  scheduled: {
    label: "Agendada",
    color: BLUE,
    bg: "#eaf1ff",
    icon: "time-outline",
  },
  completed: {
    label: "Concluída",
    color: green,
    bg: greenLight,
    icon: "checkmark-circle-outline",
  },
  cancelled: {
    label: "Cancelada",
    color: RED,
    bg: "#fdeeee",
    icon: "close-circle-outline",
  },
  no_show: {
    label: "Não compareceu",
    color: ORANGE,
    bg: "#fef3e8",
    icon: "alert-circle-outline",
  },
  rescheduled: {
    label: "Remarcada",
    color: "#8a55d9",
    bg: "#f3ecff",
    icon: "refresh-circle-outline",
  },
});

// Exibição da consulta em aberto cujo dia já passou (estado derivado —
// o status gravado continua "scheduled"/"rescheduled").
const OVERDUE_CONFIG: StatusConfig = {
  label: OVERDUE_STATUS_LABEL,
  color: ORANGE,
  bg: "#fdf1e3",
  icon: "hourglass-outline",
};

const FILTERS: { key: StatusFilter; label: string }[] = [
  { key: "all", label: "Todas" },
  { key: "scheduled", label: "Agendadas" },
  { key: "completed", label: "Concluídas" },
  { key: "cancelled", label: "Canceladas" },
  { key: "no_show", label: "Faltou" },
];

const STATUS_OPTIONS: { label: string; value: AppointmentStatus }[] = [
  { label: "Concluída", value: "completed" },
  { label: "Remarcada", value: "rescheduled" },
  { label: "Não compareceu", value: "no_show" },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

const formatDateTime = (iso: string): string => {
  if (!iso) return "Data não informada";
  try {
    const d = new Date(iso);
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  } catch {
    return iso;
  }
};

const getInitials = (name: string): string => {
  const parts = name.trim().split(" ");
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
};

// Normaliza AppointmentApiItem usando o mapa UUID→nome de profissional
const normalize = (
  item: AppointmentApiItem,
  profMap: Record<string, string>,
): NormalizedAppointment => {
  const isoRaw = item.scheduled_at ?? item.date ?? "";

  const patientName =
    item.patient_detail?.user?.full_name ??
    (typeof item.patient === "string" && item.patient.length < 50
      ? item.patient
      : "Paciente desconhecido");

  // Resolve UUID → nome via mapa; fallback em campos extras
  const professionalId = item.professional ?? "";
  const professionalName =
    profMap[professionalId] ||
    (item as any).professional_detail?.user?.full_name ||
    item.psychologist ||
    "Profissional desconhecido";

  const specialty =
    (item as any).professional_detail?.specialty ?? item.specialty ?? "";

  return {
    id: item.id,
    patientName,
    professionalName,
    specialty,
    dateTime: isoRaw,
    dateFormatted: formatDateTime(isoRaw),
    status: item.status ?? "scheduled",
    durationMinutes: item.duration_minutes,
    roomName: resolveAppointmentRoomName(item),
  };
};

// ─── Subcomponentes ───────────────────────────────────────────────────────────

const StatusBadge = ({
  status,
  scheduledAt,
}: {
  status: string;
  scheduledAt?: string;
}) => {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const overdue = isAppointmentOverdue(status, scheduledAt);
  const cfg = overdue
    ? OVERDUE_CONFIG
    : (buildStatusMap(colors.primary, colors.primaryTint)[status] ?? {
        label: status,
        color: "#6c8c80",
        bg: "#edf4f0",
        icon: "ellipse-outline",
      });
  return (
    <View style={[styles.badge, { backgroundColor: cfg.bg }]}>
      <Ionicons name={cfg.icon as any} size={12} color={cfg.color} />
      <Text style={[styles.badgeText, { color: cfg.color }]}>{cfg.label}</Text>
    </View>
  );
};

const AppointmentCard = ({
  item,
  width,
  onChangeStatus,
  onCancel,
}: {
  item: NormalizedAppointment;
  width: number | string;
  onChangeStatus: (item: NormalizedAppointment) => void;
  onCancel: (item: NormalizedAppointment) => void;
}) => {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const canModify = item.status === "scheduled";

  return (
    <View style={[styles.card, { flexBasis: width as any }]}>
      <View style={styles.cardHeader}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{getInitials(item.patientName)}</Text>
        </View>
        <View style={styles.cardInfo}>
          <Text style={styles.patientName} numberOfLines={1}>
            {item.patientName}
          </Text>
          <Text style={styles.professionalName} numberOfLines={1}>
            {item.professionalName}
          </Text>
        </View>
        <StatusBadge status={item.status} scheduledAt={item.dateTime} />
      </View>

      <View style={styles.cardDetails}>
        <View style={styles.detailItem}>
          <Ionicons name="calendar-outline" size={13} color="#6c8c80" />
          <Text style={styles.detailText}>{item.dateFormatted}</Text>
        </View>
        {item.durationMinutes ? (
          <View style={styles.detailItem}>
            <Ionicons name="hourglass-outline" size={13} color="#6c8c80" />
            <Text style={styles.detailText}>{item.durationMinutes} min</Text>
          </View>
        ) : null}
        {item.specialty ? (
          <View style={styles.detailItem}>
            <Ionicons name="medkit-outline" size={13} color="#6c8c80" />
            <Text style={styles.detailText}>{item.specialty}</Text>
          </View>
        ) : null}
        {item.roomName ? (
          <View style={styles.detailItem}>
            <Ionicons name="easel-outline" size={13} color="#6c8c80" />
            <Text style={styles.detailText}>{item.roomName}</Text>
          </View>
        ) : null}
      </View>

      {canModify && (
        <View style={styles.cardActions}>
          <TouchableOpacity
            style={styles.actionBtn}
            onPress={() => onChangeStatus(item)}
            activeOpacity={0.8}
          >
            <Ionicons name="create-outline" size={14} color={colors.primary} />
            <Text style={styles.actionBtnText}>Alterar status</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.actionBtn, styles.actionBtnRed]}
            onPress={() => onCancel(item)}
            activeOpacity={0.8}
          >
            <Ionicons name="close-outline" size={14} color={RED} />
            <Text style={[styles.actionBtnText, { color: RED }]}>
              Cancelar
            </Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
};

// ─── Tela principal ───────────────────────────────────────────────────────────

export default function AdminAppointmentsScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [appointments, setAppointments] = useState<NormalizedAppointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeFilter, setActiveFilter] = useState<StatusFilter>("all");
  const [search, setSearch] = useState("");

  // Modal alterar status
  const [statusModalVisible, setStatusModalVisible] = useState(false);
  const [selectedItem, setSelectedItem] =
    useState<NormalizedAppointment | null>(null);
  const [updatingStatus, setUpdatingStatus] = useState(false);

  // Modal cancelamento
  const [cancelModalVisible, setCancelModalVisible] = useState(false);
  const [cancelTarget, setCancelTarget] =
    useState<NormalizedAppointment | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  const [cancelling, setCancelling] = useState(false);

  // Modal remarcação (nova data)
  const [rescheduleTarget, setRescheduleTarget] =
    useState<NormalizedAppointment | null>(null);
  const [reDate, setReDate] = useState("");
  const [reTime, setReTime] = useState("");
  const [rescheduling, setRescheduling] = useState(false);

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(24)).current;

  const { width } = useWindowDimensions();
  const isDesktop = width >= DESKTOP_BREAKPOINT;
  const cardWidth = isDesktop ? 420 : "100%";

  React.useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 500,
        useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 500,
        useNativeDriver: true,
      }),
    ]).start();
  }, [fadeAnim, slideAnim]);

  // ── Carregamento ────────────────────────────────────────────────────────────
  const loadData = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      // Busca em paralelo: profissionais para montar o mapa + consultas
      const [profsResult, apptResult] = await Promise.all([
        getPsychologists(),
        getAppointments(),
      ]);

      // Monta mapa UUID → nome
      const profMap: Record<string, string> = {};
      if (profsResult.ok && Array.isArray(profsResult.data)) {
        for (const prof of profsResult.data) {
          const name =
            prof.user?.full_name ||
            prof.full_name ||
            prof.name ||
            "Profissional";
          profMap[prof.id] = name;
        }
      }

      if (!apptResult.ok) {
        showAlert(
          "Erro",
          apptResult.error ?? "Não foi possível carregar as consultas.",
        );
        return;
      }

      const normalized = (apptResult.data ?? []).map((item) =>
        normalize(item, profMap),
      );
      // Mais recentes primeiro
      normalized.sort(
        (a, b) =>
          new Date(b.dateTime).getTime() - new Date(a.dateTime).getTime(),
      );
      setAppointments(normalized);
    } catch (err: any) {
      showAlert("Erro", err?.message ?? "Ocorreu um erro inesperado.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);
  const onRefresh = () => {
    setRefreshing(true);
    void loadData(true);
  };

  // ── Filtros ─────────────────────────────────────────────────────────────────
  const filtered = appointments.filter((item) => {
    const matchesFilter =
      activeFilter === "all" || item.status === activeFilter;
    const q = search.toLowerCase();
    const matchesSearch =
      !q ||
      item.patientName.toLowerCase().includes(q) ||
      item.professionalName.toLowerCase().includes(q);
    return matchesFilter && matchesSearch;
  });

  const counts = {
    all: appointments.length,
    scheduled: appointments.filter((a) => a.status === "scheduled").length,
    completed: appointments.filter((a) => a.status === "completed").length,
    cancelled: appointments.filter((a) => a.status === "cancelled").length,
    no_show: appointments.filter((a) => a.status === "no_show").length,
  };

  // ── Ação: alterar status ────────────────────────────────────────────────────
  const openStatusModal = (item: NormalizedAppointment) => {
    setSelectedItem(item);
    setStatusModalVisible(true);
  };

  const confirmStatusChange = async (newStatus: AppointmentStatus) => {
    if (!selectedItem) return;

    // Remarcar exige nova data — abre modal próprio em vez de aplicar direto.
    if (newStatus === "rescheduled") {
      const suggestion = new Date();
      suggestion.setDate(suggestion.getDate() + 1);
      const parts = toInputParts(suggestion);
      setReDate(parts.date);
      setReTime(parts.time);
      setRescheduleTarget(selectedItem);
      setStatusModalVisible(false);
      return;
    }

    setUpdatingStatus(true);
    try {
      const result = await updateAppointmentStatus(selectedItem.id, newStatus);
      if (!result.ok) {
        showAlert(
          "Erro",
          result.error ?? "Não foi possível atualizar o status.",
        );
        return;
      }
      setAppointments((prev) =>
        prev.map((a) =>
          a.id === selectedItem.id ? { ...a, status: newStatus } : a,
        ),
      );
      setStatusModalVisible(false);
    } catch (err: any) {
      showAlert("Erro", err?.message ?? "Erro inesperado.");
    } finally {
      setUpdatingStatus(false);
    }
  };

  const confirmReschedule = async () => {
    if (!rescheduleTarget) return;
    const iso = partsToISO(reDate, reTime);
    if (!iso) {
      showAlert("Data inválida", "Selecione a nova data e horário.");
      return;
    }
    if (new Date(iso).getTime() <= Date.now()) {
      showAlert("Data inválida", "A nova data deve ser no futuro.");
      return;
    }
    setRescheduling(true);
    try {
      const result = await updateAppointmentStatus(
        rescheduleTarget.id,
        "rescheduled",
        { scheduled_at: iso },
      );
      if (!result.ok) {
        showAlert(
          "Erro",
          result.error ?? "Não foi possível remarcar a consulta.",
        );
        return;
      }
      setAppointments((prev) =>
        prev.map((a) =>
          a.id === rescheduleTarget.id
            ? {
                ...a,
                status: "rescheduled",
                dateTime: iso,
                dateFormatted: formatDateTime(iso),
              }
            : a,
        ),
      );
      setRescheduleTarget(null);
    } catch (err: any) {
      showAlert("Erro", err?.message ?? "Erro inesperado.");
    } finally {
      setRescheduling(false);
    }
  };

  // ── Ação: cancelar ──────────────────────────────────────────────────────────
  const openCancelModal = (item: NormalizedAppointment) => {
    setCancelTarget(item);
    setCancelReason("");
    setCancelModalVisible(true);
  };

  const confirmCancel = async () => {
    if (!cancelTarget) return;
    setCancelling(true);
    try {
      const reason = cancelReason.trim() || "Cancelado pelo administrador";
      const result = await cancelAppointment(cancelTarget.id, reason);
      if (!result.ok) {
        showAlert(
          "Erro",
          result.error ?? "Não foi possível cancelar a consulta.",
        );
        return;
      }
      setAppointments((prev) =>
        prev.map((a) =>
          a.id === cancelTarget.id ? { ...a, status: "cancelled" } : a,
        ),
      );
      setCancelModalVisible(false);
    } catch (err: any) {
      showAlert("Erro", err?.message ?? "Erro inesperado.");
    } finally {
      setCancelling(false);
    }
  };

  const Header = () => (
    <View style={styles.header}>
      <View style={styles.headerInner}>
        <TouchableOpacity style={styles.iconBtn} onPress={() => router.back()}>
          <Ionicons name="arrow-back-outline" size={22} color="#fff" />
        </TouchableOpacity>
        <View style={styles.headerTextBox}>
          <Text style={styles.headerTitle}>Consultas</Text>
        </View>
        <TouchableOpacity style={styles.iconBtn} onPress={() => router.replace("/(admin)")}>
          <Ionicons name="home-outline" size={20} color="#fff" />
        </TouchableOpacity>
      </View>
    </View>
  );

  // ── Loading ─────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <View style={styles.screen}>
        <StatusBar barStyle="light-content" backgroundColor={colors.primary} />
        <Header />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.loadingText}>Carregando consultas...</Text>
        </View>
      </View>
    );
  }

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <View style={styles.screen}>
      <StatusBar barStyle="light-content" backgroundColor={colors.primary} />
      <Header />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={[colors.primary]}
            tintColor={colors.primary}
          />
        }
      >
        <Animated.View
          style={[styles.container, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}
        >
          {/* Resumo */}
          <View style={styles.heroCard}>
            <View style={styles.countersRow}>
              <View style={styles.counter}>
                <Text style={styles.counterValue}>{counts.scheduled}</Text>
                <Text style={styles.counterLabel}>Agendadas</Text>
              </View>
              <View style={styles.counterDivider} />
              <View style={styles.counter}>
                <Text style={[styles.counterValue, { color: BLUE }]}>
                  {counts.completed}
                </Text>
                <Text style={styles.counterLabel}>Concluídas</Text>
              </View>
              <View style={styles.counterDivider} />
              <View style={styles.counter}>
                <Text style={[styles.counterValue, { color: RED }]}>
                  {counts.cancelled}
                </Text>
                <Text style={styles.counterLabel}>Canceladas</Text>
              </View>
              <View style={styles.counterDivider} />
              <View style={styles.counter}>
                <Text style={[styles.counterValue, { color: ORANGE }]}>
                  {counts.no_show}
                </Text>
                <Text style={styles.counterLabel}>Faltou</Text>
              </View>
            </View>
          </View>

          {/* Busca */}
          <View style={styles.searchBox}>
            <Ionicons name="search-outline" size={16} color="#94b3a6" />
            <TextInput
              style={styles.searchInput}
              placeholder="Buscar por paciente ou profissional..."
              placeholderTextColor="#94b3a6"
              value={search}
              onChangeText={setSearch}
            />
            {search.length > 0 && (
              <TouchableOpacity onPress={() => setSearch("")}>
                <Ionicons name="close-circle" size={16} color="#94b3a6" />
              </TouchableOpacity>
            )}
          </View>

          {/* Filtros */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.filtersRow}
          >
            {FILTERS.map((f) => (
              <TouchableOpacity
                key={f.key}
                style={[
                  styles.filterChip,
                  activeFilter === f.key && styles.filterChipActive,
                ]}
                onPress={() => setActiveFilter(f.key)}
                activeOpacity={0.8}
              >
                <Text
                  style={[
                    styles.filterChipText,
                    activeFilter === f.key && styles.filterChipTextActive,
                  ]}
                >
                  {f.label}
                </Text>
                <View
                  style={[
                    styles.filterCount,
                    activeFilter === f.key && styles.filterCountActive,
                  ]}
                >
                  <Text
                    style={[
                      styles.filterCountText,
                      activeFilter === f.key && styles.filterCountTextActive,
                    ]}
                  >
                    {counts[f.key]}
                  </Text>
                </View>
              </TouchableOpacity>
            ))}
          </ScrollView>

          {/* Lista */}
          {filtered.length === 0 ? (
            <View style={styles.emptyState}>
              <View style={styles.emptyIcon}>
                <Ionicons name="calendar-outline" size={32} color={colors.primary} />
              </View>
              <Text style={styles.emptyTitle}>Nenhuma consulta encontrada</Text>
              <Text style={styles.emptySubtitle}>
                {search
                  ? "Tente buscar por outro nome."
                  : "Não há consultas para o filtro selecionado."}
              </Text>
            </View>
          ) : (
            <>
              <Text style={styles.resultCount}>
                {filtered.length}{" "}
                {filtered.length === 1 ? "consulta" : "consultas"}
              </Text>
              <View style={styles.cardsWrap}>
                {filtered.map((item) => (
                  <AppointmentCard
                    key={item.id}
                    item={item}
                    width={cardWidth}
                    onChangeStatus={openStatusModal}
                    onCancel={openCancelModal}
                  />
                ))}
              </View>
            </>
          )}
        </Animated.View>
      </ScrollView>

      {/* ── Modal: Alterar status ── */}
      <Modal
        visible={statusModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => !updatingStatus && setStatusModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>Alterar status</Text>
            {selectedItem && (
              <Text style={styles.modalSubtitle}>
                {selectedItem.patientName}
                {"\n"}
                {selectedItem.dateFormatted}
              </Text>
            )}

            <View style={styles.modalOptions}>
              {STATUS_OPTIONS.map((opt) => {
                const cfg = buildStatusMap(colors.primary, colors.primaryTint)[opt.value];
                return (
                  <TouchableOpacity
                    key={opt.value}
                    style={[
                      styles.statusOption,
                      { borderColor: cfg.bg },
                      updatingStatus && styles.disabledBtn,
                    ]}
                    onPress={() => confirmStatusChange(opt.value)}
                    activeOpacity={0.8}
                    disabled={updatingStatus}
                  >
                    <View
                      style={[
                        styles.statusOptionIcon,
                        { backgroundColor: cfg.bg },
                      ]}
                    >
                      <Ionicons
                        name={cfg.icon as any}
                        size={18}
                        color={cfg.color}
                      />
                    </View>
                    <Text
                      style={[styles.statusOptionText, { color: cfg.color }]}
                    >
                      {opt.label}
                    </Text>
                    {updatingStatus && (
                      <ActivityIndicator
                        size="small"
                        color={cfg.color}
                        style={{ marginLeft: "auto" }}
                      />
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>

            <TouchableOpacity
              style={styles.modalCancelBtn}
              onPress={() => setStatusModalVisible(false)}
              disabled={updatingStatus}
            >
              <Text style={styles.modalCancelText}>Fechar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ── Modal: Cancelar ── */}
      <Modal
        visible={cancelModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => !cancelling && setCancelModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>Cancelar consulta</Text>
            {cancelTarget && (
              <Text style={styles.modalSubtitle}>
                {cancelTarget.patientName}
                {"\n"}
                {cancelTarget.dateFormatted}
              </Text>
            )}

            <Text style={styles.modalLabel}>Motivo (opcional)</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="Ex: Paciente solicitou, reagendamento..."
              placeholderTextColor="#94b3a6"
              value={cancelReason}
              onChangeText={setCancelReason}
              multiline
              numberOfLines={3}
              textAlignVertical="top"
              editable={!cancelling}
            />

            <View style={styles.modalRow}>
              <TouchableOpacity
                style={styles.modalCancelBtn}
                onPress={() => setCancelModalVisible(false)}
                disabled={cancelling}
              >
                <Text style={styles.modalCancelText}>Voltar</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.modalDangerBtn,
                  cancelling && styles.disabledBtn,
                ]}
                onPress={confirmCancel}
                activeOpacity={0.85}
                disabled={cancelling}
              >
                {cancelling ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.modalDangerText}>Confirmar</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── Modal: Remarcar (nova data) ── */}
      <Modal
        visible={!!rescheduleTarget}
        transparent
        animationType="fade"
        onRequestClose={() => !rescheduling && setRescheduleTarget(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>Remarcar consulta</Text>
            {rescheduleTarget && (
              <Text style={styles.modalSubtitle}>
                {rescheduleTarget.patientName}
                {"\n"}
                Nova data e horário (deve ser no futuro)
              </Text>
            )}

            <View style={styles.dateFieldRow}>
              <View style={styles.dateCol}>
                <DateField
                  value={reDate}
                  onChange={setReDate}
                  min={todayISODate()}
                  disabled={rescheduling}
                />
              </View>
              <View style={styles.timeCol}>
                <TimeField
                  value={reTime}
                  onChange={setReTime}
                  disabled={rescheduling}
                />
              </View>
            </View>

            <View style={styles.modalRow}>
              <TouchableOpacity
                style={styles.modalCancelBtn}
                onPress={() => setRescheduleTarget(null)}
                disabled={rescheduling}
              >
                <Text style={styles.modalCancelText}>Voltar</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.modalConfirmBtn,
                  rescheduling && styles.disabledBtn,
                ]}
                onPress={confirmReschedule}
                activeOpacity={0.85}
                disabled={rescheduling}
              >
                {rescheduling ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.modalDangerText}>Salvar</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

// ─── Estilos ──────────────────────────────────────────────────────────────────

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.pageBg },
  header: { backgroundColor: colors.primary, paddingTop: 52, paddingBottom: 20 },
  headerInner: {
    width: "100%", maxWidth: MAX_WIDTH, alignSelf: "center", paddingHorizontal: 20,
    flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12,
  },
  iconBtn: {
    width: 42, height: 42, borderRadius: 12, backgroundColor: "rgba(255,255,255,0.14)",
    alignItems: "center", justifyContent: "center",
  },
  headerTextBox: { flex: 1 },
  headerTitle: { color: colors.white, fontSize: 21, fontWeight: "800", letterSpacing: -0.3 },
  loadingContainer: { flex: 1, alignItems: "center", justifyContent: "center", gap: 14 },
  loadingText: { fontSize: 15, color: colors.primary, fontWeight: "600" },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 20, paddingTop: 22, paddingBottom: 44 },
  container: { width: "100%", maxWidth: MAX_WIDTH, alignSelf: "center" },
  heroCard: {
    backgroundColor: colors.white, borderRadius: 16, borderWidth: 1, borderColor: colors.border,
    padding: 18, marginBottom: 16, ...CARD_SHADOW,
  },
  countersRow: { flexDirection: "row", alignItems: "center" },
  counter: { flex: 1, alignItems: "center" },
  counterValue: { fontSize: 22, fontWeight: "800", color: colors.primary },
  counterLabel: { fontSize: 11, color: "#7a9e90", fontWeight: "600", marginTop: 2 },
  counterDivider: { width: 1, height: 32, backgroundColor: "#e0ede7" },
  searchBox: {
    flexDirection: "row", alignItems: "center", backgroundColor: colors.white, borderRadius: 12,
    borderWidth: 1, borderColor: colors.border, paddingHorizontal: 14, height: 50, marginBottom: 14, gap: 8,
    ...CARD_SHADOW,
  },
  searchInput: {
    flex: 1, fontSize: 14, color: colors.textDark, fontWeight: "500",
    // @ts-ignore — remove o contorno azul no web
    outlineStyle: "none",
  },
  filtersRow: { gap: 8, paddingBottom: 16 },
  filterChip: {
    flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 14, paddingVertical: 8,
    borderRadius: 999, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.border,
  },
  filterChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  filterChipText: { fontSize: 13, fontWeight: "700", color: "#5e7b70" },
  filterChipTextActive: { color: colors.white },
  filterCount: {
    minWidth: 20, height: 20, borderRadius: 10, backgroundColor: "#edf4f0",
    alignItems: "center", justifyContent: "center", paddingHorizontal: 4,
  },
  filterCountActive: { backgroundColor: "rgba(255,255,255,0.25)" },
  filterCountText: { fontSize: 11, fontWeight: "700", color: "#5e7b70" },
  filterCountTextActive: { color: colors.white },
  resultCount: { fontSize: 13, fontWeight: "700", color: "#7a9e90", marginBottom: 12 },
  cardsWrap: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  card: {
    flexGrow: 1, backgroundColor: colors.white, borderRadius: 16, borderWidth: 1, borderColor: colors.border,
    padding: 16, ...CARD_SHADOW,
  },
  cardHeader: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 12 },
  avatar: {
    width: 46, height: 46, borderRadius: 15, backgroundColor: colors.primaryTint,
    alignItems: "center", justifyContent: "center",
  },
  avatarText: { fontSize: 15, fontWeight: "800", color: colors.primary },
  cardInfo: { flex: 1 },
  patientName: { fontSize: 15, fontWeight: "800", color: colors.textDark },
  professionalName: { fontSize: 12, color: "#7a9e90", fontWeight: "600", marginTop: 2 },
  badge: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 5, borderRadius: 10 },
  badgeText: { fontSize: 11, fontWeight: "700" },
  cardDetails: { gap: 6, marginBottom: 4 },
  detailItem: { flexDirection: "row", alignItems: "center", gap: 6 },
  detailText: { fontSize: 12, color: "#6c8c80", fontWeight: "500" },
  cardActions: {
    flexDirection: "row", gap: 8, marginTop: 14, borderTopWidth: 1,
    borderTopColor: "#edf4f0", paddingTop: 12,
  },
  actionBtn: {
    flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5,
    height: 36, borderRadius: 10, borderWidth: 1.5, borderColor: "#cfe7dc", backgroundColor: "#f9fdfb",
  },
  actionBtnRed: { borderColor: "#f5d0d0", backgroundColor: "#fff8f8" },
  actionBtnText: { fontSize: 12, fontWeight: "700", color: colors.primary },
  emptyState: { alignItems: "center", paddingVertical: 48, gap: 12 },
  emptyIcon: {
    width: 72, height: 72, borderRadius: 24, backgroundColor: colors.primaryTint,
    alignItems: "center", justifyContent: "center",
  },
  emptyTitle: { fontSize: 17, fontWeight: "800", color: colors.textDark },
  emptySubtitle: { fontSize: 13, color: "#7a9e90", textAlign: "center", lineHeight: 19 },

  // Modais
  modalOverlay: {
    flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "center", alignItems: "center", padding: 24,
  },
  modalBox: { backgroundColor: colors.white, borderRadius: 20, padding: 24, width: "100%", maxWidth: 400 },
  modalTitle: { fontSize: 19, fontWeight: "800", color: colors.textDark, textAlign: "center" },
  modalSubtitle: { fontSize: 13, color: "#6c8c80", textAlign: "center", marginTop: 6, marginBottom: 20, lineHeight: 19 },
  modalLabel: {
    fontSize: 12, fontWeight: "700", color: "#5f7d70", marginBottom: 8,
    textTransform: "uppercase", letterSpacing: 0.5,
  },
  modalInput: {
    minHeight: 80, borderRadius: 12, borderWidth: 1, borderColor: "#d7ebe2",
    backgroundColor: "#f6faf8", paddingHorizontal: 14, paddingVertical: 10,
    fontSize: 14, color: colors.textDark, marginBottom: 20,
    // @ts-ignore — remove o contorno azul no web
    outlineStyle: "none",
  },
  dateFieldRow: { flexDirection: "row", gap: 10, marginBottom: 20 },
  dateCol: { flex: 1.4, minWidth: 0 },
  timeCol: { flex: 1, minWidth: 0 },
  modalConfirmBtn: {
    flex: 1,
    height: 46,
    borderRadius: 12,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  modalRow: { flexDirection: "row", gap: 10 },
  modalCancelBtn: {
    flex: 1, height: 46, borderRadius: 12, borderWidth: 1.5, borderColor: "#cfe7dc",
    backgroundColor: "#f9fdfb", alignItems: "center", justifyContent: "center",
  },
  modalCancelText: { fontSize: 14, fontWeight: "700", color: "#5e7b70" },
  modalDangerBtn: {
    flex: 1, height: 46, borderRadius: 12, backgroundColor: RED,
    alignItems: "center", justifyContent: "center",
  },
  modalDangerText: { fontSize: 14, fontWeight: "700", color: colors.white },
  disabledBtn: { opacity: 0.6 },
  modalOptions: { gap: 10, marginBottom: 16 },
  statusOption: {
    flexDirection: "row", alignItems: "center", gap: 12, padding: 14,
    borderRadius: 12, borderWidth: 1.5, backgroundColor: "#fbfefd",
  },
  statusOptionIcon: { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  statusOptionText: { fontSize: 15, fontWeight: "700" },
});
