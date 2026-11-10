import { Ionicons } from "@expo/vector-icons";
import React, { useMemo, useState } from "react";
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { ThemeColors } from "../constants/theme-palettes";
import { useTheme } from "../contexts/ThemeContext";
import type { RoomApiItem } from "../services/api";
import { describeRoomStatus, isRoomSelectable } from "../services/rooms";

// ─── Seletor OPCIONAL de sala ────────────────────────────────────────────────
//
// Usado só nos agendamentos de administrador e de psicólogo — o fluxo do
// paciente não escolhe sala. Salas ocupadas no intervalo pedido aparecem
// desabilitadas apenas como atalho visual: quem rejeita de fato o conflito é o
// backend, na validação do serializer.

interface RoomSelectorProps {
  rooms: RoomApiItem[];
  selected: string | null;
  onSelect: (roomId: string | null) => void;
  loading?: boolean;
  // Mensagem exibida quando a lista de salas não pôde ser carregada. A
  // consulta continua podendo ser agendada sem sala.
  error?: string | null;
}

const SEM_SALA = "Sem sala definida";

export default function RoomSelector({
  rooms,
  selected,
  onSelect,
  loading = false,
  error = null,
}: RoomSelectorProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [open, setOpen] = useState(false);

  const selectedRoom = rooms.find((room) => room.id === selected) ?? null;

  return (
    <View style={styles.group}>
      <Text style={styles.label}>Sala (opcional)</Text>
      <TouchableOpacity
        style={styles.button}
        onPress={() => setOpen((value) => !value)}
        activeOpacity={0.85}
      >
        <Text
          style={[styles.buttonText, !selectedRoom && styles.placeholderText]}
        >
          {selectedRoom?.name ?? SEM_SALA}
        </Text>
        {loading ? (
          <ActivityIndicator size="small" color={colors.textMuted} />
        ) : (
          <Ionicons
            name={open ? "chevron-up-outline" : "chevron-down-outline"}
            size={18}
            color={colors.textMuted}
          />
        )}
      </TouchableOpacity>

      {!!error && <Text style={styles.error}>{error}</Text>}

      {open && (
        <View style={styles.dropdown}>
          <TouchableOpacity
            style={[styles.item, !selected && styles.itemActive]}
            onPress={() => {
              onSelect(null);
              setOpen(false);
            }}
            activeOpacity={0.85}
          >
            <Text style={styles.itemText}>{SEM_SALA}</Text>
            {!selected && (
              <Ionicons name="checkmark-outline" size={16} color={colors.primary} />
            )}
          </TouchableOpacity>

          {rooms.length === 0 ? (
            <Text style={styles.empty}>Nenhuma sala cadastrada.</Text>
          ) : (
            rooms.map((room) => {
              const selectable = isRoomSelectable(room);
              const isSelected = selected === room.id;
              return (
                <TouchableOpacity
                  key={room.id}
                  style={[
                    styles.item,
                    isSelected && styles.itemActive,
                    !selectable && styles.itemDisabled,
                  ]}
                  disabled={!selectable}
                  onPress={() => {
                    onSelect(room.id);
                    setOpen(false);
                  }}
                  activeOpacity={0.85}
                >
                  <View style={styles.itemBody}>
                    <Text
                      style={[
                        styles.itemText,
                        isSelected && styles.itemTextActive,
                        !selectable && styles.itemTextDisabled,
                      ]}
                    >
                      {room.name}
                    </Text>
                    <Text
                      style={[
                        styles.itemStatus,
                        !selectable && styles.itemStatusBusy,
                      ]}
                    >
                      {describeRoomStatus(room)}
                    </Text>
                  </View>
                  {isSelected && (
                    <Ionicons
                      name="checkmark-outline"
                      size={16}
                      color={colors.primary}
                    />
                  )}
                </TouchableOpacity>
              );
            })
          )}
        </View>
      )}
    </View>
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    group: { marginTop: 14 },
    label: {
      color: colors.textDark,
      fontSize: 13,
      fontWeight: "700",
      marginBottom: 6,
    },
    button: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 10,
      paddingHorizontal: 14,
      paddingVertical: 12,
      backgroundColor: colors.pageBg,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
    },
    buttonText: { color: colors.textDark, fontSize: 15, flex: 1 },
    placeholderText: { color: colors.placeholder },
    error: { color: "#b66b37", fontSize: 12, marginTop: 6 },
    dropdown: {
      marginTop: 6,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 10,
      backgroundColor: colors.white,
      overflow: "hidden",
    },
    item: {
      paddingHorizontal: 14,
      paddingVertical: 11,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 10,
    },
    itemActive: { backgroundColor: colors.primaryTint },
    itemDisabled: { opacity: 0.55 },
    itemBody: { flex: 1 },
    itemText: { color: colors.textDark, fontSize: 15 },
    itemTextActive: { color: colors.primary, fontWeight: "700" },
    itemTextDisabled: { color: colors.textMuted },
    itemStatus: { color: colors.textMuted, fontSize: 12, marginTop: 2 },
    itemStatusBusy: { color: "#b66b37" },
    empty: {
      color: colors.textMuted,
      fontSize: 14,
      paddingHorizontal: 14,
      paddingVertical: 12,
    },
  });
