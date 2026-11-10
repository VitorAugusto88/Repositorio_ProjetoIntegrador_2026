import { Ionicons } from "@expo/vector-icons";
import { router, useFocusEffect } from "expo-router";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
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
import { showAlert } from "../../services/feedback";
import {
  getClinicData,
  getClinicStats,
  getMe,
  getUnreadNotifications,
  logout,
} from "../../services/api";
import { confirmAction } from "../../services/confirm";

// ─── Cores semânticas fixas (categorias de atalho, não mudam com a paleta) ────
const BLUE = "#2d6cdf";
const BLUE_LIGHT = "#eaf1ff";
const ORANGE = "#c46a1a";
const ORANGE_LIGHT = "#fef3e8";
const PURPLE = "#7c3aed";
const PURPLE_LIGHT = "#f3eeff";
const TEAL = "#0d9488";
const TEAL_LIGHT = "#e3f4f1";
const RED = "#d95c5c";
const RED_LIGHT = "#fdeeee";

const MAX_WIDTH = 1120;
const DESKTOP_BREAKPOINT = 900;

const CARD_SHADOW = {
  shadowColor: "#1f5442",
  shadowOpacity: 0.05,
  shadowRadius: 14,
  shadowOffset: { width: 0, height: 6 },
  elevation: 2,
} as const;

// ─── Tipagens ─────────────────────────────────────────────────────────────────
interface ClinicStats {
  total_appointments: number;
  completed_appointments: number;
  cancelled_appointments: number;
  total_patients: number;
  total_professionals: number;
}

// ─── Atalhos administrativos ──────────────────────────────────────────────────
// GREEN/GREEN_LIGHT (marca da clínica) entram aqui como parâmetros porque
// mudam conforme a paleta escolhida pelo admin — as demais cores são fixas.
const buildQuickActions = (green: string, greenLight: string) => [
  {
    id: "consultas",
    title: "Consultas",
    description: "Supervisione a agenda e o status dos atendimentos.",
    icon: "calendar-outline",
    color: BLUE,
    bg: BLUE_LIGHT,
    route: "/(admin)/consultas",
  },
  {
    id: "agendar",
    title: "Agendar",
    description: "Marque uma nova consulta para um paciente.",
    icon: "add-circle-outline",
    color: green,
    bg: greenLight,
    route: "/(admin)/agendar",
  },
  {
    id: "salas",
    title: "Salas",
    description: "Gerencie salas e consulte a disponibilidade.",
    icon: "business-outline",
    color: TEAL,
    bg: TEAL_LIGHT,
    route: "/(admin)/salas",
  },
  {
    id: "pacientes",
    title: "Pacientes",
    description: "Liste, busque e acompanhe os pacientes da clínica.",
    icon: "people-outline",
    color: green,
    bg: greenLight,
    route: "/(admin)/pacientes",
  },
  {
    id: "psicologos",
    title: "Psicólogos",
    description: "Cadastro e acompanhamento dos profissionais.",
    icon: "medkit-outline",
    color: ORANGE,
    bg: ORANGE_LIGHT,
    route: "/(admin)/psicologo",
  },
  {
    id: "usuarios",
    title: "Usuários",
    description: "Gerencie contas, papéis e status de acesso.",
    icon: "people-circle-outline",
    color: PURPLE,
    bg: PURPLE_LIGHT,
    route: "/(admin)/usuario",
  },
  {
    id: "documentos",
    title: "Documentos",
    description: "Documentos administrativos da clínica (sem vínculo com pacientes).",
    icon: "folder-outline",
    color: BLUE,
    bg: BLUE_LIGHT,
    route: "/(admin)/documentos",
  },
  {
    id: "relatorios",
    title: "Relatórios",
    description: "Indicadores, relatórios e exportações da clínica.",
    icon: "stats-chart-outline",
    color: TEAL,
    bg: TEAL_LIGHT,
    route: "/(admin)/relatorios",
  },
  {
    id: "gerenciamento",
    title: "Gerenciamento",
    description: "Dados da clínica e horário de funcionamento.",
    icon: "settings-outline",
    color: PURPLE,
    bg: PURPLE_LIGHT,
    route: "/(admin)/gerenciamento",
  },
  {
    id: "chat",
    title: "Chat",
    description: "Converse com pacientes e profissionais.",
    icon: "chatbubble-ellipses-outline",
    color: ORANGE,
    bg: ORANGE_LIGHT,
    route: "/(shared)/chat",
  },
];

export default function AdminDashboardScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const QUICK_ACTIONS = useMemo(
    () => buildQuickActions(colors.primary, colors.primaryTint),
    [colors],
  );

  const [adminName, setAdminName] = useState("Administrador");
  const [clinicName, setClinicName] = useState("");
  const [stats, setStats] = useState<ClinicStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [unreadCount, setUnreadCount] = useState(0);

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(24)).current;

  const { width } = useWindowDimensions();
  const isDesktop = width >= DESKTOP_BREAKPOINT;

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      try {
        const meResult = await getMe();
        if (!meResult.ok || !meResult.data) {
          showAlert("Erro", meResult.error || "Erro ao carregar perfil.");
          return;
        }
        setAdminName(
          meResult.data.full_name || meResult.data.name || "Administrador",
        );

        const clinicId = meResult.data.clinic;
        if (!clinicId) {
          showAlert("Erro", "Nenhuma clínica associada ao usuário.");
          return;
        }

        const [statsResult, clinicResult] = await Promise.all([
          getClinicStats(clinicId),
          getClinicData(clinicId),
        ]);

        if (statsResult.ok && statsResult.data) {
          setStats(statsResult.data as ClinicStats);
        } else {
          showAlert(
            "Erro",
            statsResult.error || "Erro ao carregar indicadores.",
          );
        }
        if (clinicResult.ok && clinicResult.data) {
          setClinicName((clinicResult.data as { name?: string }).name || "");
        }
      } catch {
        showAlert("Erro", "Erro inesperado ao carregar dados.");
      } finally {
        setLoading(false);
      }
    };

    void loadData();
  }, []);

  useFocusEffect(
    useCallback(() => {
      const loadUnread = async () => {
        const result = await getUnreadNotifications();
        if (result.ok && result.data) {
          setUnreadCount(result.data.unread_count);
        }
      };
      void loadUnread();
    }, []),
  );

  useEffect(() => {
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

  const greeting = useMemo(() => {
    const hour = new Date().getHours();
    if (hour < 12) return "Bom dia";
    if (hour < 18) return "Boa tarde";
    return "Boa noite";
  }, []);

  const initials = useMemo(() => {
    const parts = (adminName || "").trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return "A";
    const first = parts[0][0] ?? "";
    const second = parts.length > 1 ? parts[parts.length - 1][0] : "";
    return (first + second).toUpperCase();
  }, [adminName]);

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

  const metrics = useMemo(
    () => [
      {
        id: "total",
        label: "Total de consultas",
        value: stats?.total_appointments ?? 0,
        icon: "calendar-outline",
        color: colors.primary,
        bg: colors.primaryTint,
      },
      {
        id: "done",
        label: "Concluídas",
        value: stats?.completed_appointments ?? 0,
        icon: "checkmark-circle-outline",
        color: BLUE,
        bg: BLUE_LIGHT,
      },
      {
        id: "cancel",
        label: "Canceladas",
        value: stats?.cancelled_appointments ?? 0,
        icon: "close-circle-outline",
        color: RED,
        bg: RED_LIGHT,
      },
      {
        id: "patients",
        label: "Pacientes ativos",
        value: stats?.total_patients ?? 0,
        icon: "people-outline",
        color: colors.primary,
        bg: colors.primaryTint,
      },
      {
        id: "profs",
        label: "Psicólogos ativos",
        value: stats?.total_professionals ?? 0,
        icon: "person-outline",
        color: ORANGE,
        bg: ORANGE_LIGHT,
      },
    ],
    [stats, colors],
  );

  return (
    <View style={styles.screen}>
      <StatusBar barStyle="light-content" backgroundColor={colors.primary} />

      {/* ── Barra de identidade ── */}
      <View style={styles.header}>
        <View style={styles.headerInner}>
          <View style={styles.identity}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{initials}</Text>
            </View>
            <View style={styles.identityText}>
              <Text style={styles.headerGreeting}>{greeting},</Text>
              <Text style={styles.headerName} numberOfLines={1}>
                {adminName || "Administrador"}
              </Text>
              <Text style={styles.headerSub} numberOfLines={1}>
                {clinicName ? `Administrador · ${clinicName}` : "Administrador"}
              </Text>
            </View>
          </View>

          <View style={styles.headerActions}>
            <TouchableOpacity
              style={styles.notifBtn}
              onPress={() => router.push("/(admin)/notificacoes" as any)}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Ionicons name="notifications-outline" size={20} color="#fff" />
              {unreadCount > 0 && (
                <View style={styles.notifBadge}>
                  <Text style={styles.notifBadgeText}>
                    {unreadCount > 9 ? "9+" : unreadCount}
                  </Text>
                </View>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.notifBtn}
              onPress={() => router.push("/(shared)/configuracoes" as any)}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Ionicons name="settings-outline" size={20} color="#fff" />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.logoutBtn}
              onPress={handleLogout}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Ionicons name="log-out-outline" size={19} color="#fff" />
              {isDesktop && <Text style={styles.logoutText}>Sair</Text>}
            </TouchableOpacity>
          </View>
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
            <Text style={styles.loadingText}>Carregando dados...</Text>
          </View>
        ) : (
          <Animated.View
            style={[
              styles.container,
              { opacity: fadeAnim, transform: [{ translateY: slideAnim }] },
            ]}
          >
            {/* ── Resumo da clínica ── */}
            <Text style={styles.sectionTitle}>Resumo da clínica</Text>
            <View style={styles.metricsGrid}>
              {metrics.map((metric) => (
                <View
                  key={metric.id}
                  style={[
                    styles.metricCard,
                    { flexBasis: isDesktop ? 200 : "47%" },
                  ]}
                >
                  <View
                    style={[styles.metricIcon, { backgroundColor: metric.bg }]}
                  >
                    <Ionicons
                      name={metric.icon as any}
                      size={20}
                      color={metric.color}
                    />
                  </View>
                  <Text style={styles.metricValue}>{metric.value}</Text>
                  <Text style={styles.metricLabel}>{metric.label}</Text>
                </View>
              ))}
            </View>

            {/* ── Atalhos ── */}
            <Text style={styles.sectionTitle}>Atalhos</Text>
            <View style={styles.actionsGrid}>
              {QUICK_ACTIONS.map((action) => (
                <TouchableOpacity
                  key={action.id}
                  style={[
                    styles.actionTile,
                    { flexBasis: isDesktop ? 320 : "100%" },
                  ]}
                  activeOpacity={0.85}
                  onPress={() => router.push(action.route as any)}
                >
                  <View
                    style={[styles.actionIcon, { backgroundColor: action.bg }]}
                  >
                    <Ionicons
                      name={action.icon as any}
                      size={20}
                      color={action.color}
                    />
                  </View>

                  <View style={styles.actionText}>
                    <Text style={styles.actionTitle}>{action.title}</Text>
                    <Text style={styles.actionDescription}>
                      {action.description}
                    </Text>
                  </View>

                  <Ionicons
                    name="chevron-forward-outline"
                    size={18}
                    color="#9db6ab"
                  />
                </TouchableOpacity>
              ))}
            </View>
          </Animated.View>
        )}
      </ScrollView>
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
    identity: {
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
      gap: 14,
    },
    avatar: {
      width: 52,
      height: 52,
      borderRadius: 18,
      backgroundColor: "rgba(255,255,255,0.16)",
      alignItems: "center",
      justifyContent: "center",
    },
    avatarText: {
      color: colors.white,
      fontSize: 18,
      fontWeight: "800",
      letterSpacing: 0.5,
    },
    identityText: {
      flex: 1,
    },
    headerGreeting: {
      color: "#c6e6da",
      fontSize: 13,
      fontWeight: "600",
    },
    headerName: {
      color: colors.white,
      fontSize: 21,
      fontWeight: "800",
      letterSpacing: -0.3,
      marginTop: 1,
    },
    headerSub: {
      color: "#a9d6c6",
      fontSize: 12.5,
      fontWeight: "600",
      marginTop: 2,
    },
    headerActions: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
    },
    notifBtn: {
      width: 40,
      height: 40,
      borderRadius: 12,
      backgroundColor: "rgba(255,255,255,0.14)",
      alignItems: "center",
      justifyContent: "center",
    },
    notifBadge: {
      position: "absolute",
      top: 4,
      right: 4,
      minWidth: 16,
      height: 16,
      borderRadius: 8,
      paddingHorizontal: 3,
      backgroundColor: "#f87171",
      alignItems: "center",
      justifyContent: "center",
    },
    notifBadgeText: {
      color: colors.white,
      fontSize: 10,
      fontWeight: "800",
    },
    logoutBtn: {
      height: 40,
      paddingHorizontal: 12,
      borderRadius: 12,
      backgroundColor: "rgba(255,255,255,0.14)",
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 7,
    },
    logoutText: {
      color: colors.white,
      fontSize: 14,
      fontWeight: "700",
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
    sectionTitle: {
      fontSize: 16,
      fontWeight: "800",
      color: colors.textDark,
      letterSpacing: -0.2,
      marginBottom: 12,
      marginTop: 4,
    },
    // KPIs
    metricsGrid: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 12,
      marginBottom: 26,
    },
    metricCard: {
      flexGrow: 1,
      backgroundColor: colors.white,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 16,
      ...CARD_SHADOW,
    },
    metricIcon: {
      width: 46,
      height: 46,
      borderRadius: 14,
      alignItems: "center",
      justifyContent: "center",
    },
    metricValue: {
      marginTop: 14,
      fontSize: 26,
      fontWeight: "800",
      color: colors.textDark,
      letterSpacing: -0.5,
    },
    metricLabel: {
      marginTop: 4,
      fontSize: 12.5,
      lineHeight: 17,
      color: colors.textMuted,
      fontWeight: "600",
    },
    // Atalhos
    actionsGrid: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 12,
    },
    actionTile: {
      flexGrow: 1,
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
    actionIcon: {
      width: 46,
      height: 46,
      borderRadius: 14,
      alignItems: "center",
      justifyContent: "center",
    },
    actionText: {
      flex: 1,
    },
    actionTitle: {
      fontSize: 15.5,
      fontWeight: "800",
      color: colors.textDark,
    },
    actionDescription: {
      marginTop: 4,
      fontSize: 12.5,
      lineHeight: 17,
      color: colors.textMuted,
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
