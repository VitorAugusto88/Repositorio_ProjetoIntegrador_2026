import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  KeyboardAvoidingView,
  KeyboardTypeOptions,
  Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from "react-native";
import { ThemeColors } from "../../constants/theme-palettes";
import { useTheme } from "../../contexts/ThemeContext";
import { getRouteForRole, login } from "../../services/api";
import { registerForPushNotifications } from "../../services/push";

// ─── Decorative Background ───────────────────────────────────────────────────
// Componente-irmão declarado no escopo do módulo: monta seu próprio tema/estilos
// memoizados em vez de depender de `styles` do componente pai (evita recriar
// componentes memoizados a cada render, o que derrubaria o foco dos inputs).
const DecorativeBackground = () => {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <View style={styles.decor}>
      <View style={styles.circle1} />
      <View style={styles.circle2} />
      <View style={styles.circle3} />
    </View>
  );
};

// ─── FloatingInput Types ─────────────────────────────────────────────────────
interface FloatingInputProps {
  label: string;
  value: string;
  onChangeText: (val: string) => void;
  secureTextEntry?: boolean;
  keyboardType?: KeyboardTypeOptions;
  autoCapitalize?: "none" | "sentences" | "words" | "characters";
  error?: string;
  rightIcon?: string;
  onRightIconPress?: () => void;
  returnKeyType?: "next" | "done" | "go" | "search" | "send";
  onSubmitEditing?: () => void;
  inputRef?: React.RefObject<TextInput | null>;
  autoComplete?: "email" | "current-password" | "off";
  textContentType?: "emailAddress" | "password" | "none";
}

// ─── Floating Label Input ────────────────────────────────────────────────────
const FloatingInput = ({
  label,
  value,
  onChangeText,
  secureTextEntry,
  keyboardType,
  autoCapitalize,
  error,
  rightIcon,
  onRightIconPress,
  returnKeyType = "next",
  onSubmitEditing,
  inputRef,
  autoComplete = "off",
  textContentType = "none",
}: FloatingInputProps) => {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [focused, setFocused] = useState(false);
  const animatedLabel = useRef(new Animated.Value(value ? 1 : 0)).current;

  const handleFocus = useCallback(() => setFocused(true), []);
  const handleBlur = useCallback(() => setFocused(false), []);

  // O label sobe sempre que o campo tem foco OU conteudo. Depender so do foco
  // fazia o label ficar em cima do texto quando o valor entra sem foco
  // (autofill do navegador/gerenciador de senhas no celular).
  useEffect(() => {
    Animated.timing(animatedLabel, {
      toValue: focused || !!value ? 1 : 0,
      duration: 180,
      useNativeDriver: false,
    }).start();
  }, [animatedLabel, focused, value]);

  const labelTop = animatedLabel.interpolate({
    inputRange: [0, 1],
    outputRange: [17, 4],
  });
  const labelSize = animatedLabel.interpolate({
    inputRange: [0, 1],
    outputRange: [15, 11],
  });
  const labelColor = animatedLabel.interpolate({
    inputRange: [0, 1],
    outputRange: [
      "#9bbfb0",
      error ? "#e05c5c" : focused ? colors.primary : colors.primaryAccent,
    ],
  });

  return (
    <View style={styles.inputWrapper}>
      <View
        style={[
          styles.inputContainer,
          focused && styles.inputContainerFocused,
          !!error && styles.inputContainerError,
        ]}
      >
        <Animated.Text
          style={[
            styles.floatingLabel,
            { top: labelTop, fontSize: labelSize, color: labelColor },
          ]}
        >
          {label}
        </Animated.Text>
        <TextInput
          ref={inputRef}
          style={styles.textInput}
          value={value}
          onChangeText={onChangeText}

          onFocus={handleFocus}
          onBlur={handleBlur}
          secureTextEntry={secureTextEntry}
          keyboardType={keyboardType ?? "default"}
          autoCapitalize={autoCapitalize ?? "none"}
          placeholderTextColor="transparent"
          submitBehavior="submit"
          autoCorrect={false}
          autoComplete={autoComplete}
          returnKeyType={returnKeyType}
          onSubmitEditing={onSubmitEditing}
          textContentType={textContentType}
          editable={true}
          selectTextOnFocus={false} // evita seleção automática que pode interferir
        />
        {rightIcon && (
          <TouchableOpacity onPress={onRightIconPress} style={styles.eyeBtn}>
            <Ionicons name={rightIcon as any} size={20} color="#6b9e8a" />
          </TouchableOpacity>
        )}
      </View>
      {error ? <Text style={styles.errorText}>{error}</Text> : null}
    </View>
  );
};

// Memoize FloatingInput para evitar re-renderizações desnecessárias no Android
const MemoizedFloatingInput = React.memo(FloatingInput);

// ─── Props & Types ────────────────────────────────────────────────────────────
interface FormState {
  email: string;
  senha: string;
}

// ─── Main Screen ─────────────────────────────────────────────────────────────
export default function LoginScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [form, setForm] = useState<FormState>({ email: "", senha: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [showSenha, setShowSenha] = useState(false);
  const [loading, setLoading] = useState(false);
  const [apiError, setApiError] = useState("");

  // Ref mantido mas não usado para forçar foco (evita salto no Android)
  const senhaRef = useRef<TextInput>(null);

  const fadeAnim = useRef(new Animated.Value(1)).current;
  const slideAnim = useRef(new Animated.Value(0)).current;

  // Comentado para Android - animações podem interferir com foco do input
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

  // Memoizar função set para evitar re-renderizações dos inputs
  const set = useCallback(
    (field: keyof FormState) => (val: string) => {
      setForm((prev) => ({ ...prev, [field]: val }));
      // Não limpar erro enquanto digita - evita re-renders
    },
    [],
  );

  // Memoizar toggle de mostrar senha
  const toggleShowSenha = useCallback(() => {
    setShowSenha((v) => !v);
  }, []);

  const validate = useCallback((): boolean => {
    const newErrors: Record<string, string> = {};
    if (!form.email.trim()) {
      newErrors.email = "E-mail é obrigatório.";
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
      newErrors.email = "Insira um e-mail válido.";
    }
    if (!form.senha) {
      newErrors.senha = "Senha é obrigatória.";
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }, [form.email, form.senha]);

  const handleLogin = useCallback(async (): Promise<void> => {
    if (!validate()) return;
    setLoading(true);
    setApiError("");

    try {
      const result = await login({
        email: form.email.trim(),
        password: form.senha,
      });

      if (!result.ok) {
        setApiError(result.error || "E-mail ou senha incorretos.");
      } else {
        // Registra o push deste aparelho (mobile). Fire-and-forget: nao atrasa
        // nem bloqueia a navegacao; falha silenciosa (push e um extra).
        void registerForPushNotifications();
        const route = getRouteForRole(result.role ?? "");
        router.replace(route);
      }
    } catch {
      setApiError("Não foi possível conectar ao servidor.");
    } finally {
      setLoading(false);
    }
  }, [validate, form.email, form.senha]);

  return (
    <View style={styles.screen}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.authBg} />
      <DecorativeBackground />

      {/* KeyboardAvoidingView so no iOS: no Android conflita com o ScrollView. */}
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        scrollEventThrottle={16}
        nestedScrollEnabled={false}
        bounces={false}
      >
        {/* Header */}
        <View style={[styles.header]}>
          <View style={styles.logoMark}>
            <Ionicons name="leaf-outline" size={26} color="#fff" />
          </View>
          <Text style={styles.appName}>Uni3 Clinic Management</Text>
          <Text style={styles.headerTitle}>Bem-vindo de volta</Text>
          <Text style={styles.headerSubtitle}>
            Entre com sua conta para continuar
          </Text>
        </View>

        {/* Card */}
        <View style={[styles.card]}>
          <MemoizedFloatingInput
            label="E-mail"
            value={form.email}
            onChangeText={set("email")}
            keyboardType="email-address"
            autoComplete="email"
            textContentType="emailAddress"
            error={errors.email}
            returnKeyType="next"
            // onSubmitEditing removido — forçar foco via código causa salto no Android
          />
          <MemoizedFloatingInput
            label="Senha"
            value={form.senha}
            onChangeText={set("senha")}
            secureTextEntry={!showSenha}
            autoComplete="current-password"
            textContentType="password"
            error={errors.senha}
            rightIcon={showSenha ? "eye-off-outline" : "eye-outline"}
            onRightIconPress={toggleShowSenha}
            returnKeyType="done"
            onSubmitEditing={handleLogin}
            inputRef={senhaRef}
          />

          {/* Esqueci minha senha */}
          <TouchableOpacity
            style={styles.forgotBtn}
            onPress={() => router.push("/esqueci-senha" as any)}
          >
            <Text style={styles.forgotText}>Esqueci minha senha</Text>
          </TouchableOpacity>

          {/* API Error */}
          {apiError ? (
            <View style={styles.apiErrorBox}>
              <Ionicons
                name="alert-circle-outline"
                size={16}
                color="#c0392b"
                style={{ marginRight: 6 }}
              />
              <Text style={styles.apiErrorText}>{apiError}</Text>
            </View>
          ) : null}

          {/* Submit */}
          <TouchableOpacity
            style={[styles.primaryBtn, loading && styles.primaryBtnDisabled]}
            onPress={handleLogin}
            disabled={loading}
            activeOpacity={0.85}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.primaryBtnText}>Entrar</Text>
            )}
          </TouchableOpacity>

          {/* {__DEV__ && (
            <>
              <TouchableOpacity
                style={styles.demoBtn}
                onPress={() => router.replace("/homep")}
                activeOpacity={0.85}
              >
                <Ionicons name="flash-outline" size={18} color={colors.primary} />
                <Text style={styles.demoBtnText}>Entrar em modo demo</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.adminBtn}
                onPress={() => router.replace("/(admin)")}
                activeOpacity={0.85}
              >
                <Ionicons
                  name="shield-checkmark-outline"
                  size={18}
                  color={colors.primaryStrong}
                />
                <Text style={styles.adminBtnText}>Entrar como admin</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.psychologistBtn}
                onPress={() => router.replace("/dashboardP")}
                activeOpacity={0.85}
              >
                <Ionicons name="medkit-outline" size={18} color="#2d6cdf" />
                <Text style={styles.psychologistBtnText}>
                  Entrar como psicólogo
                </Text>
              </TouchableOpacity>
            </>
          )} */}

        </View>
      </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────
const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    screen: {
      flex: 1,
      backgroundColor: colors.authBg,
      // Os circulos decorativos ultrapassam a borda; sem isso a tela mobile
      // ganha rolagem/largura horizontal e o layout quebra.
      overflow: "hidden",
    },
    decor: {
      ...StyleSheet.absoluteFillObject,
      overflow: "hidden",
      pointerEvents: "none",
    },
    scroll: {
      flexGrow: 1,
      paddingHorizontal: 24,
      paddingTop: 80,
      paddingBottom: 40,
      justifyContent: "center",
    },

    // Decorative
    circle1: {
      position: "absolute",
      width: 260,
      height: 260,
      borderRadius: 130,
      backgroundColor: colors.primaryTint,
      opacity: 0.45,
      top: -80,
      right: -80,
    },
    circle2: {
      position: "absolute",
      width: 160,
      height: 160,
      borderRadius: 80,
      backgroundColor: colors.primaryAccent,
      opacity: 0.3,
      bottom: 120,
      left: -50,
    },
    circle3: {
      position: "absolute",
      width: 90,
      height: 90,
      borderRadius: 45,
      backgroundColor: colors.primary,
      opacity: 0.08,
      top: 220,
      left: 20,
    },

    // Header
    header: {
      alignItems: "center",
      marginBottom: 32,
    },
    logoMark: {
      width: 56,
      height: 56,
      borderRadius: 18,
      backgroundColor: colors.primary,
      alignItems: "center",
      justifyContent: "center",
      marginBottom: 10,
      shadowColor: colors.primary,
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: 0.3,
      shadowRadius: 12,
      elevation: 8,
    },
    appName: {
      fontSize: 12,
      fontWeight: "700",
      color: colors.primaryAccent,
      letterSpacing: 2,
      textTransform: "uppercase",
      marginBottom: 8,
      textAlign: "center",
    },
    headerTitle: {
      fontSize: 28,
      fontWeight: "800",
      color: "#1a3d31",
      marginBottom: 6,
      letterSpacing: -0.5,
    },
    headerSubtitle: {
      fontSize: 14,
      color: "#6b9e8a",
      textAlign: "center",
    },

    // Card
    card: {
      backgroundColor: colors.white,
      borderRadius: 24,
      padding: 24,
      maxWidth: 480,
      alignSelf: "center",
      width: "100%",
      shadowColor: colors.primary,
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.1,
      shadowRadius: 24,
      elevation: 6,
    },

    // Input
    inputWrapper: {
      marginBottom: 14,
    },
    inputContainer: {
      height: 58,
      borderWidth: 1.5,
      borderColor: "#d4ede3",
      borderRadius: 14,
      backgroundColor: "#fafffe",
      justifyContent: "flex-end",
      paddingHorizontal: 16,
      paddingBottom: 8,
      position: "relative",
    },
    inputContainerFocused: {
      borderColor: colors.primary,
      backgroundColor: colors.white,
      shadowColor: colors.primary,
      shadowOffset: { width: 0, height: 0 },
      shadowOpacity: 0.15,
      shadowRadius: 8,
      elevation: 2,
    },
    inputContainerError: {
      borderColor: "#e05c5c",
      backgroundColor: "#fff8f8",
    },
    floatingLabel: {
      position: "absolute",
      left: 16,
      fontWeight: "500",
    },
    textInput: {
      height: 24,
      fontSize: 15,
      color: "#1a3d31",
      fontWeight: "500",
      paddingRight: 36,
      paddingVertical: 0,
    },
    eyeBtn: {
      position: "absolute",
      right: 12,
      top: 16,
      padding: 4,
    },
    errorText: {
      fontSize: 12,
      color: "#e05c5c",
      marginTop: 4,
      marginLeft: 4,
    },

    // Forgot password
    forgotBtn: {
      alignSelf: "flex-end",
      marginBottom: 8,
      marginTop: -4,
    },
    forgotText: {
      fontSize: 13,
      color: colors.primary,
      fontWeight: "600",
    },

    // API Error
    apiErrorBox: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: "#fff1f1",
      borderWidth: 1,
      borderColor: "#f5c0c0",
      borderRadius: 12,
      padding: 12,
      marginBottom: 16,
    },
    apiErrorText: {
      fontSize: 13,
      color: "#c0392b",
      fontWeight: "500",
      flex: 1,
    },

    // Button
    primaryBtn: {
      backgroundColor: colors.primary,
      borderRadius: 14,
      height: 54,
      alignItems: "center",
      justifyContent: "center",
      marginTop: 4,
      shadowColor: colors.primary,
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: 0.35,
      shadowRadius: 12,
      elevation: 6,
    },
    primaryBtnDisabled: {
      opacity: 0.7,
    },
    primaryBtnText: {
      color: colors.white,
      fontSize: 16,
      fontWeight: "700",
      letterSpacing: 0.3,
    },
    demoBtn: {
      marginTop: 12,
      height: 52,
      borderRadius: 14,
      borderWidth: 1.5,
      borderColor: "#cfe7dc",
      backgroundColor: "#f8fdfb",
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
    },
    demoBtnText: {
      color: colors.primary,
      fontSize: 15,
      fontWeight: "700",
    },
    adminBtn: {
      marginTop: 10,
      height: 52,
      borderRadius: 14,
      borderWidth: 1.5,
      borderColor: "#b9dccd",
      backgroundColor: "#eef8f3",
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
    },
    adminBtnText: {
      color: colors.primaryStrong,
      fontSize: 15,
      fontWeight: "700",
    },
    psychologistBtn: {
      marginTop: 10,
      height: 52,
      borderRadius: 14,
      borderWidth: 1.5,
      borderColor: "#cddff8",
      backgroundColor: "#f3f8ff",
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
    },
    psychologistBtnText: {
      color: "#2d6cdf",
      fontSize: 15,
      fontWeight: "700",
    },

    // Divider
    dividerRow: {
      flexDirection: "row",
      alignItems: "center",
      marginVertical: 20,
    },
    dividerLine: {
      flex: 1,
      height: 1,
      backgroundColor: "#e0f0e8",
    },
    dividerText: {
      marginHorizontal: 12,
      color: "#9bbfb0",
      fontSize: 13,
      fontWeight: "500",
    },

    // Register link
    registerLink: {
      alignItems: "center",
      paddingVertical: 4,
    },
    registerLinkText: {
      fontSize: 14,
      color: "#6b9e8a",
    },
    registerLinkBold: {
      color: colors.primary,
      fontWeight: "700",
    },
  });
