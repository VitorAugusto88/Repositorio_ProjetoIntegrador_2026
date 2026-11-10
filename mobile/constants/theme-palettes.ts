// Sistema de paletas de cores por clínica.
//
// Cada clínica escolhe um `ThemePreset`. Os presets "blue" e "purple" (e a
// cor "custom" escolhida livremente pelo admin) são gerados algoritmicamente
// a partir de uma única cor-semente via `deriveTonalPalette`, garantindo que
// qualquer cor escolhida produza um conjunto de tons com contraste legível.
// O preset "default" é a paleta verde original do app: hex literais, sem
// passar pelo gerador, pra não haver nenhuma regressão visual em clínicas
// já cadastradas.

export type ThemePreset = "default" | "blue" | "purple" | "custom";

export interface ThemeColors {
  primary: string; // marca principal: headers, botões primários, ícones ativos, spinners
  primaryStrong: string; // tom mais escuro da marca (pressed states, acentos fortes)
  primaryAccent: string; // tom médio, usado nas telas de autenticação
  primaryTint: string; // tom bem claro, fundo de ícones/badges
  pageBg: string; // fundo padrão das telas
  authBg: string; // fundo bem claro específico das telas de login/cadastro
  border: string; // bordas de cards/inputs
  textDark: string; // texto principal
  textMuted: string; // texto secundário/hint
  placeholder: string; // texto de placeholder em inputs
  white: string;
}

// ─── Conversão de cor ──────────────────────────────────────────────────────

interface Hsl {
  h: number; // 0-360
  s: number; // 0-100
  l: number; // 0-100
}

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

export const hexToHsl = (hex: string): Hsl => {
  const normalized = hex.replace("#", "");
  const r = parseInt(normalized.substring(0, 2), 16) / 255;
  const g = parseInt(normalized.substring(2, 4), 16) / 255;
  const b = parseInt(normalized.substring(4, 6), 16) / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;

  if (max === min) return { h: 0, s: 0, l: l * 100 };

  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);

  let h: number;
  switch (max) {
    case r:
      h = (g - b) / d + (g < b ? 6 : 0);
      break;
    case g:
      h = (b - r) / d + 2;
      break;
    default:
      h = (r - g) / d + 4;
  }
  h *= 60;

  return { h, s: s * 100, l: l * 100 };
};

const hueToRgb = (p: number, q: number, t: number): number => {
  let tt = t;
  if (tt < 0) tt += 1;
  if (tt > 1) tt -= 1;
  if (tt < 1 / 6) return p + (q - p) * 6 * tt;
  if (tt < 1 / 2) return q;
  if (tt < 2 / 3) return p + (q - p) * (2 / 3 - tt) * 6;
  return p;
};

export const hslToHex = ({ h, s, l }: Hsl): string => {
  const hh = ((h % 360) + 360) % 360 / 360;
  const ss = clamp(s, 0, 100) / 100;
  const ll = clamp(l, 0, 100) / 100;

  if (ss === 0) {
    const v = Math.round(ll * 255);
    const hex = v.toString(16).padStart(2, "0");
    return `#${hex}${hex}${hex}`;
  }

  const q = ll < 0.5 ? ll * (1 + ss) : ll + ss - ll * ss;
  const p = 2 * ll - q;
  const r = hueToRgb(p, q, hh + 1 / 3);
  const g = hueToRgb(p, q, hh);
  const b = hueToRgb(p, q, hh - 1 / 3);

  const toHex = (v: number) =>
    Math.round(clamp(v, 0, 1) * 255)
      .toString(16)
      .padStart(2, "0");

  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
};

export const isValidHexColor = (value: string): boolean =>
  /^#[0-9A-Fa-f]{6}$/.test(value);

// ─── Geração da paleta a partir de uma cor-semente ────────────────────────

export const deriveTonalPalette = (seedHex: string): ThemeColors => {
  const seed = hexToHsl(seedHex);

  // `primary` preserva o H/S/L da cor escolhida, só garantindo contraste
  // mínimo legível com texto branco em cima (headers, botões).
  const primaryS = clamp(seed.s, 35, 75);
  const primaryL = clamp(seed.l, 28, 45);
  const h = seed.h;

  const primary = hslToHex({ h, s: primaryS, l: primaryL });
  const primaryStrong = hslToHex({
    h,
    s: clamp(primaryS + 5, 0, 80),
    l: clamp(primaryL - 9, 15, 100),
  });
  const primaryAccent = hslToHex({
    h,
    s: clamp(primaryS - 17, 10, 100),
    l: clamp(primaryL + 15, 0, 70),
  });

  return {
    primary,
    primaryStrong,
    primaryAccent,
    primaryTint: hslToHex({ h, s: 48, l: 94 }),
    pageBg: hslToHex({ h, s: 24, l: 93 }),
    authBg: hslToHex({ h, s: 50, l: 96 }),
    border: hslToHex({ h, s: 26, l: 90 }),
    textDark: hslToHex({ h, s: 40, l: 15 }),
    textMuted: hslToHex({ h, s: 12, l: 43 }),
    placeholder: hslToHex({ h, s: 17, l: 64 }),
    white: "#ffffff",
  };
};

// ─── Paletas prontas ───────────────────────────────────────────────────────

// Paleta original do app — hex literais, para não gerar nenhuma diferença
// visual em clínicas já cadastradas (theme_preset='default' é o padrão).
const DEFAULT_PALETTE: ThemeColors = {
  primary: "#2e8b6e",
  primaryStrong: "#1e6b54",
  primaryAccent: "#5aab8a",
  primaryTint: "#e8f7f1",
  pageBg: "#e8f1ec",
  authBg: "#f0faf5",
  border: "#dfece5",
  textDark: "#17352b",
  textMuted: "#5f7a6f",
  placeholder: "#94b3a6",
  white: "#ffffff",
};

// Sementes das paletas prontas 2 e 3 — geradas pelo mesmo algoritmo usado
// para a cor personalizada, garantindo consistência visual entre as opções.
export const BLUE_SEED = "#2563eb";
export const PURPLE_SEED = "#7c3aed"; // mesma cor já usada como acento no dashboard

export const PRESET_PALETTES: Record<Exclude<ThemePreset, "custom">, ThemeColors> = {
  default: DEFAULT_PALETTE,
  blue: deriveTonalPalette(BLUE_SEED),
  purple: deriveTonalPalette(PURPLE_SEED),
};

export const PRESET_LABELS: Record<ThemePreset, string> = {
  default: "Verde (padrão)",
  blue: "Azul",
  purple: "Roxo",
  custom: "Personalizada",
};

// Swatch de referência de cada preset — usado nos cards de seleção da tela
// de Aparência, sem precisar montar a paleta inteira só pra mostrar a bolinha.
export const PRESET_SWATCH: Record<ThemePreset, string> = {
  default: DEFAULT_PALETTE.primary,
  blue: PRESET_PALETTES.blue.primary,
  purple: PRESET_PALETTES.purple.primary,
  custom: "",
};

export const resolveThemeColors = (
  preset: ThemePreset,
  customColor?: string | null,
): ThemeColors => {
  if (preset === "custom") {
    if (customColor && isValidHexColor(customColor)) {
      return deriveTonalPalette(customColor);
    }
    return DEFAULT_PALETTE;
  }
  return PRESET_PALETTES[preset] ?? DEFAULT_PALETTE;
};
