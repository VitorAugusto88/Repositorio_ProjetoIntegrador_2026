import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
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
import { confirmAction } from "../../services/confirm";
import { showAlert } from "../../services/feedback";
import {
  createClinicRoom,
  deleteClinicRoom,
  getClinicRooms,
  getMe,
  RoomApiItem,
  updateClinicRoom,
} from "../../services/api";
import { canManageRooms } from "../../services/rooms";

const MAX_WIDTH = 1120;

export default function RoomsScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [rooms, setRooms] = useState<RoomApiItem[]>([]);
  const [clinicId, setClinicId] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [active, setActive] = useState(true);
  const [saving, setSaving] = useState(false);

  const loadRooms = async (id: string) => {
    const result = await getClinicRooms(id);
    if (!result.ok) {
      showAlert("Erro", result.error ?? "Não foi possível carregar as salas.");
      return;
    }
    setRooms(result.data ?? []);
  };

  useEffect(() => {
    const init = async () => {
      const me = await getMe();
      if (!me.ok || !me.data?.clinic) {
        showAlert("Erro", "Não foi possível identificar a clínica.");
        setLoading(false);
        return;
      }
      setClinicId(me.data.clinic);
      setIsAdmin(canManageRooms(me.data.role) || me.data.is_staff === true);
      await loadRooms(me.data.clinic);
      setLoading(false);
    };
    void init();
  }, []);

  const resetForm = () => {
    setEditing(null);
    setName("");
    setDescription("");
    setActive(true);
  };

  const saveRoom = async () => {
    if (!clinicId || !name.trim()) {
      showAlert("Campo obrigatório", "Informe o nome da sala.");
      return;
    }
    setSaving(true);
    const result = editing
      ? await updateClinicRoom(clinicId, editing, {
          name: name.trim(), description: description.trim(), is_active: active,
        })
      : await createClinicRoom(clinicId, {
          name: name.trim(), description: description.trim(), is_active: active,
        });
    setSaving(false);
    if (!result.ok) {
      showAlert("Erro", result.error ?? "Não foi possível salvar a sala.");
      return;
    }
    resetForm();
    await loadRooms(clinicId);
  };

  const editRoom = (room: RoomApiItem) => {
    setEditing(room.id);
    setName(room.name);
    setDescription(room.description ?? "");
    setActive(room.is_active);
  };

  const removeRoom = (room: RoomApiItem) => {
    if (!clinicId) return;
    confirmAction(
      "Excluir sala",
      `Excluir ${room.name}? Salas com agendamentos não podem ser excluídas.`,
      async () => {
        const result = await deleteClinicRoom(clinicId, room.id);
        if (!result.ok) {
          showAlert("Não foi possível excluir", result.error ?? "A sala possui histórico.");
          return;
        }
        await loadRooms(clinicId);
      },
      { confirmText: "Excluir" },
    );
  };

  return (
    <View style={styles.screen}>
      <StatusBar barStyle="light-content" backgroundColor={colors.primary} />
      <View style={styles.header}>
        <TouchableOpacity style={styles.iconButton} onPress={() => router.back()}>
          <Ionicons name="arrow-back-outline" size={22} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Salas</Text>
        <View style={styles.iconButton} />
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.container}>
          <Text style={styles.subtitle}>
            {isAdmin ? "Cadastre e organize as salas da clínica." : "Consulte as salas disponíveis da clínica."}
          </Text>
          {isAdmin && (
            <View style={styles.formCard}>
              <Text style={styles.sectionTitle}>{editing ? "Editar sala" : "Nova sala"}</Text>
              <TextInput style={styles.input} value={name} onChangeText={setName} placeholder="Nome da sala" placeholderTextColor={colors.placeholder} />
              <TextInput style={[styles.input, styles.multiline]} value={description} onChangeText={setDescription} placeholder="Descrição" placeholderTextColor={colors.placeholder} multiline />
              <TouchableOpacity style={styles.activeRow} onPress={() => setActive((value) => !value)}>
                <Ionicons name={active ? "checkbox" : "square-outline"} size={22} color={colors.primary} />
                <Text style={styles.activeText}>Sala ativa</Text>
              </TouchableOpacity>
              <View style={styles.formActions}>
                {editing && <TouchableOpacity style={styles.cancelButton} onPress={resetForm}><Text style={styles.cancelText}>Cancelar</Text></TouchableOpacity>}
                <TouchableOpacity style={styles.saveButton} onPress={() => void saveRoom()} disabled={saving}>
                  {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveText}>{editing ? "Salvar alterações" : "Cadastrar sala"}</Text>}
                </TouchableOpacity>
              </View>
            </View>
          )}
          {loading ? <ActivityIndicator color={colors.primary} size="large" /> : rooms.map((room) => (
            <View key={room.id} style={styles.roomCard}>
              <View style={styles.roomIcon}><Ionicons name="business-outline" size={22} color={colors.primary} /></View>
              <View style={styles.roomBody}>
                <Text style={styles.roomName}>{room.name}</Text>
                {!!room.description && <Text style={styles.roomDescription}>{room.description}</Text>}
                <Text style={[styles.status, !room.is_active && styles.inactive]}>
                  {room.is_active ? "Ativa" : "Inativa"}
                  {room.status === "ocupada" ? " · Em uso agora" : ""}
                </Text>
              </View>
              {isAdmin && <View style={styles.actions}>
                <TouchableOpacity onPress={() => editRoom(room)}><Ionicons name="create-outline" size={21} color={colors.primary} /></TouchableOpacity>
                <TouchableOpacity onPress={() => removeRoom(room)}><Ionicons name="trash-outline" size={21} color="#c45d5d" /></TouchableOpacity>
              </View>}
            </View>
          ))}
          {!loading && rooms.length === 0 && <Text style={styles.empty}>Nenhuma sala cadastrada.</Text>}
        </View>
      </ScrollView>
    </View>
  );
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.pageBg },
  header: { backgroundColor: colors.primary, paddingTop: 52, paddingBottom: 20, paddingHorizontal: 20, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  iconButton: { width: 42, height: 42, borderRadius: 12, backgroundColor: "rgba(255,255,255,0.14)", alignItems: "center", justifyContent: "center" },
  headerTitle: { color: "#fff", fontSize: 21, fontWeight: "800" },
  content: { padding: 20, paddingBottom: 48 },
  container: { width: "100%", maxWidth: MAX_WIDTH, alignSelf: "center", gap: 14 },
  subtitle: { color: colors.textMuted, fontSize: 15, marginBottom: 4 },
  formCard: { backgroundColor: colors.white, borderColor: colors.border, borderWidth: 1, borderRadius: 14, padding: 18, gap: 12 },
  sectionTitle: { color: colors.textDark, fontSize: 17, fontWeight: "800" },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: 10, padding: 12, color: colors.textDark, backgroundColor: colors.pageBg },
  multiline: { minHeight: 72, textAlignVertical: "top" },
  activeRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  activeText: { color: colors.textDark, fontWeight: "600" },
  formActions: { flexDirection: "row", justifyContent: "flex-end", gap: 10 },
  cancelButton: { padding: 12 },
  cancelText: { color: colors.textMuted, fontWeight: "700" },
  saveButton: { backgroundColor: colors.primary, borderRadius: 10, padding: 12, minWidth: 130, alignItems: "center" },
  saveText: { color: "#fff", fontWeight: "800" },
  roomCard: { backgroundColor: colors.white, borderColor: colors.border, borderWidth: 1, borderRadius: 14, padding: 16, flexDirection: "row", alignItems: "center", gap: 12 },
  roomIcon: { width: 42, height: 42, borderRadius: 12, backgroundColor: colors.primaryTint, alignItems: "center", justifyContent: "center" },
  roomBody: { flex: 1 },
  roomName: { color: colors.textDark, fontSize: 16, fontWeight: "800" },
  roomDescription: { color: colors.textMuted, marginTop: 3 },
  status: { color: colors.primary, fontSize: 12, fontWeight: "800", marginTop: 6 },
  inactive: { color: "#b66b37" },
  actions: { flexDirection: "row", gap: 14 },
  empty: { color: colors.textMuted, textAlign: "center", padding: 20 },
});
