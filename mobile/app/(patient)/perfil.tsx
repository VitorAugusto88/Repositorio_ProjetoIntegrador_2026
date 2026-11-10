import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import * as DocumentPicker from "expo-document-picker";
import React, { useMemo, useRef, useState } from "react";
import {
    ActivityIndicator,
    Animated,
    Image,
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
import { showAlert, showToast } from "../../services/feedback";
import { DateField } from "../../components/DateTimeField";
import {
    getMe,
    getPatientProfile,
    logout,
    updateMe,
    updatePatientProfile,
    updatePatientProfilePhoto,
} from "../../services/api";
import { confirmAction } from "../../services/confirm";

// Data máxima para nascimento: hoje (formato AAAA-MM-DD).
const TODAY_STR = new Date().toLocaleDateString("en-CA");

// Campos enviados no PATCH /api/auth/patients/{id}/profile/
// phone e full_name NÃO ficam aqui — pertencem ao User, salvos via updateMe
// medical_history/anamnesis NÃO ficam aqui — são clínicos, editáveis só pelo
// profissional; o paciente nem visualiza nem envia esses campos.
interface ProfilePayload {
  birth_date?: string;
  cpf?: string;
  emergency_contact_name?: string;
  emergency_contact_phone?: string;
}

// ─── Types ────────────────────────────────────────────────────────────────────
interface EditableFields {
  name: string;
  phone: string;
  birthDate: string;
  cpf: string;
  emergencyName: string;
  emergencyPhone: string;
}

// ─── Editable Row ─────────────────────────────────────────────────────────────
interface EditableRowProps {
  label: string;
  value: string;
  onChangeText: (val: string) => void;
  keyboardType?: "default" | "email-address" | "phone-pad" | "numeric";
  editable: boolean;
  readOnly?: boolean;
  multiline?: boolean;
  numberOfLines?: number;
  minHeight?: number;
  // "date" mostra o calendário clássico ao editar.
  type?: "text" | "date";
}

// Componentes no escopo do módulo (não dentro de ProfileScreen) para não
// perder identidade/estado do TextInput a cada re-render do pai — cada um lê
// a paleta da clínica direto via useTheme().
const SectionHeader = ({ icon, title }: { icon: string; title: string }) => {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <View style={styles.sectionHeader}>
      <View style={styles.sectionIconBox}>
        <Ionicons name={icon as any} size={15} color={colors.primary} />
      </View>
      <Text style={styles.sectionTitle}>{title}</Text>
    </View>
  );
};

const InfoRow = ({ label, value }: { label: string; value: string }) => {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  );
};

const EditableRow = ({
  label,
  value,
  onChangeText,
  keyboardType,
  editable,
  readOnly,
  multiline,
  numberOfLines,
  minHeight,
  type,
}: EditableRowProps) => {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <View style={styles.editableRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      {editable && !readOnly ? (
        type === "date" ? (
          <DateField
            value={value}
            onChange={onChangeText}
            max={TODAY_STR}
            variant="underline"
          />
        ) : (
          <TextInput
            style={[styles.editInput, multiline && { minHeight: minHeight ?? 80 }]}
            value={value}
            onChangeText={onChangeText}
            keyboardType={keyboardType ?? "default"}
            autoCapitalize="none"
            placeholderTextColor={colors.placeholder}
            multiline={multiline}
            numberOfLines={numberOfLines}
          />
        )
      ) : (
        <Text style={[styles.infoValue, readOnly && styles.infoValueMuted]}>
          {value}
        </Text>
      )}
    </View>
  );
};

// ─── Main Screen ─────────────────────────────────────────────────────────────
export default function ProfileScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [userId, setUserId] = useState<string | null>(null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [fields, setFields] = useState<EditableFields>({
    name: "",
    phone: "",
    birthDate: "",
    cpf: "",
    emergencyName: "",
    emergencyPhone: "",
  });
  const [original, setOriginal] = useState<EditableFields>({ ...fields });

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(20)).current;

  React.useEffect(() => {
    const loadProfile = async () => {
      setLoading(true);
      const meResult = await getMe();
      if (!meResult.ok || !meResult.data?.id) {
        showAlert(
          "Erro",
          meResult.error || "Não foi possível carregar o perfil.",
        );
        setLoading(false);
        return;
      }

      const profileResult = await getPatientProfile(meResult.data.id);
      if (!profileResult.ok || !profileResult.data) {
        showAlert(
          "Erro",
          profileResult.error || "Não foi possível carregar o perfil.",
        );
        setLoading(false);
        return;
      }

      const profile = profileResult.data;
      setUserId(meResult.data.id);
      setPhotoUrl(profile.photo || null);
      setFields({
        name: profile.user.full_name || profile.user.email || "",
        phone: profile.user.phone || "",
        birthDate: profile.birth_date || "",
        cpf: profile.cpf || "",
        emergencyName: profile.emergency_contact_name || "",
        emergencyPhone: profile.emergency_contact_phone || "",
      });
      setEmail(profile.user.email || "");
      setOriginal({
        name: profile.user.full_name || profile.user.email || "",
        phone: profile.user.phone || "",
        birthDate: profile.birth_date || "",
        cpf: profile.cpf || "",
        emergencyName: profile.emergency_contact_name || "",
        emergencyPhone: profile.emergency_contact_phone || "",
      });
      setLoading(false);
    };

    void loadProfile();
  }, []);

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

  const set = (field: keyof EditableFields) => (val: string) => {
    setFields((prev) => ({ ...prev, [field]: val }));
  };

  const handleEdit = () => {
    setOriginal({ ...fields });
    setEditing(true);
  };

  const handleCancel = () => {
    setFields({ ...original });
    setEditing(false);
  };

  const doPickPhoto = async () => {
    if (!userId || photoBusy) return;
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: "image/*",
        copyToCacheDirectory: true,
      });
      if (result.canceled || !result.assets?.length) return;

      const asset = result.assets[0];
      setPhotoBusy(true);
      const uploadResult = await updatePatientProfilePhoto(userId, {
        uri: asset.uri,
        name: asset.name || "foto.jpg",
        type: asset.mimeType || "image/jpeg",
      });
      setPhotoBusy(false);

      if (!uploadResult.ok) {
        showToast(uploadResult.error || "Não foi possível salvar a foto.", "error");
        return;
      }
      setPhotoUrl(uploadResult.data?.photo || null);
      showToast("Foto de perfil atualizada.", "success");
    } catch {
      setPhotoBusy(false);
      showAlert("Erro", "Não foi possível selecionar a imagem.");
    }
  };

  const doRemovePhoto = () => {
    if (!userId || photoBusy) return;
    confirmAction(
      "Remover foto",
      "Tem certeza que deseja remover sua foto de perfil?",
      async () => {
        setPhotoBusy(true);
        const result = await updatePatientProfilePhoto(userId, null);
        setPhotoBusy(false);
        if (!result.ok) {
          showToast(result.error || "Não foi possível remover a foto.", "error");
          return;
        }
        setPhotoUrl(null);
        showToast("Foto removida.", "success");
      },
      { confirmText: "Remover", cancelText: "Cancelar" },
    );
  };

  const handleAvatarPress = () => {
    if (photoBusy) return;
    if (!photoUrl) {
      void doPickPhoto();
      return;
    }
    showAlert("Foto de perfil", undefined, [
      { text: "Trocar foto", onPress: () => void doPickPhoto() },
      { text: "Remover foto", style: "destructive", onPress: doRemovePhoto },
      { text: "Cancelar", style: "cancel" },
    ]);
  };

  const handleLogout = () => {
    confirmAction(
      "Deseja sair da sua conta?",
      "Você será desconectado e precisará fazer login novamente.",
      async () => {
        try {
          await logout();
        } finally {
          router.replace("/login");
        }
      },
      { confirmText: "Sair" },
    );
  };

  const handleSave = async () => {
    setLoading(true);
    try {
      const meResult = await getMe();
      if (!meResult.ok || !meResult.data?.id) {
        showAlert("Erro", "Não foi possível identificar o paciente.");
        setLoading(false);
        return;
      }

      const userId = meResult.data.id;

      // ── Passo 1: salvar full_name e phone no User via PATCH /api/auth/me/
      // phone pertence ao model User — updatePatientProfile não consegue salvá-lo
      const meUpdateResult = await updateMe({
        full_name: fields.name,
        phone: fields.phone,
      });
      if (!meUpdateResult.ok) {
        console.error(
          "Erro ao salvar dados do usuário:",
          meUpdateResult.error,
          meUpdateResult.data,
        );
        showAlert(
          "Erro",
          meUpdateResult.error || "Não foi possível salvar nome/telefone.",
        );
        return;
      }

      // ── Passo 2: salvar campos do PatientProfile
      const profilePayload: ProfilePayload = {
        birth_date: fields.birthDate || undefined,
        cpf: fields.cpf || undefined,
        emergency_contact_name: fields.emergencyName || undefined,
        emergency_contact_phone: fields.emergencyPhone || undefined,
      };

      const profileResult = await updatePatientProfile(userId, profilePayload);
      if (!profileResult.ok) {
        console.error(
          "Erro ao salvar perfil:",
          profileResult.error,
          profileResult.data,
        );
        showAlert(
          "Erro",
          profileResult.error || "Não foi possível salvar as alterações.",
        );
        return;
      }

      setOriginal({ ...fields });
      setEditing(false);
      showAlert("Sucesso", "Perfil atualizado com sucesso!");
    } catch {
      showAlert("Erro", "Não foi possível salvar as alterações.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.screen}>
      <StatusBar barStyle="light-content" backgroundColor={colors.primary} />

      {/* ── Header ── */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Ionicons name="arrow-back-outline" size={22} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Meu Perfil</Text>
        {!editing ? (
          <TouchableOpacity style={styles.editBtn} onPress={handleEdit}>
            <Ionicons name="pencil-outline" size={18} color="#fff" />
            <Text style={styles.editBtnText}>Editar</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity style={styles.cancelBtn} onPress={handleCancel}>
            <Text style={styles.cancelBtnText}>Cancelar</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* ── Avatar ── */}
      <View style={styles.avatarSection}>
        <TouchableOpacity
          style={styles.avatar}
          onPress={handleAvatarPress}
          activeOpacity={0.85}
          disabled={loading || photoBusy}
        >
          {loading || photoBusy ? (
            <ActivityIndicator color={colors.white} />
          ) : photoUrl ? (
            <Image source={{ uri: photoUrl }} style={styles.avatarImg} />
          ) : (
            <Text style={styles.avatarText}>
              {(fields.name || "")
                .trim()
                .split(" ")
                .filter(Boolean)
                .map((n) => n[0] ?? "")
                .slice(0, 2)
                .join("")}
            </Text>
          )}
          {!loading && (
            <View style={styles.avatarEditBadge}>
              <Ionicons name="camera-outline" size={13} color={colors.primary} />
            </View>
          )}
        </TouchableOpacity>
        <Text style={styles.avatarName}>{fields.name || "Paciente"}</Text>
        <Text style={styles.avatarEmail}>{email || "carregando..."}</Text>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <Animated.View
          style={{ opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}
        >
          {/* ── Dados Pessoais ── */}
          <View style={styles.card}>
            <SectionHeader icon="person-outline" title="Dados Pessoais" />

            <EditableRow
              label="Nome completo"
              value={fields.name}
              onChangeText={set("name")}
              editable={editing}
            />
            <View style={styles.rowDivider} />

            <InfoRow label="E-mail" value={email || "---"} />
            <View style={styles.rowDivider} />

            <EditableRow
              label="Telefone"
              value={fields.phone}
              onChangeText={set("phone")}
              keyboardType="phone-pad"
              editable={editing}
            />
            <View style={styles.rowDivider} />

            <EditableRow
              label="Data de nascimento"
              value={fields.birthDate}
              onChangeText={set("birthDate")}
              editable={editing}
              type="date"
            />
            <View style={styles.rowDivider} />

            <EditableRow
              label="CPF"
              value={fields.cpf}
              onChangeText={set("cpf")}
              keyboardType="numeric"
              editable={editing}
            />
          </View>

          {/* ── Clínica (somente leitura) ── */}
          {!editing && (
            <TouchableOpacity
              style={styles.clinicBtn}
              onPress={() => router.push("/(patient)/clinica" as any)}
              activeOpacity={0.85}
            >
              <View style={styles.clinicIconBox}>
                <Ionicons name="business-outline" size={18} color={colors.primary} />
              </View>
              <View style={styles.clinicBtnTextBox}>
                <Text style={styles.clinicBtnTitle}>Informações da clínica</Text>
                <Text style={styles.clinicBtnHint}>
                  Endereço, contato e horários
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color="#b5cabf" />
            </TouchableOpacity>
          )}

          {/* ── Contato de Emergência ── */}
          <View style={styles.card}>
            <SectionHeader icon="call-outline" title="Contato de Emergência" />

            <EditableRow
              label="Nome"
              value={fields.emergencyName}
              onChangeText={set("emergencyName")}
              editable={editing}
            />
            <View style={styles.rowDivider} />

            <EditableRow
              label="Telefone"
              value={fields.emergencyPhone}
              onChangeText={set("emergencyPhone")}
              keyboardType="phone-pad"
              editable={editing}
            />
          </View>

          {/* ── Botão Salvar ── */}
          {editing && (
            <TouchableOpacity
              style={[styles.saveBtn, loading && styles.saveBtnDisabled]}
              onPress={handleSave}
              disabled={loading}
              activeOpacity={0.85}
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <>
                  <Ionicons name="checkmark-outline" size={18} color="#fff" />
                  <Text style={styles.saveBtnText}>Salvar alterações</Text>
                </>
              )}
            </TouchableOpacity>
          )}

          {/* ── Sair da conta ── */}
          {!editing && (
            <TouchableOpacity
              style={styles.logoutBtn}
              onPress={handleLogout}
              activeOpacity={0.85}
            >
              <Ionicons name="log-out-outline" size={18} color="#c0392b" />
              <Text style={styles.logoutBtnText}>Sair da conta</Text>
            </TouchableOpacity>
          )}
        </Animated.View>
      </ScrollView>
    </View>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────
const createStyles = (colors: ThemeColors) => StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.authBg,
  },

  // Header
  header: {
    backgroundColor: colors.primary,
    paddingTop: 52,
    paddingBottom: 16,
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
  editBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "rgba(255,255,255,0.18)",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
  },
  editBtnText: {
    color: colors.white,
    fontSize: 13,
    fontWeight: "700",
  },
  cancelBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
    backgroundColor: "rgba(255,255,255,0.18)",
  },
  cancelBtnText: {
    color: colors.white,
    fontSize: 13,
    fontWeight: "600",
  },

  // Avatar section
  avatarSection: {
    backgroundColor: colors.primary,
    alignItems: "center",
    paddingBottom: 28,
    paddingTop: 4,
  },
  avatar: {
    width: 76,
    height: 76,
    borderRadius: 24,
    backgroundColor: "rgba(255,255,255,0.2)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 10,
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.35)",
    overflow: "hidden",
  },
  avatarImg: { width: "100%", height: "100%" },
  avatarEditBadge: {
    position: "absolute",
    bottom: -2,
    right: -2,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.white,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: colors.primary,
  },
  avatarText: {
    fontSize: 26,
    fontWeight: "800",
    color: colors.white,
  },
  avatarName: {
    fontSize: 18,
    fontWeight: "800",
    color: colors.white,
    letterSpacing: -0.3,
  },
  avatarEmail: {
    fontSize: 13,
    color: "#b2dfcf",
    marginTop: 3,
  },

  // Scroll
  scroll: { flex: 1 },
  scrollContent: {
    padding: 20,
    paddingBottom: 48,
  },

  // Card
  card: {
    backgroundColor: colors.white,
    borderRadius: 20,
    padding: 18,
    marginBottom: 16,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 3,
  },

  // Section header
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 16,
  },
  sectionIconBox: {
    width: 26,
    height: 26,
    borderRadius: 8,
    backgroundColor: "#e8f7f1",
    alignItems: "center",
    justifyContent: "center",
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: "#1a3d31",
    letterSpacing: 0.1,
  },

  // Info row
  infoRow: {
    paddingVertical: 10,
  },
  infoLabel: {
    fontSize: 11,
    color: "#7aab96",
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 3,
  },
  infoValue: {
    fontSize: 15,
    color: "#1a3d31",
    fontWeight: "500",
  },
  infoValueMuted: {
    color: "#4a7a66",
  },

  // Editable row
  editableRow: {
    paddingVertical: 10,
  },
  editInput: {
    fontSize: 15,
    color: "#1a3d31",
    fontWeight: "500",
    borderBottomWidth: 1.5,
    borderBottomColor: colors.primary,
    paddingBottom: 4,
    paddingTop: 2,
  },

  // Divider
  rowDivider: {
    height: 1,
    backgroundColor: "#f0f8f4",
  },

  // Read-only badge
  readOnlyBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#f0faf5",
    alignSelf: "flex-start",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    marginBottom: 12,
  },
  readOnlyText: {
    fontSize: 11,
    color: "#7aab96",
    fontWeight: "600",
  },

  // Long text
  longText: {
    fontSize: 14,
    color: "#3a6054",
    lineHeight: 22,
  },

  // Save button
  saveBtn: {
    backgroundColor: colors.primary,
    borderRadius: 16,
    height: 54,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginTop: 4,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 6,
  },
  saveBtnDisabled: {
    opacity: 0.7,
  },
  saveBtnText: {
    color: colors.white,
    fontSize: 16,
    fontWeight: "700",
    letterSpacing: 0.2,
  },

  // Clinic (read-only) button
  clinicBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: colors.white,
    borderRadius: 20,
    padding: 18,
    marginBottom: 16,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 3,
  },
  clinicIconBox: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: "#e8f7f1",
    alignItems: "center",
    justifyContent: "center",
  },
  clinicBtnTextBox: { flex: 1 },
  clinicBtnTitle: { fontSize: 15, fontWeight: "700", color: "#1a3d31" },
  clinicBtnHint: { fontSize: 12, color: "#7aab96", fontWeight: "500", marginTop: 2 },

  // Logout button
  logoutBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    height: 52,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: "#f3c9c4",
    backgroundColor: "#fdf3f2",
    marginTop: 4,
  },
  logoutBtnText: {
    color: "#c0392b",
    fontSize: 15,
    fontWeight: "700",
  },
});
