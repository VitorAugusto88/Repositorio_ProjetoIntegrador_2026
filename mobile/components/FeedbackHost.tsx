import { Ionicons } from "@expo/vector-icons";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { ThemeColors } from "../constants/theme-palettes";
import { useTheme } from "../contexts/ThemeContext";
import {
  ButtonStyle,
  DialogItem,
  registerFeedbackListener,
  ToastItem,
  ToastType,
} from "../services/feedback";

// ─── Aparência por tipo de toast ────────────────────────────────────────────
// "success" acompanha a cor da marca da clínica; error/info são semânticas
// (fixas) — não fazem sentido mudando de cor conforme a paleta escolhida.
const getToastStyle = (
  colors: ThemeColors,
): Record<ToastType, { bg: string; icon: keyof typeof Ionicons.glyphMap }> => ({
  success: { bg: colors.primary, icon: "checkmark-circle" },
  error: { bg: "#d9534f", icon: "close-circle" },
  info: { bg: "#3f6f8f", icon: "information-circle" },
});

const TOAST_DURATION = 3800; // ms até sumir sozinho

// ─── Um toast individual (anima entrada, saída e auto-dismiss) ──────────────
function Toast({
  item,
  onDone,
}: {
  item: ToastItem;
  onDone: (id: number) => void;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const cfg = useMemo(() => getToastStyle(colors)[item.type], [colors, item.type]);

  const anim = useRef(new Animated.Value(0)).current;

  const dismiss = useCallback(() => {
    Animated.timing(anim, {
      toValue: 0,
      duration: 180,
      useNativeDriver: true,
    }).start(() => onDone(item.id));
  }, [anim, item.id, onDone]);

  useEffect(() => {
    Animated.spring(anim, {
      toValue: 1,
      useNativeDriver: true,
      friction: 8,
      tension: 80,
    }).start();

    const timer = setTimeout(dismiss, TOAST_DURATION);
    return () => clearTimeout(timer);
  }, [anim, dismiss]);

  return (
    <Animated.View
      style={[
        styles.toast,
        { backgroundColor: cfg.bg },
        {
          opacity: anim,
          transform: [
            {
              translateY: anim.interpolate({
                inputRange: [0, 1],
                outputRange: [-16, 0],
              }),
            },
          ],
        },
      ]}
    >
      <Pressable style={styles.toastInner} onPress={dismiss}>
        <Ionicons name={cfg.icon} size={20} color="#fff" />
        <Text style={styles.toastText} numberOfLines={4}>
          {item.message}
        </Text>
      </Pressable>
    </Animated.View>
  );
}

// ─── Estilo visual de cada botão do diálogo ─────────────────────────────────
// O botão "default" acompanha a marca da clínica; cancel/destructive são fixos.
function buttonColors(style: ButtonStyle, colors: ThemeColors): { bg: string; text: string } {
  if (style === "cancel") return { bg: "#eef2f0", text: "#4c7f6d" };
  if (style === "destructive") return { bg: "#d9534f", text: "#fff" };
  return { bg: colors.primary, text: "#fff" };
}

// ─── Host global: escuta o módulo de feedback e renderiza tudo ──────────────
export default function FeedbackHost() {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [dialog, setDialog] = useState<DialogItem | null>(null);

  const removeToast = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  useEffect(() => {
    registerFeedbackListener({
      onToast: (item) => setToasts((prev) => [...prev, item]),
      onDialog: (item) => setDialog(item),
    });
    return () => registerFeedbackListener(null);
  }, []);

  const closeDialog = (run?: () => void) => {
    setDialog(null);
    run?.();
  };

  // Botão de cancelar (se houver) é o que dispara ao tocar fora / fechar.
  const cancelButton = dialog?.buttons.find((b) => b.style === "cancel");
  // Layout: 2 botões lado a lado; 3+ empilhados.
  const stacked = (dialog?.buttons.length ?? 0) !== 2;

  return (
    <>
      {/* Toasts empilhados no topo */}
      <View style={styles.toastContainer} pointerEvents="box-none">
        {toasts.map((t) => (
          <Toast key={t.id} item={t} onDone={removeToast} />
        ))}
      </View>

      {/* Diálogo modal (confirmações e escolhas) */}
      <Modal
        visible={dialog !== null}
        transparent
        animationType="fade"
        onRequestClose={() => closeDialog(cancelButton?.onPress)}
      >
        <Pressable
          style={styles.overlay}
          onPress={() => closeDialog(cancelButton?.onPress)}
        >
          <Pressable style={styles.dialogCard} onPress={() => {}}>
            <Text style={styles.dialogTitle}>{dialog?.title}</Text>
            {dialog?.message ? (
              <Text style={styles.dialogMessage}>{dialog.message}</Text>
            ) : null}
            <View
              style={[
                styles.dialogActions,
                stacked ? styles.actionsStacked : styles.actionsRow,
              ]}
            >
              {dialog?.buttons.map((btn, idx) => {
                const btnColors = buttonColors(btn.style, colors);
                return (
                  <TouchableOpacity
                    key={`${btn.text}-${idx}`}
                    style={[
                      styles.dialogBtn,
                      stacked && styles.dialogBtnStacked,
                      { backgroundColor: btnColors.bg },
                    ]}
                    onPress={() => closeDialog(btn.onPress)}
                    activeOpacity={0.85}
                  >
                    <Text style={[styles.dialogBtnText, { color: btnColors.text }]}>
                      {btn.text}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    // Toasts
    toastContainer: {
      position: "absolute",
      top: Platform.OS === "web" ? 20 : 52,
      left: 0,
      right: 0,
      alignItems: "center",
      zIndex: 9999,
      gap: 8,
    },
    toast: {
      maxWidth: 440,
      width: "90%",
      borderRadius: 14,
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: 0.18,
      shadowRadius: 12,
      elevation: 8,
    },
    toastInner: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      paddingVertical: 13,
      paddingHorizontal: 16,
    },
    toastText: {
      color: "#fff",
      fontSize: 14,
      fontWeight: "600",
      flex: 1,
      lineHeight: 19,
    },

    // Diálogo
    overlay: {
      flex: 1,
      backgroundColor: "rgba(0,0,0,0.45)",
      alignItems: "center",
      justifyContent: "center",
      padding: 24,
    },
    dialogCard: {
      width: "100%",
      maxWidth: 400,
      backgroundColor: colors.white,
      borderRadius: 20,
      padding: 22,
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 10 },
      shadowOpacity: 0.2,
      shadowRadius: 20,
      elevation: 12,
    },
    dialogTitle: {
      fontSize: 17,
      fontWeight: "800",
      color: colors.textDark,
    },
    dialogMessage: {
      fontSize: 14,
      color: colors.textMuted,
      marginTop: 8,
      lineHeight: 20,
    },
    dialogActions: {
      marginTop: 22,
      gap: 10,
    },
    actionsRow: {
      flexDirection: "row",
      justifyContent: "flex-end",
    },
    actionsStacked: {
      flexDirection: "column",
    },
    dialogBtn: {
      paddingVertical: 12,
      paddingHorizontal: 20,
      borderRadius: 12,
      minWidth: 100,
      alignItems: "center",
      justifyContent: "center",
    },
    dialogBtnStacked: {
      width: "100%",
    },
    dialogBtnText: {
      fontWeight: "700",
      fontSize: 14,
    },
  });
