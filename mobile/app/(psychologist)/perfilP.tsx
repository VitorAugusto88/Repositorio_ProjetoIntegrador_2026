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
import {
  getMe,
  getPsychologists,
  logout,
  updateMe,
  updateProfessionalProfile,
  updateProfessionalProfilePhoto,
} from "../../services/api";
import { confirmAction } from "../../services/confirm";

// ─── Types ────────────────────────────────────────────────────────────────────
interface EditableFields {
  name: string;
  phone: string;
  crp: string;
  specialty: string;
  bio: string;
}

const MAX_WIDTH = 1120;

interface EditableRowProps {
  label: string;
  value: string;
  onChangeText: (val: string) => void;
  keyboardType?: "default" | "phone-pad" | "numeric";
  editable: boolean;
  multiline?: boolean;
  readOnly?: boolean;
}

// Componentes no escopo do módulo (não dentro do componente principal) para
// não perder identidade/estado do TextInput a cada re-render do pai — cada um
// lê a paleta da clínica direto via useTheme().
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

const EditableRow = ({
  label,
  value,
  onChangeText,
  keyboardType,
  editable,
  multiline,
  readOnly,
}: EditableRowProps) => {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <View style={styles.editableRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      {editable && !readOnly ? (
        <TextInput
          style={[styles.editInput, multiline && styles.editInputMultiline]}
          value={value}
          onChangeText={onChangeText}
          keyboardType={keyboardType ?? "default"}
          autoCapitalize="none"
          placeholderTextColor={colors.placeholder}
          multiline={multiline}
          numberOfLines={multiline ? 3 : 1}
        />
      ) : (
        <Text style={[styles.infoValue, readOnly && styles.infoValueMuted]}>
          {value || "—"}
        </Text>
      )}
    </View>
  );
};

// ─── Main Screen ──────────────────────────────────────────────────────────────
export default function PsychologistProfileScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [email, setEmail] = useState("");
  const [professionalId, setProfessionalId] = useState("");
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [fields, setFields] = useState<EditableFields>({
    name: "",
    phone: "",
    crp: "",
    specialty: "",
    bio: "",
  });
  const [original, setOriginal] = useState<EditableFields>({ ...fields });

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(20)).current;

  React.useEffect(() => {
    const loadProfile = async () => {
      setLoading(true);
      const meResult = await getMe();
      if (!meResult.ok || !meResult.data?.id) {
        showAlert("Erro", meResult.error || "Não foi possível carregar o perfil.");
        setLoading(false);
        return;
      }

      const profsResult = await getPsychologists();
      const myProfile = profsResult.data?.find(
        (p: any) => p.user.id === meResult.data.id,
      );

      if (myProfile) {
        setProfessionalId(myProfile.id);
        const loaded: EditableFields = {
          name: meResult.data.full_name || meResult.data.name || "",
          phone: meResult.data.phone || "",
          crp: myProfile.crp || "",
          specialty: myProfile.specialty || "",
          bio: myProfile.bio || "",
        };
        setFields(loaded);
        setOriginal(loaded);
        setEmail(meResult.data.email || "");
        setPhotoUrl(myProfile.photo || null);
      }

      setLoading(false);
    };

    void loadProfile();
  }, []);

  React.useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 500, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 0, duration: 500, useNativeDriver: true }),
    ]).start();
  }, [fadeAnim, slideAnim]);

  const set = (field: keyof EditableFields) => (val: string) =>
    setFields((prev) => ({ ...prev, [field]: val }));

  const handleEdit = () => {
    setOriginal({ ...fields });
    setEditing(true);
  };

  const handleCancel = () => {
    setFields({ ...original });
    setEditing(false);
  };

  const doPickPhoto = async () => {
    if (!professionalId || photoBusy) return;
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: "image/*",
        copyToCacheDirectory: true,
      });
      if (result.canceled || !result.assets?.length) return;

      const asset = result.assets[0];
      setPhotoBusy(true);
      const uploadResult = await updateProfessionalProfilePhoto(professionalId, {
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
    if (!professionalId || photoBusy) return;
    confirmAction(
      "Remover foto",
      "Tem certeza que deseja remover sua foto de perfil?",
      async () => {
        setPhotoBusy(true);
        const result = await updateProfessionalProfilePhoto(professionalId, null);
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

  const handleSave = async () => {
    setSaving(true);
    try {
      const meUpdate = await updateMe({ full_name: fields.name, phone: fields.phone });
      if (!meUpdate.ok) {
        showAlert("Erro", meUpdate.error || "Não foi possível salvar nome/telefone.");
        return;
      }

      if (professionalId) {
        const profUpdate = await updateProfessionalProfile(professionalId, {
          crp: fields.crp || undefined,
          specialty: fields.specialty || undefined,
          bio: fields.bio || undefined,
        });
        if (!profUpdate.ok) {
          showAlert("Erro", profUpdate.error || "Não foi possível salvar perfil profissional.");
          return;
        }
      }

      setOriginal({ ...fields });
      setEditing(false);
      showAlert("Sucesso", "Perfil atualizado com sucesso!");
    } catch {
      showAlert("Erro", "Não foi possível salvar as alterações.");
    } finally {
      setSaving(false);
    }
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

  const initials = fields.name
    .split(" ")
    .filter((n) => n.length > 1)
    .slice(0, 2)
    .map((n) => n[0])
    .join("")
    .toUpperCase();

  return (
    <View style={styles.screen}>
      <StatusBar barStyle="light-content" backgroundColor={colors.primary} />

      {/* ── Header ── */}
      <View style={styles.header}>
        <View style={styles.headerInner}>
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
            <Text style={styles.avatarText}>{initials || "P"}</Text>
          )}
          {!loading && (
            <View style={styles.avatarEditBadge}>
              <Ionicons name="camera-outline" size={13} color={colors.primary} />
            </View>
          )}
        </TouchableOpacity>
        <Text style={styles.avatarName}>{fields.name || "Profissional"}</Text>
        <Text style={styles.avatarEmail}>{email || "carregando..."}</Text>
        {fields.crp ? (
          <View style={styles.crpBadge}>
            <Ionicons name="ribbon-outline" size={12} color={colors.primary} />
            <Text style={styles.crpBadgeText}>CRP {fields.crp}</Text>
          </View>
        ) : null}
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <Animated.View style={{ opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}>

          {/* ── Dados Pessoais ── */}
          <View style={styles.card}>
            <SectionHeader icon="person-outline" title="Dados Pessoais" />
            <EditableRow label="Nome completo" value={fields.name} onChangeText={set("name")} editable={editing} />
            <View style={styles.rowDivider} />
            <EditableRow label="E-mail" value={email} onChangeText={() => {}} editable={editing} readOnly />
            <View style={styles.rowDivider} />
            <EditableRow label="Telefone" value={fields.phone} onChangeText={set("phone")} keyboardType="phone-pad" editable={editing} />
          </View>

          {/* ── Dados Profissionais ── */}
          <View style={styles.card}>
            <SectionHeader icon="briefcase-outline" title="Dados Profissionais" />
            <EditableRow label="CRP" value={fields.crp} onChangeText={set("crp")} editable={editing} />
            <View style={styles.rowDivider} />
            <EditableRow label="Especialidade" value={fields.specialty} onChangeText={set("specialty")} editable={editing} />
            <View style={styles.rowDivider} />
            <EditableRow label="Bio / Apresentação" value={fields.bio} onChangeText={set("bio")} editable={editing} multiline />
          </View>


          {/* ── Botão Sair ── */}
          {!editing && (
            <TouchableOpacity
              style={styles.logoutBtn}
              onPress={handleLogout}
              activeOpacity={0.85}
            >
              <Ionicons name="log-out-outline" size={18} color="#e05c5c" />
              <Text style={styles.logoutBtnText}>Sair da conta</Text>
            </TouchableOpacity>
          )}

          {/* ── Botão Salvar ── */}
          {editing && (
            <TouchableOpacity
              style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
              onPress={handleSave}
              disabled={saving}
              activeOpacity={0.85}
            >
              {saving ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <>
                  <Ionicons name="checkmark-outline" size={18} color="#fff" />
                  <Text style={styles.saveBtnText}>Salvar alterações</Text>
                </>
              )}
            </TouchableOpacity>
          )}

        </Animated.View>
      </ScrollView>
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
    width: 36, height: 36, borderRadius: 10,
    backgroundColor: "rgba(255,255,255,0.15)",
    alignItems: "center", justifyContent: "center",
  },
  headerTitle: { fontSize: 17, fontWeight: "700", color: colors.white, letterSpacing: 0.2 },
  editBtn: {
    flexDirection: "row", alignItems: "center", gap: 5,
    backgroundColor: "rgba(255,255,255,0.18)",
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 10,
  },
  editBtnText: { color: colors.white, fontSize: 13, fontWeight: "700" },
  cancelBtn: {
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 10,
    backgroundColor: "rgba(255,255,255,0.18)",
  },
  cancelBtnText: { color: colors.white, fontSize: 13, fontWeight: "600" },

  avatarSection: {
    backgroundColor: colors.primary, alignItems: "center", paddingBottom: 28, paddingTop: 4,
  },
  avatar: {
    width: 76, height: 76, borderRadius: 24,
    backgroundColor: "rgba(255,255,255,0.2)",
    alignItems: "center", justifyContent: "center",
    marginBottom: 10, borderWidth: 2, borderColor: "rgba(255,255,255,0.35)",
    overflow: "hidden",
  },
  avatarImg: { width: "100%", height: "100%" },
  avatarEditBadge: {
    position: "absolute", bottom: -2, right: -2,
    width: 24, height: 24, borderRadius: 12, backgroundColor: colors.white,
    alignItems: "center", justifyContent: "center",
    borderWidth: 2, borderColor: colors.primary,
  },
  avatarText: { fontSize: 26, fontWeight: "800", color: colors.white },
  avatarName: { fontSize: 18, fontWeight: "800", color: colors.white, letterSpacing: -0.3 },
  avatarEmail: { fontSize: 13, color: "#b2dfcf", marginTop: 3 },
  crpBadge: {
    marginTop: 8, flexDirection: "row", alignItems: "center", gap: 5,
    backgroundColor: "rgba(255,255,255,0.18)",
    paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999,
  },
  crpBadgeText: { fontSize: 12, fontWeight: "700", color: colors.white },

  scroll: { flex: 1 },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 48,
    width: "100%",
    maxWidth: MAX_WIDTH,
    alignSelf: "center",
  },

  card: {
    backgroundColor: colors.white, borderRadius: 16, padding: 18, marginBottom: 16,
    borderWidth: 1, borderColor: colors.border,
    shadowColor: "#1f5442", shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.05, shadowRadius: 14, elevation: 2,
  },

  sectionHeader: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 16 },
  sectionIconBox: {
    width: 26, height: 26, borderRadius: 8, backgroundColor: colors.primaryTint,
    alignItems: "center", justifyContent: "center",
  },
  sectionTitle: { fontSize: 14, fontWeight: "700", color: "#1a3d31", letterSpacing: 0.1 },

  infoLabel: {
    fontSize: 11, color: "#7aab96", fontWeight: "600",
    textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 3,
  },
  infoValue: { fontSize: 15, color: "#1a3d31", fontWeight: "500" },
  infoValueMuted: { color: "#4a7a66" },

  editableRow: { paddingVertical: 10 },
  editInput: {
    fontSize: 15, color: "#1a3d31", fontWeight: "500",
    borderBottomWidth: 1.5, borderBottomColor: colors.primary,
    paddingBottom: 4, paddingTop: 2,
  },
  editInputMultiline: {
    minHeight: 60, borderWidth: 1.5, borderColor: colors.primary,
    borderRadius: 8, padding: 8, borderBottomWidth: 1.5,
  },

  rowDivider: { height: 1, backgroundColor: "#f0f8f4" },

  availabilityLink: {
    backgroundColor: colors.white, borderRadius: 20, padding: 18, marginBottom: 16,
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    shadowColor: colors.primary, shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08, shadowRadius: 12, elevation: 3,
  },
  availabilityLinkLeft: { flexDirection: "row", alignItems: "center", gap: 14 },
  availabilityLinkIcon: {
    width: 44, height: 44, borderRadius: 14, backgroundColor: colors.primaryTint,
    alignItems: "center", justifyContent: "center",
  },
  availabilityLinkTitle: { fontSize: 15, fontWeight: "700", color: "#1a3d31" },
  availabilityLinkSub: { fontSize: 12, color: "#7aab96", marginTop: 2 },

  saveBtn: {
    backgroundColor: colors.primary, borderRadius: 16, height: 54,
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    marginTop: 4, marginBottom: 16,
    shadowColor: colors.primary, shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35, shadowRadius: 12, elevation: 6,
  },
  saveBtnDisabled: { opacity: 0.7 },
  saveBtnText: { color: colors.white, fontSize: 16, fontWeight: "700", letterSpacing: 0.2 },

  logoutBtn: {
    borderRadius: 16,
    height: 50,
    borderWidth: 1.5,
    borderColor: "#f5d0d0",
    backgroundColor: "#fff8f8",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginTop: 4,
    marginBottom: 16,
  },
  logoutBtnText: { color: "#e05c5c", fontSize: 15, fontWeight: "700" },
});