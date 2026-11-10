import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import React, { useMemo, useRef, useState } from "react";
import {
    ActivityIndicator,
    Animated,
    Modal,
    ScrollView,
    StatusBar,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from "react-native";
import { ThemeColors } from "../../constants/theme-palettes";
import { useTheme } from "../../contexts/ThemeContext";
import { showAlert } from "../../services/feedback";
import {
    createAvailabilityBlock,
    deleteAvailability,
    getMe,
    getPsychologistAvailability,
    getPsychologists,
    updateAvailability,
} from "../../services/api";

// ─── Types ────────────────────────────────────────────────────────────────────
interface AvailabilitySlot {
  id: string;
  weekday: number;
  weekday_display: string;
  start_time: string;
  end_time: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────
const WEEKDAYS = [
  { label: "Segunda", value: 0 },
  { label: "Terça", value: 1 },
  { label: "Quarta", value: 2 },
  { label: "Quinta", value: 3 },
  { label: "Sexta", value: 4 },
  { label: "Sábado", value: 5 },
  { label: "Domingo", value: 6 },
];

const WEEKDAY_SHORT = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];
const WEEKDAY_COLORS = [
  "#2d6cdf",
  "#2e8b6e",
  "#c46a1a",
  "#7c3aed",
  "#db2777",
  "#0891b2",
  "#64748b",
];
const WEEKDAY_BGS = [
  "#eaf1ff",
  "#e8f7f1",
  "#fef3e8",
  "#f3eeff",
  "#fce7f3",
  "#e0f2fe",
  "#f1f5f9",
];

const TIME_OPTIONS = Array.from({ length: 28 }, (_, i) => {
  const hour = Math.floor(i / 2) + 7;
  const min = i % 2 === 0 ? "00" : "30";
  return `${String(hour).padStart(2, "0")}:${min}`;
});

const MAX_WIDTH = 1120;

// ─── Main Screen ──────────────────────────────────────────────────────────────
export default function AvailabilityScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [professionalId, setProfessionalId] = useState("");
  const [availability, setAvailability] = useState<AvailabilitySlot[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [editingSlot, setEditingSlot] = useState<AvailabilitySlot | null>(null);
  const [newSlot, setNewSlot] = useState({
    weekday: 0,
    start_time: "08:00",
    end_time: "17:00",
  });
  const [showStartPicker, setShowStartPicker] = useState(false);
  const [showEndPicker, setShowEndPicker] = useState(false);

  // Estado para modal de deleção
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [slotToDelete, setSlotToDelete] = useState<AvailabilitySlot | null>(
    null,
  );
  const [isDeleting, setIsDeleting] = useState(false);

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(20)).current;

  React.useEffect(() => {
    const load = async () => {
      setLoading(true);
      const meResult = await getMe();
      if (!meResult.ok || !meResult.data?.id) {
        showAlert("Erro", "Não foi possível carregar o perfil.");
        setLoading(false);
        return;
      }

      const profsResult = await getPsychologists();
      const myProfile = profsResult.data?.find(
        (p: any) => p.user.id === meResult.data.id,
      );

      if (myProfile) {
        setProfessionalId(myProfile.id);
        const availResult = await getPsychologistAvailability(myProfile.id);
        if (availResult.ok && availResult.data) {
          setAvailability(availResult.data as AvailabilitySlot[]);
        }
      }

      setLoading(false);
    };

    void load();
  }, []);

  React.useEffect(() => {
    if (!loading) {
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
    }
  }, [loading, fadeAnim, slideAnim]);

  const openAdd = () => {
    setEditingSlot(null);
    setNewSlot({ weekday: 0, start_time: "08:00", end_time: "17:00" });
    setShowStartPicker(false);
    setShowEndPicker(false);
    setShowModal(true);
  };

  const openEdit = (slot: AvailabilitySlot) => {
    setEditingSlot(slot);
    setNewSlot({
      weekday: slot.weekday,
      start_time: slot.start_time.slice(0, 5),
      end_time: slot.end_time.slice(0, 5),
    });
    setShowStartPicker(false);
    setShowEndPicker(false);
    setShowModal(true);
  };

  const handleSave = async () => {
    if (newSlot.start_time >= newSlot.end_time) {
      showAlert(
        "Erro",
        "O horário de início deve ser antes do horário de fim.",
      );
      return;
    }

    setSaving(true);

    if (editingSlot) {
      // Editar slot existente via PATCH
      const result = await updateAvailability(editingSlot.id, {
        weekday: newSlot.weekday,
        start_time: newSlot.start_time + ":00",
        end_time: newSlot.end_time + ":00",
      });
      if (result.ok) {
        const availResult = await getPsychologistAvailability(professionalId);
        if (availResult.ok && availResult.data) {
          setAvailability(availResult.data as AvailabilitySlot[]);
        }
        setShowModal(false);
        showAlert("Sucesso", "Horário atualizado!");
      } else {
        showAlert(
          "Erro",
          result.error || "Não foi possível atualizar o horário.",
        );
      }
    } else {
      // Criar novo slot
      if (!professionalId) {
        showAlert("Erro", "Perfil profissional não carregado.");
        setSaving(false);
        return;
      }
      const result = await createAvailabilityBlock({
        professional: professionalId,
        weekday: newSlot.weekday,
        start_time: newSlot.start_time + ":00",
        end_time: newSlot.end_time + ":00",
        blocked: false,
      });
      if (result.ok) {
        const availResult = await getPsychologistAvailability(professionalId);
        if (availResult.ok && availResult.data) {
          setAvailability(availResult.data as AvailabilitySlot[]);
        }
        setShowModal(false);
        showAlert("Sucesso", "Horário adicionado!");
      } else {
        showAlert(
          "Erro",
          result.error || "Não foi possível adicionar o horário.",
        );
      }
    }

    setSaving(false);
  };

  const handleDelete = (slot: AvailabilitySlot) => {
    setSlotToDelete(slot);
    setShowDeleteModal(true);
  };

  const confirmDelete = async () => {
    if (!slotToDelete) return;

    setIsDeleting(true);

    try {
      const result = await deleteAvailability(slotToDelete.id);
    

      if (result.ok) {
        setAvailability((prev) => prev.filter((s) => s.id !== slotToDelete.id));
        setShowDeleteModal(false);
        setSlotToDelete(null);
      } else {
        showAlert(
          "Erro",
          result.error || "Não foi possível remover o horário.",
        );
      }
    } catch (error) {
      console.log("💥 Exceção na deleção:", error);
      showAlert("Erro", `Exceção: ${error}`);
    } finally {
      setIsDeleting(false);
    }
  };

  const cancelDelete = () => {
    setShowDeleteModal(false);
    setSlotToDelete(null);
  };

  const availabilityByDay = WEEKDAYS.map((day) => ({
    ...day,
    slots: availability.filter((s) => s.weekday === day.value),
  })).filter((day) => day.slots.length > 0);

  const totalSlots = availability.length;

  return (
    <View style={styles.screen}>
      <StatusBar barStyle="light-content" backgroundColor={colors.primary} />

      {/* ── Header ── */}
      <View style={styles.header}>
        <View style={styles.headerInner}>
          <TouchableOpacity
            style={styles.backBtn}
            onPress={() => router.replace("/(psychologist)/dashboardP")}
          >
            <Ionicons name="arrow-back-outline" size={22} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Disponibilidade</Text>
          <TouchableOpacity style={styles.addBtn} onPress={openAdd}>
            <Ionicons name="add-outline" size={20} color="#fff" />
            <Text style={styles.addBtnText}>Adicionar</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* ── Summary Bar ── */}
      <View style={styles.summaryBar}>
        <View style={styles.summaryInner}>
          <View style={styles.summaryItem}>
            <Text style={styles.summaryNumber}>{totalSlots}</Text>
            <Text style={styles.summaryLabel}>
              {totalSlots === 1 ? "horário" : "horários"}
            </Text>
          </View>
          <View style={styles.summaryDivider} />
          <View style={styles.summaryItem}>
            <Text style={styles.summaryNumber}>{availabilityByDay.length}</Text>
            <Text style={styles.summaryLabel}>
              {availabilityByDay.length === 1 ? "dia ativo" : "dias ativos"}
            </Text>
          </View>
          <View style={styles.summaryDivider} />
          <View style={styles.summaryItem}>
            <Text style={styles.summaryNumber}>
              {7 - availabilityByDay.length}
            </Text>
            <Text style={styles.summaryLabel}>dias livres</Text>
          </View>
        </View>
      </View>

      {/* ── Content ── */}
      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator color={colors.primary} size="large" />
          <Text style={styles.loadingText}>Carregando horários...</Text>
        </View>
      ) : (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          <Animated.View
            style={{
              opacity: fadeAnim,
              transform: [{ translateY: slideAnim }],
            }}
          >
            {availabilityByDay.length === 0 ? (
              <View style={styles.emptyState}>
                <View style={styles.emptyIcon}>
                  <Ionicons name="calendar-outline" size={40} color="#b2d4c8" />
                </View>
                <Text style={styles.emptyTitle}>Nenhum horário cadastrado</Text>
                <Text style={styles.emptyText}>
                  Adicione os dias e horários em que você atende pacientes para
                  que eles possam agendar consultas.
                </Text>
                <TouchableOpacity style={styles.emptyAddBtn} onPress={openAdd}>
                  <Ionicons name="add-outline" size={18} color={colors.white} />
                  <Text style={styles.emptyAddBtnText}>
                    Adicionar primeiro horário
                  </Text>
                </TouchableOpacity>
              </View>
            ) : (
              <>
                {/* Weekday overview pills */}
                <View style={styles.overviewRow}>
                  {WEEKDAYS.map((day) => {
                    const hasSlots = availability.some(
                      (s) => s.weekday === day.value,
                    );
                    return (
                      <View
                        key={day.value}
                        style={[
                          styles.overviewPill,
                          hasSlots && {
                            backgroundColor: WEEKDAY_BGS[day.value],
                          },
                        ]}
                      >
                        <Text
                          style={[
                            styles.overviewPillText,
                            hasSlots && { color: WEEKDAY_COLORS[day.value] },
                          ]}
                        >
                          {WEEKDAY_SHORT[day.value]}
                        </Text>
                        {hasSlots && (
                          <View
                            style={[
                              styles.overviewDot,
                              { backgroundColor: WEEKDAY_COLORS[day.value] },
                            ]}
                          />
                        )}
                      </View>
                    );
                  })}
                </View>

                {/* Day groups */}
                {availabilityByDay.map((day) => (
                  <View key={day.value} style={styles.dayCard}>
                    <View style={styles.dayCardHeader}>
                      <View
                        style={[
                          styles.dayBadge,
                          { backgroundColor: WEEKDAY_BGS[day.value] },
                        ]}
                      >
                        <Text
                          style={[
                            styles.dayBadgeText,
                            { color: WEEKDAY_COLORS[day.value] },
                          ]}
                        >
                          {day.label}
                        </Text>
                      </View>
                      <Text style={styles.daySlotCount}>
                        {day.slots.length}{" "}
                        {day.slots.length === 1 ? "bloco" : "blocos"}
                      </Text>
                    </View>
                    <View style={styles.slotsContainer}>
                      {day.slots.map((slot) => (
                        <View
                          key={slot.id}
                          style={[
                            styles.slotChip,
                            { borderColor: WEEKDAY_BGS[day.value] },
                          ]}
                        >
                          <Ionicons
                            name="time-outline"
                            size={13}
                            color={WEEKDAY_COLORS[day.value]}
                          />
                          <Text
                            style={[
                              styles.slotChipText,
                              { color: WEEKDAY_COLORS[day.value] },
                            ]}
                          >
                            {slot.start_time.slice(0, 5)} –{" "}
                            {slot.end_time.slice(0, 5)}
                          </Text>
                          <TouchableOpacity
                            style={styles.slotActionBtn}
                            onPress={() => openEdit(slot)}
                            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                          >
                            <Ionicons name="pencil" size={14} color="#6b8faf" />
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={styles.slotActionBtn}
                            onPress={() => handleDelete(slot)}
                            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                          >
                            <Ionicons
                              name="close-circle"
                              size={16}
                              color="#d95c5c"
                            />
                          </TouchableOpacity>
                        </View>
                      ))}
                    </View>
                  </View>
                ))}
              </>
            )}
          </Animated.View>
        </ScrollView>
      )}

      {/* ── Modal: Adicionar Disponibilidade ── */}
      <Modal
        visible={showModal}
        transparent
        animationType="slide"
        onRequestClose={() => {
          setShowModal(false);
          setEditingSlot(null);
        }}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>
              {editingSlot ? "Editar horário" : "Adicionar horário"}
            </Text>
            <Text style={styles.modalSubtitle}>
              Configure o dia e o período de atendimento.
            </Text>

            {/* Dia da semana */}
            <Text style={styles.modalFieldLabel}>Dia da semana</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.weekdayScroll}
              contentContainerStyle={styles.weekdayScrollContent}
            >
              {WEEKDAYS.map((day) => {
                const isActive = newSlot.weekday === day.value;
                return (
                  <TouchableOpacity
                    key={day.value}
                    style={[
                      styles.weekdayChip,
                      isActive && {
                        backgroundColor: WEEKDAY_COLORS[day.value],
                        borderColor: WEEKDAY_COLORS[day.value],
                      },
                    ]}
                    onPress={() =>
                      setNewSlot((prev) => ({ ...prev, weekday: day.value }))
                    }
                  >
                    <Text
                      style={[
                        styles.weekdayChipText,
                        isActive && { color: colors.white },
                      ]}
                    >
                      {WEEKDAY_SHORT[day.value]}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            {/* Horários */}
            <View style={styles.timeRow}>
              <View style={styles.timeField}>
                <Text style={styles.modalFieldLabel}>Início</Text>
                <TouchableOpacity
                  style={styles.timePickerBtn}
                  onPress={() => {
                    setShowStartPicker(!showStartPicker);
                    setShowEndPicker(false);
                  }}
                >
                  <Ionicons name="time-outline" size={16} color={colors.primary} />
                  <Text style={styles.timePickerBtnText}>
                    {newSlot.start_time}
                  </Text>
                  <Ionicons
                    name="chevron-down-outline"
                    size={14}
                    color={colors.primary}
                  />
                </TouchableOpacity>
                {showStartPicker && (
                  <ScrollView style={styles.timeDropdown} nestedScrollEnabled>
                    {TIME_OPTIONS.map((t) => (
                      <TouchableOpacity
                        key={t}
                        style={[
                          styles.timeOption,
                          newSlot.start_time === t && styles.timeOptionActive,
                        ]}
                        onPress={() => {
                          setNewSlot((p) => ({ ...p, start_time: t }));
                          setShowStartPicker(false);
                        }}
                      >
                        <Text
                          style={[
                            styles.timeOptionText,
                            newSlot.start_time === t &&
                              styles.timeOptionTextActive,
                          ]}
                        >
                          {t}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                )}
              </View>

              <Ionicons
                name="arrow-forward-outline"
                size={18}
                color="#9bbfb0"
                style={styles.timeArrow}
              />

              <View style={styles.timeField}>
                <Text style={styles.modalFieldLabel}>Fim</Text>
                <TouchableOpacity
                  style={styles.timePickerBtn}
                  onPress={() => {
                    setShowEndPicker(!showEndPicker);
                    setShowStartPicker(false);
                  }}
                >
                  <Ionicons name="time-outline" size={16} color={colors.primary} />
                  <Text style={styles.timePickerBtnText}>
                    {newSlot.end_time}
                  </Text>
                  <Ionicons
                    name="chevron-down-outline"
                    size={14}
                    color={colors.primary}
                  />
                </TouchableOpacity>
                {showEndPicker && (
                  <ScrollView style={styles.timeDropdown} nestedScrollEnabled>
                    {TIME_OPTIONS.map((t) => (
                      <TouchableOpacity
                        key={t}
                        style={[
                          styles.timeOption,
                          newSlot.end_time === t && styles.timeOptionActive,
                        ]}
                        onPress={() => {
                          setNewSlot((p) => ({ ...p, end_time: t }));
                          setShowEndPicker(false);
                        }}
                      >
                        <Text
                          style={[
                            styles.timeOptionText,
                            newSlot.end_time === t &&
                              styles.timeOptionTextActive,
                          ]}
                        >
                          {t}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                )}
              </View>
            </View>

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={styles.modalCancelBtn}
                onPress={() => {
                  setShowModal(false);
                  setEditingSlot(null);
                }}
              >
                <Text style={styles.modalCancelBtnText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalConfirmBtn, saving && { opacity: 0.7 }]}
                onPress={handleSave}
                disabled={saving}
              >
                {saving ? (
                  <ActivityIndicator color={colors.white} size="small" />
                ) : (
                  <Text style={styles.modalConfirmBtnText}>Confirmar</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── Modal: Confirmar Deleção ── */}
      <Modal
        visible={showDeleteModal}
        transparent
        animationType="fade"
        onRequestClose={cancelDelete}
      >
        <View style={styles.deleteModalOverlay}>
          <View style={styles.deleteModalContent}>
            <View style={styles.deleteIconBox}>
              <Ionicons name="warning-outline" size={40} color="#d95c5c" />
            </View>

            <Text style={styles.deleteModalTitle}>Remover horário?</Text>

            {slotToDelete && (
              <Text style={styles.deleteModalMessage}>
                Tem certeza que deseja remover{"\n"}
                <Text style={styles.deleteModalHighlight}>
                  {WEEKDAY_SHORT[slotToDelete.weekday]}{" "}
                  {slotToDelete.start_time.slice(0, 5)}–
                  {slotToDelete.end_time.slice(0, 5)}
                </Text>
                {"\n"}de sua disponibilidade?
              </Text>
            )}

            <View style={styles.deleteModalButtons}>
              <TouchableOpacity
                style={styles.deleteModalCancelBtn}
                onPress={cancelDelete}
                disabled={isDeleting}
              >
                <Text style={styles.deleteModalCancelBtnText}>Cancelar</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.deleteModalConfirmBtn,
                  isDeleting && { opacity: 0.7 },
                ]}
                onPress={confirmDelete}
                disabled={isDeleting}
              >
                {isDeleting ? (
                  <ActivityIndicator color={colors.white} size="small" />
                ) : (
                  <Text style={styles.deleteModalConfirmBtnText}>Remover</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────
const createStyles = (colors: ThemeColors) => StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.pageBg },

  header: {
    backgroundColor: colors.primary,
    paddingTop: 52,
    paddingBottom: 16,
  },
  headerInner: {
    width: "100%",
    maxWidth: MAX_WIDTH,
    alignSelf: "center",
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
    fontWeight: "700",
    color: colors.white,
    letterSpacing: 0.2,
  },
  addBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "rgba(255,255,255,0.18)",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
  },
  addBtnText: { color: colors.white, fontSize: 13, fontWeight: "700" },

  summaryBar: {
    backgroundColor: colors.primaryStrong,
    paddingVertical: 14,
  },
  summaryInner: {
    width: "100%",
    maxWidth: MAX_WIDTH,
    alignSelf: "center",
    paddingHorizontal: 20,
    flexDirection: "row",
  },
  summaryItem: { flex: 1, alignItems: "center" },
  summaryNumber: { fontSize: 22, fontWeight: "800", color: colors.white },
  summaryLabel: { fontSize: 11, color: "rgba(255,255,255,0.65)", marginTop: 2 },
  summaryDivider: {
    width: 1,
    backgroundColor: "rgba(255,255,255,0.2)",
    marginVertical: 4,
  },

  loadingContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  loadingText: { fontSize: 14, color: "#7aab96" },

  scroll: { flex: 1 },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 48,
    width: "100%",
    maxWidth: MAX_WIDTH,
    alignSelf: "center",
  },

  overviewRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 20,
    gap: 6,
  },
  overviewPill: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: "#e8f0ed",
    gap: 4,
  },
  overviewPillText: { fontSize: 11, fontWeight: "700", color: "#9bbfb0" },
  overviewDot: { width: 5, height: 5, borderRadius: 999 },

  dayCard: {
    backgroundColor: colors.white,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 18,
    marginBottom: 12,
    shadowColor: "#1f5442",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.05,
    shadowRadius: 14,
    elevation: 2,
  },
  dayCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  dayBadge: {
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  dayBadgeText: { fontSize: 13, fontWeight: "800" },
  daySlotCount: { fontSize: 12, color: "#9bbfb0", fontWeight: "600" },

  slotsContainer: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  slotChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "#f8fcfa",
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderWidth: 1,
  },
  slotChipText: { fontSize: 13, fontWeight: "700" },
  slotActionBtn: { marginLeft: 2 },

  emptyState: {
    alignItems: "center",
    paddingVertical: 48,
    paddingHorizontal: 24,
  },
  emptyIcon: {
    width: 80,
    height: 80,
    borderRadius: 24,
    backgroundColor: colors.primaryTint,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 20,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: "#2e5d4e",
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 14,
    color: "#7aab96",
    textAlign: "center",
    lineHeight: 22,
    marginBottom: 28,
  },
  emptyAddBtn: {
    backgroundColor: colors.primary,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 16,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  emptyAddBtnText: { color: colors.white, fontSize: 15, fontWeight: "700" },

  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(10,21,17,0.4)",
    justifyContent: "flex-end",
  },
  modalSheet: {
    backgroundColor: colors.white,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    padding: 24,
    paddingBottom: 40,
  },
  modalHandle: {
    width: 42,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#d7ebe2",
    alignSelf: "center",
    marginBottom: 20,
  },
  modalTitle: { fontSize: 22, fontWeight: "800", color: "#173d31" },
  modalSubtitle: {
    fontSize: 14,
    color: "#678076",
    marginTop: 6,
    marginBottom: 20,
  },
  modalFieldLabel: {
    fontSize: 11,
    color: "#7aab96",
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 8,
  },

  weekdayScroll: { marginBottom: 20 },
  weekdayScrollContent: { gap: 8, paddingRight: 8 },
  weekdayChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1.5,
    borderColor: "#d4e8de",
    backgroundColor: colors.white,
  },
  weekdayChipText: { fontSize: 13, fontWeight: "700", color: "#5a756a" },

  timeRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    marginBottom: 24,
  },
  timeField: { flex: 1 },
  timeArrow: { marginTop: 32 },
  timePickerBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderWidth: 1.5,
    borderColor: "#c8e6d8",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: colors.primaryTint,
  },
  timePickerBtnText: { flex: 1, fontSize: 15, fontWeight: "700", color: colors.primary },
  timeDropdown: {
    maxHeight: 160,
    borderWidth: 1,
    borderColor: "#d4e8de",
    borderRadius: 12,
    backgroundColor: colors.white,
    marginTop: 4,
  },
  timeOption: { paddingHorizontal: 14, paddingVertical: 10 },
  timeOptionActive: { backgroundColor: colors.primaryTint },
  timeOptionText: { fontSize: 14, color: "#3a6054", fontWeight: "500" },
  timeOptionTextActive: { color: colors.primary, fontWeight: "700" },

  modalButtons: { flexDirection: "row", gap: 10 },
  modalCancelBtn: {
    flex: 1,
    backgroundColor: "#f0f0f0",
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: "center",
  },
  modalCancelBtnText: { color: "#666", fontSize: 15, fontWeight: "600" },
  modalConfirmBtn: {
    flex: 1,
    backgroundColor: colors.primary,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: "center",
  },
  modalConfirmBtnText: { color: colors.white, fontSize: 15, fontWeight: "700" },

  // Delete Modal
  deleteModalOverlay: {
    flex: 1,
    backgroundColor: "rgba(10,21,17,0.5)",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 20,
  },
  deleteModalContent: {
    backgroundColor: colors.white,
    borderRadius: 24,
    padding: 28,
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 16,
    elevation: 8,
  },
  deleteIconBox: {
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: "#fdeaea",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 20,
  },
  deleteModalTitle: {
    fontSize: 20,
    fontWeight: "800",
    color: "#173d31",
    marginBottom: 12,
    textAlign: "center",
  },
  deleteModalMessage: {
    fontSize: 15,
    color: "#5e7b70",
    textAlign: "center",
    lineHeight: 24,
    marginBottom: 28,
  },
  deleteModalHighlight: {
    fontWeight: "700",
    color: "#d95c5c",
  },
  deleteModalButtons: {
    flexDirection: "row",
    gap: 12,
    width: "100%",
  },
  deleteModalCancelBtn: {
    flex: 1,
    backgroundColor: "#f0f0f0",
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: "center",
  },
  deleteModalCancelBtnText: {
    color: "#666",
    fontSize: 15,
    fontWeight: "600",
  },
  deleteModalConfirmBtn: {
    flex: 1,
    backgroundColor: "#d95c5c",
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: "center",
  },
  deleteModalConfirmBtnText: {
    color: colors.white,
    fontSize: 15,
    fontWeight: "700",
  },
});
