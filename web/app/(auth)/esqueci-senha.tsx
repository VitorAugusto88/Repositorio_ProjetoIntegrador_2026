import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import React, { useMemo, useRef, useState } from "react";
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
  View,
} from "react-native";
import { ThemeColors } from "../../constants/theme-palettes";
import { useTheme } from "../../contexts/ThemeContext";
import { requestPasswordReset } from "../../services/api";

interface FloatingInputProps {
  label: string;
  value: string;
  onChangeText: (val: string) => void;
  keyboardType?: KeyboardTypeOptions;
  autoCapitalize?: "none" | "sentences" | "words" | "characters";
  error?: string;
}

const DecorativeBackground = () => {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <>
      <View style={styles.circle1} />
      <View style={styles.circle2} />
      <View style={styles.circle3} />
    </>
  );
};

const FloatingInput = ({
  label,
  value,
  onChangeText,
  keyboardType,
  autoCapitalize,
  error,
}: FloatingInputProps) => {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [focused, setFocused] = useState(false);
  const animatedLabel = useRef(new Animated.Value(value ? 1 : 0)).current;

  const animate = (toValue: number) => {
    Animated.timing(animatedLabel, {
      toValue,
      duration: 180,
      useNativeDriver: false,
    }).start();
  };

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
          style={styles.textInput}
          value={value}
          onChangeText={onChangeText}
          onFocus={() => {
            setFocused(true);
            animate(1);
          }}
          onBlur={() => {
            setFocused(false);
            if (!value) animate(0);
          }}
          keyboardType={keyboardType ?? "default"}
          autoCapitalize={autoCapitalize ?? "none"}
          placeholderTextColor="transparent"
        />
      </View>
      {error ? <Text style={styles.errorText}>{error}</Text> : null}
    </View>
  );
};

export default function ForgotPasswordScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [apiError, setApiError] = useState("");
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(30)).current;

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

  const handleSubmit = async () => {
    const trimmedEmail = email.trim();
    setError("");
    setApiError("");

    if (!trimmedEmail) {
      setError("E-mail é obrigatório.");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      setError("Insira um e-mail válido.");
      return;
    }

    setLoading(true);
    const result = await requestPasswordReset(trimmedEmail);
    if (result.ok) {
      setSent(true);
    } else {
      setApiError(result.error || "Não foi possível solicitar a recuperação.");
    }
    setLoading(false);
  };

  return (
    <View style={styles.screen}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.authBg} />
      <DecorativeBackground />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <Animated.View
            style={[
              styles.header,
              { opacity: fadeAnim, transform: [{ translateY: slideAnim }] },
            ]}
          >
            <View style={styles.logoMark}>
              <Ionicons name="mail-outline" size={26} color="#fff" />
            </View>
            <Text style={styles.appName}>Uni3 Clinic Management</Text>
            <Text style={styles.headerTitle}>Recuperar senha</Text>
            <Text style={styles.headerSubtitle}>
              Informe seu e-mail para receber o link de redefinição
            </Text>
          </Animated.View>

          <Animated.View
            style={[
              styles.card,
              { opacity: fadeAnim, transform: [{ translateY: slideAnim }] },
            ]}
          >
            {sent ? (
              <View style={styles.successBox}>
                <View style={styles.successIcon}>
                  <Ionicons name="checkmark" size={30} color={colors.primary} />
                </View>
                <Text style={styles.successTitle}>Verifique seu e-mail</Text>
                <Text style={styles.successText}>
                  Se o endereço existir no sistema, enviaremos instruções para
                  criar uma nova senha.
                </Text>
              </View>
            ) : (
              <>
                <FloatingInput
                  label="E-mail"
                  value={email}
                  onChangeText={(value) => {
                    setEmail(value);
                    setError("");
                    setApiError("");
                  }}
                  keyboardType="email-address"
                  error={error}
                />

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

                <TouchableOpacity
                  style={[
                    styles.primaryBtn,
                    loading && styles.primaryBtnDisabled,
                  ]}
                  onPress={handleSubmit}
                  disabled={loading}
                  activeOpacity={0.85}
                >
                  {loading ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={styles.primaryBtnText}>Enviar link</Text>
                  )}
                </TouchableOpacity>
              </>
            )}

            <TouchableOpacity
              style={styles.secondaryBtn}
              onPress={() => router.replace("/login")}
              activeOpacity={0.85}
            >
              <Ionicons name="arrow-back-outline" size={18} color={colors.primary} />
              <Text style={styles.secondaryBtnText}>Voltar para login</Text>
            </TouchableOpacity>
          </Animated.View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.authBg },
    scroll: {
      flexGrow: 1,
      paddingHorizontal: 24,
      paddingTop: 80,
      paddingBottom: 40,
      justifyContent: "center",
    },
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
    header: { alignItems: "center", marginBottom: 32 },
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
    },
    headerSubtitle: {
      fontSize: 14,
      color: "#6b9e8a",
      textAlign: "center",
      lineHeight: 20,
    },
    card: {
      backgroundColor: colors.white,
      borderRadius: 24,
      padding: 24,
      maxWidth: 480,
      alignSelf: 'center' as const,
      width: '100%' as const,
      shadowColor: colors.primary,
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.1,
      shadowRadius: 24,
      elevation: 6,
    },
    inputWrapper: { marginBottom: 14 },
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
      fontSize: 15,
      color: "#1a3d31",
      fontWeight: "500",
    },
    errorText: {
      fontSize: 12,
      color: "#e05c5c",
      marginTop: 4,
      marginLeft: 4,
    },
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
    primaryBtnDisabled: { opacity: 0.7 },
    primaryBtnText: {
      color: colors.white,
      fontSize: 16,
      fontWeight: "700",
    },
    secondaryBtn: {
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
    secondaryBtnText: {
      color: colors.primary,
      fontSize: 15,
      fontWeight: "700",
    },
    successBox: { alignItems: "center", paddingVertical: 8 },
    successIcon: {
      width: 66,
      height: 66,
      borderRadius: 33,
      backgroundColor: colors.primaryTint,
      alignItems: "center",
      justifyContent: "center",
      marginBottom: 16,
    },
    successTitle: {
      fontSize: 21,
      fontWeight: "800",
      color: "#1a3d31",
      marginBottom: 8,
      textAlign: "center",
    },
    successText: {
      fontSize: 14,
      lineHeight: 21,
      color: "#6b9e8a",
      textAlign: "center",
      marginBottom: 8,
    },
  });
