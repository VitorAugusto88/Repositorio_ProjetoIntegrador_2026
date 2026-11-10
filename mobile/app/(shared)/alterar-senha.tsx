import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import React, { useMemo, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { ThemeColors } from "../../constants/theme-palettes";
import { useTheme } from "../../contexts/ThemeContext";
import { changePassword } from "../../services/api";
import { showToast } from "../../services/feedback";

const MAX_WIDTH = 480;

// Remove o contorno azul do input no web (sem quebrar a tipagem do RN).
const webOutlineNone = Platform.OS === "web" ? ({ outlineStyle: "none" } as any) : undefined;

// Campo de senha com botão de mostrar/ocultar.
const PasswordField = ({
  label,
  value,
  visible,
  error,
  onChangeText,
  onToggleVisible,
  styles,
}: {
  label: string;
  value: string;
  visible: boolean;
  error?: string;
  onChangeText: (value: string) => void;
  onToggleVisible: () => void;
  styles: ReturnType<typeof createStyles>;
}) => (
  <View style={styles.fieldWrapper}>
    <Text style={styles.fieldLabel}>{label}</Text>
    <View style={[styles.inputBox, !!error && styles.inputBoxError]}>
      <TextInput
        style={[styles.input, webOutlineNone]}
        value={value}
        onChangeText={onChangeText}
        secureTextEntry={!visible}
        autoCapitalize="none"
        placeholderTextColor="#9bbfb0"
      />
      <TouchableOpacity onPress={onToggleVisible} style={styles.eyeBtn}>
        <Ionicons
          name={visible ? "eye-off-outline" : "eye-outline"}
          size={20}
          color="#6b9e8a"
        />
      </TouchableOpacity>
    </View>
    {error ? <Text style={styles.errorText}>{error}</Text> : null}
  </View>
);

export default function ChangePasswordScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNext, setShowNext] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [apiError, setApiError] = useState("");
  const [loading, setLoading] = useState(false);

  const validate = () => {
    const e: Record<string, string> = {};
    if (!current) e.current = "Informe a senha atual.";
    if (!next) e.next = "Informe a nova senha.";
    else if (next.length < 8) e.next = "A nova senha deve ter no mínimo 8 caracteres.";
    else if (next === current) e.next = "A nova senha deve ser diferente da atual.";
    if (!confirm) e.confirm = "Confirme a nova senha.";
    else if (next !== confirm) e.confirm = "As senhas não coincidem.";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async () => {
    setApiError("");
    if (!validate()) return;

    setLoading(true);
    const result = await changePassword({
      current_password: current,
      new_password: next,
    });
    setLoading(false);

    if (result.ok) {
      showToast("Senha atualizada com sucesso.", "success");
      router.back();
    } else {
      setApiError(result.error || "Não foi possível alterar a senha.");
    }
  };

  return (
    <View style={styles.screen}>
      <StatusBar barStyle="light-content" backgroundColor={colors.primary} />

      <View style={styles.header}>
        <View style={styles.headerInner}>
          <TouchableOpacity style={styles.iconBtn} onPress={() => router.back()}>
            <Ionicons name="arrow-back-outline" size={22} color={colors.white} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Alterar senha</Text>
          <View style={styles.iconBtn} />
        </View>
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.card}>
            <View style={styles.lockIcon}>
              <Ionicons name="lock-closed-outline" size={24} color={colors.primary} />
            </View>
            <Text style={styles.cardTitle}>Defina uma nova senha</Text>
            <Text style={styles.cardSubtitle}>
              Confirme sua senha atual e escolha uma nova, com no mínimo 8 caracteres.
            </Text>

            <PasswordField
              label="Senha atual"
              value={current}
              visible={showCurrent}
              error={errors.current}
              onChangeText={(v) => {
                setCurrent(v);
                setErrors((p) => ({ ...p, current: "" }));
                setApiError("");
              }}
              onToggleVisible={() => setShowCurrent((p) => !p)}
              styles={styles}
            />
            <PasswordField
              label="Nova senha"
              value={next}
              visible={showNext}
              error={errors.next}
              onChangeText={(v) => {
                setNext(v);
                setErrors((p) => ({ ...p, next: "" }));
                setApiError("");
              }}
              onToggleVisible={() => setShowNext((p) => !p)}
              styles={styles}
            />
            <PasswordField
              label="Confirmar nova senha"
              value={confirm}
              visible={showConfirm}
              error={errors.confirm}
              onChangeText={(v) => {
                setConfirm(v);
                setErrors((p) => ({ ...p, confirm: "" }));
                setApiError("");
              }}
              onToggleVisible={() => setShowConfirm((p) => !p)}
              styles={styles}
            />

            {apiError ? (
              <View style={styles.apiErrorBox}>
                <Ionicons name="alert-circle-outline" size={16} color="#c0392b" />
                <Text style={styles.apiErrorText}>{apiError}</Text>
              </View>
            ) : null}

            <TouchableOpacity
              style={[styles.primaryBtn, loading && { opacity: 0.7 }]}
              onPress={handleSubmit}
              disabled={loading}
              activeOpacity={0.85}
            >
              {loading ? (
                <ActivityIndicator color={colors.white} />
              ) : (
                <Text style={styles.primaryBtnText}>Salvar nova senha</Text>
              )}
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.pageBg },
  header: { backgroundColor: colors.primary, paddingTop: 52, paddingBottom: 20 },
  headerInner: {
    width: "100%",
    maxWidth: 720,
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
    paddingTop: 24,
    paddingBottom: 44,
    maxWidth: MAX_WIDTH,
    alignSelf: "center" as const,
    width: "100%" as const,
  },
  card: {
    backgroundColor: colors.white,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 22,
    shadowColor: "#1f5442",
    shadowOpacity: 0.06,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 3,
  },
  lockIcon: {
    width: 52,
    height: 52,
    borderRadius: 16,
    backgroundColor: colors.primaryTint,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 14,
  },
  cardTitle: { fontSize: 19, fontWeight: "800", color: colors.textDark },
  cardSubtitle: {
    fontSize: 13,
    lineHeight: 19,
    color: colors.textMuted,
    marginTop: 6,
    marginBottom: 18,
  },
  fieldWrapper: { marginBottom: 14 },
  fieldLabel: {
    fontSize: 12,
    fontWeight: "800",
    color: colors.textMuted,
    marginBottom: 6,
    marginLeft: 2,
  },
  inputBox: {
    flexDirection: "row",
    alignItems: "center",
    height: 50,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: "#d4ede3",
    backgroundColor: "#fafffe",
    paddingHorizontal: 14,
  },
  inputBoxError: { borderColor: "#e05c5c", backgroundColor: "#fff8f8" },
  input: {
    flex: 1,
    fontSize: 15,
    color: colors.textDark,
    fontWeight: "500",
  },
  eyeBtn: { padding: 4, marginLeft: 8 },
  errorText: { fontSize: 12, color: "#e05c5c", marginTop: 4, marginLeft: 4 },
  apiErrorBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#fff1f1",
    borderWidth: 1,
    borderColor: "#f5c0c0",
    borderRadius: 12,
    padding: 12,
    marginBottom: 14,
  },
  apiErrorText: { fontSize: 13, color: "#c0392b", fontWeight: "500", flex: 1 },
  primaryBtn: {
    backgroundColor: colors.primary,
    borderRadius: 14,
    height: 52,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 4,
  },
  primaryBtnText: { color: colors.white, fontSize: 16, fontWeight: "800" },
});
