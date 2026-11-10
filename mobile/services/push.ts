/**
 * Notificacoes push (Expo Push Service) — apenas mobile (Android/iOS).
 *
 * No web nao registramos push (decisao do projeto: web fica com in-app + tempo
 * real). Toda a integracao com o backend passa por registerDeviceToken /
 * unregisterDeviceToken em services/api.ts.
 */
import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { router } from "expo-router";
import { Platform } from "react-native";

import { registerDeviceToken } from "./api";

// Exibe a notificacao mesmo com o app em primeiro plano (banner + som).
// So no mobile — no web nao ha push.
if (Platform.OS !== "web") {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
}

const currentPlatform = (): "android" | "ios" | "web" =>
  Platform.OS === "ios" ? "ios" : Platform.OS === "android" ? "android" : "web";

// Descobre o projectId do EAS (necessario para o getExpoPushTokenAsync em build).
const getProjectId = (): string | undefined =>
  (Constants.expoConfig as any)?.extra?.eas?.projectId ??
  (Constants as any)?.easConfig?.projectId;

/**
 * Pede permissao, obtem o ExpoPushToken e registra no backend.
 * Silencioso em falha (nunca lanca) — push e um extra, nao pode travar o login.
 * Retorna o token registrado, ou null se nao foi possivel.
 */
export const registerForPushNotifications = async (): Promise<string | null> => {
  // Web fica de fora (push web exigiria Firebase JS + service worker).
  if (Platform.OS === "web") return null;

  // Push real so funciona em aparelho fisico.
  if (!Device.isDevice) {
    if (__DEV__) console.log("[push] emulador/simulador: push ignorado.");
    return null;
  }

  try {
    // Canal Android obrigatorio para exibir notificacoes.
    if (Platform.OS === "android") {
      await Notifications.setNotificationChannelAsync("default", {
        name: "Padrao",
        importance: Notifications.AndroidImportance.DEFAULT,
      });
    }

    const { status: existing } = await Notifications.getPermissionsAsync();
    let status = existing;
    if (existing !== "granted") {
      const req = await Notifications.requestPermissionsAsync();
      status = req.status;
    }
    if (status !== "granted") {
      if (__DEV__) console.log("[push] permissao negada.");
      return null;
    }

    const projectId = getProjectId();
    const tokenResponse = await Notifications.getExpoPushTokenAsync(
      projectId ? { projectId } : undefined,
    );
    const token = tokenResponse.data;
    if (!token) return null;

    const result = await registerDeviceToken(token, currentPlatform());
    if (!result.ok) {
      if (__DEV__) console.log("[push] falha ao registrar token:", result.error);
      return null;
    }
    if (__DEV__) console.log("[push] token registrado:", token);
    return token;
  } catch (e) {
    if (__DEV__) console.log("[push] erro ao registrar push:", e);
    return null;
  }
};

// Deep link ao tocar numa notificacao, usando o metadata enviado pelo backend.
const handleNotificationNavigation = (data: any) => {
  if (!data) return;
  const event = data.event as string | undefined;

  if (event === "new_message") {
    router.push("/(shared)/chat" as any);
    return;
  }
  // appointment_reminder / confirmed / cancelled / rescheduled
  if (event?.startsWith("appointment") && data.appointment_id) {
    router.push({
      pathname: "/(shared)/consulta-detalhe",
      params: { id: String(data.appointment_id) },
    } as any);
  }
};

/**
 * Registra os listeners de toque na notificacao (foreground e cold start).
 * Deve ser chamado uma vez no layout raiz. Retorna a funcao de cleanup.
 */
export const setupNotificationListeners = (): (() => void) => {
  // Web nao tem push aqui — nada a escutar.
  if (Platform.OS === "web") return () => {};

  // App aberto (foreground/background): usuario tocou na notificacao.
  const responseSub = Notifications.addNotificationResponseReceivedListener(
    (response) => {
      handleNotificationNavigation(response.notification.request.content.data);
    },
  );

  // App aberto a partir de estar totalmente fechado (cold start) via notificacao.
  Notifications.getLastNotificationResponseAsync().then((response) => {
    if (response) {
      handleNotificationNavigation(response.notification.request.content.data);
    }
  });

  return () => {
    responseSub.remove();
  };
};
