import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import React, { useMemo, useRef, useState } from "react";
import {
    ActivityIndicator,
    Animated,
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
import { getMyAssignedProfessional, ProfessionalApiItem } from "../../services/api";

// ─── Psychologist Card ────────────────────────────────────────────────────────
const PsychologistCard = ({
  item,
  onSchedule,
  fadeAnim,
  index,
}: {
  item: ProfessionalApiItem;
  onSchedule: () => void;
  fadeAnim: Animated.Value;
  index: number;
}) => {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const name =
    item.user?.full_name ||
    item.user?.first_name ||
    item.full_name ||
    item.name ||
    "Psicólogo";
  const specialty = item.specialty || "Psicologia";
  const color = item.color || colors.primary;
  const bg = item.bg || colors.primaryTint;
  const initials = name
    .split(" ")
    .filter((part) => part.length > 0)
    .map((part) => part[0])
    .slice(0, 2)
    .join("");
  const available = item.available ?? true;

  return (
    <Animated.View style={[styles.card, { opacity: fadeAnim }]}>
      {/* Availability badge */}
      <View
        style={[
          styles.availBadge,
          { backgroundColor: available ? colors.primaryTint : "#fef3f3" },
        ]}
      >
        <View
          style={[
            styles.availDot,
            { backgroundColor: available ? colors.primary : "#e05c5c" },
          ]}
        />
        <Text
          style={[
            styles.availText,
            { color: available ? colors.primary : "#e05c5c" },
          ]}
        >
          {available ? "Disponível" : "Indisponível"}
        </Text>
      </View>

      {/* Top row */}
      <View style={styles.cardTop}>
        <View style={[styles.avatar, { backgroundColor: bg }]}>
          <Text style={[styles.avatarText, { color }]}>{initials}</Text>
        </View>

        <View style={styles.cardInfo}>
          <Text style={styles.cardName}>{name}</Text>
          <Text style={styles.cardCrp}>{item.crp}</Text>
          <View style={[styles.specialtyBadge, { backgroundColor: bg }]}>
            <Text style={[styles.specialtyText, { color }]}>{specialty}</Text>
          </View>
        </View>
      </View>

      {/* Stats */}
      <View style={styles.statsRow}>
        <View style={styles.newProfessionalBadge}>
          <Ionicons name="sparkles-outline" size={13} color="#c46a1a" />
          <Text style={styles.newProfessionalText}>Novo profissional</Text>
        </View>
        <View style={styles.statDivider} />

        {/* ─── UX 1: Only show sessions if > 0 ────────────────────────────── */}
        {item.sessions && item.sessions > 0 && (
          <>
            <Ionicons name="people-outline" size={13} color="#7aab96" />
            <Text style={styles.statText}>{item.sessions} sessões</Text>
          </>
        )}
      </View>

      {/* Bio */}
      <Text style={styles.bio}>{item.bio}</Text>

      {/* Schedule button */}
      <TouchableOpacity
        style={[styles.scheduleBtn, !available && styles.scheduleBtnDisabled]}
        onPress={available ? onSchedule : undefined}
        activeOpacity={0.85}
        disabled={!available}
      >
        <Ionicons
          name="calendar-outline"
          size={16}
          color={available ? "#fff" : "#aaa"}
        />
        <Text
          style={[
            styles.scheduleBtnText,
            !available && styles.scheduleBtnTextDisabled,
          ]}
        >
          {available ? "Agendar consulta" : "Sem horários disponíveis"}
        </Text>
      </TouchableOpacity>
    </Animated.View>
  );
};

// ─── Main Screen ─────────────────────────────────────────────────────────────
export default function MyPsychologistScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  // O paciente não escolhe com quem se consulta: esta tela mostra apenas o
  // psicólogo responsável, definido pelo administrador no cadastro. A troca é
  // solicitada à administração — daí não haver busca nem lista aqui.
  const [psychologist, setPsychologist] = useState<ProfessionalApiItem | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(20)).current;

  React.useEffect(() => {
    const loadAssignedProfessional = async () => {
      setLoading(true);
      const result = await getMyAssignedProfessional();
      if (result.ok) {
        setPsychologist(result.data ?? null);
      } else {
        showAlert(
          "Erro",
          result.error || "Não foi possível carregar o seu psicólogo.",
        );
      }
      setLoading(false);
    };

    void loadAssignedProfessional();

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

  return (
    <View style={styles.screen}>
      <StatusBar barStyle="light-content" backgroundColor={colors.primary} />

      {/* ── Header ── */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Ionicons name="arrow-back-outline" size={22} color="#fff" />
        </TouchableOpacity>
        <View>
          <Text style={styles.headerTitle}>Meu Psicólogo</Text>
          <Text style={styles.headerSubtitle}>
            {loading ? "Carregando..." : "Profissional responsável pelo seu acompanhamento"}
          </Text>
        </View>
        <View style={{ width: 36 }} />
      </View>

      {/* ── Conteúdo ── */}
      <ScrollView
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
      >
        {loading ? (
          <View style={styles.emptyBox}>
            <ActivityIndicator size="large" color={colors.primary} />
          </View>
        ) : !psychologist ? (
          <View style={styles.emptyBox}>
            <Ionicons name="person-outline" size={40} color="#b2dfcf" />
            <Text style={styles.emptyText}>
              Você ainda não tem um psicólogo responsável
            </Text>
            <Text style={styles.emptyHint}>
              Entre em contato com o administrador da clínica para ser vinculado
              a um profissional.
            </Text>
          </View>
        ) : (
          <>
            <PsychologistCard
              item={psychologist}
              index={0}
              fadeAnim={fadeAnim}
              onSchedule={() => router.push("/agendamento")}
            />
            <View style={styles.noticeBox}>
              <Ionicons name="information-circle-outline" size={18} color={colors.primary} />
              <Text style={styles.noticeText}>
                Para trocar de psicólogo, fale com o administrador da clínica.
              </Text>
            </View>
          </>
        )}
      </ScrollView>
    </View>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────
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
    textAlign: "center",
  },
  headerSubtitle: {
    fontSize: 12,
    color: "#b2dfcf",
    textAlign: "center",
    marginTop: 2,
  },

  // Search

  // Filter chips

  // List
  listContent: {
    padding: 20,
    paddingBottom: 40,
    gap: 16,
  },

  // Card
  card: {
    backgroundColor: colors.white,
    borderRadius: 20,
    padding: 18,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 14,
    elevation: 3,
  },
  availBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    alignSelf: "flex-end",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
    marginBottom: 12,
  },
  availDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  availText: {
    fontSize: 11,
    fontWeight: "700",
  },
  cardTop: {
    flexDirection: "row",
    gap: 14,
    marginBottom: 12,
  },
  avatar: {
    width: 62,
    height: 62,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: {
    fontSize: 20,
    fontWeight: "800",
  },
  cardInfo: {
    flex: 1,
    justifyContent: "center",
    gap: 3,
  },
  cardName: {
    fontSize: 16,
    fontWeight: "800",
    color: "#1a3d31",
    letterSpacing: -0.2,
  },
  cardCrp: {
    fontSize: 12,
    color: "#7aab96",
    fontWeight: "500",
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

  // Stats
  statsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 12,
  },
  statDivider: {
    width: 1,
    height: 12,
    backgroundColor: "#d4ede3",
    marginHorizontal: 2,
  },
  statText: {
    fontSize: 12,
    color: "#7aab96",
    fontWeight: "500",
  },
  newProfessionalBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#fef3e8",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  newProfessionalText: {
    fontSize: 12,
    color: "#c46a1a",
    fontWeight: "700",
  },

  // Bio
  bio: {
    fontSize: 13,
    color: "#4a7a66",
    lineHeight: 20,
    marginBottom: 16,
  },

  // Schedule button
  scheduleBtn: {
    backgroundColor: colors.primary,
    borderRadius: 12,
    height: 46,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  scheduleBtnDisabled: {
    backgroundColor: "#f0f0f0",
    shadowOpacity: 0,
    elevation: 0,
  },
  scheduleBtnText: {
    color: colors.white,
    fontSize: 14,
    fontWeight: "700",
  },
  scheduleBtnTextDisabled: {
    color: "#aaa",
  },

  // Empty
  emptyBox: {
    alignItems: "center",
    justifyContent: "center",
    paddingTop: 60,
    gap: 12,
  },
  emptyText: {
    fontSize: 15,
    color: "#7aab96",
    fontWeight: "500",
  },
  emptyHint: {
    fontSize: 13,
    color: "#9bbfb0",
    textAlign: "center",
    lineHeight: 19,
    paddingHorizontal: 32,
  },
  noticeBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: colors.primaryTint,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginTop: 4,
  },
  noticeText: {
    flex: 1,
    fontSize: 13,
    color: "#3d5b50",
    lineHeight: 19,
  },
  });
