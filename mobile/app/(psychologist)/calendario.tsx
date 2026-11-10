import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
    ActivityIndicator,
    Animated,
    Modal,
    ScrollView,
    StatusBar,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    useWindowDimensions,
    View,
} from "react-native";
import { DateField, TimeField } from "../../components/DateTimeField";
import { ThemeColors } from "../../constants/theme-palettes";
import { useTheme } from "../../contexts/ThemeContext";
import {
    AppointmentApiItem,
    getAppointments,
    getMe,
    getSessionNote,
    isAppointmentOverdue,
    OVERDUE_STATUS_LABEL,
    updateAppointmentStatus,
    updateSessionNote,
} from "../../services/api";
import { partsToISO, toInputParts, todayISODate } from "../../services/dateInput";
import { showAlert } from "../../services/feedback";

type AppointmentStatus =
  | "scheduled"
  | "completed"
  | "rescheduled"
  | "no_show"
  | "cancelled";

interface CalendarAppointment {
  id: string;
  dayKey: string;
  weekday: string;
  dateLabel: string;
  time: string;
  patientName: string;
  type: string;
  status: AppointmentStatus;
  scheduledAt: string; // ISO original — usado para saber se o dia já passou
}

// ─── Cores semânticas fixas (status de consulta, não mudam com a paleta) ─────
const BLUE_LIGHT = "#eaf1ff";
const ORANGE_LIGHT = "#fef3e8";

const MAX_WIDTH = 1120;
const DESKTOP_BREAKPOINT = 900;

const CARD_SHADOW = {
  shadowColor: "#1f5442",
  shadowOpacity: 0.05,
  shadowRadius: 14,
  shadowOffset: { width: 0, height: 6 },
  elevation: 2,
} as const;

const WEEKDAYS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const MONTHS = [
  "Janeiro",
  "Fevereiro",
  "Março",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
];

const getDaysInMonth = (year: number, month: number) =>
  new Date(year, month + 1, 0).getDate();

const getFirstDayOfMonth = (year: number, month: number) =>
  new Date(year, month, 1).getDay();

const toKey = (year: number, month: number, day: number) =>
  `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

const extractPatientName = (item: AppointmentApiItem): string => {
  if (item.patient_detail?.user?.full_name) {
    return item.patient_detail.user.full_name;
  }
  if ((item as any).patient_name) {
    return (item as any).patient_name;
  }
  return "Paciente";
};

const toCalendarAppointment = (item: AppointmentApiItem): CalendarAppointment => {
  const date = new Date(item.scheduled_at!);
  const dayKey = item.scheduled_at!.split("T")[0];
  return {
    id: item.id,
    dayKey,
    weekday: date.toLocaleDateString("pt-BR", { weekday: "short" }),
    dateLabel: date.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" }),
    time: date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }),
    patientName: extractPatientName(item),
    type: "Sessão individual",
    status: (item.status as AppointmentStatus) ?? "scheduled",
    scheduledAt: item.scheduled_at!,
  };
};

// GREEN/GREEN_LIGHT (marca da clínica) entram como parâmetro porque mudam
// conforme a paleta escolhida pelo admin — as demais cores são fixas.
const getStatusMeta = (
  status: AppointmentStatus,
  scheduledAt: string | undefined,
  colors: ThemeColors,
) => {
  if (isAppointmentOverdue(status, scheduledAt)) {
    return {
      label: OVERDUE_STATUS_LABEL,
      icon: "hourglass-outline",
      color: "#c46a1a",
      bg: ORANGE_LIGHT,
    };
  }

  switch (status) {
    case "completed":
      return { label: "Realizada", icon: "checkmark-circle-outline", color: "#2d6cdf", bg: BLUE_LIGHT };
    case "rescheduled":
      return { label: "Remarcada", icon: "swap-horizontal-outline", color: "#c46a1a", bg: ORANGE_LIGHT };
    case "no_show":
      return { label: "Não compareceu", icon: "close-circle-outline", color: "#b03030", bg: "#fdeaea" };
    case "cancelled":
      return { label: "Cancelada", icon: "ban-outline", color: "#888", bg: "#f2f2f2" };
    default:
      return { label: "Agendada", icon: "calendar-outline", color: colors.primary, bg: colors.primaryTint };
  }
};

const formatDayLabel = (key: string) => {
  const [y, m, d] = key.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  const weekday = date.toLocaleDateString("pt-BR", { weekday: "long" });
  return `${weekday.charAt(0).toUpperCase()}${weekday.slice(1)}, ${d} de ${MONTHS[m - 1]}`;
};

export default function PsychologistCalendarScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const { width: screenWidth } = useWindowDimensions();
  const cellSize = Math.min(46, Math.max(36, (screenWidth - 60) / 7));
  const { width } = useWindowDimensions();
  const isDesktop = width >= DESKTOP_BREAKPOINT;

  const today = new Date();
  const todayKey = toKey(today.getFullYear(), today.getMonth(), today.getDate());

  const [appointments, setAppointments] = useState<CalendarAppointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentYear, setCurrentYear] = useState(today.getFullYear());
  const [currentMonth, setCurrentMonth] = useState(today.getMonth());
  const [selectedDate, setSelectedDate] = useState<string>(todayKey);

  const [selectedAppointment, setSelectedAppointment] =
    useState<CalendarAppointment | null>(null);
  const [updatingStatus, setUpdatingStatus] = useState(false);

  // Modal de conclusão (data realizada + nota do que aconteceu)
  const [completing, setCompleting] = useState<CalendarAppointment | null>(null);
  const [completeDate, setCompleteDate] = useState("");
  const [completeTime, setCompleteTime] = useState("");
  const [completeNote, setCompleteNote] = useState("");
  const [loadingCompleteNote, setLoadingCompleteNote] = useState(false);

  // Modal de remarcação (nova data)
  const [rescheduling, setRescheduling] = useState<CalendarAppointment | null>(null);
  const [reDate, setReDate] = useState("");
  const [reTime, setReTime] = useState("");

  const [submitting, setSubmitting] = useState(false);

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(24)).current;

  const loadAppointments = async () => {
    setLoading(true);
    try {
      const [meResult, appointmentsResult] = await Promise.all([getMe(), getAppointments()]);

      if (!meResult.ok || !meResult.data) {
        showAlert("Erro", meResult.error || "Erro ao carregar perfil.");
        setLoading(false);
        return;
      }

      if (appointmentsResult.ok && appointmentsResult.data) {
        setAppointments(
          appointmentsResult.data
            .filter((item) => item.scheduled_at)
            .map(toCalendarAppointment),
        );
      } else {
        showAlert("Erro", appointmentsResult.error || "Erro ao carregar consultas.");
      }
    } catch {
      showAlert("Erro", "Erro inesperado ao carregar dados.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAppointments();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  React.useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 500, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 0, duration: 500, useNativeDriver: true }),
    ]).start();
  }, [fadeAnim, slideAnim]);

  // Contagem de consultas por dia, restrita ao mês exibido (para os pontinhos da grade).
  const appointmentsCountByDay = useMemo(() => {
    const map: Record<string, number> = {};
    const monthPrefix = `${currentYear}-${String(currentMonth + 1).padStart(2, "0")}`;
    for (const item of appointments) {
      if (item.dayKey.startsWith(monthPrefix)) {
        map[item.dayKey] = (map[item.dayKey] ?? 0) + 1;
      }
    }
    return map;
  }, [appointments, currentYear, currentMonth]);

  const monthCompletedCount = useMemo(() => {
    const monthPrefix = `${currentYear}-${String(currentMonth + 1).padStart(2, "0")}`;
    return appointments.filter(
      (item) => item.dayKey.startsWith(monthPrefix) && item.status === "completed",
    ).length;
  }, [appointments, currentYear, currentMonth]);

  const selectedDayAppointments = useMemo(
    () =>
      appointments
        .filter((item) => item.dayKey === selectedDate)
        .sort((a, b) => a.time.localeCompare(b.time)),
    [appointments, selectedDate],
  );

  const prevMonth = () => {
    if (currentMonth === 0) {
      setCurrentMonth(11);
      setCurrentYear((y) => y - 1);
    } else {
      setCurrentMonth((m) => m - 1);
    }
  };

  const nextMonth = () => {
    if (currentMonth === 11) {
      setCurrentMonth(0);
      setCurrentYear((y) => y + 1);
    } else {
      setCurrentMonth((m) => m + 1);
    }
  };

  const goToToday = () => {
    setCurrentYear(today.getFullYear());
    setCurrentMonth(today.getMonth());
    setSelectedDate(todayKey);
  };

  const handleStatusChange = async (
    newStatus: "completed" | "scheduled" | "rescheduled" | "no_show",
    successMessage: string,
  ) => {
    if (!selectedAppointment) return;
    setUpdatingStatus(true);
    const updatedId = selectedAppointment.id;
    const result = await updateAppointmentStatus(updatedId, newStatus);
    setUpdatingStatus(false);

    if (result.ok) {
      setAppointments((current) =>
        current.map((item) => (item.id === updatedId ? { ...item, status: newStatus } : item)),
      );
      setSelectedAppointment((current) =>
        current ? { ...current, status: newStatus } : current,
      );
      showAlert("Consulta atualizada", successMessage);
      setTimeout(() => loadAppointments(), 1500);
    } else {
      const detail = result.data ? JSON.stringify(result.data) : "";
      showAlert(
        "Erro ao atualizar",
        result.error ? `${result.error}${detail ? `\n\n${detail}` : ""}` : "Não foi possível atualizar o status.",
      );
    }
  };

  const handleMarkCompleted = async () => {
    if (!selectedAppointment) return;
    const target = selectedAppointment;
    const now = toInputParts();
    setCompleteDate(now.date);
    setCompleteTime(now.time);
    setCompleteNote("");
    setCompleting(target);
    setLoadingCompleteNote(true);
    const noteResult = await getSessionNote(target.id);
    setLoadingCompleteNote(false);
    if (noteResult.ok && noteResult.data) {
      setCompleteNote(noteResult.data.notes || "");
    }
  };

  const confirmCompletion = async () => {
    if (!completing) return;
    const iso = partsToISO(completeDate, completeTime);
    if (!iso) {
      showAlert("Data inválida", "Selecione a data e o horário da realização.");
      return;
    }
    if (new Date(iso).getTime() > Date.now()) {
      showAlert("Data inválida", "A data de realização não pode ser no futuro.");
      return;
    }
    setSubmitting(true);
    const result = await updateAppointmentStatus(completing.id, "completed", { completed_at: iso });
    if (!result.ok) {
      setSubmitting(false);
      showAlert("Erro", result.error || "Não foi possível concluir a consulta.");
      return;
    }
    if (completeNote.trim()) {
      await updateSessionNote(completing.id, completeNote);
    }
    setSubmitting(false);
    const doneId = completing.id;
    setAppointments((current) =>
      current.map((item) => (item.id === doneId ? { ...item, status: "completed" } : item)),
    );
    setCompleting(null);
    setSelectedAppointment(null);
    showAlert("Consulta concluída", "A consulta foi marcada como realizada.");
  };

  const handleUndoCompleted = () =>
    handleStatusChange("scheduled", "Consulta revertida para agendada.");

  const handleMarkRescheduled = () => {
    if (!selectedAppointment) return;
    const suggestion = new Date();
    suggestion.setDate(suggestion.getDate() + 1);
    const parts = toInputParts(suggestion);
    setReDate(parts.date);
    setReTime(selectedAppointment.time || parts.time);
    setRescheduling(selectedAppointment);
  };

  const confirmReschedule = async () => {
    if (!rescheduling) return;
    const iso = partsToISO(reDate, reTime);
    if (!iso) {
      showAlert("Data inválida", "Selecione a nova data e horário.");
      return;
    }
    if (new Date(iso).getTime() <= Date.now()) {
      showAlert("Data inválida", "A nova data deve ser no futuro.");
      return;
    }
    setSubmitting(true);
    const result = await updateAppointmentStatus(rescheduling.id, "rescheduled", { scheduled_at: iso });
    setSubmitting(false);
    if (!result.ok) {
      showAlert("Erro", result.error || "Não foi possível remarcar a consulta.");
      return;
    }
    setRescheduling(null);
    setSelectedAppointment(null);
    await loadAppointments();
    showAlert("Consulta remarcada", "A nova data foi salva.");
  };

  const daysInMonth = getDaysInMonth(currentYear, currentMonth);
  const firstDay = getFirstDayOfMonth(currentYear, currentMonth);
  const calendarCells: (number | null)[] = [
    ...Array(firstDay).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  while (calendarCells.length % 7 !== 0) calendarCells.push(null);

  return (
    <View style={styles.screen}>
      <StatusBar barStyle="light-content" backgroundColor={colors.primary} />

      <View style={styles.header}>
        <View style={styles.headerInner}>
          <TouchableOpacity style={styles.iconBtn} onPress={() => router.back()}>
            <Ionicons name="arrow-back-outline" size={22} color="#fff" />
          </TouchableOpacity>

          <View style={styles.headerTextBox}>
            <Text style={styles.headerTitle}>Calendário</Text>
          </View>

          <TouchableOpacity
            style={styles.iconBtn}
            onPress={() => router.push("/(psychologist)/agenda")}
          >
            <Ionicons name="reorder-three-outline" size={22} color="#fff" />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.iconBtn}
            onPress={() => router.replace("/(psychologist)/dashboardP")}
          >
            <Ionicons name="home-outline" size={20} color="#fff" />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={styles.loadingText}>Carregando calendário...</Text>
          </View>
        ) : (
          <Animated.View
            style={[styles.container, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}
          >
            <View style={styles.summaryRow}>
              <View style={styles.summaryCard}>
                <View style={[styles.summaryIcon, { backgroundColor: colors.primaryTint }]}>
                  <Ionicons name="calendar-outline" size={18} color={colors.primary} />
                </View>
                <View style={styles.summaryText}>
                  <Text style={styles.summaryValue}>{selectedDayAppointments.length}</Text>
                  <Text style={styles.summaryLabel}>Consultas no dia</Text>
                </View>
              </View>
              <View style={styles.summaryCard}>
                <View style={[styles.summaryIcon, { backgroundColor: BLUE_LIGHT }]}>
                  <Ionicons name="checkmark-circle-outline" size={18} color="#2d6cdf" />
                </View>
                <View style={styles.summaryText}>
                  <Text style={styles.summaryValue}>{monthCompletedCount}</Text>
                  <Text style={styles.summaryLabel}>Realizadas no mês</Text>
                </View>
              </View>
            </View>

            {/* ── Calendário mensal ── */}
            <View style={styles.calendarCard}>
              <View style={styles.monthNav}>
                <TouchableOpacity style={styles.navBtn} onPress={prevMonth} activeOpacity={0.7}>
                  <Ionicons name="chevron-back-outline" size={18} color={colors.primary} />
                </TouchableOpacity>
                <Text style={styles.monthLabel}>
                  {MONTHS[currentMonth]} {currentYear}
                </Text>
                <TouchableOpacity style={styles.navBtn} onPress={nextMonth} activeOpacity={0.7}>
                  <Ionicons name="chevron-forward-outline" size={18} color={colors.primary} />
                </TouchableOpacity>
              </View>

              <TouchableOpacity style={styles.todayLink} onPress={goToToday} activeOpacity={0.7}>
                <Text style={styles.todayLinkText}>Ir para hoje</Text>
              </TouchableOpacity>

              <View style={[styles.weekdaysRow, { width: cellSize * 7 }]}>
                {WEEKDAYS.map((w) => (
                  <Text key={w} style={[styles.weekdayText, { width: cellSize }]}>
                    {w}
                  </Text>
                ))}
              </View>

              <View style={[styles.daysGrid, { width: cellSize * 7 }]}>
                {calendarCells.map((day, idx) => {
                  if (!day) {
                    return (
                      <View
                        key={`empty-${idx}`}
                        style={[styles.dayCell, { width: cellSize, height: cellSize }]}
                      />
                    );
                  }

                  const key = toKey(currentYear, currentMonth, day);
                  const isToday = key === todayKey;
                  const isSelected = key === selectedDate;
                  const count = appointmentsCountByDay[key] ?? 0;
                  const hasAppointments = count > 0;

                  return (
                    <TouchableOpacity
                      key={key}
                      style={[
                        styles.dayCell,
                        {
                          width: cellSize,
                          height: cellSize,
                          borderRadius: cellSize / 2,
                        },
                        hasAppointments && styles.dayCellHasAppointments,
                        isToday && !isSelected && styles.dayCellToday,
                        isSelected && styles.dayCellSelected,
                      ]}
                      onPress={() => setSelectedDate(key)}
                      activeOpacity={0.75}
                    >
                      <Text
                        style={[
                          styles.dayText,
                          hasAppointments && styles.dayTextHasAppointments,
                          isSelected && styles.dayTextSelected,
                        ]}
                      >
                        {day}
                      </Text>
                      {hasAppointments && !isSelected && (
                        <View style={styles.appointmentDot} />
                      )}
                    </TouchableOpacity>
                  );
                })}
              </View>

              <View style={styles.legend}>
                <View style={styles.legendItem}>
                  <View style={[styles.legendDot, { backgroundColor: colors.primary }]} />
                  <Text style={styles.legendText}>Com consultas</Text>
                </View>
                <View style={styles.legendItem}>
                  <View
                    style={[
                      styles.legendDot,
                      { borderWidth: 1.5, borderColor: colors.primary, backgroundColor: "transparent" },
                    ]}
                  />
                  <Text style={styles.legendText}>Hoje</Text>
                </View>
                <View style={styles.legendItem}>
                  <View style={[styles.legendDot, { backgroundColor: colors.primaryTint }]} />
                  <Text style={styles.legendText}>Selecionado</Text>
                </View>
              </View>
            </View>

            {/* ── Consultas do dia selecionado ── */}
            <Text style={styles.sectionTitle}>
              {selectedDate ? formatDayLabel(selectedDate) : "Consultas do dia"}
            </Text>

            {selectedDayAppointments.length === 0 ? (
              <View style={styles.emptyCard}>
                <Ionicons name="calendar-clear-outline" size={34} color="#9bbcaf" />
                <Text style={styles.emptyTitle}>Sem consultas nesse dia</Text>
                <Text style={styles.emptyText}>Nenhuma consulta agendada para este dia.</Text>
              </View>
            ) : (
              <View style={styles.appointmentsWrap}>
                {selectedDayAppointments.map((appointment) => {
                  const statusMeta = getStatusMeta(appointment.status, appointment.scheduledAt, colors);

                  return (
                    <TouchableOpacity
                      key={appointment.id}
                      style={[styles.appointmentCard, { flexBasis: isDesktop ? 360 : "100%" }]}
                      activeOpacity={0.85}
                      onPress={() => setSelectedAppointment(appointment)}
                    >
                      <View style={[styles.statusStripe, { backgroundColor: statusMeta.color }]} />
                      <View style={styles.appointmentBody}>
                        <View style={styles.appointmentTopRow}>
                          <View style={styles.appointmentTimeBox}>
                            <Text style={styles.appointmentTime}>{appointment.time}</Text>
                            <Text style={styles.appointmentPatient}>{appointment.patientName}</Text>
                          </View>
                          <View style={[styles.statusBadge, { backgroundColor: statusMeta.bg }]}>
                            <Ionicons name={statusMeta.icon as any} size={14} color={statusMeta.color} />
                            <Text style={[styles.statusText, { color: statusMeta.color }]}>
                              {statusMeta.label}
                            </Text>
                          </View>
                        </View>
                        <View style={styles.appointmentFooter}>
                          <Text style={styles.appointmentType}>{appointment.type}</Text>
                          <Ionicons name="chevron-forward-outline" size={18} color="#9db6ab" />
                        </View>
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}
          </Animated.View>
        )}
      </ScrollView>

      {/* Modal: detalhes da consulta */}
      <Modal
        visible={!!selectedAppointment}
        transparent
        animationType={isDesktop ? "fade" : "slide"}
        onRequestClose={() => setSelectedAppointment(null)}
      >
        <View style={[styles.modalOverlay, isDesktop && styles.modalOverlayDesktop]}>
          <View style={[styles.modalSheet, isDesktop && styles.modalSheetDesktop]}>
            {!isDesktop && <View style={styles.modalHandle} />}

            {selectedAppointment && (
              <>
                <Text style={styles.modalTitle}>Detalhes da consulta</Text>
                <Text style={styles.modalSubtitle}>
                  {selectedAppointment.weekday}, {selectedAppointment.dateLabel} as{" "}
                  {selectedAppointment.time}
                </Text>

                <View style={styles.detailCard}>
                  <Text style={styles.detailLabel}>Paciente</Text>
                  <Text style={styles.detailValue}>{selectedAppointment.patientName}</Text>
                </View>

                <View style={styles.detailCard}>
                  <Text style={styles.detailLabel}>Tipo de atendimento</Text>
                  <Text style={styles.detailValue}>{selectedAppointment.type}</Text>
                </View>

                <View style={styles.detailCard}>
                  <Text style={styles.detailLabel}>Status atual</Text>
                  <Text style={styles.detailValue}>
                    {getStatusMeta(selectedAppointment.status, selectedAppointment.scheduledAt, colors).label}
                  </Text>
                </View>

                {selectedAppointment.status === "scheduled" && (
                  <>
                    <TouchableOpacity
                      style={[styles.primaryAction, updatingStatus && styles.actionDisabled]}
                      onPress={handleMarkCompleted}
                      disabled={updatingStatus}
                      activeOpacity={0.85}
                    >
                      {updatingStatus ? (
                        <ActivityIndicator size="small" color="#fff" />
                      ) : (
                        <Ionicons name="checkmark-circle-outline" size={18} color="#fff" />
                      )}
                      <Text style={styles.primaryActionText}>Marcar como realizada</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[styles.secondaryAction, updatingStatus && styles.actionDisabled]}
                      onPress={handleMarkRescheduled}
                      disabled={updatingStatus}
                      activeOpacity={0.85}
                    >
                      <Ionicons name="swap-horizontal-outline" size={18} color={colors.primary} />
                      <Text style={styles.secondaryActionText}>Marcar como remarcada</Text>
                    </TouchableOpacity>
                  </>
                )}

                {selectedAppointment.status === "completed" && (
                  <TouchableOpacity
                    style={[styles.undoAction, updatingStatus && styles.actionDisabled]}
                    onPress={handleUndoCompleted}
                    disabled={updatingStatus}
                    activeOpacity={0.85}
                  >
                    {updatingStatus ? (
                      <ActivityIndicator size="small" color="#c46a1a" />
                    ) : (
                      <Ionicons name="arrow-undo-outline" size={18} color="#c46a1a" />
                    )}
                    <Text style={styles.undoActionText}>Desfazer realizada</Text>
                  </TouchableOpacity>
                )}

                {selectedAppointment.status === "rescheduled" && (
                  <TouchableOpacity
                    style={[styles.secondaryAction, updatingStatus && styles.actionDisabled]}
                    onPress={() => handleStatusChange("scheduled", "Consulta reativada como agendada.")}
                    disabled={updatingStatus}
                    activeOpacity={0.85}
                  >
                    {updatingStatus ? (
                      <ActivityIndicator size="small" color={colors.primary} />
                    ) : (
                      <Ionicons name="refresh-outline" size={18} color={colors.primary} />
                    )}
                    <Text style={styles.secondaryActionText}>Reverter para agendada</Text>
                  </TouchableOpacity>
                )}

                {(selectedAppointment.status === "cancelled" ||
                  selectedAppointment.status === "no_show") && (
                  <View style={styles.detailCard}>
                    <Text style={[styles.detailLabel, { color: "#b03030" }]}>
                      Esta consulta não pode ser alterada
                    </Text>
                  </View>
                )}

                <TouchableOpacity
                  style={styles.closeAction}
                  onPress={() => setSelectedAppointment(null)}
                  activeOpacity={0.85}
                >
                  <Text style={styles.closeActionText}>Fechar</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>
      </Modal>

      {/* Modal: concluir consulta (data realizada + o que aconteceu) */}
      <Modal
        visible={!!completing}
        transparent
        animationType={isDesktop ? "fade" : "slide"}
        onRequestClose={() => !submitting && setCompleting(null)}
      >
        <View style={[styles.modalOverlay, isDesktop && styles.modalOverlayDesktop]}>
          <View style={[styles.modalSheet, isDesktop && styles.modalSheetDesktop]}>
            {!isDesktop && <View style={styles.modalHandle} />}
            <Text style={styles.modalTitle}>Concluir consulta</Text>
            <Text style={styles.modalSubtitle}>
              Informe quando a consulta foi realizada. Não pode ser no futuro.
            </Text>

            <Text style={styles.fieldLabel}>Data realizada</Text>
            <View style={styles.dateRow}>
              <View style={styles.dateCol}>
                <DateField value={completeDate} onChange={setCompleteDate} max={todayISODate()} />
              </View>
              <View style={styles.timeCol}>
                <TimeField value={completeTime} onChange={setCompleteTime} />
              </View>
            </View>

            <Text style={styles.fieldLabel}>O que aconteceu (opcional)</Text>
            {loadingCompleteNote ? (
              <ActivityIndicator size="small" color={colors.primary} style={{ marginVertical: 20 }} />
            ) : (
              <TextInput
                style={styles.noteInput}
                value={completeNote}
                onChangeText={setCompleteNote}
                multiline
                placeholder="Anote as observações da sessão. Visível apenas para você."
                placeholderTextColor="#9db6ab"
                textAlignVertical="top"
              />
            )}

            <TouchableOpacity
              style={[styles.primaryAction, submitting && styles.actionDisabled]}
              onPress={confirmCompletion}
              disabled={submitting}
              activeOpacity={0.85}
            >
              {submitting ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Ionicons name="checkmark-circle-outline" size={18} color="#fff" />
              )}
              <Text style={styles.primaryActionText}>Confirmar conclusão</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.closeAction}
              onPress={() => setCompleting(null)}
              disabled={submitting}
              activeOpacity={0.85}
            >
              <Text style={styles.closeActionText}>Cancelar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Modal: remarcar consulta (nova data) */}
      <Modal
        visible={!!rescheduling}
        transparent
        animationType={isDesktop ? "fade" : "slide"}
        onRequestClose={() => !submitting && setRescheduling(null)}
      >
        <View style={[styles.modalOverlay, isDesktop && styles.modalOverlayDesktop]}>
          <View style={[styles.modalSheet, isDesktop && styles.modalSheetDesktop]}>
            {!isDesktop && <View style={styles.modalHandle} />}
            <Text style={styles.modalTitle}>Remarcar consulta</Text>
            <Text style={styles.modalSubtitle}>Escolha a nova data e horário. Deve ser no futuro.</Text>

            <Text style={styles.fieldLabel}>Nova data</Text>
            <View style={styles.dateRow}>
              <View style={styles.dateCol}>
                <DateField value={reDate} onChange={setReDate} min={todayISODate()} />
              </View>
              <View style={styles.timeCol}>
                <TimeField value={reTime} onChange={setReTime} />
              </View>
            </View>

            <TouchableOpacity
              style={[styles.primaryAction, submitting && styles.actionDisabled]}
              onPress={confirmReschedule}
              disabled={submitting}
              activeOpacity={0.85}
            >
              {submitting ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Ionicons name="swap-horizontal-outline" size={18} color="#fff" />
              )}
              <Text style={styles.primaryActionText}>Salvar nova data</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.closeAction}
              onPress={() => setRescheduling(null)}
              disabled={submitting}
              activeOpacity={0.85}
            >
              <Text style={styles.closeActionText}>Cancelar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    screen: {
      flex: 1,
      backgroundColor: colors.pageBg,
    },
    header: {
      backgroundColor: colors.primary,
      paddingTop: 52,
      paddingBottom: 20,
    },
    headerInner: {
      width: "100%",
      maxWidth: MAX_WIDTH,
      alignSelf: "center",
      paddingHorizontal: 20,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 12,
    },
    iconBtn: {
      width: 42,
      height: 42,
      borderRadius: 12,
      backgroundColor: "rgba(255,255,255,0.14)",
      alignItems: "center",
      justifyContent: "center",
    },
    headerTextBox: {
      flex: 1,
    },
    headerTitle: {
      color: colors.white,
      fontSize: 21,
      fontWeight: "800",
      letterSpacing: -0.3,
    },
    scroll: {
      flex: 1,
    },
    scrollContent: {
      paddingHorizontal: 20,
      paddingTop: 22,
      paddingBottom: 44,
    },
    container: {
      width: "100%",
      maxWidth: MAX_WIDTH,
      alignSelf: "center",
    },
    summaryRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 12,
      marginBottom: 22,
    },
    summaryCard: {
      flexGrow: 1,
      flexBasis: 150,
      minWidth: 140,
      backgroundColor: colors.white,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 16,
      flexDirection: "row",
      alignItems: "center",
      gap: 14,
      ...CARD_SHADOW,
    },
    summaryIcon: {
      width: 42,
      height: 42,
      borderRadius: 13,
      alignItems: "center",
      justifyContent: "center",
    },
    summaryText: {
      flex: 1,
    },
    summaryValue: {
      fontSize: 24,
      fontWeight: "800",
      color: colors.textDark,
      letterSpacing: -0.5,
    },
    summaryLabel: {
      marginTop: 2,
      fontSize: 12.5,
      color: colors.textMuted,
      fontWeight: "600",
    },
    calendarCard: {
      alignSelf: "center",
      backgroundColor: colors.white,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 18,
      marginBottom: 24,
      ...CARD_SHADOW,
    },
    monthNav: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
    },
    navBtn: {
      width: 36,
      height: 36,
      borderRadius: 11,
      backgroundColor: colors.primaryTint,
      alignItems: "center",
      justifyContent: "center",
    },
    monthLabel: {
      fontSize: 17,
      fontWeight: "800",
      color: colors.textDark,
      letterSpacing: -0.3,
    },
    todayLink: {
      alignSelf: "center",
      marginTop: 8,
      marginBottom: 4,
    },
    todayLinkText: {
      fontSize: 12.5,
      fontWeight: "700",
      color: colors.primary,
    },
    weekdaysRow: {
      flexDirection: "row",
      marginTop: 14,
      marginBottom: 6,
    },
    weekdayText: {
      textAlign: "center",
      fontSize: 11,
      fontWeight: "700",
      color: colors.textMuted,
      textTransform: "uppercase",
    },
    daysGrid: {
      flexDirection: "row",
      flexWrap: "wrap",
      justifyContent: "flex-start",
    },
    dayCell: {
      alignItems: "center",
      justifyContent: "center",
      marginBottom: 4,
      position: "relative",
    },
    dayCellHasAppointments: {
      backgroundColor: colors.primaryTint,
    },
    dayCellToday: {
      borderWidth: 1.5,
      borderColor: colors.primary,
    },
    dayCellSelected: {
      backgroundColor: colors.primary,
    },
    dayText: {
      fontSize: 13,
      color: colors.textDark,
      fontWeight: "600",
    },
    dayTextHasAppointments: {
      color: colors.primary,
      fontWeight: "800",
    },
    dayTextSelected: {
      color: colors.white,
      fontWeight: "800",
    },
    appointmentDot: {
      position: "absolute",
      bottom: 4,
      width: 4,
      height: 4,
      borderRadius: 2,
      backgroundColor: colors.primary,
    },
    legend: {
      flexDirection: "row",
      justifyContent: "center",
      flexWrap: "wrap",
      gap: 16,
      marginTop: 14,
    },
    legendItem: {
      flexDirection: "row",
      alignItems: "center",
      gap: 5,
    },
    legendDot: {
      width: 12,
      height: 12,
      borderRadius: 6,
    },
    legendText: {
      fontSize: 11,
      color: colors.textMuted,
      fontWeight: "600",
    },
    sectionTitle: {
      fontSize: 16,
      fontWeight: "800",
      color: colors.textDark,
      letterSpacing: -0.2,
      marginBottom: 12,
      textTransform: "capitalize",
    },
    emptyCard: {
      backgroundColor: colors.white,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 28,
      alignItems: "center",
      marginBottom: 24,
      ...CARD_SHADOW,
    },
    emptyTitle: {
      marginTop: 12,
      fontSize: 16,
      fontWeight: "800",
      color: colors.textDark,
    },
    emptyText: {
      marginTop: 8,
      fontSize: 14,
      lineHeight: 20,
      color: colors.textMuted,
      textAlign: "center",
    },
    appointmentsWrap: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 12,
    },
    appointmentCard: {
      flexGrow: 1,
      backgroundColor: colors.white,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.border,
      overflow: "hidden",
      flexDirection: "row",
      ...CARD_SHADOW,
    },
    statusStripe: {
      width: 5,
    },
    appointmentBody: {
      flex: 1,
      padding: 16,
    },
    appointmentTopRow: {
      flexDirection: "row",
      alignItems: "flex-start",
      justifyContent: "space-between",
      gap: 12,
    },
    appointmentTimeBox: {
      flex: 1,
    },
    appointmentTime: {
      fontSize: 20,
      fontWeight: "800",
      color: colors.textDark,
    },
    appointmentPatient: {
      marginTop: 3,
      fontSize: 15,
      fontWeight: "700",
      color: "#274a3d",
    },
    statusBadge: {
      flexDirection: "row",
      alignItems: "center",
      borderRadius: 999,
      paddingVertical: 7,
      paddingHorizontal: 11,
    },
    statusText: {
      marginLeft: 6,
      fontSize: 12,
      fontWeight: "700",
    },
    appointmentFooter: {
      marginTop: 12,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
    },
    appointmentType: {
      fontSize: 13.5,
      color: colors.textMuted,
      fontWeight: "600",
    },
    modalOverlay: {
      flex: 1,
      backgroundColor: "rgba(10, 21, 17, 0.35)",
      justifyContent: "flex-end",
    },
    modalOverlayDesktop: {
      justifyContent: "center",
      alignItems: "center",
      padding: 20,
    },
    modalSheet: {
      backgroundColor: colors.white,
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      padding: 24,
      paddingBottom: 36,
    },
    modalSheetDesktop: {
      width: "100%",
      maxWidth: 460,
      borderRadius: 20,
      paddingBottom: 24,
    },
    modalHandle: {
      width: 42,
      height: 4,
      borderRadius: 2,
      backgroundColor: colors.border,
      alignSelf: "center",
      marginBottom: 20,
    },
    modalTitle: {
      fontSize: 20,
      fontWeight: "800",
      color: colors.textDark,
    },
    modalSubtitle: {
      marginTop: 6,
      fontSize: 14,
      color: colors.textMuted,
      marginBottom: 18,
    },
    detailCard: {
      backgroundColor: "#f6faf8",
      borderRadius: 14,
      padding: 16,
      marginBottom: 12,
      borderWidth: 1,
      borderColor: colors.border,
    },
    detailLabel: {
      fontSize: 11,
      color: colors.textMuted,
      fontWeight: "700",
      textTransform: "uppercase",
      letterSpacing: 0.5,
    },
    detailValue: {
      marginTop: 6,
      fontSize: 15,
      color: colors.textDark,
      fontWeight: "700",
    },
    fieldLabel: {
      fontSize: 11,
      color: colors.textMuted,
      fontWeight: "700",
      textTransform: "uppercase",
      letterSpacing: 0.5,
      marginBottom: 8,
      marginTop: 4,
    },
    dateRow: {
      flexDirection: "row",
      gap: 10,
      marginBottom: 6,
    },
    dateCol: { flex: 1.4, minWidth: 0 },
    timeCol: { flex: 1, minWidth: 0 },
    noteInput: {
      minHeight: 120,
      borderRadius: 14,
      backgroundColor: "#f6faf8",
      borderWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: 14,
      paddingVertical: 12,
      fontSize: 14,
      color: colors.textDark,
      marginBottom: 6,
      // @ts-ignore — remove o contorno azul no web
      outlineStyle: "none",
    },
    primaryAction: {
      marginTop: 10,
      height: 52,
      borderRadius: 14,
      backgroundColor: colors.primary,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
    },
    primaryActionText: {
      color: colors.white,
      fontSize: 15,
      fontWeight: "700",
    },
    secondaryAction: {
      marginTop: 10,
      height: 52,
      borderRadius: 14,
      borderWidth: 1.5,
      borderColor: "#cfe2d8",
      backgroundColor: "#f6faf8",
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
    },
    secondaryActionText: {
      color: colors.primary,
      fontSize: 15,
      fontWeight: "700",
    },
    undoAction: {
      marginTop: 10,
      height: 52,
      borderRadius: 14,
      borderWidth: 1.5,
      borderColor: "#f5d5b8",
      backgroundColor: ORANGE_LIGHT,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
    },
    undoActionText: {
      color: "#c46a1a",
      fontSize: 15,
      fontWeight: "700",
    },
    actionDisabled: {
      opacity: 0.6,
    },
    closeAction: {
      marginTop: 10,
      height: 48,
      borderRadius: 14,
      alignItems: "center",
      justifyContent: "center",
    },
    closeActionText: {
      color: colors.textMuted,
      fontSize: 15,
      fontWeight: "700",
    },
    loadingContainer: {
      flex: 1,
      justifyContent: "center",
      alignItems: "center",
      paddingTop: 100,
    },
    loadingText: {
      marginTop: 16,
      fontSize: 16,
      color: colors.primary,
      fontWeight: "600",
    },
  });
