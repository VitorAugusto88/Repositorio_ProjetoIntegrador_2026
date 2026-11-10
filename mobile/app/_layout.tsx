import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import 'react-native-reanimated';

import { useColorScheme } from '@/hooks/use-color-scheme';
import FeedbackHost from '../components/FeedbackHost';
import { ThemeProvider as ClinicThemeProvider } from '../contexts/ThemeContext';
import { getAccessToken } from '../services/api';
import { registerForPushNotifications, setupNotificationListeners } from '../services/push';

export default function RootLayout() {
  const colorScheme = useColorScheme();

  useEffect(() => {
    // Listeners de toque na notificacao (deep link para chat/consulta).
    const cleanup = setupNotificationListeners();
    // Sessao ja ativa ao reabrir o app: reregistra o token (pode ter mudado).
    getAccessToken().then((token) => {
      if (token) void registerForPushNotifications();
    });
    return cleanup;
  }, []);

  return (
    <ClinicThemeProvider>
      <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
        <Stack screenOptions={{ headerShown: false, animation: 'slide_from_right' }} />
        <StatusBar style="auto" />
        <FeedbackHost />
      </ThemeProvider>
    </ClinicThemeProvider>
  );
}
