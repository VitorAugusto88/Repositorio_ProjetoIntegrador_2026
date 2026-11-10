import { Alert, Platform } from "react-native";

// Confirmacao cross-platform. O Alert.alert do React Native NAO funciona na web
// (alvo principal do projeto): o dialogo nunca aparece e o callback de confirmacao
// nunca dispara. Na web usamos window.confirm; no nativo, o Alert com dois botoes.
export const confirmAction = (
  title: string,
  message: string,
  onConfirm: () => void,
  options?: { confirmText?: string; cancelText?: string },
): void => {
  const confirmText = options?.confirmText ?? "Confirmar";
  const cancelText = options?.cancelText ?? "Cancelar";

  if (Platform.OS === "web") {
    const ok =
      typeof window !== "undefined" && typeof window.confirm === "function"
        ? window.confirm(`${title}\n\n${message}`)
        : true;
    if (ok) onConfirm();
    return;
  }

  Alert.alert(title, message, [
    { text: cancelText, style: "cancel" },
    { text: confirmText, style: "destructive", onPress: onConfirm },
  ]);
};
