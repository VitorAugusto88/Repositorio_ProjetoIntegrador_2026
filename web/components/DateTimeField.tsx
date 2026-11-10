import React, { useMemo } from "react";
import { Platform, StyleSheet, TextInput, TextStyle } from "react-native";
import { ThemeColors } from "../constants/theme-palettes";
import { useTheme } from "../contexts/ThemeContext";

// ─── Campos de data e hora com o calendário/relógio CLÁSSICO ────────────────
//
// No web (alvo principal do app) usamos os inputs nativos do navegador
// (`<input type="date">` e `<input type="time">`), que já abrem o calendário
// clássico e o seletor de horário. O valor deles sai exatamente no formato
// que o backend espera — data "AAAA-MM-DD" e hora "HH:MM" — então encaixa
// direto no estado existente, sem conversão.
//
// No mobile (iOS/Android) caímos num TextInput simples (mesmo comportamento
// de antes), para não depender de biblioteca nativa nem quebrar o build.
//
// `variant`:
//   - "box" (padrão): campo com borda arredondada, para formulários.
//   - "underline": só linha inferior, para as linhas de edição do perfil.

type Variant = "box" | "underline";

interface FieldProps {
  value: string;
  onChange: (value: string) => void;
  // Data mínima/máxima selecionável (formato "AAAA-MM-DD"). Só usadas no web.
  min?: string;
  max?: string;
  disabled?: boolean;
  variant?: Variant;
}

// Estilo do <input> web conforme a variante, para casar com os campos do app.
function webStyle(variant: Variant, colors: ThemeColors, disabled?: boolean): React.CSSProperties {
  const base: React.CSSProperties =
    variant === "underline"
      ? {
          boxSizing: "border-box",
          width: "100%",
          border: "none",
          borderBottom: `1.5px solid ${colors.primary}`,
          backgroundColor: "transparent",
          padding: "2px 0 4px",
          fontSize: 15,
          color: "#1a3d31",
          fontWeight: 500,
          fontFamily: "inherit",
          outline: "none",
        }
      : {
          boxSizing: "border-box",
          width: "100%",
          minHeight: 52,
          borderRadius: 16,
          border: `1.5px solid ${colors.border}`,
          backgroundColor: colors.white,
          paddingLeft: 14,
          paddingRight: 12,
          fontSize: 15,
          color: colors.textDark,
          fontWeight: 500,
          fontFamily: "inherit",
          outline: "none",
        };
  return disabled ? { ...base, opacity: 0.6 } : base;
}

function nativeStyle(
  variant: Variant,
  styles: ReturnType<typeof createStyles>,
): TextStyle {
  return variant === "underline" ? styles.nativeUnderline : styles.nativeBox;
}

export function DateField({
  value,
  onChange,
  min,
  max,
  disabled,
  variant = "box",
}: FieldProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  if (Platform.OS === "web") {
    return (
      <input
        type="date"
        value={value}
        min={min}
        max={max}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        style={webStyle(variant, colors, disabled)}
      />
    );
  }
  return (
    <TextInput
      style={nativeStyle(variant, styles)}
      value={value}
      onChangeText={onChange}
      editable={!disabled}
      placeholder="AAAA-MM-DD"
      placeholderTextColor={colors.placeholder}
    />
  );
}

export function TimeField({
  value,
  onChange,
  disabled,
  variant = "box",
}: FieldProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  // O backend às vezes envia "HH:MM:SS"; o <input type="time"> espera "HH:MM".
  const hhmm = value ? value.slice(0, 5) : value;
  if (Platform.OS === "web") {
    return (
      <input
        type="time"
        value={hhmm}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        style={webStyle(variant, colors, disabled)}
      />
    );
  }
  return (
    <TextInput
      style={nativeStyle(variant, styles)}
      value={hhmm}
      onChangeText={onChange}
      editable={!disabled}
      placeholder="HH:MM"
      placeholderTextColor={colors.placeholder}
    />
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    nativeBox: {
      minHeight: 52,
      borderRadius: 16,
      borderWidth: 1.5,
      borderColor: colors.border,
      backgroundColor: colors.white,
      paddingHorizontal: 16,
      fontSize: 15,
      color: colors.textDark,
      fontWeight: "500",
    },
    nativeUnderline: {
      fontSize: 15,
      color: "#1a3d31",
      fontWeight: "500",
      borderBottomWidth: 1.5,
      borderBottomColor: colors.primary,
      paddingBottom: 4,
      paddingTop: 2,
    },
  });
