import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import * as DocumentPicker from "expo-document-picker";
import React, { useEffect, useMemo, useRef, useState } from "react";
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
import { confirmAction } from "../../services/confirm";
import { TimeField } from "../../components/DateTimeField";
import {
  getClinicData,
  getMe,
  updateClinic,
  updateClinicLogo,
} from "../../services/api";

const MAX_WIDTH = 1120;

const CARD_SHADOW = {
  shadowColor: "#1f5442",
  shadowOpacity: 0.05,
  shadowRadius: 14,
  shadowOffset: { width: 0, height: 6 },
  elevation: 2,
} as const;

interface ClinicForm {
  name: string;
  address: string;
  phone: string;
  email: string;
  openingTime: string;
  closingTime: string;
}

const InputField = ({
  label,
  value,
  onChangeText,
  placeholder,
  keyboardType,
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder: string;
  keyboardType?: "default" | "email-address" | "phone-pad";
}) => {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <View style={styles.inputGroup}>
      <Text style={styles.inputLabel}>{label}</Text>
      <TextInput
        style={styles.input}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.placeholder}
        keyboardType={keyboardType ?? "default"}
      />
    </View>
  );
};

export default function AdminClinicManagementScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const emptyForm: ClinicForm = {
    name: "",
    address: "",
    phone: "",
    email: "",
    openingTime: "",
    closingTime: "",
  };

  const [form, setForm] = useState<ClinicForm>(emptyForm);
  const [loading, setLoading] = useState(false);
  const [loadingInitial, setLoadingInitial] = useState(true);
  const [clinicId, setClinicId] = useState<string | null>(null);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [logoBusy, setLogoBusy] = useState(false);

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

  // Carregamento de dados da clínica ao montar a tela
  useEffect(() => {
    const loadClinicData = async () => {
      try {
        setLoadingInitial(true);

        // 1. Busca usuário logado para obter clinic_id
        const meResult = await getMe();
        if (!meResult.ok || !meResult.data) {
          showAlert(
            "Erro",
            meResult.error ?? "Não foi possível carregar o perfil.",
          );
          return;
        }

        const cId = meResult.data.clinic;
        if (!cId) {
          showAlert("Erro", "Nenhuma clínica associada ao usuário.");
          return;
        }

        setClinicId(cId);

        // 2. Busca dados da clínica
        const clinicResult = await getClinicData(cId);
        if (!clinicResult.ok || !clinicResult.data) {
          showAlert(
            "Erro",
            clinicResult.error ??
              "Não foi possível carregar os dados da clínica.",
          );
          return;
        }

        const clinicData = clinicResult.data;
        setForm({
          name: clinicData.name || "",
          address: clinicData.address || "",
          phone: clinicData.phone || "",
          email: clinicData.email || "",
          openingTime: clinicData.open_from || "",
          closingTime: clinicData.open_until || "",
        });
        setLogoUrl(clinicData.logo || null);
      } catch (err: any) {
        showAlert(
          "Erro",
          err?.message ?? "Ocorreu um erro inesperado ao carregar dados.",
        );
      } finally {
        setLoadingInitial(false);
      }
    };

    void loadClinicData();
  }, []);

  const setField = (field: keyof ClinicForm) => (value: string) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  const handlePickLogo = async () => {
    if (!clinicId || logoBusy) return;
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: "image/*",
        copyToCacheDirectory: true,
      });
      if (result.canceled || !result.assets?.length) return;

      const asset = result.assets[0];
      setLogoBusy(true);
      const uploadResult = await updateClinicLogo(clinicId, {
        uri: asset.uri,
        name: asset.name || "logo.jpg",
        type: asset.mimeType || "image/jpeg",
      });
      setLogoBusy(false);

      if (!uploadResult.ok) {
        showToast(uploadResult.error || "Não foi possível salvar a logo.", "error");
        return;
      }
      setLogoUrl(uploadResult.data?.logo || null);
      showToast("Logo da clínica atualizada.", "success");
    } catch {
      setLogoBusy(false);
      showAlert("Erro", "Não foi possível selecionar a imagem.");
    }
  };

  const handleRemoveLogo = () => {
    if (!clinicId || logoBusy) return;
    confirmAction(
      "Remover logo",
      "Tem certeza que deseja remover a logo da clínica?",
      async () => {
        setLogoBusy(true);
        const result = await updateClinicLogo(clinicId, null);
        setLogoBusy(false);
        if (!result.ok) {
          showToast(result.error || "Não foi possível remover a logo.", "error");
          return;
        }
        setLogoUrl(null);
        showToast("Logo removida.", "success");
      },
      { confirmText: "Remover", cancelText: "Cancelar" },
    );
  };

  const handleSave = async () => {
    if (!clinicId) {
      showAlert("Erro", "Clínica não identificada.");
      return;
    }

    // Validação simples
    if (form.openingTime >= form.closingTime) {
      showAlert(
        "Erro",
        "O horário de abertura deve ser antes do fechamento.",
      );
      return;
    }

    setLoading(true);

    try {
      const result = await updateClinic(clinicId, {
        name: form.name,
        address: form.address,
        phone: form.phone,
        email: form.email,
        open_from: form.openingTime,
        open_until: form.closingTime,
      });

      if (!result.ok) {
        showAlert(
          "Erro",
          result.error ?? "Não foi possível salvar os dados.",
        );
        return;
      }

      showAlert(
        "Sucesso",
        "As informações da clínica foram salvas com sucesso.",
      );
    } catch (err: any) {
      showAlert("Erro", err?.message ?? "Ocorreu um erro inesperado.");
    } finally {
      setLoading(false);
    }
  };

  const Header = () => (
    <View style={styles.header}>
      <View style={styles.headerInner}>
        <TouchableOpacity style={styles.iconBtn} onPress={() => router.back()}>
          <Ionicons name="arrow-back-outline" size={22} color="#fff" />
        </TouchableOpacity>
        <View style={styles.headerTextBox}>
          <Text style={styles.headerTitle}>Gerenciamento</Text>
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
            <Text style={styles.sectionTitle}>Logo da clínica</Text>
            <Text style={styles.sectionSubtitle}>
              Aparece no perfil da clínica. Formatos de imagem, até 5MB.
            </Text>

            <View style={styles.logoRow}>
              <View style={styles.logoPreview}>
                {logoBusy ? (
                  <ActivityIndicator size="small" color={colors.primary} />
                ) : logoUrl ? (
                  <Image source={{ uri: logoUrl }} style={styles.logoImg} />
                ) : (
                  <Ionicons name="business-outline" size={30} color={colors.placeholder} />
                )}
              </View>
              <View style={styles.logoActions}>
                <TouchableOpacity
                  style={styles.logoBtn}
                  onPress={handlePickLogo}
                  activeOpacity={0.85}
                  disabled={logoBusy}
                >
                  <Ionicons name="image-outline" size={16} color={colors.primary} />
                  <Text style={styles.logoBtnText}>
                    {logoUrl ? "Trocar logo" : "Selecionar logo"}
                  </Text>
                </TouchableOpacity>
                {logoUrl && (
                  <TouchableOpacity
                    style={styles.logoRemove}
                    onPress={handleRemoveLogo}
                    activeOpacity={0.85}
                    disabled={logoBusy}
                  >
                    <Ionicons name="trash-outline" size={15} color="#d95c5c" />
                    <Text style={styles.logoRemoveText}>Remover</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          </View>

          <View style={styles.formCard}>
            <Text style={styles.sectionTitle}>Informações da clínica</Text>

            <InputField
              label="Nome da clínica"
              value={form.name}
              onChangeText={setField("name")}
              placeholder="Digite o nome da clínica"
            />

            <InputField
              label="Endereço"
              value={form.address}
              onChangeText={setField("address")}
              placeholder="Digite o endereço"
            />

            <InputField
              label="Telefone"
              value={form.phone}
              onChangeText={setField("phone")}
              placeholder="Digite o telefone"
              keyboardType="phone-pad"
            />

            <InputField
              label="E-mail"
              value={form.email}
              onChangeText={setField("email")}
              placeholder="Digite o e-mail"
              keyboardType="email-address"
            />
          </View>

          <View style={styles.formCard}>
            <Text style={styles.sectionTitle}>Horário de funcionamento</Text>
            <Text style={styles.sectionSubtitle}>
              Defina os horários padrão de abertura e fechamento da clínica.
            </Text>

            <View style={styles.timeRow}>
              <View style={styles.timeCard}>
                <Text style={styles.inputLabel}>Abertura</Text>
                <TimeField
                  value={form.openingTime}
                  onChange={setField("openingTime")}
                />
              </View>

              <View style={styles.timeCard}>
                <Text style={styles.inputLabel}>Fechamento</Text>
                <TimeField
                  value={form.closingTime}
                  onChange={setField("closingTime")}
                />
              </View>
            </View>
          </View>

          <TouchableOpacity
            style={[styles.saveButton, loading && styles.saveButtonDisabled]}
            onPress={handleSave}
            activeOpacity={0.85}
            disabled={loading}
          >
            <Ionicons name="save-outline" size={18} color="#fff" />
            <Text style={styles.saveButtonText}>
              {loading ? "Salvando..." : "Salvar alterações"}
            </Text>
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
    sectionTitle: { fontSize: 16, fontWeight: "800", color: colors.textDark, marginBottom: 12, letterSpacing: -0.2 },
    sectionSubtitle: { fontSize: 13, lineHeight: 19, color: colors.textMuted, marginBottom: 14 },
    logoRow: { flexDirection: "row", alignItems: "center", gap: 16, marginTop: 4 },
    logoPreview: {
      width: 76, height: 76, borderRadius: 18, backgroundColor: "#f6faf8",
      borderWidth: 1, borderColor: colors.border, alignItems: "center", justifyContent: "center",
      overflow: "hidden",
    },
    logoImg: { width: "100%", height: "100%" },
    logoActions: { flex: 1, gap: 8 },
    logoBtn: {
      flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
      borderRadius: 12, borderWidth: 1.5, borderColor: colors.primary, backgroundColor: colors.primaryTint,
      paddingVertical: 11, paddingHorizontal: 14, alignSelf: "flex-start",
    },
    logoBtnText: { fontSize: 14, fontWeight: "700", color: colors.primary },
    logoRemove: {
      flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-start",
      paddingVertical: 4, paddingHorizontal: 4,
    },
    logoRemoveText: { fontSize: 13, fontWeight: "600", color: "#d95c5c" },
    inputGroup: { marginBottom: 14 },
    inputLabel: {
      fontSize: 12, fontWeight: "700", color: "#5f7d70", marginBottom: 8,
      textTransform: "uppercase", letterSpacing: 0.5,
    },
    input: {
      minHeight: 50, borderRadius: 12, borderWidth: 1, borderColor: colors.border,
      backgroundColor: "#f6faf8", paddingHorizontal: 16, fontSize: 15, color: colors.textDark, fontWeight: "500",
      // @ts-ignore — remove o contorno azul no web
      outlineStyle: "none",
    },
    timeRow: { flexDirection: "row", gap: 12 },
    timeCard: { flex: 1 },
    saveButton: {
      height: 54, borderRadius: 14, backgroundColor: colors.primary,
      flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    },
    saveButtonDisabled: { opacity: 0.75 },
    saveButtonText: { color: colors.white, fontSize: 16, fontWeight: "800" },
  });
