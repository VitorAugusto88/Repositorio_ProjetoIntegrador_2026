import { Ionicons } from "@expo/vector-icons";
import React, { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import ColorPicker, {
  HueSlider,
  Panel1,
  Preview,
  Swatches,
} from "reanimated-color-picker";

import {
  PRESET_LABELS,
  PRESET_SWATCH,
  ThemeColors,
  ThemePreset,
} from "../constants/theme-palettes";
import { useTheme } from "../contexts/ThemeContext";
import { showToast } from "../services/feedback";

// Sugestões rápidas dentro do seletor de cor personalizada — cobrem uma boa
// variedade de matizes pra quem só quer clicar em vez de digitar hex.
const SUGGESTED_SWATCHES = [
  "#2e8b6e", "#2563eb", "#7c3aed", "#c46a1a",
  "#0d9488", "#d95c5c", "#db2777", "#0891b2",
  "#65a30d", "#9333ea", "#0f766e", "#334155",
];

const READY_PRESETS: ThemePreset[] = ["default", "blue", "purple"];

export default function AppearanceSettings() {
  const { colors, themePreset, applyTheme } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [busyPreset, setBusyPreset] = useState<ThemePreset | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerHex, setPickerHex] = useState(colors.primary);

  const handleSelectPreset = async (preset: ThemePreset) => {
    if (preset === themePreset || busyPreset) return;
    setBusyPreset(preset);
    const result = await applyTheme(preset);
    setBusyPreset(null);
    showToast(
      result.ok ? "Cor da clínica atualizada." : result.error || "Não foi possível salvar a cor.",
      result.ok ? "success" : "error",
    );
  };

  const openCustomPicker = () => {
    setPickerHex(themePreset === "custom" ? colors.primary : colors.primary);
    setPickerOpen(true);
  };

  const handleApplyCustom = async () => {
    setBusyPreset("custom");
    const result = await applyTheme("custom", pickerHex);
    setBusyPreset(null);
    if (result.ok) setPickerOpen(false);
    showToast(
      result.ok ? "Cor personalizada aplicada." : result.error || "Não foi possível salvar a cor.",
      result.ok ? "success" : "error",
    );
  };

  return (
    <>
      <Text style={styles.sectionTitle}>Aparência</Text>
      <View style={styles.card}>
        <Text style={styles.hint}>
          Escolha a paleta de cores da clínica. A mudança vale para todos os usuários
          cadastrados nesta clínica.
        </Text>

        <View style={styles.grid}>
          {READY_PRESETS.map((preset) => {
            const selected = themePreset === preset;
            return (
              <TouchableOpacity
                key={preset}
                style={[styles.swatchCard, selected && styles.swatchCardSelected]}
                onPress={() => handleSelectPreset(preset)}
                activeOpacity={0.8}
                disabled={busyPreset !== null}
              >
                <View style={[styles.swatchCircle, { backgroundColor: PRESET_SWATCH[preset] }]}>
                  {busyPreset === preset ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : selected ? (
                    <Ionicons name="checkmark" size={18} color="#fff" />
                  ) : null}
                </View>
                <Text style={styles.swatchLabel}>{PRESET_LABELS[preset]}</Text>
              </TouchableOpacity>
            );
          })}

          <TouchableOpacity
            style={[styles.swatchCard, themePreset === "custom" && styles.swatchCardSelected]}
            onPress={openCustomPicker}
            activeOpacity={0.8}
            disabled={busyPreset !== null}
          >
            <View
              style={[
                styles.swatchCircle,
                styles.customSwatchCircle,
                themePreset === "custom" && { backgroundColor: colors.primary },
              ]}
            >
              {busyPreset === "custom" && !pickerOpen ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Ionicons
                  name="color-palette-outline"
                  size={18}
                  color={themePreset === "custom" ? "#fff" : colors.primary}
                />
              )}
            </View>
            <Text style={styles.swatchLabel}>{PRESET_LABELS.custom}</Text>
          </TouchableOpacity>
        </View>
      </View>

      <Modal visible={pickerOpen} animationType="slide" transparent onRequestClose={() => setPickerOpen(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Cor personalizada</Text>
              <TouchableOpacity onPress={() => setPickerOpen(false)} hitSlop={10}>
                <Ionicons name="close" size={22} color={colors.textMuted} />
              </TouchableOpacity>
            </View>

            <ColorPicker
              value={pickerHex}
              onChangeJS={(c) => setPickerHex(c.hex)}
              style={styles.pickerWrapper}
            >
              <Panel1 style={styles.pickerPanel} />
              <HueSlider style={styles.pickerHue} />
              <Preview style={styles.pickerPreview} hideInitialColor />
              <Swatches colors={SUGGESTED_SWATCHES} style={styles.pickerSwatches} />
            </ColorPicker>

            <TouchableOpacity
              style={styles.applyButton}
              onPress={handleApplyCustom}
              disabled={busyPreset === "custom"}
              activeOpacity={0.85}
            >
              {busyPreset === "custom" ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={styles.applyButtonText}>Aplicar cor</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </>
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
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
      padding: 16,
    },
    hint: {
      fontSize: 12.5,
      lineHeight: 18,
      color: colors.textMuted,
      fontWeight: "500",
      marginBottom: 14,
    },
    grid: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 14,
    },
    swatchCard: {
      alignItems: "center",
      width: 74,
      paddingVertical: 8,
      borderRadius: 12,
      borderWidth: 2,
      borderColor: "transparent",
    },
    swatchCardSelected: {
      borderColor: colors.primary,
      backgroundColor: colors.primaryTint,
    },
    swatchCircle: {
      width: 44,
      height: 44,
      borderRadius: 22,
      alignItems: "center",
      justifyContent: "center",
    },
    customSwatchCircle: {
      backgroundColor: colors.primaryTint,
      borderWidth: 1,
      borderColor: colors.border,
    },
    swatchLabel: {
      marginTop: 6,
      fontSize: 11.5,
      fontWeight: "700",
      color: colors.textDark,
      textAlign: "center",
    },
    modalBackdrop: {
      flex: 1,
      backgroundColor: "rgba(0,0,0,0.4)",
      justifyContent: "flex-end",
    },
    modalCard: {
      backgroundColor: colors.white,
      borderTopLeftRadius: 20,
      borderTopRightRadius: 20,
      padding: 20,
      paddingBottom: 32,
    },
    modalHeader: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: 18,
    },
    modalTitle: {
      fontSize: 17,
      fontWeight: "800",
      color: colors.textDark,
    },
    pickerWrapper: {
      width: "100%",
    },
    pickerPanel: {
      height: 180,
      borderRadius: 12,
    },
    pickerHue: {
      marginTop: 16,
      height: 24,
      borderRadius: 12,
    },
    pickerPreview: {
      marginTop: 16,
      height: 40,
      borderRadius: 10,
    },
    pickerSwatches: {
      marginTop: 16,
    },
    applyButton: {
      marginTop: 22,
      height: 48,
      borderRadius: 14,
      backgroundColor: colors.primary,
      alignItems: "center",
      justifyContent: "center",
    },
    applyButtonText: {
      color: colors.white,
      fontSize: 15,
      fontWeight: "800",
    },
  });
