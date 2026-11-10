import { Ionicons } from "@expo/vector-icons";
import Constants from "expo-constants";
import { router } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Linking,
  Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import AppearanceSettings from "../../components/AppearanceSettings";
import { ThemeColors } from "../../constants/theme-palettes";
import { useTheme } from "../../contexts/ThemeContext";
import {
  clearAllChatMessages,
  deleteAllNotifications,
  getMe,
  isPushEnabled,
  logout,
  unregisterDeviceToken,
} from "../../services/api";
import { showConfirm, showToast } from "../../services/feedback";
import { registerForPushNotifications } from "../../services/push";

// Cor fixa de perigo/destrutiva — não muda com a paleta da clínica.
const DANGER = "#c0392b";
const MAX_WIDTH = 720;

// E-mail de suporte (placeholder até a clínica definir o oficial).
const SUPPORT_EMAIL = "suporte@clinica.com.br";

const CARD_SHADOW = {
  shadowColor: "#1f5442",
  shadowOpacity: 0.05,
  shadowRadius: 14,
  shadowOffset: { width: 0, height: 6 },
  elevation: 2,
} as const;

const isWeb = Platform.OS === "web";

export default function SettingsScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [role, setRole] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [pushOn, setPushOn] = useState(false);
  const [pushBusy, setPushBusy] = useState(false);

  const appVersion =
    (Constants.expoConfig as any)?.version ??
    (Constants as any)?.manifest?.version ??
    "1.0.0";

  useEffect(() => {
    const init = async () => {
      const me = await getMe();
      if (me.ok && me.data?.role) setRole(String(me.data.role).toLowerCase());
      if (!isWeb) setPushOn(await isPushEnabled());
      setLoading(false);
    };
    void init();
  }, []);

  // Rota da tela de perfil conforme o papel. Admin não tem perfil editável.
  const profileRoute =
    role === "patient"
      ? "/(patient)/perfil"
      : role === "professional" || role === "psychologist"
        ? "/(psychologist)/perfilP"
        : null;

  const handleTogglePush = async (next: boolean) => {
    setPushBusy(true);
    if (next) {
      const token = await registerForPushNotifications();
      if (token) {
        setPushOn(true);
        showToast("Notificações push ativadas.", "success");
      } else {
        setPushOn(false);
        showToast("Não foi possível ativar. Verifique a permissão do sistema.", "error");
      }
    } else {
      await unregisterDeviceToken();
      setPushOn(false);
      showToast("Notificações push desativadas.", "info");
    }
    setPushBusy(false);
  };

  const handleLogout = () => {
    showConfirm({
      title: "Deseja sair da sua conta?",
      message: "Você será desconectado e precisará fazer login novamente.",
      confirmText: "Sair",
      destructive: true,
      onConfirm: async () => {
        try {
          await logout();
        } finally {
          router.replace("/login");
        }
      },
    });
  };

  const handleClearNotifications = () => {
    showConfirm({
      title: "Apagar todas as notificações?",
      message: "Todas as suas notificações serão removidas. Esta ação não pode ser desfeita.",
      confirmText: "Apagar",
      destructive: true,
      onConfirm: async () => {
        const result = await deleteAllNotifications();
        showToast(
          result.ok ? "Notificações apagadas." : result.error || "Não foi possível apagar.",
          result.ok ? "success" : "error",
        );
      },
    });
  };

  const handleClearChat = () => {
    showConfirm({
      title: "Apagar todas as mensagens?",
      message:
        "Todas as mensagens de todas as suas conversas serão removidas apenas para você. Os outros participantes continuarão vendo as mensagens.",
      confirmText: "Apagar",
      destructive: true,
      onConfirm: async () => {
        const result = await clearAllChatMessages();
        showToast(
          result.ok ? "Mensagens apagadas." : result.error || "Não foi possível apagar.",
          result.ok ? "success" : "error",
        );
      },
    });
  };

  const openSupportEmail = () => {
    Linking.openURL(
      `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent("Suporte - Sistema Clínico")}`,
    ).catch(() => showToast("Não foi possível abrir o app de e-mail.", "error"));
  };

  return (
    <View style={styles.screen}>
      <StatusBar barStyle="light-content" backgroundColor={colors.primary} />

      <View style={styles.header}>
        <View style={styles.headerInner}>
          <TouchableOpacity style={styles.iconBtn} onPress={() => router.back()}>
            <Ionicons name="arrow-back-outline" size={22} color={colors.white} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Configurações</Text>
          <View style={styles.iconBtn} />
        </View>
      </View>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
          {/* ── Conta ── */}
          <Text style={styles.sectionTitle}>Conta</Text>
          <View style={styles.card}>
            {profileRoute && (
              <Row
                icon="person-outline"
                label="Editar perfil"
                onPress={() => router.push(profileRoute as any)}
              />
            )}
            <Row
              icon="lock-closed-outline"
              label="Alterar senha"
              onPress={() => router.push("/(shared)/alterar-senha" as any)}
              last={false}
            />
            <Row
              icon="log-out-outline"
              label="Sair"
              danger
              onPress={handleLogout}
              hideChevron
              last
            />
          </View>

          {/* ── Notificações ── */}
          <Text style={styles.sectionTitle}>Notificações</Text>
          <View style={styles.card}>
            <View style={[styles.row, styles.rowLast]}>
              <View style={[styles.rowIcon, { backgroundColor: colors.primaryTint }]}>
                <Ionicons name="notifications-outline" size={19} color={colors.primary} />
              </View>
              <View style={styles.rowTextBox}>
                <Text style={styles.rowLabel}>Notificações push</Text>
                {isWeb ? (
                  <Text style={styles.rowHint}>Disponível apenas no app para celular.</Text>
                ) : (
                  <Text style={styles.rowHint}>
                    Avisos de consultas e mensagens neste aparelho.
                  </Text>
                )}
              </View>
              {isWeb ? (
                <Text style={styles.badge}>Mobile</Text>
              ) : pushBusy ? (
                <ActivityIndicator color={colors.primary} />
              ) : (
                <Switch
                  value={pushOn}
                  onValueChange={handleTogglePush}
                  trackColor={{ false: colors.primaryTint, true: colors.primary }}
                  thumbColor={colors.white}
                />
              )}
            </View>
          </View>

          {/* ── Aparência (só admin) ── */}
          {role === "admin" && <AppearanceSettings />}

          {/* ── Dados ── */}
          <Text style={styles.sectionTitle}>Dados</Text>
          <View style={styles.card}>
            <Row
              icon="notifications-off-outline"
              label="Apagar todas as notificações"
              onPress={handleClearNotifications}
              danger
              hideChevron
            />
            <Row
              icon="trash-outline"
              label="Apagar todas as mensagens"
              onPress={handleClearChat}
              danger
              hideChevron
              last
            />
          </View>

          {/* ── Ajuda ── */}
          <Text style={styles.sectionTitle}>Ajuda</Text>
          <View style={styles.card}>
            <Row
              icon="help-circle-outline"
              label="Perguntas frequentes"
              onPress={() => router.push("/(shared)/ajuda" as any)}
              last
            />
          </View>

          {/* ── Privacidade e Termos ── */}
          <Text style={styles.sectionTitle}>Privacidade e Termos</Text>
          <View style={styles.card}>
            <Row
              icon="document-text-outline"
              label="Termos de Uso"
              onPress={() => router.push("/(shared)/termos" as any)}
            />
            <Row
              icon="shield-checkmark-outline"
              label="Política de Privacidade"
              onPress={() => router.push("/(shared)/privacidade" as any)}
              last
            />
          </View>

          {/* ── Sobre ── */}
          <Text style={styles.sectionTitle}>Sobre</Text>
          <View style={styles.card}>
            <View style={styles.row}>
              <View style={[styles.rowIcon, { backgroundColor: colors.primaryTint }]}>
                <Ionicons name="information-circle-outline" size={19} color={colors.primary} />
              </View>
              <View style={styles.rowTextBox}>
                <Text style={styles.rowLabel}>Versão do app</Text>
              </View>
              <Text style={styles.rowValue}>{appVersion}</Text>
            </View>
            <Row
              icon="mail-outline"
              label="Contato e suporte"
              onPress={openSupportEmail}
              last
            />
          </View>

          <Text style={styles.footer}>Sistema Clínico • {SUPPORT_EMAIL}</Text>
        </ScrollView>
      )}
    </View>
  );
}

// ─── Linha de opção reutilizável ──────────────────────────────────────────────
const Row = ({
  icon,
  label,
  onPress,
  danger,
  hideChevron,
  last,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  danger?: boolean;
  hideChevron?: boolean;
  last?: boolean;
}) => {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <TouchableOpacity
      style={[styles.row, last && styles.rowLast]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <View style={[styles.rowIcon, { backgroundColor: danger ? "#fbeae8" : colors.primaryTint }]}>
        <Ionicons name={icon} size={19} color={danger ? DANGER : colors.primary} />
      </View>
      <View style={styles.rowTextBox}>
        <Text style={[styles.rowLabel, danger && { color: DANGER }]}>{label}</Text>
      </View>
      {!hideChevron && <Ionicons name="chevron-forward" size={18} color="#b5cabf" />}
    </TouchableOpacity>
  );
};

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.pageBg },
    header: { backgroundColor: colors.primary, paddingTop: 52, paddingBottom: 20 },
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
    headerTitle: { color: colors.white, fontSize: 21, fontWeight: "800", letterSpacing: -0.3 },
    scroll: { flex: 1 },
    scrollContent: {
      paddingHorizontal: 20,
      paddingTop: 20,
      paddingBottom: 44,
      maxWidth: MAX_WIDTH,
      alignSelf: "center" as const,
      width: "100%" as const,
    },
    loadingContainer: { flex: 1, alignItems: "center", justifyContent: "center" },
    sectionTitle: {
      fontSize: 13,
      fontWeight: "800",
      color: colors.textMuted,
      textTransform: "uppercase",
      letterSpacing: 0.4,
      marginBottom: 10,
      marginTop: 18,
      marginLeft: 4,
    },
    card: {
      backgroundColor: colors.white,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.border,
      overflow: "hidden",
      ...CARD_SHADOW,
    },
    row: {
      flexDirection: "row",
      alignItems: "center",
      gap: 14,
      paddingHorizontal: 16,
      paddingVertical: 14,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    rowLast: { borderBottomWidth: 0 },
    rowIcon: {
      width: 38,
      height: 38,
      borderRadius: 11,
      alignItems: "center",
      justifyContent: "center",
    },
    rowTextBox: { flex: 1 },
    rowLabel: { fontSize: 15, fontWeight: "700", color: colors.textDark },
    rowHint: { fontSize: 12, color: colors.textMuted, marginTop: 2, fontWeight: "500" },
    rowValue: { fontSize: 14, color: colors.textMuted, fontWeight: "700" },
    badge: {
      fontSize: 11,
      fontWeight: "800",
      color: colors.primary,
      backgroundColor: colors.primaryTint,
      overflow: "hidden",
      borderRadius: 8,
      paddingHorizontal: 9,
      paddingVertical: 4,
    },
    footer: {
      textAlign: "center",
      color: "#9db8ac",
      fontSize: 12,
      fontWeight: "600",
      marginTop: 26,
    },
  });
