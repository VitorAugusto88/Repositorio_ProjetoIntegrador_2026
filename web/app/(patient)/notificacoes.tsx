import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  RefreshControl,
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
  getNotifications,
  markNotificationRead,
  NotificationApiItem,
} from "../../services/api";

type NotificationFilter = "all" | "unread" | "read";

const FILTERS: { key: NotificationFilter; label: string }[] = [
  { key: "all", label: "Todas" },
  { key: "unread", label: "Nao lidas" },
  { key: "read", label: "Historico" },
];

type TypeMeta = Record<
  string,
  { label: string; icon: keyof typeof Ionicons.glyphMap; color: string; bg: string }
>;

const buildTypeMeta = (colors: ThemeColors): TypeMeta => ({
  appointment_reminder: {
    label: "Lembrete",
    icon: "alarm-outline",
    color: "#8b5cf6",
    bg: "#f0ebff",
  },
  appointment_confirmed: {
    label: "Consulta confirmada",
    icon: "checkmark-circle-outline",
    color: colors.primary,
    bg: colors.primaryTint,
  },
  appointment_cancelled: {
    label: "Consulta cancelada",
    icon: "close-circle-outline",
    color: "#d95c5c",
    bg: "#fdeeee",
  },
  appointment_rescheduled: {
    label: "Consulta remarcada",
    icon: "calendar-outline",
    color: "#3a7bd5",
    bg: "#e8f0fc",
  },
  new_message: {
    label: "Mensagem",
    icon: "chatbubble-ellipses-outline",
    color: "#e67e22",
    bg: "#fef3e8",
  },
  general: {
    label: "Aviso",
    icon: "notifications-outline",
    color: "#64748b",
    bg: "#eef2f7",
  },
});

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

const formatDateTime = (value?: string | null) => {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
};

const getNotificationMeta = (type: string, typeMeta: TypeMeta) =>
  typeMeta[type] ?? typeMeta.general;

const getMetadataLabel = (metadata?: Record<string, any>) => {
  if (!metadata) return "";
  const date =
    metadata.scheduled_at ||
    metadata.appointment_date ||
    metadata.date ||
    metadata.created_at;
  const person =
    metadata.professional_name ||
    metadata.patient_name ||
    metadata.sender_name ||
    metadata.name;

  if (date && person) return `${person} • ${formatDateTime(String(date))}`;
  if (person) return String(person);
  if (date) return formatDateTime(String(date));
  return "";
};

const NotificationCard = ({
  item,
  onMarkRead,
  marking,
}: {
  item: NotificationApiItem;
  onMarkRead: (id: string) => void;
  marking: boolean;
}) => {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const typeMeta = useMemo(() => buildTypeMeta(colors), [colors]);
  const meta = getNotificationMeta(item.type, typeMeta);
  const metadataLabel = getMetadataLabel(item.metadata);

  return (
    <View style={[styles.notificationCard, !item.is_read && styles.unreadCard]}>
      <View style={styles.cardTopRow}>
        <View style={[styles.typeIcon, { backgroundColor: meta.bg }]}>
          <Ionicons name={meta.icon} size={20} color={meta.color} />
        </View>
        <View style={styles.cardTitleBox}>
          <View style={styles.cardTitleRow}>
            <Text style={styles.notificationTitle} numberOfLines={2}>
              {item.title}
            </Text>
            {!item.is_read && <View style={styles.unreadDot} />}
          </View>
          <Text style={styles.notificationDate}>
            {formatDateTime(item.created_at)}
          </Text>
        </View>
      </View>

      <Text style={styles.notificationBody}>{item.body}</Text>

      <View style={styles.cardFooter}>
        <View style={[styles.typePill, { backgroundColor: meta.bg }]}>
          <Text style={[styles.typePillText, { color: meta.color }]}>
            {meta.label}
          </Text>
        </View>

        {metadataLabel ? (
          <Text style={styles.metadataText} numberOfLines={1}>
            {metadataLabel}
          </Text>
        ) : null}
      </View>

      {!item.is_read && (
        <TouchableOpacity
          style={styles.markReadBtn}
          onPress={() => onMarkRead(item.id)}
          disabled={marking}
          activeOpacity={0.85}
        >
          {marking ? (
            <ActivityIndicator size="small" color={colors.primary} />
          ) : (
            <>
              <Ionicons name="checkmark-outline" size={15} color={colors.primary} />
              <Text style={styles.markReadText}>Marcar como lida</Text>
            </>
          )}
        </TouchableOpacity>
      )}
    </View>
  );
};

export default function NotificationsScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [notifications, setNotifications] = useState<NotificationApiItem[]>([]);
  const [activeFilter, setActiveFilter] = useState<NotificationFilter>("all");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [markingIds, setMarkingIds] = useState<Record<string, boolean>>({});

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(24)).current;

  const unreadCount = useMemo(
    () => notifications.filter((item) => !item.is_read).length,
    [notifications],
  );

  const filteredNotifications = useMemo(() => {
    if (activeFilter === "unread") {
      return notifications.filter((item) => !item.is_read);
    }
    if (activeFilter === "read") {
      return notifications.filter((item) => item.is_read);
    }
    return notifications;
  }, [activeFilter, notifications]);

  const loadNotifications = async (silent = false) => {
    if (!silent) setLoading(true);
    const result = await getNotifications();
    if (result.ok && Array.isArray(result.data)) {
      setNotifications(result.data);
    } else {
      showAlert(
        "Erro",
        result.error || "Nao foi possivel carregar as notificacoes.",
      );
    }
    if (!silent) setLoading(false);
  };

  useEffect(() => {
    void loadNotifications();
  }, []);

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

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await loadNotifications(true);
    } finally {
      setRefreshing(false);
    }
  };

  const handleMarkRead = async (id: string) => {
    setMarkingIds((prev) => ({ ...prev, [id]: true }));
    const previous = notifications;
    setNotifications((prev) =>
      prev.map((item) => (item.id === id ? { ...item, is_read: true } : item)),
    );

    const result = await markNotificationRead(id);
    if (result.ok && result.data) {
      setNotifications((prev) =>
        prev.map((item) => (item.id === id ? result.data! : item)),
      );
    } else {
      setNotifications(previous);
      showAlert(
        "Erro",
        result.error || "Nao foi possivel marcar a notificacao como lida.",
      );
    }

    setMarkingIds((prev) => ({ ...prev, [id]: false }));
  };

  const handleMarkAllRead = async () => {
    const unread = notifications.filter((item) => !item.is_read);
    if (unread.length === 0) return;

    const previous = notifications;
    setNotifications((prev) =>
      prev.map((item) => ({ ...item, is_read: true })),
    );

    const results = await Promise.all(
      unread.map((item) => markNotificationRead(item.id)),
    );
    if (results.some((result) => !result.ok)) {
      setNotifications(previous);
      showAlert("Erro", "Nao foi possivel marcar todos os avisos como lidos.");
      return;
    }

    await loadNotifications(true);
  };

  return (
    <View style={styles.screen}>
      <StatusBar barStyle="light-content" backgroundColor={colors.primary} />
      <DecorativeBackground />

      <View style={styles.header}>
        <TouchableOpacity
          style={styles.iconBtn}
          onPress={() => router.back()}
          activeOpacity={0.85}
        >
          <Ionicons name="arrow-back-outline" size={22} color={colors.white} />
        </TouchableOpacity>

        <View style={styles.headerTextBox}>
          <Text style={styles.headerTitle}>Notificacoes</Text>
          <Text style={styles.headerSubtitle}>
            {unreadCount > 0
              ? `${unreadCount} aviso${unreadCount > 1 ? "s" : ""} nao lido${
                  unreadCount > 1 ? "s" : ""
                }`
              : "Tudo em dia por aqui"}
          </Text>
        </View>

        <TouchableOpacity
          style={[styles.iconBtn, unreadCount === 0 && styles.iconBtnDisabled]}
          onPress={handleMarkAllRead}
          disabled={unreadCount === 0}
          activeOpacity={0.85}
        >
          <Ionicons name="checkmark-done-outline" size={22} color={colors.white} />
        </TouchableOpacity>
      </View>

      <Animated.View
        style={[
          styles.content,
          { opacity: fadeAnim, transform: [{ translateY: slideAnim }] },
        ]}
      >
        <View style={styles.filterRow}>
          {FILTERS.map((filter) => (
            <TouchableOpacity
              key={filter.key}
              style={[
                styles.filterBtn,
                activeFilter === filter.key && styles.filterBtnActive,
              ]}
              onPress={() => setActiveFilter(filter.key)}
              activeOpacity={0.85}
            >
              <Text
                style={[
                  styles.filterText,
                  activeFilter === filter.key && styles.filterTextActive,
                ]}
              >
                {filter.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {loading ? (
          <View style={styles.loadingBox}>
            <ActivityIndicator color={colors.primary} />
            <Text style={styles.loadingText}>Carregando avisos...</Text>
          </View>
        ) : (
          <ScrollView
            style={styles.list}
            contentContainerStyle={styles.listContent}
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
            {filteredNotifications.length === 0 ? (
              <View style={styles.emptyBox}>
                <View style={styles.emptyIcon}>
                  <Ionicons
                    name="notifications-off-outline"
                    size={30}
                    color={colors.primary}
                  />
                </View>
                <Text style={styles.emptyTitle}>Nenhum aviso encontrado</Text>
                <Text style={styles.emptyText}>
                  Novas mensagens, consultas e lembretes vao aparecer aqui.
                </Text>
              </View>
            ) : (
              filteredNotifications.map((item) => (
                <NotificationCard
                  key={item.id}
                  item={item}
                  onMarkRead={handleMarkRead}
                  marking={!!markingIds[item.id]}
                />
              ))
            )}
          </ScrollView>
        )}
      </Animated.View>
    </View>
  );
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.authBg,
  },
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
  header: {
    backgroundColor: colors.primary,
    paddingTop: 54,
    paddingBottom: 24,
    paddingHorizontal: 20,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  iconBtn: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.15)",
    alignItems: "center",
    justifyContent: "center",
  },
  iconBtnDisabled: {
    opacity: 0.45,
  },
  headerTextBox: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: "800",
    color: colors.white,
    letterSpacing: -0.4,
  },
  headerSubtitle: {
    fontSize: 13,
    color: "#b2dfcf",
    marginTop: 2,
    fontWeight: "600",
  },
  content: {
    flex: 1,
    paddingTop: 18,
  },
  filterRow: {
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 20,
    marginBottom: 14,
  },
  filterBtn: {
    flex: 1,
    height: 40,
    borderRadius: 10,
    backgroundColor: colors.white,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#d9eee5",
  },
  filterBtnActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  filterText: {
    fontSize: 13,
    color: "#5a8f7a",
    fontWeight: "700",
  },
  filterTextActive: {
    color: colors.white,
  },
  loadingBox: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  loadingText: {
    fontSize: 14,
    color: colors.primary,
    fontWeight: "600",
  },
  list: {
    flex: 1,
  },
  listContent: {
    paddingHorizontal: 20,
    paddingBottom: 36,
    gap: 12,
    maxWidth: 960,
    alignSelf: 'center' as const,
    width: '100%' as const,
  },
  notificationCard: {
    backgroundColor: colors.white,
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: "#e3f1eb",
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.08,
    shadowRadius: 14,
    elevation: 3,
  },
  unreadCard: {
    borderColor: "#bde7d6",
  },
  cardTopRow: {
    flexDirection: "row",
    gap: 12,
    alignItems: "flex-start",
  },
  typeIcon: {
    width: 42,
    height: 42,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  cardTitleBox: {
    flex: 1,
  },
  cardTitleRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
  },
  notificationTitle: {
    flex: 1,
    fontSize: 15,
    color: "#1a3d31",
    fontWeight: "800",
    lineHeight: 20,
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#f87171",
    marginTop: 5,
  },
  notificationDate: {
    fontSize: 12,
    color: "#89aa9b",
    marginTop: 3,
    fontWeight: "600",
  },
  notificationBody: {
    fontSize: 13,
    color: "#557366",
    lineHeight: 20,
    marginTop: 12,
  },
  cardFooter: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 14,
  },
  typePill: {
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 8,
  },
  typePillText: {
    fontSize: 11,
    fontWeight: "800",
  },
  metadataText: {
    flex: 1,
    fontSize: 12,
    color: "#7d9f91",
    fontWeight: "600",
  },
  markReadBtn: {
    height: 36,
    marginTop: 14,
    borderRadius: 10,
    backgroundColor: colors.primaryTint,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  markReadText: {
    fontSize: 13,
    color: colors.primary,
    fontWeight: "800",
  },
  emptyBox: {
    alignItems: "center",
    justifyContent: "center",
    paddingTop: 80,
    paddingHorizontal: 24,
  },
  emptyIcon: {
    width: 62,
    height: 62,
    borderRadius: 18,
    backgroundColor: colors.primaryTint,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 17,
    color: "#1a3d31",
    fontWeight: "800",
    marginBottom: 6,
    textAlign: "center",
  },
  emptyText: {
    fontSize: 13,
    color: "#7d9f91",
    lineHeight: 20,
    textAlign: "center",
  },
});
