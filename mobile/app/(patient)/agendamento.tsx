import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import React, { useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Image,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from "react-native";
import { ThemeColors } from "../../constants/theme-palettes";
import { useTheme } from "../../contexts/ThemeContext";
import {
  AppointmentAvailabilityApiItem,
  createAppointment,
  getCurrentPatientProfileId,
  getMyAssignedProfessional,
  getPsychologistAvailability,
  ProfessionalApiItem,
} from "../../services/api";
import { showAlert } from "../../services/feedback";
// ─── Helpers ──────────────────────────────────────────────────────────────────
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

/**
 * Converte o weekday do JavaScript (0=Dom, 1=Seg ... 6=Sáb)
 * para o padrão da API Django (0=Seg, 1=Ter ... 6=Dom).
 */
const jsToDjangoWeekday = (jsWeekday: number): number =>
  jsWeekday === 0 ? 6 : jsWeekday - 1;

/**
 * Gera slots de tempo a partir de um bloco de disponibilidade.
 * Ex: start=09:00, end=17:00, duration=50 → ["09:00", "09:50", "10:40", ...]
 */
const generateSlots = (
  startTime: string,
  endTime: string,
  durationMinutes = 50,
): string[] => {
  const [startH, startM] = startTime.split(":").map(Number);
  const [endH, endM] = endTime.split(":").map(Number);
  const startTotal = startH * 60 + startM;
  const endTotal = endH * 60 + endM;
  const slots: string[] = [];

  for (
    let t = startTotal;
    t + durationMinutes <= endTotal;
    t += durationMinutes
  ) {
    const h = String(Math.floor(t / 60)).padStart(2, "0");
    const m = String(t % 60).padStart(2, "0");
    slots.push(`${h}:${m}`);
  }

  return slots;
};

// ─── Types ────────────────────────────────────────────────────────────────────
interface Psychologist {
  id: string;
  name: string;
  crp: string;
  specialty: string;
  bio: string;
  photo: string | null;
  initials: string;
  color: string;
  bg: string;
  sessionDuration: number;
}

const formatInitials = (name: string) =>
  name
    .split(" ")
    .filter((part) => part.length > 0)
    .map((part) => part[0])
    .slice(0, 2)
    .join("");

// `fallbackColor`/`fallbackBg` vêm da paleta da clínica (colors.primary/primaryTint)
// — usados só quando o item da API não define cor própria.
const normalizeProfessional = (
  item: ProfessionalApiItem,
  fallbackColor: string,
  fallbackBg: string,
): Psychologist => {
  const name =
    item.user?.full_name?.trim() ||
    item.name?.trim() ||
    item.full_name?.trim() ||
    item.psychologistName?.trim() ||
    item.psychologistNameAlt?.trim() ||
    item.professional?.trim() ||
    [item.user?.first_name, item.user?.last_name]
      .filter(Boolean)
      .join(" ")
      .trim() ||
    [item.first_name, item.last_name].filter(Boolean).join(" ").trim() ||
    "Profissional";

  return {
    id: String(item.id),
    name,
    crp: item.crp || "",
    specialty: item.specialty || "Psicologia",
    bio: item.bio?.trim() || "",
    photo: item.photo || null,
    initials: item.initials || formatInitials(name),
    color: item.color || fallbackColor,
    bg: item.bg || fallbackBg,
    sessionDuration: item.session_duration_minutes || 50,
  };
};

type AvailabilityItem = AppointmentAvailabilityApiItem;

// ─── Main Screen ─────────────────────────────────────────────────────────────
export default function ScheduleScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const { width: screenWidth } = useWindowDimensions();
  const cellSize = Math.min(46, Math.max(36, (screenWidth - 60) / 7));

  const today = new Date();
  // O paciente não escolhe o profissional: a consulta é sempre com o psicólogo
  // vinculado ao seu perfil, definido pelo administrador no cadastro.
  const [activePsychologist, setActivePsychologist] =
    useState<Psychologist | null>(null);
  const [loadingPros, setLoadingPros] = useState(true);
  const [currentYear, setCurrentYear] = useState(today.getFullYear());
  const [currentMonth, setCurrentMonth] = useState(today.getMonth());
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selectedTime, setSelectedTime] = useState<string | null>(null);
  const [availability, setAvailability] = useState<AvailabilityItem[]>([]);
  const [availableWeekdays, setAvailableWeekdays] = useState<string[]>([]);
  const [patientProfileId, setPatientProfileId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingSlots, setLoadingSlots] = useState(true);

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(20)).current;

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

  React.useEffect(() => {
    const loadPatientProfile = async () => {
      const result = await getCurrentPatientProfileId();
      if (__DEV__) {
        console.log("👤 patientProfileId result:", JSON.stringify(result));
      }
      setPatientProfileId(result.ok && result.data ? result.data : null);
    };
    void loadPatientProfile();
  }, []);

  React.useEffect(() => {
    const loadAssignedProfessional = async () => {
      setLoadingPros(true);
      const result = await getMyAssignedProfessional();
      setActivePsychologist(
        result.ok && result.data
          ? normalizeProfessional(result.data, colors.primary, colors.primaryTint)
          : null,
      );
      setLoadingPros(false);
    };

    void loadAssignedProfessional();
  }, [colors]);

  React.useEffect(() => {
    const loadAvailability = async () => {
      if (!activePsychologist) {
        setAvailability([]);
        setAvailableWeekdays([]);
        setLoadingSlots(false);
        return;
      }

      setLoadingSlots(true);
      setSelectedDate(null);
      setSelectedTime(null);
      const result = await getPsychologistAvailability(activePsychologist.id);
      const rawList: AvailabilityItem[] = result.data ?? [];

      if (result.ok) {
        const availableItems: AvailabilityItem[] = rawList.filter(
          (item) => item.blocked !== true,
        );
        setAvailability(availableItems);

        // Usa weekday_display diretamente da API (já está em português)
        // e mapeia para abreviações usadas no calendário
        const DJANGO_TO_LABEL: Record<number, string> = {
          0: "Seg",
          1: "Ter",
          2: "Qua",
          3: "Qui",
          4: "Sex",
          5: "Sáb",
          6: "Dom",
        };

        setAvailableWeekdays([
          ...new Set(
            availableItems
              .map(
                (item) =>
                  DJANGO_TO_LABEL[item.weekday] ?? item.weekday_display ?? "",
              )
              .filter(Boolean),
          ),
        ]);
      } else {
        setAvailability([]);
        setAvailableWeekdays([]);
      }
      setLoadingSlots(false);
    };

    void loadAvailability();
  }, [activePsychologist]);

  // ── Calendar logic ──────────────────────────────────────────────────────────
  const getDaysInMonth = (year: number, month: number) =>
    new Date(year, month + 1, 0).getDate();

  const getFirstDayOfMonth = (year: number, month: number) =>
    new Date(year, month, 1).getDay();

  const toKey = (year: number, month: number, day: number) => {
    const mm = String(month + 1).padStart(2, "0");
    const dd = String(day).padStart(2, "0");
    return `${year}-${mm}-${dd}`;
  };

  const isPast = (year: number, month: number, day: number) => {
    const d = new Date(year, month, day);
    const t = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    return d <= t;
  };

  const isAvailable = (year: number, month: number, day: number) => {
    const jsWeekday = new Date(year, month, day).getDay();
    // ✅ Converte JS (0=Dom) → Django (0=Seg)
    const djangoWeekday = jsToDjangoWeekday(jsWeekday);
    return availability.some(
      (item) => !item.blocked && item.weekday === djangoWeekday,
    );
  };

  const prevMonth = () => {
    if (currentMonth === 0) {
      setCurrentMonth(11);
      setCurrentYear((y) => y - 1);
    } else {
      setCurrentMonth((m) => m - 1);
    }
    setSelectedDate(null);
    setSelectedTime(null);
  };

  const nextMonth = () => {
    if (currentMonth === 11) {
      setCurrentMonth(0);
      setCurrentYear((y) => y + 1);
    } else {
      setCurrentMonth((m) => m + 1);
    }
    setSelectedDate(null);
    setSelectedTime(null);
  };

  const handleDayPress = (key: string) => {
    setSelectedDate(key);
    setSelectedTime(null);
  };

  // ── Confirm ─────────────────────────────────────────────────────────────────
  const handleConfirm = async () => {
    if (!selectedDate || !selectedTime || !activePsychologist) {
      showAlert("Erro", "Preencha todos os campos antes de confirmar.");
      return;
    }
    if (!patientProfileId) {
      showAlert(
        "Erro",
        "Não foi possível identificar seu perfil de paciente. Tente sair e entrar novamente.",
      );

      return;
    }

    setLoading(true);
    try {
      // Cria ISO 8601 com timezone de Brasília (-03:00)
      // Exemplo: 2025-06-15T10:00:00-03:00
      const scheduledAt = `${selectedDate}T${selectedTime}:00-03:00`;

      const result = await createAppointment(
        activePsychologist.id,
        scheduledAt,
        activePsychologist.sessionDuration,
        { patientId: patientProfileId },
      );

      if (!result.ok) {
        showAlert(
          "Erro",
          result.error || "Não foi possível confirmar o agendamento.",
        );

        return;
      }

      showAlert(
        "Consulta agendada! 🎉",
        `${activePsychologist?.name ?? ""} — ${formatDate(selectedDate)} às ${selectedTime}. Você pode acompanhá-la em "Minhas consultas".`,
        [{ text: "OK", onPress: () => router.back() }],
      );
    } catch {
      showAlert("Erro", "Não foi possível confirmar o agendamento.");
    } finally {
      setLoading(false);
    }
  };

  // ── Formatters ───────────────────────────────────────────────────────────────
  const formatDate = (key: string) => {
    const [y, m, d] = key.split("-").map(Number);
    const date = new Date(y, m - 1, d);
    return `${WEEKDAYS[date.getDay()]}, ${d} de ${MONTHS[m - 1]}`;
  };

  // ── Build calendar grid ──────────────────────────────────────────────────────
  const daysInMonth = getDaysInMonth(currentYear, currentMonth);
  const firstDay = getFirstDayOfMonth(currentYear, currentMonth);
  const calendarCells: (number | null)[] = [
    ...Array(firstDay).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  while (calendarCells.length % 7 !== 0) calendarCells.push(null);

  // ── Slots para o dia selecionado ─────────────────────────────────────────────
  const selectedDjangoWeekday = selectedDate
    ? (() => {
        const [y, m, d] = selectedDate.split("-").map(Number);
        const jsWeekday = new Date(y, m - 1, d).getDay();
        // ✅ Converte JS (0=Dom) → Django (0=Seg)
        return jsToDjangoWeekday(jsWeekday);
      })()
    : null;

  // ✅ Gera slots de 50 em 50 min dentro de cada bloco de disponibilidade
  const slots =
    selectedDjangoWeekday !== null
      ? availability
          .filter((item) => item.weekday === selectedDjangoWeekday)
          .flatMap((item) =>
            generateSlots(
              item.start_time,
              item.end_time,
              activePsychologist?.sessionDuration ?? 50,
            ),
          )
      : [];

  return (
    <View style={styles.screen}>
      <StatusBar barStyle="light-content" backgroundColor={colors.primary} />

      {/* ── Header ── */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Ionicons name="arrow-back-outline" size={22} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Agendar Consulta</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <Animated.View
          style={{ opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}
        >
          {loadingPros ? (
            <View style={styles.card}>
              <ActivityIndicator color={colors.primary} />
            </View>
          ) : activePsychologist ? (
            <>
              {/* ── Psychologist card ── */}
              <View style={styles.psychCard}>
                <View
                  style={[
                    styles.psychAvatar,
                    { backgroundColor: activePsychologist.bg },
                  ]}
                >
                  {activePsychologist.photo ? (
                    <Image
                      source={{ uri: activePsychologist.photo }}
                      style={styles.psychAvatarImg}
                    />
                  ) : (
                    <Text
                      style={[
                        styles.psychAvatarText,
                        { color: activePsychologist.color },
                      ]}
                    >
                      {activePsychologist.initials}
                    </Text>
                  )}
                </View>
                <View style={styles.psychInfo}>
                  <Text style={styles.psychName}>
                    {activePsychologist.name}
                  </Text>
                  <Text style={styles.psychCrp}>{activePsychologist.crp}</Text>
                  <View
                    style={[
                      styles.specialtyBadge,
                      { backgroundColor: activePsychologist.bg },
                    ]}
                  >
                    <Text
                      style={[
                        styles.specialtyText,
                        { color: activePsychologist.color },
                      ]}
                    >
                      {activePsychologist.specialty}
                    </Text>
                  </View>
                  <View style={styles.availabilityRow}>
                    <Ionicons name="calendar-outline" size={14} color={colors.primary} />
                    <Text style={styles.availabilityText}>
                      {availableWeekdays.length > 0
                        ? availableWeekdays.join(", ")
                        : "Nenhum dia disponível"}
                    </Text>
                  </View>
                </View>
              </View>

              {/* ── Calendar ── */}
              <View style={styles.card}>
                {/* Month nav */}
                <View style={styles.monthNav}>
                  <TouchableOpacity style={styles.navBtn} onPress={prevMonth}>
                    <Ionicons
                      name="chevron-back-outline"
                      size={18}
                      color={colors.primary}
                    />
                  </TouchableOpacity>
                  <Text style={styles.monthLabel}>
                    {MONTHS[currentMonth]} {currentYear}
                  </Text>
                  <TouchableOpacity style={styles.navBtn} onPress={nextMonth}>
                    <Ionicons
                      name="chevron-forward-outline"
                      size={18}
                      color={colors.primary}
                    />
                  </TouchableOpacity>
                </View>

                {/* Weekday headers */}
                <View style={styles.weekdaysRow}>
                  {WEEKDAYS.map((w) => (
                    <Text
                      key={w}
                      style={[styles.weekdayText, { width: cellSize }]}
                    >
                      {w}
                    </Text>
                  ))}
                </View>

                {/* Days grid */}
                <View style={styles.daysGrid}>
                  {calendarCells.map((day, idx) => {
                    if (!day)
                      return (
                        <View
                          key={`empty-${idx}`}
                          style={[
                            styles.dayCell,
                            {
                              width: cellSize,
                              height: cellSize,
                              borderRadius: cellSize / 2,
                            },
                          ]}
                        />
                      );
                    const key = toKey(currentYear, currentMonth, day);
                    const past = isPast(currentYear, currentMonth, day);
                    const available =
                      !past && isAvailable(currentYear, currentMonth, day);
                    const selected = selectedDate === key;

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
                          available && styles.dayCellAvailable,
                          selected && styles.dayCellSelected,
                          past && styles.dayCellPast,
                        ]}
                        onPress={() => available && handleDayPress(key)}
                        disabled={!available}
                        activeOpacity={0.7}
                      >
                        <Text
                          style={[
                            styles.dayText,
                            available && styles.dayTextAvailable,
                            selected && styles.dayTextSelected,
                            past && styles.dayTextPast,
                          ]}
                        >
                          {day}
                        </Text>
                        {available && !selected && (
                          <View style={styles.availDot} />
                        )}
                      </TouchableOpacity>
                    );
                  })}
                </View>

                {/* Legend */}
                <View style={styles.legend}>
                  <View style={styles.legendItem}>
                    <View
                      style={[
                        styles.legendDot,
                        {
                          backgroundColor: colors.primaryTint,
                          borderWidth: 1,
                          borderColor: colors.primary,
                        },
                      ]}
                    />
                    <Text style={styles.legendText}>Disponível</Text>
                  </View>
                  <View style={styles.legendItem}>
                    <View
                      style={[styles.legendDot, { backgroundColor: colors.primary }]}
                    />
                    <Text style={styles.legendText}>Selecionado</Text>
                  </View>
                  <View style={styles.legendItem}>
                    <View
                      style={[styles.legendDot, { backgroundColor: "#f0f0f0" }]}
                    />
                    <Text style={styles.legendText}>Indisponível</Text>
                  </View>
                </View>
              </View>
            </>
          ) : (
            <View style={styles.card}>
              <Text style={styles.noSlots}>
                Você ainda não tem um psicólogo responsável definido. Entre em
                contato com o administrador da clínica.
              </Text>
            </View>
          )}

          {/* ── Time slots ── */}
          {selectedDate && (
            <View style={styles.card}>
              <View style={styles.slotHeader}>
                <Ionicons name="time-outline" size={16} color={colors.primary} />
                <Text style={styles.slotTitle}>
                  Horários — {formatDate(selectedDate)}
                </Text>
              </View>

              {loadingSlots ? (
                <ActivityIndicator
                  color={colors.primary}
                  style={{ paddingVertical: 18 }}
                />
              ) : slots.length === 0 ? (
                <Text style={styles.noSlots}>
                  Nenhum horário disponível para este dia.
                </Text>
              ) : (
                <View style={styles.slotsGrid}>
                  {slots.map((time) => (
                    <TouchableOpacity
                      key={time}
                      style={[
                        styles.slotBtn,
                        selectedTime === time && styles.slotBtnSelected,
                      ]}
                      onPress={() => setSelectedTime(time)}
                      activeOpacity={0.8}
                    >
                      <Text
                        style={[
                          styles.slotText,
                          selectedTime === time && styles.slotTextSelected,
                        ]}
                      >
                        {time}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </View>
          )}

          {/* ── Summary ── */}
          {selectedDate && selectedTime && (
            <View style={styles.summaryCard}>
              <View style={styles.summaryRow}>
                <Ionicons name="person-outline" size={15} color={colors.primary} />
                <Text style={styles.summaryText}>
                  {activePsychologist?.name ?? ""}
                </Text>
              </View>
              <View style={styles.summaryDivider} />
              <View style={styles.summaryRow}>
                <Ionicons name="calendar-outline" size={15} color={colors.primary} />
                <Text style={styles.summaryText}>
                  {formatDate(selectedDate)}
                </Text>
              </View>
              <View style={styles.summaryDivider} />
              <View style={styles.summaryRow}>
                <Ionicons name="time-outline" size={15} color={colors.primary} />
                <Text style={styles.summaryText}>{selectedTime}</Text>
              </View>
              <View style={styles.summaryDivider} />
              <View style={styles.summaryRow}>
                <Ionicons name="notifications-outline" size={15} color={colors.primary} />
                <Text style={styles.summaryText}>
                  Você receberá um aviso nas notificações
                </Text>
              </View>
            </View>
          )}

          {/* ── Confirm button ── */}
          <TouchableOpacity
            style={[
              styles.confirmBtn,
              (!selectedDate || !selectedTime || loading) &&
                styles.confirmBtnDisabled,
            ]}
            onPress={handleConfirm}
            disabled={!selectedDate || !selectedTime || loading}
            activeOpacity={0.85}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Ionicons
                  name="checkmark-circle-outline"
                  size={20}
                  color={!selectedDate || !selectedTime ? "#aaa" : "#fff"}
                />
                <Text
                  style={[
                    styles.confirmBtnText,
                    (!selectedDate || !selectedTime) &&
                      styles.confirmBtnTextDisabled,
                  ]}
                >
                  Confirmar agendamento
                </Text>
              </>
            )}
          </TouchableOpacity>
        </Animated.View>
      </ScrollView>

    </View>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────
const CELL = 42;

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.authBg },

    // Header
    header: {
      backgroundColor: colors.primary,
      paddingTop: 52,
      paddingBottom: 18,
      paddingHorizontal: 20,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
    },
    backBtn: {
      width: 36,
      height: 36,
      borderRadius: 10,
      backgroundColor: "rgba(255,255,255,0.15)",
      alignItems: "center",
      justifyContent: "center",
    },
    headerTitle: {
      fontSize: 17,
      fontWeight: "800",
      color: colors.white,
    },

    scrollContent: {
      padding: 20,
      paddingBottom: 48,
      gap: 16,
      width: "100%",
      maxWidth: 980,
      alignSelf: "center",
    },


    // Psychologist card
    psychCard: {
      backgroundColor: colors.white,
      borderRadius: 20,
      padding: 16,
      flexDirection: "row",
      alignItems: "center",
      gap: 14,
      shadowColor: colors.primary,
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.08,
      shadowRadius: 12,
      elevation: 3,
    },
    psychAvatar: {
      width: 54,
      height: 54,
      borderRadius: 16,
      alignItems: "center",
      justifyContent: "center",
    },
    psychAvatarText: {
      fontSize: 18,
      fontWeight: "800",
    },
    psychAvatarImg: {
      width: "100%",
      height: "100%",
      borderRadius: 16,
    },
    psychInfo: { flex: 1, gap: 3 },
    psychName: {
      fontSize: 15,
      fontWeight: "800",
      color: "#1a3d31",
    },
    psychCrp: {
      fontSize: 12,
      color: "#7aab96",
    },
    specialtyBadge: {
      alignSelf: "flex-start",
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 8,
      marginTop: 2,
    },
    specialtyText: {
      fontSize: 11,
      fontWeight: "700",
    },
    availabilityRow: {
      marginTop: 10,
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      flexWrap: "wrap",
    },
    availabilityText: {
      fontSize: 12,
      color: "#4c7f6d",
      fontWeight: "600",
      flexShrink: 1,
    },

    // Card wrapper
    card: {
      backgroundColor: colors.white,
      borderRadius: 20,
      padding: 18,
      shadowColor: colors.primary,
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.08,
      shadowRadius: 12,
      elevation: 3,
    },

    // Month navigation
    monthNav: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: 16,
    },
    navBtn: {
      width: 34,
      height: 34,
      borderRadius: 10,
      backgroundColor: colors.primaryTint,
      alignItems: "center",
      justifyContent: "center",
    },
    monthLabel: {
      fontSize: 16,
      fontWeight: "800",
      color: "#1a3d31",
    },

    // Weekdays
    weekdaysRow: {
      flexDirection: "row",
      marginBottom: 8,
    },
    weekdayText: {
      width: CELL,
      textAlign: "center",
      fontSize: 11,
      fontWeight: "700",
      color: "#7aab96",
      textTransform: "uppercase",
    },

    // Days grid
    daysGrid: {
      flexDirection: "row",
      flexWrap: "wrap",
    },
    dayCell: {
      width: CELL,
      height: CELL,
      alignItems: "center",
      justifyContent: "center",
      marginBottom: 4,
      borderRadius: CELL / 2,
      position: "relative",
    },
    dayCellAvailable: {
      backgroundColor: colors.primaryTint,
      borderWidth: 1,
      borderColor: "#b2dfcf",
    },
    dayCellSelected: {
      backgroundColor: colors.primary,
      borderColor: colors.primary,
    },
    dayCellPast: {
      opacity: 0.3,
    },
    dayText: {
      fontSize: 13,
      color: "#9bbfb0",
      fontWeight: "500",
    },
    dayTextAvailable: {
      color: "#1a3d31",
      fontWeight: "700",
    },
    dayTextSelected: {
      color: colors.white,
      fontWeight: "800",
    },
    dayTextPast: {
      color: "#c0c0c0",
    },
    availDot: {
      position: "absolute",
      bottom: 4,
      width: 4,
      height: 4,
      borderRadius: 2,
      backgroundColor: colors.primary,
    },

    // Legend
    legend: {
      flexDirection: "row",
      justifyContent: "center",
      gap: 16,
      marginTop: 12,
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
      color: "#7aab96",
      fontWeight: "500",
    },

    // Time slots
    slotHeader: {
      flexDirection: "row",
      alignItems: "center",
      gap: 7,
      marginBottom: 14,
    },
    slotTitle: {
      fontSize: 14,
      fontWeight: "700",
      color: "#1a3d31",
    },
    noSlots: {
      fontSize: 13,
      color: "#7aab96",
      textAlign: "center",
      paddingVertical: 8,
    },
    slotsGrid: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 10,
    },
    slotBtn: {
      paddingHorizontal: 18,
      paddingVertical: 10,
      borderRadius: 12,
      backgroundColor: colors.primaryTint,
      borderWidth: 1.5,
      borderColor: "#b2dfcf",
    },
    slotBtnSelected: {
      backgroundColor: colors.primary,
      borderColor: colors.primary,
    },
    slotText: {
      fontSize: 14,
      fontWeight: "700",
      color: "#1a3d31",
    },
    slotTextSelected: {
      color: colors.white,
    },

    // Summary
    summaryCard: {
      backgroundColor: colors.white,
      borderRadius: 20,
      padding: 18,
      shadowColor: colors.primary,
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.08,
      shadowRadius: 12,
      elevation: 3,
    },
    summaryRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      paddingVertical: 10,
    },
    summaryText: {
      fontSize: 14,
      color: "#1a3d31",
      fontWeight: "500",
      flex: 1,
    },
    summaryDivider: {
      height: 1,
      backgroundColor: "#f0f8f4",
    },

    // Confirm button
    confirmBtn: {
      backgroundColor: colors.primary,
      borderRadius: 16,
      height: 54,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      shadowColor: colors.primary,
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: 0.35,
      shadowRadius: 12,
      elevation: 6,
    },
    confirmBtnDisabled: {
      backgroundColor: "#e0e0e0",
      shadowOpacity: 0,
      elevation: 0,
    },
    confirmBtnText: {
      color: colors.white,
      fontSize: 16,
      fontWeight: "700",
    },
    confirmBtnTextDisabled: {
      color: "#aaa",
    },

    // Modal — perfil do psicólogo
  });
