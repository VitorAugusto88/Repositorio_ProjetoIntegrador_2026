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
import { ThemeColors } from "../../constants/theme-palettes";
import { useTheme } from "../../contexts/ThemeContext";
import { showAlert } from "../../services/feedback";
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
import { DateField, TimeField } from "../../components/DateTimeField";

type AppointmentStatus =
  | "scheduled"
  | "completed"
  | "rescheduled"
  | "no_show"
  | "cancelled";

interface WeeklyAppointment {
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

// Cores semânticas fixas (status de consulta, não mudam com a paleta)
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

const getCurrentWeekDays = (weekOffset: number = 0) => {
  const today = new Date();
  const dayOfWeek = today.getDay();
  const monday = new Date(today);
  monday.setDate(today.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));
  monday.setDate(monday.getDate() + weekOffset * 7);

  return Array.from({ length: 6 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return {
      key: d.toISOString().split("T")[0],
      weekday: ["Seg", "Ter", "Qua", "Qui", "Sex", "Sab"][i],
      fullLabel: d.toLocaleDateString("pt-BR", {
        day: "2-digit",
        month: "short",
      }),
      date: d,
    };
  });
};

const extractPatientName = (item: AppointmentApiItem): string => {
  if (item.patient_detail?.user?.full_name) {
    return item.patient_detail.user.full_name;
  }
  if ((item as any).patient_name) {
    return (item as any).patient_name;
  }
  return "Paciente";
};

const toWeeklyAppointment = (item: AppointmentApiItem): WeeklyAppointment => {
  const date = new Date(item.scheduled_at!);
  const dayKey = item.scheduled_at!.split("T")[0];
  return {
    id: item.id,
    dayKey,
    weekday: date.toLocaleDateString("pt-BR", { weekday: "short" }),
    dateLabel: date.toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "short",
    }),
    time: date.toLocaleTimeString("pt-BR", {
      hour: "2-digit",
      minute: "2-digit",
    }),
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
  // Consulta em aberto cujo dia já passou: rótulo automático, sem ação do
  // usuário. Não aparece antes nem durante o dia da consulta.
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
      return {
        label: "Realizada",
        icon: "checkmark-circle-outline",
        color: "#2d6cdf",
        bg: BLUE_LIGHT,
      };
    case "rescheduled":
      return {
        label: "Remarcada",
        icon: "swap-horizontal-outline",
        color: "#c46a1a",
        bg: ORANGE_LIGHT,
      };
    case "no_show":
      return {
        label: "Não compareceu",
        icon: "close-circle-outline",
        color: "#b03030",
        bg: "#fdeaea",
      };
    case "cancelled":
      return {
        label: "Cancelada",
        icon: "ban-outline",
        color: "#888",
        bg: "#f2f2f2",
      };
    default:
      return {
        label: "Agendada",
        icon: "calendar-outline",
        color: colors.primary,
        bg: colors.primaryTint,
      };
  }
};

export default function PsychologistAgendaScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [appointments, setAppointments] = useState<WeeklyAppointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDay, setSelectedDay] = useState("");
  const [selectedAppointment, setSelectedAppointment] =
    useState<WeeklyAppointment | null>(null);
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [weekOffset, setWeekOffset] = useState(0);

  // Modal de conclusão (data realizada + nota do que aconteceu)
  const [completing, setCompleting] = useState<WeeklyAppointment | null>(null);
  const [completeDate, setCompleteDate] = useState("");
  const [completeTime, setCompleteTime] = useState("");
  const [completeNote, setCompleteNote] = useState("");
  const [loadingCompleteNote, setLoadingCompleteNote] = useState(false);

  // Modal de remarcação (nova data)
  const [rescheduling, setRescheduling] = useState<WeeklyAppointment | null>(
    null,
  );
  const [reDate, setReDate] = useState("");
  const [reTime, setReTime] = useState("");

  const [submitting, setSubmitting] = useState(false);

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(24)).current;
  const weekDays = useMemo(() => getCurrentWeekDays(weekOffset), [weekOffset]);

  const { width } = useWindowDimensions();
  const isDesktop = width >= DESKTOP_BREAKPOINT;

  useEffect(() => {
    // Compute the week days for the current offset inside the effect
    // so we don't depend on the weekDays memo (which changes reference every render)
    const currentWeekDays = getCurrentWeekDays(weekOffset);

    const loadData = async () => {
      setLoading(true);
      try {
        const [meResult, appointmentsResult] = await Promise.all([
          getMe(),
          getAppointments(),
        ]);

        if (!meResult.ok || !meResult.data) {
          showAlert("Erro", meResult.error || "Erro ao carregar perfil.");
          setLoading(false);
          return;
        }

        if (appointmentsResult.ok && appointmentsResult.data) {
          const weeklyAppointments = appointmentsResult.data
            .filter((item) => item.scheduled_at)
            .map(toWeeklyAppointment)
            .filter((item) =>
              currentWeekDays.some((day) => day.key === item.dayKey),
            );
          setAppointments(weeklyAppointments);
        } else {
          showAlert(
            "Erro",
            appointmentsResult.error || "Erro ao carregar consultas.",
          );
        }

        const todayKey = new Date().toISOString().split("T")[0];
        if (currentWeekDays.some((day) => day.key === todayKey)) {
          setSelectedDay(todayKey);
        } else if (currentWeekDays.length > 0) {
          setSelectedDay(currentWeekDays[0].key);
        }
      } catch {
        showAlert("Erro", "Erro inesperado ao carregar dados.");
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [weekOffset]); // ✅ Only re-run when the week actually changes, not on every render

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

  const summary = useMemo(() => {
    const todayCount = appointments.filter(
      (item) => item.dayKey === selectedDay,
    ).length;
    const completedCount = appointments.filter(
      (item) => item.status === "completed",
    ).length;
    return { todayCount, completedCount };
  }, [appointments, selectedDay]);

  const selectedDayAppointments = useMemo(
    () =>
      appointments
        .filter((item) => item.dayKey === selectedDay)
        .sort((a, b) => a.time.localeCompare(b.time)),
    [appointments, selectedDay],
  );

  const handleStatusChange = async (
    newStatus: "completed" | "scheduled" | "rescheduled" | "no_show",
    successMessage: string,
  ) => {
    if (!selectedAppointment) return;
    setUpdatingStatus(true);

    // Captura o id ANTES de qualquer setState para evitar closure stale
    const updatedId = selectedAppointment.id;

    if (__DEV__) {
      console.log(
        `🔄 Enviando atualização: appointmentId=${updatedId}, newStatus=${newStatus}`,
      );
    }

    const result = await updateAppointmentStatus(updatedId, newStatus);

    if (__DEV__) {
      console.log("📡 Resposta da API:", result);
    }

    setUpdatingStatus(false);

    if (result.ok) {
      if (__DEV__) {
        console.log("✅ Atualização bem-sucedida no backend");
      }

      // Atualiza estado local imediatamente para feedback instantâneo
      setAppointments((current) =>
        current.map((item) =>
          item.id === updatedId ? { ...item, status: newStatus } : item,
        ),
      );
      setSelectedAppointment((current) =>
        current ? { ...current, status: newStatus } : current,
      );

      showAlert("Consulta atualizada", successMessage);

      // Recarrega do backend após 1.5s e FAZ MERGE preservando o status confirmado
      // Isso evita que uma resposta lenta do backend reverta o status local
      setTimeout(() => {
        const reloadData = async () => {
          if (__DEV__) {
            console.log("🔄 Recarregando consultas do backend...");
          }
          const appointmentsResult = await getAppointments();
          if (__DEV__) {
            console.log("📝 Consultas recarregadas:", appointmentsResult);
          }

          if (appointmentsResult.ok && appointmentsResult.data) {
            const freshAppointments = appointmentsResult.data
              .filter((item) => item.scheduled_at)
              .map(toWeeklyAppointment);

            // merge que protege o item recém-atualizado
            // Se o backend ainda retornar o status antigo (race condition),
            // mantém o newStatus que confirmamos via 200 OK
            setAppointments(() => {
              return freshAppointments.map((fetched) => {
                if (fetched.id === updatedId) {
                  const backendReflected = fetched.status === newStatus;
                  if (!backendReflected) {
                    if (__DEV__) {
                      console.warn(
                        `⚠️ Backend ainda retornou status antigo (${fetched.status}) para ${updatedId}. Mantendo ${newStatus}.`,
                      );
                    }
                  }
                  return backendReflected
                    ? fetched
                    : { ...fetched, status: newStatus as AppointmentStatus };
                }
                return fetched;
              });
            });

            // Atualiza também o modal se ainda estiver aberto com o mesmo appointment
            setSelectedAppointment((current) => {
              if (!current || current.id !== updatedId) return current;
              return { ...current, status: newStatus as AppointmentStatus };
            });
          }
        };
        reloadData();
      }, 1500);
    } else {
      if (__DEV__) {
        console.error("❌ Erro ao atualizar:", result.error);
      }
      const detail = result.data ? JSON.stringify(result.data) : "";
      showAlert(
        "Erro ao atualizar",
        result.error
          ? `${result.error}${detail ? `\n\n${detail}` : ""}`
          : "Não foi possível atualizar o status.",
      );
    }
  };

  // Abre o modal de conclusão: prefill com "agora" e carrega a nota existente.
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
      showAlert(
        "Data inválida",
        "A data de realização não pode ser no futuro.",
      );
      return;
    }
    setSubmitting(true);
    const result = await updateAppointmentStatus(completing.id, "completed", {
      completed_at: iso,
    });
    if (!result.ok) {
      setSubmitting(false);
      showAlert("Erro", result.error || "Não foi possível concluir a consulta.");
      return;
    }
    // Salva a nota da sessão (o que aconteceu), se preenchida.
    if (completeNote.trim()) {
      await updateSessionNote(completing.id, completeNote);
    }
    setSubmitting(false);
    const doneId = completing.id;
    setAppointments((current) =>
      current.map((item) =>
        item.id === doneId ? { ...item, status: "completed" } : item,
      ),
    );
    setCompleting(null);
    setSelectedAppointment(null);
    showAlert("Consulta concluída", "A consulta foi marcada como realizada.");
  };

  const handleUndoCompleted = () =>
    handleStatusChange("scheduled", "Consulta revertida para agendada.");

  // Abre o modal de remarcação com sugestão de nova data (amanhã, mesmo horário).
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
    const result = await updateAppointmentStatus(rescheduling.id, "rescheduled", {
      scheduled_at: iso,
    });
    setSubmitting(false);
    if (!result.ok) {
      showAlert("Erro", result.error || "Não foi possível remarcar a consulta.");
      return;
    }
    setRescheduling(null);
    setSelectedAppointment(null);
    // Recarrega a semana atual para refletir a nova data.
    const appointmentsResult = await getAppointments();
    if (appointmentsResult.ok && appointmentsResult.data) {
      const currentWeekDays = getCurrentWeekDays(weekOffset);
      const weekly = appointmentsResult.data
        .filter((item) => item.scheduled_at)
        .map(toWeeklyAppointment)
        .filter((item) =>
          currentWeekDays.some((day) => day.key === item.dayKey),
        );
      setAppointments(weekly);
    }
    showAlert("Consulta remarcada", "A nova data foi salva.");
  };

  const handlePreviousWeek = () => {
    const newOffset = weekOffset - 1;
    setWeekOffset(newOffset);
    const newWeekDays = getCurrentWeekDays(newOffset);
    setSelectedDay(newWeekDays[0].key);
  };

  const handleNextWeek = () => {
    const newOffset = weekOffset + 1;
    setWeekOffset(newOffset);
    const newWeekDays = getCurrentWeekDays(newOffset);
    setSelectedDay(newWeekDays[0].key);
  };

  const handleTodayWeek = () => {
    setWeekOffset(0);
    const todayKey = new Date().toISOString().split("T")[0];
    const todayInWeek = getCurrentWeekDays(0).find(
      (day) => day.key === todayKey,
    );
    if (todayInWeek) {
      setSelectedDay(todayInWeek.key);
    } else if (weekDays.length > 0) {
      setSelectedDay(weekDays[0].key);
    }
  };

  const renderDay = (day: ReturnType<typeof getCurrentWeekDays>[number]) => {
    const isActive = day.key === selectedDay;
    const appointmentsCount = appointments.filter(
      (item) => item.dayKey === day.key,
    ).length;

    return (
      <TouchableOpacity
        key={day.key}
        style={[
          styles.dayCard,
          isDesktop ? styles.dayCardDesktop : styles.dayCardMobile,
          isActive && styles.dayCardActive,
        ]}
        onPress={() => setSelectedDay(day.key)}
        activeOpacity={0.85}
      >
        <Text style={[styles.dayWeekLabel, isActive && styles.dayWeekLabelActive]}>
          {day.weekday}
        </Text>
        <Text style={[styles.dayDateLabel, isActive && styles.dayDateLabelActive]}>
          {day.fullLabel}
        </Text>
        <View style={[styles.dayBadge, isActive && styles.dayBadgeActive]}>
          <Text style={[styles.dayBadgeText, isActive && styles.dayBadgeTextActive]}>
            {appointmentsCount} consulta{appointmentsCount === 1 ? "" : "s"}
          </Text>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.screen}>
      <StatusBar barStyle="light-content" backgroundColor={colors.primary} />

      <View style={styles.header}>
        <View style={styles.headerInner}>
          <TouchableOpacity style={styles.iconBtn} onPress={() => router.back()}>
            <Ionicons name="arrow-back-outline" size={22} color="#fff" />
          </TouchableOpacity>

          <View style={styles.headerTextBox}>
            <Text style={styles.headerTitle}>Agenda</Text>
          </View>

          <TouchableOpacity
            style={styles.iconBtn}
            onPress={() => router.push("/(psychologist)/calendario" as any)}
          >
            <Ionicons name="grid-outline" size={20} color="#fff" />
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
            <Text style={styles.loadingText}>Carregando agenda...</Text>
          </View>
        ) : (
          <Animated.View
            style={[
              styles.container,
              { opacity: fadeAnim, transform: [{ translateY: slideAnim }] },
            ]}
          >
            <View style={styles.summaryRow}>
              <View style={styles.summaryCard}>
                <View style={[styles.summaryIcon, { backgroundColor: colors.primaryTint }]}>
                  <Ionicons name="calendar-outline" size={18} color={colors.primary} />
                </View>
                <View style={styles.summaryText}>
                  <Text style={styles.summaryValue}>{summary.todayCount}</Text>
                  <Text style={styles.summaryLabel}>Consultas no dia</Text>
                </View>
              </View>
              <View style={styles.summaryCard}>
                <View style={[styles.summaryIcon, { backgroundColor: BLUE_LIGHT }]}>
                  <Ionicons name="checkmark-circle-outline" size={18} color="#2d6cdf" />
                </View>
                <View style={styles.summaryText}>
                  <Text style={styles.summaryValue}>{summary.completedCount}</Text>
                  <Text style={styles.summaryLabel}>Realizadas</Text>
                </View>
              </View>
            </View>

            <Text style={styles.sectionTitle}>Calendário semanal</Text>
            <View style={styles.weekNavigationContainer}>
              <TouchableOpacity
                style={styles.weekNavButton}
                onPress={handlePreviousWeek}
                activeOpacity={0.7}
              >
                <Ionicons name="chevron-back-outline" size={20} color={colors.primary} />
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.todayButton}
                onPress={handleTodayWeek}
                activeOpacity={0.7}
              >
                <Text style={styles.todayButtonText}>Hoje</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.weekNavButton}
                onPress={handleNextWeek}
                activeOpacity={0.7}
              >
                <Ionicons name="chevron-forward-outline" size={20} color={colors.primary} />
              </TouchableOpacity>
            </View>

            {weekDays.length > 0 && (
              <View style={styles.weekLabelContainer}>
                <View style={styles.weekLabelBadge}>
                  <Text style={styles.weekLabelText}>
                    {weekDays[0].fullLabel.split(" ")[0]}{" "}
                    {weekDays[0].fullLabel.split(" ")[1]} –{" "}
                    {weekDays[5].fullLabel.split(" ")[0]}{" "}
                    {weekDays[5].fullLabel.split(" ")[1]}{" "}
                    {new Date().getFullYear()}
                  </Text>
                </View>
              </View>
            )}

            {isDesktop ? (
              <View style={styles.weekRowDesktop}>{weekDays.map(renderDay)}</View>
            ) : (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.weekRow}
              >
                {weekDays.map(renderDay)}
              </ScrollView>
            )}

            <Text style={styles.sectionTitle}>Consultas agendadas</Text>
            {selectedDayAppointments.length === 0 ? (
              <View style={styles.emptyCard}>
                <Ionicons name="calendar-clear-outline" size={34} color="#9bbcaf" />
                <Text style={styles.emptyTitle}>Sem consultas nesse dia</Text>
                <Text style={styles.emptyText}>
                  Nenhuma consulta agendada para este dia.
                </Text>
                <TouchableOpacity
                  style={styles.emptyBtn}
                  onPress={() => router.push("/(psychologist)/disponibilidade")}
                  activeOpacity={0.85}
                >
                  <Ionicons name="time-outline" size={15} color={colors.primary} />
                  <Text style={styles.emptyBtnText}>Ver minha disponibilidade</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View style={styles.appointmentsWrap}>
                {selectedDayAppointments.map((appointment) => {
                  const statusMeta = getStatusMeta(
                    appointment.status,
                    appointment.scheduledAt,
                    colors,
                  );

                  return (
                    <TouchableOpacity
                      key={appointment.id}
                      style={[
                        styles.appointmentCard,
                        { flexBasis: isDesktop ? 360 : "100%" },
                      ]}
                      activeOpacity={0.85}
                      onPress={() => setSelectedAppointment(appointment)}
                    >
                      <View
                        style={[
                          styles.statusStripe,
                          { backgroundColor: statusMeta.color },
                        ]}
                      />

                      <View style={styles.appointmentBody}>
                        <View style={styles.appointmentTopRow}>
                          <View style={styles.appointmentTimeBox}>
                            <Text style={styles.appointmentTime}>
                              {appointment.time}
                            </Text>
                            <Text style={styles.appointmentPatient}>
                              {appointment.patientName}
                            </Text>
                          </View>

                          <View
                            style={[
                              styles.statusBadge,
                              { backgroundColor: statusMeta.bg },
                            ]}
                          >
                            <Ionicons
                              name={statusMeta.icon as any}
                              size={14}
                              color={statusMeta.color}
                            />
                            <Text
                              style={[styles.statusText, { color: statusMeta.color }]}
                            >
                              {statusMeta.label}
                            </Text>
                          </View>
                        </View>

                        <View style={styles.appointmentFooter}>
                          <Text style={styles.appointmentType}>
                            {appointment.type}
                          </Text>
                          <Ionicons
                            name="chevron-forward-outline"
                            size={18}
                            color="#9db6ab"
                          />
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

      <Modal
        visible={!!selectedAppointment}
        transparent
        animationType={isDesktop ? "fade" : "slide"}
        onRequestClose={() => setSelectedAppointment(null)}
      >
        <View
          style={[
            styles.modalOverlay,
            isDesktop && styles.modalOverlayDesktop,
          ]}
        >
          <View
            style={[styles.modalSheet, isDesktop && styles.modalSheetDesktop]}
          >
            {!isDesktop && <View style={styles.modalHandle} />}

            {selectedAppointment && (
              <>
                <Text style={styles.modalTitle}>Detalhes da consulta</Text>
                <Text style={styles.modalSubtitle}>
                  {selectedAppointment.weekday}, {selectedAppointment.dateLabel}{" "}
                  as {selectedAppointment.time}
                </Text>

                <View style={styles.detailCard}>
                  <Text style={styles.detailLabel}>Paciente</Text>
                  <Text style={styles.detailValue}>
                    {selectedAppointment.patientName}
                  </Text>
                </View>

                <View style={styles.detailCard}>
                  <Text style={styles.detailLabel}>Tipo de atendimento</Text>
                  <Text style={styles.detailValue}>
                    {selectedAppointment.type}
                  </Text>
                </View>

                <View style={styles.detailCard}>
                  <Text style={styles.detailLabel}>Status atual</Text>
                  <Text style={styles.detailValue}>
                    {
                      getStatusMeta(
                        selectedAppointment.status,
                        selectedAppointment.scheduledAt,
                        colors,
                      ).label
                    }
                  </Text>
                </View>

                {selectedAppointment.status === "scheduled" && (
                  <>
                    <TouchableOpacity
                      style={[
                        styles.primaryAction,
                        updatingStatus && styles.actionDisabled,
                      ]}
                      onPress={handleMarkCompleted}
                      disabled={updatingStatus}
                      activeOpacity={0.85}
                    >
                      {updatingStatus ? (
                        <ActivityIndicator size="small" color="#fff" />
                      ) : (
                        <Ionicons
                          name="checkmark-circle-outline"
                          size={18}
                          color="#fff"
                        />
                      )}
                      <Text style={styles.primaryActionText}>
                        Marcar como realizada
                      </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[
                        styles.secondaryAction,
                        updatingStatus && styles.actionDisabled,
                      ]}
                      onPress={handleMarkRescheduled}
                      disabled={updatingStatus}
                      activeOpacity={0.85}
                    >
                      <Ionicons
                        name="swap-horizontal-outline"
                        size={18}
                        color={colors.primary}
                      />
                      <Text style={styles.secondaryActionText}>
                        Marcar como remarcada
                      </Text>
                    </TouchableOpacity>
                  </>
                )}

                {selectedAppointment.status === "completed" && (
                  <TouchableOpacity
                    style={[
                      styles.undoAction,
                      updatingStatus && styles.actionDisabled,
                    ]}
                    onPress={handleUndoCompleted}
                    disabled={updatingStatus}
                    activeOpacity={0.85}
                  >
                    {updatingStatus ? (
                      <ActivityIndicator size="small" color="#c46a1a" />
                    ) : (
                      <Ionicons
                        name="arrow-undo-outline"
                        size={18}
                        color="#c46a1a"
                      />
                    )}
                    <Text style={styles.undoActionText}>Desfazer realizada</Text>
                  </TouchableOpacity>
                )}

                {selectedAppointment.status === "rescheduled" && (
                  <TouchableOpacity
                    style={[
                      styles.secondaryAction,
                      updatingStatus && styles.actionDisabled,
                    ]}
                    onPress={() =>
                      handleStatusChange(
                        "scheduled",
                        "Consulta reativada como agendada.",
                      )
                    }
                    disabled={updatingStatus}
                    activeOpacity={0.85}
                  >
                    {updatingStatus ? (
                      <ActivityIndicator size="small" color={colors.primary} />
                    ) : (
                      <Ionicons name="refresh-outline" size={18} color={colors.primary} />
                    )}
                    <Text style={styles.secondaryActionText}>
                      Reverter para agendada
                    </Text>
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
        <View
          style={[styles.modalOverlay, isDesktop && styles.modalOverlayDesktop]}
        >
          <View style={[styles.modalSheet, isDesktop && styles.modalSheetDesktop]}>
            {!isDesktop && <View style={styles.modalHandle} />}
            <Text style={styles.modalTitle}>Concluir consulta</Text>
            <Text style={styles.modalSubtitle}>
              Informe quando a consulta foi realizada. Não pode ser no futuro.
            </Text>

            <Text style={styles.fieldLabel}>Data realizada</Text>
            <View style={styles.dateRow}>
              <View style={styles.dateCol}>
                <DateField
                  value={completeDate}
                  onChange={setCompleteDate}
                  max={todayISODate()}
                />
              </View>
              <View style={styles.timeCol}>
                <TimeField value={completeTime} onChange={setCompleteTime} />
              </View>
            </View>

            <Text style={styles.fieldLabel}>O que aconteceu (opcional)</Text>
            {loadingCompleteNote ? (
              <ActivityIndicator
                size="small"
                color={colors.primary}
                style={{ marginVertical: 20 }}
              />
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
        <View
          style={[styles.modalOverlay, isDesktop && styles.modalOverlayDesktop]}
        >
          <View style={[styles.modalSheet, isDesktop && styles.modalSheetDesktop]}>
            {!isDesktop && <View style={styles.modalHandle} />}
            <Text style={styles.modalTitle}>Remarcar consulta</Text>
            <Text style={styles.modalSubtitle}>
              Escolha a nova data e horário. Deve ser no futuro.
            </Text>

            <Text style={styles.fieldLabel}>Nova data</Text>
            <View style={styles.dateRow}>
              <View style={styles.dateCol}>
                <DateField
                  value={reDate}
                  onChange={setReDate}
                  min={todayISODate()}
                />
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
      marginBottom: 26,
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
    sectionTitle: {
      fontSize: 16,
      fontWeight: "800",
      color: colors.textDark,
      letterSpacing: -0.2,
      marginBottom: 12,
    },
    weekNavigationContainer: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 12,
      marginBottom: 16,
    },
    weekNavButton: {
      width: 44,
      height: 44,
      borderRadius: 12,
      backgroundColor: colors.white,
      borderWidth: 1,
      borderColor: colors.border,
      alignItems: "center",
      justifyContent: "center",
    },
    todayButton: {
      paddingVertical: 11,
      paddingHorizontal: 20,
      borderRadius: 12,
      backgroundColor: colors.primary,
      alignItems: "center",
      justifyContent: "center",
    },
    todayButtonText: {
      color: colors.white,
      fontSize: 14,
      fontWeight: "700",
    },
    weekLabelContainer: {
      alignItems: "center",
      marginBottom: 16,
    },
    weekLabelBadge: {
      backgroundColor: colors.primaryTint,
      borderRadius: 999,
      paddingVertical: 8,
      paddingHorizontal: 16,
    },
    weekLabelText: {
      fontSize: 13,
      fontWeight: "700",
      color: colors.primary,
      textAlign: "center",
    },
    weekRow: {
      gap: 12,
      paddingBottom: 8,
      marginBottom: 20,
    },
    weekRowDesktop: {
      flexDirection: "row",
      gap: 10,
      marginBottom: 24,
    },
    dayCard: {
      backgroundColor: colors.white,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 14,
      ...CARD_SHADOW,
    },
    dayCardMobile: {
      width: 118,
    },
    dayCardDesktop: {
      flexGrow: 1,
      flexBasis: 0,
      minWidth: 90,
    },
    dayCardActive: {
      backgroundColor: colors.primary,
      borderColor: colors.primary,
    },
    dayWeekLabel: {
      fontSize: 12.5,
      color: colors.textMuted,
      fontWeight: "700",
      textTransform: "uppercase",
    },
    dayWeekLabelActive: {
      color: "#d9efe5",
    },
    dayDateLabel: {
      marginTop: 6,
      fontSize: 17,
      color: colors.textDark,
      fontWeight: "800",
    },
    dayDateLabelActive: {
      color: colors.white,
    },
    dayBadge: {
      marginTop: 12,
      alignSelf: "flex-start",
      backgroundColor: "#f2f9f5",
      borderRadius: 999,
      paddingVertical: 5,
      paddingHorizontal: 10,
    },
    dayBadgeActive: {
      backgroundColor: "rgba(255,255,255,0.18)",
    },
    dayBadgeText: {
      fontSize: 11,
      fontWeight: "700",
      color: colors.primary,
    },
    dayBadgeTextActive: {
      color: colors.white,
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
    emptyBtn: {
      marginTop: 16,
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      borderWidth: 1.5,
      borderColor: colors.primary,
      borderRadius: 12,
      paddingVertical: 10,
      paddingHorizontal: 16,
    },
    emptyBtnText: {
      fontSize: 13,
      fontWeight: "700",
      color: colors.primary,
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
    // flex + minWidth:0 permite que o campo de hora encolha e não estoure a telinha.
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
