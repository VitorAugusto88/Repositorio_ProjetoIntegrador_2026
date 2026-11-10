import { Ionicons } from "@expo/vector-icons";
import { router, useFocusEffect } from "expo-router";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
    Animated,
    Dimensions,
    RefreshControl,
    ScrollView,
    StatusBar,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from "react-native";
import { showAlert } from "../../services/feedback";
import {
  getAppointments,
  getMe,
  getPsychologists,
  getUnreadNotifications,
} from "../../services/api";
import { ThemeColors } from "../../constants/theme-palettes";
import { useTheme } from "../../contexts/ThemeContext";

const { width } = Dimensions.get("window");

const DEFAULT_PATIENT_NAME = "Paciente";

interface NextAppointment {
  id: string;
  date: string;
  time: string;
  professional: string;
  specialty: string;
  avatar: string;
}

// ─── Shortcut Cards Data ──────────────────────────────────────────────────────
// color/bg do item "Agendar Consulta" e "Meu Psicólogo" seguem a cor da marca
// (mudam conforme a paleta); as demais são categorias fixas, sem relação com a marca.
const buildShortcuts = (green: string, greenLight: string) => [
  {
    id: "1",
    label: "Agendar\nConsulta",
    icon: "calendar-outline",
    color: green,
    bg: greenLight,
    route: "Schedule",
  },
  {
    id: "2",
    label: "Minhas\nConsultas",
    icon: "time-outline",
    color: "#3a7bd5",
    bg: "#e8f0fc",
    route: "MyAppointments",
  },
  {
    id: "3",
    label: "Chat",
    icon: "chatbubble-ellipses-outline",
    color: "#8b5cf6",
    bg: "#f0ebff",
    route: "Chat",
  },
  {
    id: "6",
    label: "Meu\nPsicólogo",
    icon: "person-outline",
    color: green,
    bg: greenLight,
    route: "MyPsychologist",
  },
  // {
  //   id: "4",
  //   label: "Documentos",
  //   icon: "document-text-outline",
  //   color: "#e67e22",
  //   bg: "#fef3e8",
  //   route: "Documents",
  // },
  {
    id: "4",
    label: "Perfil",
    icon: "person-outline",
    color: "#e05c7a",
    bg: "#fdeef2",
    route: "Profile",
  },
  {
    id: "7",
    label: "Ajuda",
    icon: "help-circle-outline",
    color: "#0d9488",
    bg: "#e3f4f1",
    route: "Help",
  },
];

// ─── Shortcut Card ────────────────────────────────────────────────────────────
interface ShortcutCardProps {
  label: string;
  icon: string;
  color: string;
  bg: string;
  onPress: () => void;
}

const ShortcutCard = ({
  label,
  icon,
  color,
  bg,
  onPress,
}: ShortcutCardProps) => {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <TouchableOpacity
      style={styles.shortcutCard}
      onPress={onPress}
      activeOpacity={0.8}
    >
      <View style={[styles.shortcutIconBox, { backgroundColor: bg }]}>
        <Ionicons name={icon as any} size={26} color={color} />
      </View>
      <Text style={styles.shortcutLabel}>{label}</Text>
    </TouchableOpacity>
  );
};

// ─── Decorative Background ───────────────────────────────────────────────────
const DecorativeBackground = () => {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <>
      <View style={styles.circle1} />
      <View style={styles.circle2} />
    </>
  );
};

// ─── Main Screen ─────────────────────────────────────────────────────────────
export default function HomeP() {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const SHORTCUTS = useMemo(
    () => buildShortcuts(colors.primary, colors.primaryTint),
    [colors],
  );

  const [patientName, setPatientName] = useState(DEFAULT_PATIENT_NAME);
  const [nextAppointment, setNextAppointment] =
    useState<NextAppointment | null>(null);
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [loadingAppointment, setLoadingAppointment] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const firstFocusRef = useRef(true);
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(24)).current;

  const fetchProfile = useCallback(async () => {
    setLoadingProfile(true);
    try {
      const result = await getMe();
      if (result.ok && result.data) {
        const name =
          result.data.full_name || result.data.name || DEFAULT_PATIENT_NAME;
        setPatientName(name);
      } else {
        showAlert(
          "Erro",
          result.error || "Não foi possível carregar o perfil.",
        );
      }
    } catch (error) {
      if (__DEV__) {
        console.error("Erro ao carregar perfil:", error);
      }
    } finally {
      setLoadingProfile(false);
    }
  }, []);

  const fetchAppointments = useCallback(async (silent = false) => {
    if (!silent) setLoadingAppointment(true);
    try {
      // ── FIX BUG 1: carregar profissionais primeiro para montar o mapa UUID→nome
      const profsResult = await getPsychologists();
      const profMap: Record<string, string> = {};
      if (profsResult.ok && Array.isArray(profsResult.data)) {
        for (const prof of profsResult.data) {
          const name =
            prof.user?.full_name ||
            prof.full_name ||
            prof.name ||
            prof.psychologistName ||
            "Profissional";
          profMap[prof.id] = name;
        }
      }

      const result = await getAppointments();
      if (result.ok && Array.isArray(result.data)) {
        const upcoming = result.data
          .filter(
            (item) => item.status === "scheduled" || item.status === "agendada",
          )
          .map((item) => {
            const scheduledAt = item.scheduled_at ?? "";
            const date = scheduledAt.split("T")[0] ?? "";
            const time = scheduledAt.split("T")[1]?.slice(0, 5) ?? "";

            // ── FIX BUG 1: resolver UUID → nome usando o mapa local
            const professionalId = item.professional ?? "";
            const professionalName = profMap[professionalId] || "Profissional";

            // Iniciais geradas a partir do nome resolvido, não do UUID
            const avatar = professionalName
              .split(" ")
              .filter((part) => part.length > 0)
              .map((part) => part[0].toUpperCase())
              .slice(0, 2)
              .join("");

            return {
              id: String(item.id ?? ""),
              date,
              time,
              professional: professionalName,
              specialty: item.specialty || "Psicologia",
              avatar: avatar || "P",
            };
          })
          .filter((item) => item.date && item.time)
          .sort((a, b) => {
            const dateA = new Date(`${a.date}T${a.time}:00`).getTime();
            const dateB = new Date(`${b.date}T${b.time}:00`).getTime();
            return dateA - dateB;
          })
          .find(
            (item) => new Date(`${item.date}T${item.time}:00`) > new Date(),
          );

        // Sempre reflete o estado atual: se a consulta foi cancelada/remarcada
        // e nao ha mais uma proxima, o card precisa sumir (nao manter a antiga).
        setNextAppointment(upcoming ?? null);
      }
    } catch (error) {
      if (__DEV__) {
        console.error("Erro ao carregar consultas:", error);
      }
    } finally {
      setLoadingAppointment(false);
    }
  }, []);

  const fetchUnread = useCallback(async () => {
    const result = await getUnreadNotifications();
    if (result.ok && result.data) {
      setUnreadCount(result.data.unread_count);
    }
  }, []);

  useEffect(() => {
    void fetchProfile();
    void fetchAppointments();
  }, [fetchProfile, fetchAppointments]);

  // Sempre que a home ganha foco (ex.: ao voltar de agendar/cancelar ou da tela
  // de notificacoes), recarrega a contagem de nao lidas e a proxima consulta —
  // assim o card "Proxima consulta" e o sino nunca ficam presos em dados antigos.
  // O primeiro foco e ignorado para a consulta porque a montagem ja a carregou
  // (com loader); os focos seguintes atualizam em silencio, sem piscar a tela.
  useFocusEffect(
    useCallback(() => {
      void fetchUnread();
      if (firstFocusRef.current) {
        firstFocusRef.current = false;
        return;
      }
      void fetchAppointments(true);
    }, [fetchUnread, fetchAppointments]),
  );

  React.useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 600,
        useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 600,
        useNativeDriver: true,
      }),
    ]).start();
  }, [fadeAnim, slideAnim]);

  // ─── FEATURE 1: Pull-to-refresh ───────────────────────────────────────────
  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await Promise.all([fetchProfile(), fetchAppointments(), fetchUnread()]);
    } catch (error) {
      if (__DEV__) {
        console.error("Erro ao atualizar dados:", error);
      }
    } finally {
      setRefreshing(false);
    }
  };

  const getGreeting = (): string => {
    const hour = new Date().getHours();
    if (hour < 12) return "Bom dia";
    if (hour < 18) return "Boa tarde";
    return "Boa noite";
  };

  return (
    <View style={styles.screen}>
      <StatusBar barStyle="light-content" backgroundColor={colors.primary} />
      <DecorativeBackground />

      {/* ── Header ── */}
      <View style={styles.header}>
        <Animated.View
          style={{ opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}
        >
          <Text style={styles.greeting}>{getGreeting()},</Text>
          <Text style={styles.patientName}>
            {loadingProfile ? "Carregando..." : `${patientName} 👋`}
          </Text>
        </Animated.View>

        <View style={styles.headerActions}>
          <TouchableOpacity
            style={styles.notifBtn}
            onPress={() => router.push("/(patient)/notificacoes")}
          >
            <Ionicons name="notifications-outline" size={22} color="#fff" />
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
          >
            <Ionicons name="settings-outline" size={21} color="#fff" />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={[colors.primary]}
            tintColor={colors.primary}
          />
        }
      >
        {/* ── Próxima Consulta ── */}
        <Animated.View
          style={{ opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}
        >
          <Text style={styles.sectionTitle}>Próxima consulta</Text>

          {loadingAppointment ? (
            <Text style={styles.emptyText}>Carregando próxima consulta...</Text>
          ) : nextAppointment ? (
            <View style={styles.appointmentCard}>
              {/* Faixa lateral */}
              <View style={styles.appointmentAccent} />

              <View style={styles.appointmentContent}>
                {/* Data e hora */}
                <View style={styles.appointmentDateRow}>
                  <Ionicons name="calendar-outline" size={15} color={colors.primary} />
                  <Text style={styles.appointmentDate}>
                    {nextAppointment.date}
                  </Text>
                </View>
                <View style={styles.appointmentTimeRow}>
                  <Ionicons name="time-outline" size={15} color={colors.primary} />
                  <Text style={styles.appointmentTime}>
                    {nextAppointment.time}
                  </Text>
                </View>

                <View style={styles.divider} />

                {/* Profissional */}
                <View style={styles.professionalRow}>
                  <View style={styles.avatar}>
                    <Text style={styles.avatarText}>
                      {nextAppointment.avatar}
                    </Text>
                  </View>
                  <View>
                    <Text style={styles.professionalName}>
                      {nextAppointment.professional}
                    </Text>
                    <Text style={styles.professionalSpecialty}>
                      {nextAppointment.specialty}
                    </Text>
                  </View>
                </View>

                {/* Botão */}
                <TouchableOpacity
                  style={styles.detailsBtn}
                  activeOpacity={0.8}
                  onPress={() =>
                    router.push({
                      pathname: "/(shared)/consulta-detalhe",
                      params: { id: nextAppointment.id },
                    })
                  }
                >
                  <Text style={styles.detailsBtnText}>Ver detalhes</Text>
                  <Ionicons
                    name="arrow-forward-outline"
                    size={14}
                    color={colors.primary}
                  />
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <Text style={styles.emptyText}>
              Nenhuma consulta agendada no momento.
            </Text>
          )}
        </Animated.View>

        {/* ── Atalhos ── */}
        <Animated.View
          style={{ opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}
        >
          <Text style={styles.sectionTitle}>O que você precisa?</Text>

          <View style={styles.shortcutsGrid}>
            {SHORTCUTS.map((item) => (
              <ShortcutCard
                key={item.id}
                label={item.label}
                icon={item.icon}
                color={item.color}
                bg={item.bg}
                onPress={() => {
                  const routes: Record<
                    string,
                    | "/agendamento"
                    | "/consultas"
                    | "/(shared)/chat"
                    | "/documento"
                    | "/perfil"
                    | "/escolha"
                    | "/(shared)/ajuda"
                  > = {
                    Schedule: "/agendamento",
                    MyAppointments: "/consultas",
                    Chat: "/(shared)/chat",
                    Documents: "/documento",
                    Profile: "/perfil",
                    MyPsychologist: "/escolha",
                    Help: "/(shared)/ajuda",
                  };

                  const targetRoute = routes[item.route];

                  if (targetRoute) {
                    router.push(targetRoute);
                    return;
                  }

                  showAlert(
                    "Tela indisponivel",
                    "Esse atalho ainda nao foi configurado.",
                  );
                }}
              />
            ))}
          </View>
        </Animated.View>

        {/* ── Banner motivacional ── */}
        <Animated.View style={[styles.bannerCard, { opacity: fadeAnim }]}>
          <View style={styles.bannerTextBox}>
            <Text style={styles.bannerTitle}>Cuide da sua saúde mental 🌿</Text>
            <Text style={styles.bannerSubtitle}>
              Manter a regularidade nas consultas faz toda a diferença.
            </Text>
          </View>
          <Ionicons name="heart-outline" size={40} color="#b2dfcf" />
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

  // Decorative
  circle1: {
    position: "absolute",
    width: 300,
    height: 300,
    borderRadius: 150,
    backgroundColor: "#27795f",
    top: -100,
    right: -80,
    opacity: 0.5,
  },
  circle2: {
    position: "absolute",
    width: 180,
    height: 180,
    borderRadius: 90,
    backgroundColor: colors.primaryStrong,
    top: -60,
    left: -60,
    opacity: 0.3,
  },

  // Header
  header: {
    backgroundColor: colors.primary,
    paddingTop: 56,
    paddingBottom: 28,
    paddingHorizontal: 24,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  greeting: {
    fontSize: 15,
    color: "#b2dfcf",
    fontWeight: "500",
  },
  patientName: {
    fontSize: 26,
    fontWeight: "800",
    color: colors.white,
    letterSpacing: -0.5,
    marginTop: 2,
  },
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  notifBtn: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.15)",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 4,
  },
  notifBadge: {
    position: "absolute",
    top: 3,
    right: 3,
    minWidth: 17,
    height: 17,
    borderRadius: 9,
    paddingHorizontal: 3,
    backgroundColor: "#f87171",
    borderWidth: 1.5,
    borderColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  notifBadgeText: {
    color: "#fff",
    fontSize: 10,
    fontWeight: "800",
  },

  // Scroll
  scroll: { flex: 1 },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 40,
  },

  // Section title
  sectionTitle: {
    fontSize: 17,
    fontWeight: "700",
    color: colors.textDark,
    marginBottom: 14,
    marginTop: 4,
  },

  // Appointment card
  appointmentCard: {
    backgroundColor: colors.white,
    borderRadius: 20,
    flexDirection: "row",
    marginBottom: 28,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.1,
    shadowRadius: 16,
    elevation: 4,
    overflow: "hidden",
  },
  appointmentAccent: {
    width: 5,
    backgroundColor: colors.primary,
    borderTopLeftRadius: 20,
    borderBottomLeftRadius: 20,
  },
  appointmentContent: {
    flex: 1,
    padding: 18,
  },
  appointmentDateRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 6,
  },
  appointmentDate: {
    fontSize: 13,
    color: "#4a7a66",
    fontWeight: "600",
  },
  appointmentTimeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  appointmentTime: {
    fontSize: 22,
    fontWeight: "800",
    color: colors.textDark,
    letterSpacing: -0.5,
  },
  divider: {
    height: 1,
    backgroundColor: "#e8f4ef",
    marginVertical: 14,
  },
  professionalRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 14,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: colors.primaryTint,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: {
    fontSize: 13,
    fontWeight: "800",
    color: colors.primary,
  },
  professionalName: {
    fontSize: 14,
    fontWeight: "700",
    color: colors.textDark,
  },
  professionalSpecialty: {
    fontSize: 12,
    color: "#7aab96",
    marginTop: 1,
  },
  detailsBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    alignSelf: "flex-start",
    backgroundColor: colors.primaryTint,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  detailsBtnText: {
    fontSize: 12,
    color: colors.primary,
    fontWeight: "700",
  },

  // Shortcuts grid
  shortcutsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    marginBottom: 28,
  },
  shortcutCard: {
    width: (width - 40 - 12 * 2) / 3,
    backgroundColor: colors.white,
    borderRadius: 18,
    paddingVertical: 16,
    paddingHorizontal: 10,
    alignItems: "center",
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.07,
    shadowRadius: 10,
    elevation: 3,
  },
  shortcutIconBox: {
    width: 50,
    height: 50,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 10,
  },
  shortcutLabel: {
    fontSize: 11,
    fontWeight: "600",
    color: "#2a5044",
    textAlign: "center",
    lineHeight: 15,
  },

  // Banner
  bannerCard: {
    backgroundColor: colors.primary,
    borderRadius: 20,
    padding: 20,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 14,
    elevation: 5,
  },
  bannerTextBox: {
    flex: 1,
    marginRight: 12,
  },
  bannerTitle: {
    fontSize: 15,
    fontWeight: "800",
    color: colors.white,
    marginBottom: 4,
  },
  bannerSubtitle: {
    fontSize: 12,
    color: "#b2dfcf",
    lineHeight: 17,
  },
  emptyText: {
    fontSize: 14,
    color: "#6b7a72",
    textAlign: "center",
    marginVertical: 12,
  },
});
