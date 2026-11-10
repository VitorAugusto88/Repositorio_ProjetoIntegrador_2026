import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { ThemeColors } from "../../constants/theme-palettes";
import { useTheme } from "../../contexts/ThemeContext";
import { showAlert } from "../../services/feedback";
import { DateField, TimeField } from "../../components/DateTimeField";
import RoomSelector from "../../components/RoomSelector";
import {
  createAppointment,
  getClinicPatients,
  getClinicRooms,
  getMe,
  getProfessionalsByClinic,
  RoomApiItem,
} from "../../services/api";
import { buildRoomInterval, isRoomSelectable } from "../../services/rooms";

const MAX_WIDTH = 1120;

const CARD_SHADOW = {
  shadowColor: "#1f5442",
  shadowOpacity: 0.05,
  shadowRadius: 14,
  shadowOffset: { width: 0, height: 6 },
  elevation: 2,
} as const;

interface SimpleUser {
  id: string;
  label: string;
}

// ─── Seletor de lista ─────────────────────────────────────────────────────────
const Selector = ({
  label,
  items,
  selected,
  onSelect,
}: {
  label: string;
  items: SimpleUser[];
  selected: string | null;
  onSelect: (id: string) => void;
}) => {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [open, setOpen] = useState(false);
  const selectedLabel =
    items.find((i) => i.id === selected)?.label ?? "Selecione...";

  return (
    <View style={styles.selectorGroup}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TouchableOpacity
        style={styles.selectorBtn}
        onPress={() => setOpen((v) => !v)}
        activeOpacity={0.85}
      >
        <Text
          style={[
            styles.selectorBtnText,
            !selected && { color: colors.placeholder },
          ]}
        >
          {selectedLabel}
        </Text>
        <Ionicons
          name={open ? "chevron-up-outline" : "chevron-down-outline"}
          size={18}
          color={colors.textMuted}
        />
      </TouchableOpacity>
      {open && (
        <View style={styles.dropdown}>
          {items.length === 0 ? (
            <Text style={styles.dropdownEmpty}>Nenhum item disponível</Text>
          ) : (
            items.map((item) => (
              <TouchableOpacity
                key={item.id}
                style={[
                  styles.dropdownItem,
                  selected === item.id && styles.dropdownItemActive,
                ]}
                onPress={() => {
                  onSelect(item.id);
                  setOpen(false);
                }}
                activeOpacity={0.85}
              >
                <Text
                  style={[
                    styles.dropdownItemText,
                    selected === item.id && styles.dropdownItemTextActive,
                  ]}
                >
                  {item.label}
                </Text>
                {selected === item.id && (
                  <Ionicons
                    name="checkmark-outline"
                    size={16}
                    color={colors.primary}
                  />
                )}
              </TouchableOpacity>
            ))
          )}
        </View>
      )}
    </View>
  );
};

// ─── Tela principal ───────────────────────────────────────────────────────────
export default function AdminAgendarScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const params = useLocalSearchParams<{
    patientId?: string;
    professionalId?: string;
  }>();

  const [loadingInitial, setLoadingInitial] = useState(true);
  const [saving, setSaving] = useState(false);
  const [clinicId, setClinicId] = useState<string | null>(null);

  const [patients, setPatients] = useState<SimpleUser[]>([]);
  const [professionals, setProfessionals] = useState<SimpleUser[]>([]);

  const [selectedPatient, setSelectedPatient] = useState<string | null>(
    params.patientId ?? null,
  );
  const [selectedProfessional, setSelectedProfessional] = useState<
    string | null
  >(params.professionalId ?? null);

  // Data e hora como strings simples (ex: "2026-05-10", "14:30")
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [duration, setDuration] = useState("50");
  const [ignoreAvailability, setIgnoreAvailability] = useState(false);

  // Sala é opcional: `null` significa "sem sala definida".
  const [rooms, setRooms] = useState<RoomApiItem[]>([]);
  const [selectedRoom, setSelectedRoom] = useState<string | null>(null);
  const [loadingRooms, setLoadingRooms] = useState(false);
  const [roomsError, setRoomsError] = useState<string | null>(null);

  // Data mínima do calendário: hoje (impede agendar no passado). Formato AAAA-MM-DD.
  const todayStr = new Date().toLocaleDateString("en-CA");

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(24)).current;

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

  useEffect(() => {
    const init = async () => {
      try {
        setLoadingInitial(true);

        const meResult = await getMe();
        if (!meResult.ok || !meResult.data?.clinic) {
          showAlert("Erro", "Não foi possível identificar a clínica.");
          return;
        }

        const cId = meResult.data.clinic;
        setClinicId(cId);

        const [patientsRes, professionalsRes] = await Promise.all([
          getClinicPatients(cId),
          getProfessionalsByClinic(cId),
        ]);

        if (patientsRes.ok) {
          setPatients(
            (patientsRes.data ?? []).map((p: any) => ({
              id: p.id,
              label: p.user?.full_name ?? p.user?.email ?? p.id, // PatientProfile: nome em p.user.full_name
            })),
          );
        }

        if (professionalsRes.ok) {
          setProfessionals(
            (professionalsRes.data ?? []).map((p: any) => ({
              id: p.id,
              label: p.user?.full_name ?? p.user?.email ?? p.id,
            })),
          );
        }
      } catch (err: any) {
        showAlert("Erro", err?.message ?? "Ocorreu um erro inesperado.");
      } finally {
        setLoadingInitial(false);
      }
    };

    void init();
  }, []);

  // Recarrega as salas sempre que o intervalo pretendido muda, para que o
  // backend calcule `status` (livre/ocupada) já para a data/hora escolhidas.
  useEffect(() => {
    if (!clinicId) return;
    let cancelled = false;

    const loadRooms = async () => {
      setLoadingRooms(true);
      const interval = buildRoomInterval(date, time, parseInt(duration, 10));
      const result = await getClinicRooms(clinicId, interval ?? {});
      if (cancelled) return;
      setLoadingRooms(false);

      if (!result.ok) {
        // Falha ao listar não impede agendar sem sala.
        setRooms([]);
        setRoomsError(
          result.error ?? "Não foi possível carregar as salas da clínica.",
        );
        return;
      }
      setRoomsError(null);
      setRooms(result.data ?? []);
    };

    void loadRooms();
    return () => {
      cancelled = true;
    };
  }, [clinicId, date, time, duration]);

  // Se a sala escolhida ficar ocupada/inativa depois de trocar o horário, a
  // seleção é desfeita para não enviar um valor que o backend recusaria.
  useEffect(() => {
    if (!selectedRoom) return;
    const room = rooms.find((item) => item.id === selectedRoom);
    if (room && !isRoomSelectable(room)) setSelectedRoom(null);
  }, [rooms, selectedRoom]);

  const handleSave = async () => {
    if (!selectedPatient) {
      showAlert("Campo obrigatório", "Selecione o paciente.");
      return;
    }
    if (!selectedProfessional) {
      showAlert("Campo obrigatório", "Selecione o psicólogo.");
      return;
    }
    if (!date || !time) {
      showAlert(
        "Campo obrigatório",
        "Informe a data e o horário da consulta.",
      );
      return;
    }
    if (!clinicId) {
      showAlert("Erro", "Clínica não identificada.");
      return;
    }

    // Valida formato de data e hora
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    const timeRegex = /^\d{2}:\d{2}$/;
    if (!dateRegex.test(date)) {
      showAlert(
        "Data inválida",
        "Use o formato AAAA-MM-DD (ex: 2026-05-10).",
      );
      return;
    }
    if (!timeRegex.test(time)) {
      showAlert("Hora inválida", "Use o formato HH:MM (ex: 14:30).");
      return;
    }

    const durationMin = parseInt(duration, 10);
    if (isNaN(durationMin) || durationMin < 10) {
      showAlert(
        "Duração inválida",
        "Informe uma duração de pelo menos 10 minutos.",
      );
      return;
    }

    setSaving(true);
    try {
      const scheduledAt = `${date}T${time}:00-03:00`;
      const result = await createAppointment(
        selectedProfessional,
        scheduledAt,
        durationMin,
        {
          patientId: selectedPatient,
          clinicId,
          ignoreAvailability,
          roomId: selectedRoom ?? undefined,
        },
      );

      if (!result.ok) {
        showAlert(
          "Erro ao agendar",
          result.error ?? "Não foi possível criar a consulta.",
        );
        return;
      }

      showAlert("Consulta agendada", "A consulta foi criada com sucesso.", [
        { text: "OK", onPress: () => router.back() },
      ]);
    } catch (err: any) {
      showAlert("Erro", err?.message ?? "Ocorreu um erro inesperado.");
    } finally {
      setSaving(false);
    }
  };

  const Header = () => (
    <View style={styles.header}>
      <View style={styles.headerInner}>
        <TouchableOpacity style={styles.iconBtn} onPress={() => router.back()}>
          <Ionicons name="arrow-back-outline" size={22} color="#fff" />
        </TouchableOpacity>
        <View style={styles.headerTextBox}>
          <Text style={styles.headerTitle}>Novo agendamento</Text>
        </View>
        <TouchableOpacity style={styles.iconBtn} onPress={() => router.replace("/(admin)")}>
          <Ionicons name="home-outline" size={20} color="#fff" />
        </TouchableOpacity>
      </View>
    </View>
  );

  if (loadingInitial) {
    return (
      <View style={styles.screen}>
        <StatusBar barStyle="light-content" backgroundColor={colors.primary} />
        <Header />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.loadingText}>Carregando dados...</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <StatusBar barStyle="light-content" backgroundColor={colors.primary} />
      <Header />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <Animated.View
          style={[styles.container, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}
        >
          <View style={styles.formCard}>
            <Text style={styles.sectionTitle}>Participantes</Text>

            <Selector
              label="Paciente *"
              items={patients}
              selected={selectedPatient}
              onSelect={setSelectedPatient}
            />

            <Selector
              label="Psicólogo *"
              items={professionals}
              selected={selectedProfessional}
              onSelect={setSelectedProfessional}
            />
          </View>

          <View style={styles.formCard}>
            <Text style={styles.sectionTitle}>Data e horário</Text>

            {/* Campos com calendário/relógio nativos */}
            <View style={styles.rowFields}>
              <View style={styles.halfField}>
                <Text style={styles.fieldLabel}>Data *</Text>
                <DateField value={date} onChange={setDate} min={todayStr} />
              </View>
              <View style={styles.halfField}>
                <Text style={styles.fieldLabel}>Hora *</Text>
                <TimeField value={time} onChange={setTime} />
              </View>
            </View>

            <Text style={styles.fieldLabel}>Duração (minutos)</Text>
            <TextInput
              style={styles.textRealInput}
              value={duration}
              onChangeText={setDuration}
              placeholder="50"
              placeholderTextColor={colors.placeholder}
              keyboardType="numeric"
            />

            <RoomSelector
              rooms={rooms}
              selected={selectedRoom}
              onSelect={setSelectedRoom}
              loading={loadingRooms}
              error={roomsError}
            />

            <TouchableOpacity
              style={styles.checkRow}
              onPress={() => setIgnoreAvailability((v) => !v)}
              activeOpacity={0.8}
            >
              <Ionicons
                name={ignoreAvailability ? "checkbox" : "square-outline"}
                size={22}
                color={colors.primary}
              />
              <View style={styles.checkTextBox}>
                <Text style={styles.checkLabel}>Ignorar disponibilidade</Text>
                <Text style={styles.checkHint}>
                  Agenda mesmo fora dos horários cadastrados do profissional, só para esta consulta.
                </Text>
              </View>
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            style={[styles.saveButton, saving && styles.saveButtonDisabled]}
            onPress={handleSave}
            disabled={saving}
            activeOpacity={0.85}
          >
            {saving ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <>
                <Ionicons
                  name="checkmark-circle-outline"
                  size={20}
                  color="#fff"
                />
                <Text style={styles.saveButtonText}>Confirmar agendamento</Text>
              </>
            )}
          </TouchableOpacity>
        </Animated.View>
      </ScrollView>
    </View>
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
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
    formCard: {
      backgroundColor: colors.white, borderRadius: 16, borderWidth: 1, borderColor: colors.border,
      padding: 18, marginBottom: 16, ...CARD_SHADOW,
    },
    sectionTitle: { fontSize: 16, fontWeight: "800", color: colors.textDark, marginBottom: 16, letterSpacing: -0.2 },
    fieldLabel: {
      fontSize: 12, fontWeight: "700", color: "#5f7d70", marginBottom: 8,
      textTransform: "uppercase", letterSpacing: 0.5,
    },
    selectorGroup: { marginBottom: 16 },
    selectorBtn: {
      minHeight: 50, borderRadius: 12, borderWidth: 1, borderColor: colors.border,
      backgroundColor: "#f6faf8", paddingHorizontal: 16,
      flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    },
    selectorBtnText: { fontSize: 15, color: colors.textDark, fontWeight: "500", flex: 1 },
    dropdown: {
      marginTop: 6, borderRadius: 12, borderWidth: 1, borderColor: colors.border,
      backgroundColor: colors.white, overflow: "hidden",
    },
    dropdownEmpty: { padding: 16, fontSize: 14, color: colors.placeholder, textAlign: "center" },
    dropdownItem: {
      paddingVertical: 14, paddingHorizontal: 16,
      flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    },
    dropdownItemActive: { backgroundColor: colors.primaryTint },
    dropdownItemText: { fontSize: 15, color: colors.textDark, fontWeight: "500" },
    dropdownItemTextActive: { color: colors.primary, fontWeight: "700" },
    rowFields: { flexDirection: "row", gap: 12 },
    halfField: { flex: 1, minWidth: 0 },
    checkRow: {
      flexDirection: "row", alignItems: "center", gap: 12, marginTop: 16,
      paddingTop: 16, borderTopWidth: 1, borderTopColor: "#eef5f1",
    },
    checkTextBox: { flex: 1 },
    checkLabel: { fontSize: 14, fontWeight: "700", color: colors.textDark },
    checkHint: { fontSize: 12, color: "#6a887d", marginTop: 2, lineHeight: 16 },
    saveButton: {
      height: 54, borderRadius: 14, backgroundColor: colors.primary,
      flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    },
    saveButtonDisabled: { opacity: 0.75 },
    saveButtonText: { color: colors.white, fontSize: 16, fontWeight: "800" },
    textRealInput: {
      minHeight: 50, borderRadius: 12, borderWidth: 1, borderColor: colors.border,
      backgroundColor: "#f6faf8", paddingHorizontal: 16, fontSize: 15,
      color: colors.textDark, fontWeight: "500", marginBottom: 4,
      // @ts-ignore — remove o contorno azul no web
      outlineStyle: "none",
    },
  });
