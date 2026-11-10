/**
 * app/(patient)/clinica.tsx
 *
 * Tela SOMENTE LEITURA com as informações da clínica à qual o paciente
 * pertence. O paciente não edita nada aqui — apenas consulta endereço,
 * contato e horários. A edição da clínica é exclusiva do admin.
 */

import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Linking,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { ThemeColors } from "../../constants/theme-palettes";
import { useTheme } from "../../contexts/ThemeContext";
import { getClinicData, getClinicId, getClinics } from "../../services/api";
import { showToast } from "../../services/feedback";

// "HH:MM:SS" → "HH:MM"
const formatTime = (t?: string): string =>
  t ? String(t).slice(0, 5) : "";

interface ClinicInfo {
  name?: string;
  address?: string;
  phone?: string;
  email?: string;
  open_from?: string;
  open_until?: string;
  total_professionals?: number;
}

export default function ClinicInfoScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [loading, setLoading] = useState(true);
  const [clinic, setClinic] = useState<ClinicInfo | null>(null);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      // 1ª tentativa: pela clinic_id do token; 2ª: lista (retorna a do usuário).
      const clinicId = await getClinicId();
      let data: ClinicInfo | null = null;

      if (clinicId) {
        const result = await getClinicData(clinicId);
        if (result.ok && result.data) data = result.data as ClinicInfo;
      }
      if (!data) {
        const list = await getClinics();
        if (list.ok && Array.isArray(list.data) && list.data.length > 0) {
          data = list.data[0] as ClinicInfo;
        }
      }

      if (!data) {
        showToast("Não foi possível carregar as informações da clínica.", "error");
      }
      setClinic(data);
      setLoading(false);
    };
    void load();
  }, []);

  const openPhone = () => {
    if (clinic?.phone) Linking.openURL(`tel:${clinic.phone}`).catch(() => {});
  };
  const openEmail = () => {
    if (clinic?.email) Linking.openURL(`mailto:${clinic.email}`).catch(() => {});
  };

  const hours =
    clinic?.open_from || clinic?.open_until
      ? `${formatTime(clinic?.open_from)} às ${formatTime(clinic?.open_until)}`
      : "";

  return (
    <View style={styles.screen}>
      <StatusBar barStyle="light-content" backgroundColor={colors.primary} />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Ionicons name="arrow-back-outline" size={22} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Minha Clínica</Text>
        <View style={styles.backBtn} />
      </View>

      {loading ? (
        <View style={styles.loading}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : !clinic ? (
        <View style={styles.loading}>
          <Ionicons name="business-outline" size={44} color="#b8d9ce" />
          <Text style={styles.emptyText}>Clínica não encontrada.</Text>
        </View>
      ) : (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* Identidade */}
          <View style={styles.identityCard}>
            <View style={styles.identityIcon}>
              <Ionicons name="business" size={26} color={colors.primary} />
            </View>
            <Text style={styles.clinicName}>{clinic.name || "Clínica"}</Text>
            <View style={styles.readOnlyBadge}>
              <Ionicons name="lock-closed" size={11} color="#7aab96" />
              <Text style={styles.readOnlyText}>Somente leitura</Text>
            </View>
          </View>

          {/* Contato e endereço */}
          <View style={styles.card}>
            <Row label="Endereço" value={clinic.address || "Não informado"} />
            <View style={styles.divider} />
            <Row
              label="Telefone"
              value={clinic.phone || "Não informado"}
              onPress={clinic.phone ? openPhone : undefined}
              icon={clinic.phone ? "call-outline" : undefined}
            />
            <View style={styles.divider} />
            <Row
              label="E-mail"
              value={clinic.email || "Não informado"}
              onPress={clinic.email ? openEmail : undefined}
              icon={clinic.email ? "mail-outline" : undefined}
            />
            <View style={styles.divider} />
            <Row
              label="Horário de funcionamento"
              value={hours || "Não informado"}
            />
          </View>
        </ScrollView>
      )}
    </View>
  );
}

// ─── Linha de informação (read-only, opcionalmente clicável) ──────────────────
const Row = ({
  label,
  value,
  onPress,
  icon,
}: {
  label: string;
  value: string;
  onPress?: () => void;
  icon?: keyof typeof Ionicons.glyphMap;
}) => {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const content = (
    <View style={styles.rowInner}>
      <View style={{ flex: 1 }}>
        <Text style={styles.rowLabel}>{label}</Text>
        <Text style={styles.rowValue}>{value}</Text>
      </View>
      {icon && <Ionicons name={icon} size={18} color={colors.primary} />}
    </View>
  );
  if (onPress) {
    return (
      <TouchableOpacity onPress={onPress} activeOpacity={0.7}>
        {content}
      </TouchableOpacity>
    );
  }
  return content;
};

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.authBg },
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
    headerTitle: { fontSize: 17, fontWeight: "700", color: colors.white, letterSpacing: 0.2 },
    loading: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
    emptyText: { fontSize: 15, color: "#7aab96", fontWeight: "600" },
    scroll: { flex: 1 },
    scrollContent: { padding: 20, paddingBottom: 48 },

    identityCard: {
      backgroundColor: colors.white,
      borderRadius: 20,
      padding: 22,
      marginBottom: 16,
      alignItems: "center",
      shadowColor: colors.primary,
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.08,
      shadowRadius: 12,
      elevation: 3,
    },
    identityIcon: {
      width: 56,
      height: 56,
      borderRadius: 18,
      backgroundColor: colors.primaryTint,
      alignItems: "center",
      justifyContent: "center",
      marginBottom: 12,
    },
    clinicName: {
      fontSize: 19,
      fontWeight: "800",
      color: "#1a3d31",
      textAlign: "center",
    },
    readOnlyBadge: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      backgroundColor: colors.authBg,
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: 8,
      marginTop: 10,
    },
    readOnlyText: { fontSize: 11, color: "#7aab96", fontWeight: "600" },

    card: {
      backgroundColor: colors.white,
      borderRadius: 20,
      padding: 18,
      shadowColor: colors.primary,
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.08,
      shadowRadius: 12,
      elevation: 3,
    },
    rowInner: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      paddingVertical: 12,
    },
    rowLabel: {
      fontSize: 11,
      color: "#7aab96",
      fontWeight: "600",
      textTransform: "uppercase",
      letterSpacing: 0.5,
      marginBottom: 3,
    },
    rowValue: { fontSize: 15, color: "#1a3d31", fontWeight: "500" },
    divider: { height: 1, backgroundColor: "#f0f8f4" },
  });
