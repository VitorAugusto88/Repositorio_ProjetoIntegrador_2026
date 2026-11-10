import AsyncStorage from "@react-native-async-storage/async-storage";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  resolveThemeColors,
  ThemeColors,
  ThemePreset,
} from "../constants/theme-palettes";
import { getClinicData, getClinicId, updateClinic } from "../services/api";

const CACHE_KEY_PREFIX = "@clinica:theme:";

interface CachedTheme {
  preset: ThemePreset;
  color: string | null;
}

interface ThemeContextValue {
  colors: ThemeColors;
  themePreset: ThemePreset;
  customColor: string | null;
  applyTheme: (
    preset: ThemePreset,
    customHex?: string,
  ) => Promise<{ ok: boolean; error?: string }>;
  refreshTheme: () => Promise<void>;
}

const DEFAULT_COLORS = resolveThemeColors("default");

const ThemeContext = createContext<ThemeContextValue>({
  colors: DEFAULT_COLORS,
  themePreset: "default",
  customColor: null,
  applyTheme: async () => ({ ok: false, error: "Tema ainda não carregado." }),
  refreshTheme: async () => {},
});

// Hook usado em toda tela pra ler as cores da clínica do usuário logado.
// Fora de uma clínica (deslogado, telas de auth) sempre resolve pro tema
// 'default' — a paleta original do app.
export const useTheme = (): ThemeContextValue => useContext(ThemeContext);

export const ThemeProvider = ({ children }: { children: React.ReactNode }) => {
  // Nasce já com o preset 'default' (sem loading state visível) — evita
  // qualquer flash de tela sem cor antes do primeiro carregamento.
  const [themePreset, setThemePreset] = useState<ThemePreset>("default");
  const [customColor, setCustomColor] = useState<string | null>(null);
  const clinicIdRef = useRef<string | null>(null);

  const colors = useMemo(
    () => resolveThemeColors(themePreset, customColor),
    [themePreset, customColor],
  );

  const loadTheme = useCallback(async () => {
    const clinicId = await getClinicId();
    clinicIdRef.current = clinicId;

    if (!clinicId) {
      setThemePreset("default");
      setCustomColor(null);
      return;
    }

    // Cache-first: repinta com a cor certa rápido em reaberturas do app,
    // antes de esperar a resposta de rede (que é sempre assíncrona).
    try {
      const cached = await AsyncStorage.getItem(`${CACHE_KEY_PREFIX}${clinicId}`);
      if (cached) {
        const parsed = JSON.parse(cached) as CachedTheme;
        setThemePreset(parsed.preset);
        setCustomColor(parsed.color);
      }
    } catch {
      // Cache corrompido/ausente: segue pro fetch de rede normalmente.
    }

    const result = await getClinicData(clinicId);
    if (!result.ok || !result.data) return;

    const preset = (result.data.theme_preset as ThemePreset) || "default";
    const color = (result.data.theme_primary_color as string) || null;

    setThemePreset(preset);
    setCustomColor(color);
    await AsyncStorage.setItem(
      `${CACHE_KEY_PREFIX}${clinicId}`,
      JSON.stringify({ preset, color } as CachedTheme),
    );
  }, []);

  useEffect(() => {
    void loadTheme();
  }, [loadTheme]);

  // Chamado pela tela de Configurações (admin) ao trocar a paleta da clínica.
  // Atualiza o backend e, em caso de sucesso, já repinta o app inteiro.
  const applyTheme = useCallback(
    async (preset: ThemePreset, customHex?: string) => {
      const clinicId = clinicIdRef.current ?? (await getClinicId());
      if (!clinicId) {
        return { ok: false, error: "Nenhuma clínica associada ao usuário." };
      }

      const payload: { theme_preset: ThemePreset; theme_primary_color?: string } = {
        theme_preset: preset,
      };
      if (preset === "custom" && customHex) {
        payload.theme_primary_color = customHex;
      }

      const result = await updateClinic(clinicId, payload);
      if (!result.ok) {
        return { ok: false, error: result.error || "Não foi possível salvar a cor da clínica." };
      }

      const color = preset === "custom" ? customHex ?? null : null;
      setThemePreset(preset);
      setCustomColor(color);
      await AsyncStorage.setItem(
        `${CACHE_KEY_PREFIX}${clinicId}`,
        JSON.stringify({ preset, color } as CachedTheme),
      );
      return { ok: true };
    },
    [],
  );

  const value = useMemo<ThemeContextValue>(
    () => ({ colors, themePreset, customColor, applyTheme, refreshTheme: loadTheme }),
    [colors, themePreset, customColor, applyTheme, loadTheme],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
};
