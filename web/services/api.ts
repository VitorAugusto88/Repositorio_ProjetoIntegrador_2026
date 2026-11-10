import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";

const LOCAL_API_BASE_URL = Platform.select({
  web: "http://127.0.0.1:8000/api",
  android: "http://10.0.2.2:8000/api",
  default: "http://127.0.0.1:8000/api",
}) as string;

const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_URL?.trim() || LOCAL_API_BASE_URL;

const STORAGE_KEYS = {
  accessToken: "@clinica:accessToken",
  refreshToken: "@clinica:refreshToken",
  clinicId: "@clinica:clinicId",
  pushToken: "@clinica:pushToken",
};

export interface JwtPayload {
  role?: string;
  full_name?: string;
  clinic_id?: string;
  [key: string]: any;
}

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface ClinicApiItem {
  id: string;
  name: string;
  address?: string;
  phone?: string;
  email?: string;
}

export interface RoomApiItem {
  id: string;
  clinic: string;
  name: string;
  description?: string;
  is_active: boolean;
  status?: "livre" | "ocupada";
}

export interface AppointmentApiItem {
  id: string;
  date?: string;
  time?: string;
  scheduled_at?: string;
  status?: string;
  status_display?: string;
  // Derivado no backend: consulta ainda em aberto cujo DIA ja passou.
  // Nunca e gravado nem forcado pelo usuario — so muda a exibicao.
  is_overdue?: boolean;
  completed_at?: string | null;
  psychologist?: string;
  specialty?: string;
  professional?: string;
  professional_detail?: {
    user?: { id: string; full_name?: string; email?: string };
  };
  patient?: string;
  room?: string | null;
  room_detail?: RoomApiItem | null;
  duration_minutes?: number;
  patient_detail?: {
    user: {
      id: string;
      full_name: string;
      email?: string;
      phone?: string;
    };
  };
}

// Nota de sessão do psicólogo sobre uma consulta.
// Visível APENAS ao profissional dono da consulta (regra do backend).
export interface SessionNoteApi {
  id: string;
  appointment: string;
  notes: string;
  created_at: string;
  updated_at: string;
}

export interface ConversationApiItem {
  id: string;
  psychologist_id?: string;
  psychologistName?: string;
  psychologistNameAlt?: string;
  specialty?: string;
  avatar?: string;
  unread_count?: number;
  last_message?: string;
  last_message_time?: string;
  online?: boolean;
}

export interface ChatMessageApiItem {
  id: string;
  conversation?: string;
  conversation_id?: string;
  sender: "patient" | "psychologist" | string;
  content_encrypted?: string;
  text?: string;
  message_type?: string;
  media_url?: string;
  media_name?: string;
  media_duration_ms?: number | null;
  attachment?: string;
  created_at: string;
  read?: boolean;
}

export interface DocumentApi {
  id: string;
  title: string;
  file_type: string;
  uploaded_at: string;
  size?: string;
  download_url?: string;
}

export interface NotificationApiItem {
  id: string;
  type: string;
  channel: string;
  status: string;
  title: string;
  body: string;
  metadata?: Record<string, any>;
  is_read: boolean;
  read_at?: string | null;
  sent_at?: string | null;
  created_at: string;
}

export interface ReportPeriodQuery {
  start_date?: string;
  end_date?: string;
  professional_id?: string;
  clinic_id?: string;
}

export interface ReportSummary {
  total_appointments?: number;
  unique_patients?: number;
  patients_attended?: number;
  scheduled?: number;
  completed?: number;
  cancelled?: number;
  rescheduled?: number;
  no_show?: number;
  attendance_rate_percent?: number;
  cancellation_rate_percent?: number;
  first_appointment_at?: string | null;
  last_appointment_at?: string | null;
}

export interface ReportRow {
  [key: string]: any;
}

export interface PatientReportApi {
  report: "patient" | "professional_patient";
  period: { start_date?: string | null; end_date?: string | null };
  patient?: ReportRow;
  professional?: ReportRow;
  summary: ReportSummary;
  status_counts: ReportRow[];
  frequency_by_month: ReportRow[];
  appointment_history: ReportRow[];
}

export interface ProfessionalSummaryReportApi {
  report: "professional_summary";
  period: { start_date?: string | null; end_date?: string | null };
  professional: ReportRow;
  summary: ReportSummary;
  status_counts: ReportRow[];
  volume_by_month: ReportRow[];
  patients: ReportRow[];
  appointments: ReportRow[];
}

export interface AdminAppointmentsReportApi {
  report: "admin_appointments";
  period: { start_date?: string | null; end_date?: string | null };
  clinic_id?: string | null;
  filters?: ReportRow;
  summary: ReportSummary;
  status_counts: ReportRow[];
  consultations_by_period: ReportRow[];
  consultations_by_professional: ReportRow[];
  appointments: ReportRow[];
}

// Tipagem fiel ao retorno real de GET /api/auth/professionals/
export interface ProfessionalApiItem {
  id: string; // UUID do ProfessionalProfile â€” usado no POST /appointments/
  user: {
    id: string;
    email: string;
    full_name: string;
    phone?: string;
    role?: string;
    clinic?: string;
    is_active?: boolean;
    created_at?: string;
    first_name?: string;
    last_name?: string;
  };
  crp?: string;
  specialty?: string;
  bio?: string;
  photo?: string | null;
  session_duration_minutes?: number;
  created_at?: string;
  updated_at?: string;
  // campos legados mantidos para compatibilidade
  name?: string;
  full_name?: string;
  first_name?: string;
  last_name?: string;
  psychologistName?: string;
  psychologistNameAlt?: string;
  professional?: string;
  initials?: string;
  color?: string;
  bg?: string;
  sessions?: number;
  available?: boolean;
}

export interface AppointmentAvailabilityApiItem {
  id: string;
  professional: string;
  weekday: number; // Django: 0=Seg, 1=Ter, 2=Qua, 3=Qui, 4=Sex, 5=SÃ¡b, 6=Dom
  weekday_display: string;
  start_time: string;
  end_time: string;
  blocked: boolean;
}

export interface PatientProfileApiItem {
  id: string;
  user: {
    id: string;
    email: string;
    full_name: string;
    phone?: string;
    role?: string;
    clinic?: string;
    is_active?: boolean;
    created_at?: string;
  };
  photo?: string | null;
  birth_date?: string | null;
  cpf?: string | null;
  medical_history?: string;
  anamnesis?: string;
  emergency_contact_name?: string;
  emergency_contact_phone?: string;
  // Psicólogo responsável pelo paciente. Definido pelo administrador no
  // cadastro — o paciente não escolhe com quem se consulta, só agenda com
  // quem está vinculado aqui. Para o paciente o campo é somente-leitura.
  assigned_professional?: string | null; // UUID do ProfessionalProfile
  assigned_professional_detail?: ProfessionalApiItem | null;
  created_at?: string;
  updated_at?: string;
}

export interface ApiResult<T = any> {
  ok: boolean;
  data?: T;
  error?: string;
  accessToken?: string;
  refreshToken?: string;
  role?: string;
}

export const normalizeDateToYYYYMMDD = (date?: string): string | undefined => {
  if (!date) return undefined;

  // Remove qualquer separador (-, /, ., espaço)
  const digits = date.replace(/[-\/\.\s]/g, "");

  if (digits.length !== 8 || !/^\d{8}$/.test(digits)) return undefined;

  // Detecta o formato: se começa com dia (DDMMYYYY) ou ano (YYYYMMDD)
  const firstPart = parseInt(digits.substring(0, 2), 10);

  // Se os dois primeiros dígitos forem > 31, assume que já está em YYYYMMDD
  if (firstPart > 31) return digits;

  // Caso contrário, assume DDMMYYYY → converte para YYYYMMDD
  const day = digits.substring(0, 2);
  const month = digits.substring(2, 4);
  const year = digits.substring(4, 8);

  return `${year}${month}${day}`;
};



const fetchJson = async (url: string, options: RequestInit = {}) => {
  const response = await fetchWithRefresh(url, options);
  const data = await response.json().catch(() => null);
  return { response, data };
};

const extractList = <T>(data: any): T[] =>
  Array.isArray(data) ? data : Array.isArray(data?.results) ? data.results : [];

const base64UrlDecode = (input: string): string => {
  const base64 = input.replace(/-/g, "+").replace(/_/g, "/");
  const pad = base64.length % 4;
  const padded =
    base64 + (pad === 2 ? "==" : pad === 3 ? "=" : pad === 1 ? "===" : "");
  // '=' fica fora da tabela de propÃ³sito: Ã© padding e deve ser ignorado no loop
  // (indexOf retorna -1 e o caractere Ã© pulado). IncluÃ­-lo corrompia o Ãºltimo
  // byte decodificado, quebrando o JSON.parse do token e zerando o role no login.
  const chars =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  const bytes = [] as number[];
  let buffer = 0;
  let bits = 0;
  for (let i = 0; i < padded.length; i += 1) {
    const val = chars.indexOf(padded.charAt(i));
    if (val === -1) continue;
    buffer = (buffer << 6) | val;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((buffer >> bits) & 0xff);
    }
  }
  try {
    return new TextDecoder().decode(new Uint8Array(bytes));
  } catch {
    return String.fromCharCode(...bytes);
  }
};

const parseJwt = (token: string): JwtPayload | null => {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length < 2) return null;
  try {
    return JSON.parse(base64UrlDecode(parts[1])) as JwtPayload;
  } catch {
    return null;
  }
};

export const normalizeError = (data: any): string => {
  if (!data) return "Ocorreu um erro inesperado.";
  if (typeof data === "string") return data;
  if (data.message) return String(data.message);
  if (data.error) return String(data.error);
  if (data.detail) return String(data.detail);
  if (typeof data === "object") {
    const values = Object.values(data).flat();
    if (values.length) return String(values[0]);
  }
  return "Ocorreu um erro inesperado.";
};

// O backend devolve media_url relativo (ex.: "/media/chat/attachments/...").
// Aqui montamos a URL absoluta usando a origem da API (API_BASE_URL sem o "/api").
export const resolveMediaUrl = (url?: string | null): string => {
  if (!url) return "";
  if (/^https?:\/\//i.test(url)) return url;
  const origin = API_BASE_URL.replace(/\/api\/?$/, "");
  return `${origin}${url.startsWith("/") ? "" : "/"}${url}`;
};

// â”€â”€â”€ Token Storage â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export const saveTokens = async (
  accessToken: string,
  refreshToken: string,
): Promise<void> => {
  const payload = parseJwt(accessToken);
  const clinicId = (payload?.clinic_id || payload?.clinic) ?? null;

  const storagePairs: [string, string][] = [
    [STORAGE_KEYS.accessToken, accessToken],
    [STORAGE_KEYS.refreshToken, refreshToken],
  ];

  if (clinicId) {
    storagePairs.push([STORAGE_KEYS.clinicId, clinicId]);
  }

  await AsyncStorage.multiSet(storagePairs);
};

export const getAccessToken = async (): Promise<string | null> =>
  AsyncStorage.getItem(STORAGE_KEYS.accessToken);

export const getRefreshToken = async (): Promise<string | null> =>
  AsyncStorage.getItem(STORAGE_KEYS.refreshToken);

export const getClinicId = async (): Promise<string | null> =>
  AsyncStorage.getItem(STORAGE_KEYS.clinicId);

export const clearTokens = async (): Promise<void> => {
  await AsyncStorage.multiRemove([
    STORAGE_KEYS.accessToken,
    STORAGE_KEYS.refreshToken,
    STORAGE_KEYS.clinicId,
    STORAGE_KEYS.pushToken,
  ]);
};

const createAuthHeaders = async (): Promise<Record<string, string> | null> => {
  const token = await getAccessToken();
  if (!token) return null;
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  };
};

// â”€â”€â”€ Token Refresh â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

// Single-flight: vÃ¡rias requisiÃ§Ãµes que tomam 401 ao mesmo tempo compartilham
// um Ãºnico refresh. Com ROTATE_REFRESH_TOKENS + BLACKLIST_AFTER_ROTATION, o
// primeiro refresh invalida o refresh token antigo, entÃ£o refreshes concorrentes
// com o token antigo falhariam.
let refreshPromise: Promise<string | null> | null = null;

const refreshAccessToken = async (): Promise<string | null> => {
  if (refreshPromise) return refreshPromise;

  refreshPromise = (async () => {
    try {
      const refreshToken = await getRefreshToken();
      if (!refreshToken) return null;

      const response = await fetch(`${API_BASE_URL}/auth/refresh/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refresh: refreshToken }),
      });
      const data = await response.json().catch(() => null);
      const newAccess = data?.access;

      if (!response.ok || !newAccess) {
        // Refresh expirado/invÃ¡lido â€” limpa a sessÃ£o para forÃ§ar novo login.
        await clearTokens();
        return null;
      }

      // ROTATE_REFRESH_TOKENS=True: o backend devolve um novo refresh a cada uso.
      await saveTokens(newAccess, data?.refresh ?? refreshToken);
      return newAccess;
    } catch {
      return null;
    } finally {
      refreshPromise = null;
    }
  })();

  return refreshPromise;
};

// Faz o fetch e, ao receber 401 numa requisiÃ§Ã£o autenticada, renova o token uma
// vez e refaz a chamada. RequisiÃ§Ãµes pÃºblicas (sem Authorization) passam direto.
const fetchWithRefresh = async (
  url: string,
  options: RequestInit = {},
): Promise<Response> => {
  const headers = {
    ...(options.headers as Record<string, string> | undefined),
  };
  const hadAuth = "Authorization" in headers;

  const response = await fetch(url, { ...options, headers });
  if (response.status !== 401 || !hadAuth) return response;

  const newToken = await refreshAccessToken();
  if (!newToken) return response;

  return fetch(url, {
    ...options,
    headers: { ...headers, Authorization: `Bearer ${newToken}` },
  });
};

// â”€â”€â”€ Auth â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export const login = async (
  credentials: LoginCredentials,
): Promise<ApiResult> => {
  const response = await fetch(`${API_BASE_URL}/auth/login/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(credentials),
  });
  const data = await response.json().catch(() => null);
  const accessToken = data?.access || data?.access_token;
  const refreshToken = data?.refresh || data?.refresh_token;
  if (!response.ok || !accessToken || !refreshToken) {
    return {
      ok: false,
      error: normalizeError(data) || "E-mail ou senha incorretos.",
      data,
    };
  }
  await saveTokens(accessToken, refreshToken);
  const role = getRoleFromToken(accessToken);
  return { ok: true, data, accessToken, refreshToken, role };
};

// POST /api/auth/logout/ - invalida o refresh token no backend (blacklist) e
// limpa a sessao local. A falha de rede nao impede o logout local: os tokens
// sao sempre removidos para garantir que o usuario realmente saia da conta.
export const logout = async (): Promise<ApiResult> => {
  const refreshToken = await getRefreshToken();
  const accessToken = await getAccessToken();

  // Desativa o device token de push ANTES de limpar a sessao (ainda ha token de
  // acesso valido). Assim o aparelho deslogado para de receber push.
  await unregisterDeviceToken();

  try {
    if (refreshToken && accessToken) {
      await fetch(`${API_BASE_URL}/auth/logout/`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ refresh: refreshToken }),
      });
    }
  } catch {
    // Sem conexao: ainda assim limpamos os tokens localmente abaixo.
  }

  await clearTokens();
  return { ok: true };
};

// â”€â”€â”€ Admin User Management â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

// GET /api/auth/admin/users/ â€” listar todos os usuÃ¡rios da clÃ­nica
export const getAdminUsers = async (): Promise<ApiResult<any[]>> => {
  const headers = await createAuthHeaders();
  if (!headers) return { ok: false, error: "UsuÃ¡rio nÃ£o autenticado." };
  const { response, data } = await fetchJson(
    `${API_BASE_URL}/auth/admin/users/`,
    { method: "GET", headers },
  );
  const results = extractList<any>(data);
  if (!response.ok)
    return { ok: false, error: normalizeError(data), data: results };
  return { ok: true, data: results };
};

// GET /api/auth/admin/users/<id>/ â€” detalhes de um usuÃ¡rio
export const getAdminUser = async (userId: string): Promise<ApiResult> => {
  const headers = await createAuthHeaders();
  if (!headers) return { ok: false, error: "UsuÃ¡rio nÃ£o autenticado." };
  const { response, data } = await fetchJson(
    `${API_BASE_URL}/auth/admin/users/${encodeURIComponent(userId)}/`,
    { method: "GET", headers },
  );
  if (!response.ok) return { ok: false, error: normalizeError(data), data };
  return { ok: true, data };
};

// PATCH /api/auth/admin/users/<id>/ â€” editar dados bÃ¡sicos do usuÃ¡rio
export const updateAdminUser = async (
  userId: string,
  payload: { full_name?: string; phone?: string; email?: string },
): Promise<ApiResult> => {
  const headers = await createAuthHeaders();
  if (!headers) return { ok: false, error: "UsuÃ¡rio nÃ£o autenticado." };
  const { response, data } = await fetchJson(
    `${API_BASE_URL}/auth/admin/users/${encodeURIComponent(userId)}/`,
    { method: "PATCH", headers, body: JSON.stringify(payload) },
  );
  if (!response.ok) return { ok: false, error: normalizeError(data), data };
  return { ok: true, data };
};

// PATCH /api/auth/admin/users/<id>/status/ â€” ativar/desativar usuÃ¡rio
export const toggleUserStatus = async (
  userId: string,
  isActive: boolean,
): Promise<ApiResult> => {
  const headers = await createAuthHeaders();
  if (!headers) return { ok: false, error: "UsuÃ¡rio nÃ£o autenticado." };
  const { response, data } = await fetchJson(
    `${API_BASE_URL}/auth/admin/users/${encodeURIComponent(userId)}/status/`,
    { method: "PATCH", headers, body: JSON.stringify({ is_active: isActive }) },
  );
  if (!response.ok) return { ok: false, error: normalizeError(data), data };
  return { ok: true, data };
};

// PATCH /api/auth/admin/users/<id>/role/ â€” alterar papel do usuÃ¡rio
export const changeUserRole = async (
  userId: string,
  role: string,
): Promise<ApiResult> => {
  const headers = await createAuthHeaders();
  if (!headers) return { ok: false, error: "UsuÃ¡rio nÃ£o autenticado." };
  const { response, data } = await fetchJson(
    `${API_BASE_URL}/auth/admin/users/${encodeURIComponent(userId)}/role/`,
    { method: "PATCH", headers, body: JSON.stringify({ role }) },
  );
  if (!response.ok) return { ok: false, error: normalizeError(data), data };
  return { ok: true, data };
};

// DELETE /api/auth/admin/users/<id>/ — excluir usuário
// preserveClinicalData=true  → arquiva/anonimiza (mantém documentos e consultas)
// preserveClinicalData=false → apaga o usuário e seus dados em cascata
export const deleteAdminUser = async (
  userId: string,
  preserveClinicalData: boolean,
): Promise<ApiResult> => {
  const headers = await createAuthHeaders();
  if (!headers) return { ok: false, error: "Usuário não autenticado." };
  const query = `?preserve_clinical_data=${preserveClinicalData ? "true" : "false"}`;
  const { response, data } = await fetchJson(
    `${API_BASE_URL}/auth/admin/users/${encodeURIComponent(userId)}/${query}`,
    { method: "DELETE", headers },
  );
  if (!response.ok) return { ok: false, error: normalizeError(data), data };
  return { ok: true, data };
};

// POST /api/auth/admin/users/professionals/ â€” criar profissional via admin
export const createProfessionalAsAdmin = async (payload: {
  email: string;
  full_name: string;
  phone?: string;
  crp?: string;
  specialty?: string;
  send_invite?: boolean;
  // Foto opcional do psicologo. Quando presente, o cadastro vai como
  // multipart/form-data (o backend salva em ProfessionalProfile.photo).
  photo?: { uri: string; name: string; type: string };
}): Promise<ApiResult> => {
  const { photo, ...rest } = payload;

  // Sem foto: mantem o envio JSON simples de sempre.
  if (!photo) {
    const headers = await createAuthHeaders();
    if (!headers) return { ok: false, error: "UsuÃ¡rio nÃ£o autenticado." };
    const { response, data } = await fetchJson(
      `${API_BASE_URL}/auth/admin/users/professionals/`,
      { method: "POST", headers, body: JSON.stringify(rest) },
    );
    if (!response.ok) return { ok: false, error: normalizeError(data), data };
    return { ok: true, data };
  }

  // Com foto: multipart. Nunca definir Content-Type manualmente — o boundary
  // precisa ser gerado automaticamente (mesmo padrao de uploadDocument).
  const token = await getAccessToken();
  if (!token) return { ok: false, error: "UsuÃ¡rio nÃ£o autenticado." };

  const formData = new FormData();
  Object.entries(rest).forEach(([key, value]) => {
    if (value !== undefined && value !== null) {
      formData.append(key, String(value));
    }
  });

  if (Platform.OS === "web") {
    const blobRes = await fetch(photo.uri);
    const blob = await blobRes.blob();
    const fileObj = new File([blob], photo.name, {
      type: blob.type || photo.type || "image/jpeg",
    });
    formData.append("photo", fileObj);
  } else {
    formData.append("photo", photo as any);
  }

  const res = await fetchWithRefresh(
    `${API_BASE_URL}/auth/admin/users/professionals/`,
    { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: formData },
  );
  const data = await res.json().catch(() => null);
  if (!res.ok) return { ok: false, error: normalizeError(data), data };
  return { ok: true, data };
};

// POST /api/auth/admin/users/patients/ â€” criar paciente via admin (requer autenticaÃ§Ã£o)
export const createPatientAsAdmin = async (payload: {
  email: string;
  full_name: string;
  phone?: string;
  birth_date?: string;
  cpf?: string;
  medical_history?: string;
  anamnesis?: string;
  emergency_contact_name?: string;
  emergency_contact_phone?: string;
  // Obrigatório: o backend recusa o cadastro sem o psicólogo responsável.
  assigned_professional: string; // UUID do ProfessionalProfile
  send_invite?: boolean;
}): Promise<ApiResult> => {
  const headers = await createAuthHeaders();
  if (!headers) return { ok: false, error: "UsuÃ¡rio nÃ£o autenticado." };
  if (__DEV__) console.log("birth_date (raw):", payload.birth_date);
  payload.birth_date = normalizeDateToYYYYMMDD(payload.birth_date);
  const { response, data } = await fetchJson(
    `${API_BASE_URL}/auth/admin/users/patients/`,
    {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    },
  );
  if (__DEV__) console.log("createPatientAsAdmin payload:", JSON.stringify(payload));

  if (!response.ok) return { ok: false, error: normalizeError(data), data };
  return { ok: true, data };
};

export const getMe = async (): Promise<ApiResult> => {
  const headers = await createAuthHeaders();
  if (!headers) return { ok: false, error: "UsuÃ¡rio nÃ£o autenticado." };
  const response = await fetchWithRefresh(`${API_BASE_URL}/auth/me/`, {
    method: "GET",
    headers,
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) return { ok: false, error: normalizeError(data), data };
  return { ok: true, data };
};

// Atualiza full_name e phone do usuÃ¡rio autenticado via PATCH /api/auth/me/
// O phone pertence ao model User â€” este Ã© o endpoint correto para salvÃ¡-lo
export const updateMe = async (payload: {
  full_name?: string;
  phone?: string;
}): Promise<ApiResult> => {
  const headers = await createAuthHeaders();
  if (!headers) return { ok: false, error: "UsuÃ¡rio nÃ£o autenticado." };
  const { response, data } = await fetchJson(`${API_BASE_URL}/auth/me/`, {
    method: "PATCH",
    headers,
    body: JSON.stringify(payload),
  });
  if (!response.ok) return { ok: false, error: normalizeError(data), data };
  return { ok: true, data };
};

// â”€â”€â”€ ClÃ­nicas â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

// Usado na tela de cadastro para listar clÃ­nicas disponÃ­veis (sem autenticaÃ§Ã£o)
export const getClinics = async (): Promise<ApiResult<ClinicApiItem[]>> => {
  const { response, data } = await fetchJson(`${API_BASE_URL}/clinics/`, {
    method: "GET",
    headers: { "Content-Type": "application/json" },
  });
  const results = extractList<ClinicApiItem>(data);
  if (!response.ok)
    return { ok: false, error: normalizeError(data), data: results };
  return { ok: true, data: results };
};

// â”€â”€â”€ Perfil do Paciente â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export const getPatientProfile = async (
  userId: string, // user.id de GET /api/auth/me/
): Promise<ApiResult<PatientProfileApiItem>> => {
  const headers = await createAuthHeaders();
  if (!headers) return { ok: false, error: "UsuÃ¡rio nÃ£o autenticado." };
  const { response, data } = await fetchJson(
    `${API_BASE_URL}/auth/patients/${encodeURIComponent(userId)}/profile/`,
    { method: "GET", headers },
  );
  if (!response.ok) return { ok: false, error: normalizeError(data), data };
  return { ok: true, data };
};

const extractPatientProfileIdFromUser = (user: any): string | null =>
  user?.patient_profile_id ??
  user?.patient_profile?.id ??
  user?.patientProfile?.id ??
  user?.patient?.id ??
  user?.profile?.id ??
  null;

export const getCurrentPatientProfileId = async (): Promise<ApiResult<string>> => {
  const me = await getMe();
  if (!me.ok || !me.data?.id) {
    return { ok: false, error: me.error || "Não foi possível identificar o paciente." };
  }

  // Tentativa 1: campo embutido no /me/
  const embeddedProfileId = extractPatientProfileIdFromUser(me.data);
  if (embeddedProfileId) return { ok: true, data: embeddedProfileId };

  // Tentativa 2: endpoint dedicado /auth/patients/<user_id>/profile/
  const profile = await getPatientProfile(me.data.id);
  if (profile.ok && profile.data?.id) return { ok: true, data: profile.data.id };

  // ❌ Removido: fallback getClinicPatients — proibido para pacientes (403)
  return {
    ok: false,
    error: "Perfil de paciente não encontrado. Contate o administrador da clínica.",
  };
};

export const updatePatientProfile = async (
  userId: string, // user.id de GET /api/auth/me/
  payload: Record<string, any>,
): Promise<ApiResult> => {
  const headers = await createAuthHeaders();
  if (!headers) return { ok: false, error: "UsuÃ¡rio nÃ£o autenticado." };
  const { response, data } = await fetchJson(
    `${API_BASE_URL}/auth/patients/${encodeURIComponent(userId)}/profile/`,
    { method: "PATCH", headers, body: JSON.stringify(payload) },
  );
  if (!response.ok) return { ok: false, error: normalizeError(data), data };
  return { ok: true, data };
};

// PATCH /api/auth/patients/<userId>/profile/ (multipart) — envia ou remove a
// foto de perfil do paciente. Passe `photo` para enviar uma nova foto, ou
// `null` para remover a atual.
export const updatePatientProfilePhoto = (
  userId: string,
  photo: { uri: string; name: string; type: string } | null,
): Promise<ApiResult> =>
  patchFileField(
    `${API_BASE_URL}/auth/patients/${encodeURIComponent(userId)}/profile/`,
    "photo",
    "remove_photo",
    photo,
  );

// PATCH /api/auth/patients/<userId>/profile/ — troca o psicólogo responsável.
// Só o administrador consegue: para o paciente o campo é somente-leitura no
// serializer, e um PATCH dele é ignorado silenciosamente pelo backend.
export const updatePatientAssignedProfessional = async (
  userId: string, // user.id do paciente (não o id do PatientProfile)
  professionalId: string, // UUID do ProfessionalProfile
): Promise<ApiResult> =>
  updatePatientProfile(userId, { assigned_professional: professionalId });

// Psicólogo vinculado ao paciente autenticado, já com nome, CRP, bio e foto.
// Vem do próprio perfil (assigned_professional_detail), sem requisição extra —
// usado na tela "Meu psicólogo" e para fixar o profissional no agendamento.
export const getMyAssignedProfessional = async (): Promise<
  ApiResult<ProfessionalApiItem | null>
> => {
  const me = await getMe();
  if (!me.ok || !me.data?.id) {
    return {
      ok: false,
      error: me.error || "Não foi possível identificar o paciente.",
    };
  }

  const profile = await getPatientProfile(me.data.id);
  if (!profile.ok) {
    return { ok: false, error: profile.error || "Perfil não encontrado." };
  }

  return { ok: true, data: profile.data?.assigned_professional_detail ?? null };
};

// GET /api/auth/<clinicId>/patients/
// Retorna lista de pacientes da clÃ­nica. Admin vÃª todos; psicÃ³logo sÃ³ vÃª os seus.
// Nota: a rota fica em /api/auth/ (nÃ£o em /api/clinics/) conforme urls.py de accounts.
export const getClinicPatients = async (
  clinicId: string,
): Promise<ApiResult<any[]>> => {
  const headers = await createAuthHeaders();
  if (!headers) return { ok: false, error: "UsuÃ¡rio nÃ£o autenticado." };
  // A lista e paginada (DRF PageNumberPagination, PAGE_SIZE=20). Buscar apenas
  // a primeira pagina escondia todo paciente a partir do 21o: ele sumia da lista
  // do psicologo e dos seletores de paciente (agendar, documentos), sem nenhum
  // aviso. Seguimos o campo `next` ate esgotar as paginas, como getNotifications.
  const all: any[] = [];
  let url: string | null =
    `${API_BASE_URL}/auth/${encodeURIComponent(clinicId)}/patients/`;
  let guard = 0;
  while (url && guard < 50) {
    guard += 1;
    const { response, data } = await fetchJson(url, { method: "GET", headers });
    if (!response.ok)
      return { ok: false, error: normalizeError(data), data: all };
    all.push(...extractList<any>(data));
    url =
      data && typeof data === "object" && typeof data.next === "string"
        ? data.next
        : null;
  }
  return { ok: true, data: all };
};

// Alias usado pelas telas de admin — aponta para getClinicPatients
export const getPatientsByClinic = getClinicPatients;

// Atualiza campos do model User (full_name, phone) via PATCH /api/auth/me/
// O endpoint /api/auth/users/:id/ nÃ£o existe â€” o correto Ã© /api/auth/me/
// que jÃ¡ aceita full_name e phone do usuÃ¡rio autenticado
export const updateUser = async (
  _userId: string, // mantido para nÃ£o quebrar chamadas existentes
  payload: { full_name?: string; phone?: string },
): Promise<ApiResult> => {
  const headers = await createAuthHeaders();
  if (!headers) return { ok: false, error: "UsuÃ¡rio nÃ£o autenticado." };
  const { response, data } = await fetchJson(`${API_BASE_URL}/auth/me/`, {
    method: "PATCH",
    headers,
    body: JSON.stringify(payload),
  });
  if (!response.ok) return { ok: false, error: normalizeError(data), data };
  return { ok: true, data };
};

// â”€â”€â”€ Profissionais â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export const getPsychologists = async (): Promise<
  ApiResult<ProfessionalApiItem[]>
> => {
  const headers = await createAuthHeaders();
  if (!headers) return { ok: false, error: "UsuÃ¡rio nÃ£o autenticado." };
  const { response, data } = await fetchJson(
    `${API_BASE_URL}/auth/professionals/`,
    { method: "GET", headers },
  );
  const results = extractList<ProfessionalApiItem>(data);
  if (!response.ok)
    return { ok: false, error: normalizeError(data), data: results };
  return { ok: true, data: results };
};

// PATCH /api/auth/professionals/<id>/  â€” atualiza crp, specialty, bio do profissional
export const updateProfessionalProfile = async (
  professionalId: string,
  payload: {
    crp?: string;
    specialty?: string;
    bio?: string;
    session_duration_minutes?: number;
  },
): Promise<ApiResult> => {
  const headers = await createAuthHeaders();
  if (!headers) return { ok: false, error: "UsuÃ¡rio nÃ£o autenticado." };
  const { response, data } = await fetchJson(
    `${API_BASE_URL}/auth/professionals/${encodeURIComponent(professionalId)}/`,
    { method: "PATCH", headers, body: JSON.stringify(payload) },
  );
  if (!response.ok) return { ok: false, error: normalizeError(data), data };
  return { ok: true, data };
};

// PATCH /api/auth/professionals/<id>/ (multipart) — envia ou remove a foto de
// perfil do profissional. Passe `photo` para enviar uma nova foto, ou `null`
// para remover a atual.
export const updateProfessionalProfilePhoto = (
  professionalId: string,
  photo: { uri: string; name: string; type: string } | null,
): Promise<ApiResult> =>
  patchFileField(
    `${API_BASE_URL}/auth/professionals/${encodeURIComponent(professionalId)}/`,
    "photo",
    "remove_photo",
    photo,
  );

// DELETE /api/appointments/availability/<id>/
export const deleteAvailability = async (
  availabilityId: string,
): Promise<ApiResult> => {
  const headers = await createAuthHeaders();
  if (!headers) return { ok: false, error: "UsuÃ¡rio nÃ£o autenticado." };
  const token = await getAccessToken();
  const url = `${API_BASE_URL}/appointments/availability/${encodeURIComponent(availabilityId)}/`;
  if (__DEV__) {
    console.log("ðŸ—‘ï¸ DELETE availability:", url);
  }
  const response = await fetchWithRefresh(url, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
  if (__DEV__) {
    console.log("ðŸ“¦ DELETE response status:", response.status);
  }
  // 204 No Content Ã© sucesso â€” nÃ£o tentar .json() numa resposta vazia
  if (response.status === 204 || response.ok) {
    if (__DEV__) {
      console.log("âœ… Deletado com sucesso");
    }
    return { ok: true };
  }
  const data = await response.json().catch(() => null);
  if (__DEV__) {
    console.log("âŒ Erro ao deletar:", data);
  }
  return { ok: false, error: normalizeError(data), data };
};

// PATCH /api/appointments/availability/<id>/
export const updateAvailability = async (
  availabilityId: string,
  payload: { weekday?: number; start_time?: string; end_time?: string },
): Promise<ApiResult> => {
  const headers = await createAuthHeaders();
  if (!headers) return { ok: false, error: "UsuÃ¡rio nÃ£o autenticado." };
  const { response, data } = await fetchJson(
    `${API_BASE_URL}/appointments/availability/${encodeURIComponent(availabilityId)}/`,
    { method: "PATCH", headers, body: JSON.stringify(payload) },
  );
  if (!response.ok) return { ok: false, error: normalizeError(data), data };
  return { ok: true, data };
};

// â”€â”€â”€ ClÃ­nicas (Admin) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

// GET /api/clinics/{clinic_id}/stats/
// Retorna estatÃ­sticas da clÃ­nica: total_appointments, completed_appointments, etc.
export const getClinicStats = async (clinicId: string): Promise<ApiResult> => {
  const headers = await createAuthHeaders();
  if (!headers) return { ok: false, error: "UsuÃ¡rio nÃ£o autenticado." };
  const { response, data } = await fetchJson(
    `${API_BASE_URL}/clinics/${encodeURIComponent(clinicId)}/stats/`,
    { method: "GET", headers },
  );
  if (!response.ok) return { ok: false, error: normalizeError(data), data };
  return { ok: true, data };
};

// GET /api/clinics/{clinic_id}/
// Retorna dados da clÃ­nica: name, address, phone, email, open_from, open_until, etc.
export const getClinicData = async (clinicId: string): Promise<ApiResult> => {
  const headers = await createAuthHeaders();
  if (!headers) return { ok: false, error: "UsuÃ¡rio nÃ£o autenticado." };
  const { response, data } = await fetchJson(
    `${API_BASE_URL}/clinics/${encodeURIComponent(clinicId)}/`,
    { method: "GET", headers },
  );
  if (!response.ok) return { ok: false, error: normalizeError(data), data };
  return { ok: true, data };
};

// PATCH /api/clinics/{clinic_id}/
// Atualiza dados da clÃ­nica: name, address, phone, email, open_from, open_until,
// theme_preset ('default'|'blue'|'purple'|'custom'), theme_primary_color (#RRGGBB, só para 'custom')
export const updateClinic = async (
  clinicId: string,
  payload: {
    name?: string;
    address?: string;
    phone?: string;
    email?: string;
    open_from?: string;
    open_until?: string;
    theme_preset?: "default" | "blue" | "purple" | "custom";
    theme_primary_color?: string;
  },
): Promise<ApiResult> => {
  const headers = await createAuthHeaders();
  if (!headers) return { ok: false, error: "UsuÃ¡rio nÃ£o autenticado." };
  const { response, data } = await fetchJson(
    `${API_BASE_URL}/clinics/${encodeURIComponent(clinicId)}/`,
    { method: "PATCH", headers, body: JSON.stringify(payload) },
  );
  if (!response.ok) return { ok: false, error: normalizeError(data), data };
  return { ok: true, data };
};

// GET /api/clinics/{clinic_id}/rooms/ — salas ativas para profissionais;
// administradores também recebem salas inativas para gerenciá-las.
export const getClinicRooms = async (
  clinicId: string,
  options: { start?: string; end?: string } = {},
): Promise<ApiResult<RoomApiItem[]>> => {
  const headers = await createAuthHeaders();
  if (!headers) return { ok: false, error: "Usuário não autenticado." };
  const params = new URLSearchParams();
  if (options.start) params.set("start", options.start);
  if (options.end) params.set("end", options.end);
  const query = params.toString() ? `?${params.toString()}` : "";
  const { response, data } = await fetchJson(
    `${API_BASE_URL}/clinics/${encodeURIComponent(clinicId)}/rooms/${query}`,
    { method: "GET", headers },
  );
  const rooms = extractList<RoomApiItem>(data);
  if (!response.ok) return { ok: false, error: normalizeError(data), data: rooms };
  return { ok: true, data: rooms };
};

// POST /api/clinics/{clinic_id}/rooms/
export const createClinicRoom = async (
  clinicId: string,
  payload: { name: string; description?: string; is_active?: boolean },
): Promise<ApiResult<RoomApiItem>> => {
  const headers = await createAuthHeaders();
  if (!headers) return { ok: false, error: "Usuário não autenticado." };
  const { response, data } = await fetchJson(
    `${API_BASE_URL}/clinics/${encodeURIComponent(clinicId)}/rooms/`,
    { method: "POST", headers, body: JSON.stringify(payload) },
  );
  if (!response.ok) return { ok: false, error: normalizeError(data), data };
  return { ok: true, data };
};

// PATCH /api/clinics/{clinic_id}/rooms/{room_id}/
export const updateClinicRoom = async (
  clinicId: string,
  roomId: string,
  payload: { name?: string; description?: string; is_active?: boolean },
): Promise<ApiResult<RoomApiItem>> => {
  const headers = await createAuthHeaders();
  if (!headers) return { ok: false, error: "Usuário não autenticado." };
  const { response, data } = await fetchJson(
    `${API_BASE_URL}/clinics/${encodeURIComponent(clinicId)}/rooms/${encodeURIComponent(roomId)}/`,
    { method: "PATCH", headers, body: JSON.stringify(payload) },
  );
  if (!response.ok) return { ok: false, error: normalizeError(data), data };
  return { ok: true, data };
};

// DELETE /api/clinics/{clinic_id}/rooms/{room_id}/
export const deleteClinicRoom = async (
  clinicId: string,
  roomId: string,
): Promise<ApiResult> => {
  const headers = await createAuthHeaders();
  if (!headers) return { ok: false, error: "Usuário não autenticado." };
  const { response, data } = await fetchJson(
    `${API_BASE_URL}/clinics/${encodeURIComponent(clinicId)}/rooms/${encodeURIComponent(roomId)}/`,
    { method: "DELETE", headers },
  );
  if (!response.ok) return { ok: false, error: normalizeError(data), data };
  return { ok: true, data };
};

// Helper compartilhado: PATCH multipart pra trocar/remover um campo de
// arquivo (logo da clínica, foto de perfil). `fieldName` é o campo de
// arquivo no backend (ex: "logo", "photo"); `removeFieldName` é a flag
// write-only que o serializer usa pra limpar (ex: "remove_logo",
// "remove_photo") — um campo de arquivo vazio não é interpretado como
// "remover" pelo DRF. Passe `photo: null` para remover o arquivo atual.
const patchFileField = async (
  url: string,
  fieldName: string,
  removeFieldName: string,
  photo: { uri: string; name: string; type: string } | null,
): Promise<ApiResult> => {
  const token = await getAccessToken();
  if (!token) return { ok: false, error: "Usuário não autenticado." };

  const formData = new FormData();

  if (!photo) {
    formData.append(removeFieldName, "true");
  } else if (Platform.OS === "web") {
    const blobRes = await fetch(photo.uri);
    const blob = await blobRes.blob();
    const fileObj = new File([blob], photo.name, {
      type: blob.type || photo.type || "image/jpeg",
    });
    formData.append(fieldName, fileObj);
  } else {
    formData.append(fieldName, photo as any);
  }

  const res = await fetchWithRefresh(url, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${token}` },
    body: formData,
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) return { ok: false, error: normalizeError(data), data };
  return { ok: true, data };
};

// PATCH /api/clinics/{clinic_id}/ (multipart) — envia ou remove a logo da clínica.
// Passe `photo` para enviar uma nova logo, ou `null` para remover a atual.
export const updateClinicLogo = (
  clinicId: string,
  photo: { uri: string; name: string; type: string } | null,
): Promise<ApiResult> =>
  patchFileField(
    `${API_BASE_URL}/clinics/${encodeURIComponent(clinicId)}/`,
    "logo",
    "remove_logo",
    photo,
  );

// GET /api/auth/professionals/?clinic_id={clinic_id}
// Retorna lista de profissionais de uma clÃ­nica especÃ­fica
export const getProfessionalsByClinic = async (
  clinicId: string,
): Promise<ApiResult<ProfessionalApiItem[]>> => {
  const headers = await createAuthHeaders();
  if (!headers) return { ok: false, error: "UsuÃ¡rio nÃ£o autenticado." };
  const { response, data } = await fetchJson(
    `${API_BASE_URL}/auth/professionals/?clinic_id=${encodeURIComponent(clinicId)}`,
    { method: "GET", headers },
  );
  const results = extractList<ProfessionalApiItem>(data);
  if (!response.ok)
    return { ok: false, error: normalizeError(data), data: results };
  return { ok: true, data: results };
};

// â”€â”€â”€ Agendamentos â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

// GET /api/appointments/<id>/ â€” detalhe completo de uma consulta
export const getAppointmentDetail = async (
  appointmentId: string,
): Promise<ApiResult> => {
  const headers = await createAuthHeaders();
  if (!headers) return { ok: false, error: "UsuÃ¡rio nÃ£o autenticado." };
  const { response, data } = await fetchJson(
    `${API_BASE_URL}/appointments/${encodeURIComponent(appointmentId)}/`,
    { method: "GET", headers },
  );
  if (!response.ok) return { ok: false, error: normalizeError(data), data };
  return { ok: true, data };
};

// GET /api/appointments/  (opcionalmente ?patient=<PatientProfile.id>)
// Sem filtro: todas as consultas do usuário logado.
// Com patientProfileId: só as consultas daquele paciente — usado pela ficha
// do paciente para montar o histórico de consultas.
export const getAppointments = async (
  patientProfileId?: string,
): Promise<ApiResult<AppointmentApiItem[]>> => {
  const headers = await createAuthHeaders();
  if (!headers) return { ok: false, error: "UsuÃ¡rio nÃ£o autenticado." };
  const query = patientProfileId
    ? `?patient=${encodeURIComponent(patientProfileId)}`
    : "";
  const { response, data } = await fetchJson(
    `${API_BASE_URL}/appointments/${query}`,
    {
      method: "GET",
      headers,
    },
  );
  const results = extractList<AppointmentApiItem>(data);
  if (!response.ok)
    return { ok: false, error: normalizeError(data), data: results };
  return { ok: true, data: results };
};

// GET /api/appointments/<id>/notes/ — nota de sessão do psicólogo.
// O backend faz get_or_create, então sempre retorna uma nota (notes vazio se nova).
export const getSessionNote = async (
  appointmentId: string,
): Promise<ApiResult<SessionNoteApi>> => {
  const headers = await createAuthHeaders();
  if (!headers) return { ok: false, error: "UsuÃ¡rio nÃ£o autenticado." };
  const { response, data } = await fetchJson(
    `${API_BASE_URL}/appointments/${encodeURIComponent(appointmentId)}/notes/`,
    { method: "GET", headers },
  );
  if (!response.ok) return { ok: false, error: normalizeError(data), data };
  return { ok: true, data };
};

// PATCH /api/appointments/<id>/notes/ — salva a nota de sessão.
export const updateSessionNote = async (
  appointmentId: string,
  notes: string,
): Promise<ApiResult<SessionNoteApi>> => {
  const headers = await createAuthHeaders();
  if (!headers) return { ok: false, error: "UsuÃ¡rio nÃ£o autenticado." };
  const { response, data } = await fetchJson(
    `${API_BASE_URL}/appointments/${encodeURIComponent(appointmentId)}/notes/`,
    {
      method: "PATCH",
      headers,
      body: JSON.stringify({ notes }),
    },
  );
  if (!response.ok) return { ok: false, error: normalizeError(data), data };
  return { ok: true, data };
};

// GET /api/appointments/summary/
// Retorna: { consultas_hoje, proxima_consulta, total_pacientes }
export const getProfessionalSummary = async (): Promise<
  ApiResult<{
    consultas_hoje: number;
    proxima_consulta: AppointmentApiItem | null;
    total_pacientes: number;
  }>
> => {
  const headers = await createAuthHeaders();
  if (!headers) return { ok: false, error: "UsuÃ¡rio nÃ£o autenticado." };
  const { response, data } = await fetchJson(
    `${API_BASE_URL}/appointments/summary/`,
    {
      method: "GET",
      headers,
    },
  );
  if (!response.ok) return { ok: false, error: normalizeError(data), data };
  return { ok: true, data };
};

export const createAppointment = async (
  professionalId: string, // item.id do ProfessionalProfile â€” UUID obrigatÃ³rio
  scheduledAt: string, // ex: "2025-06-15T10:00:00-03:00" â€” formato ISO 8601 com timezone obrigatÃ³rio
  durationMinutes = 50,
  options: {
    patientId?: string;
    clinicId?: string;
    ignoreAvailability?: boolean;
    roomId?: string;
  } = {},
): Promise<ApiResult> => {
  const headers = await createAuthHeaders();
  if (!headers) return { ok: false, error: "UsuÃ¡rio nÃ£o autenticado." };

  // Garante formato ISO 8601 com timezone â€” backend rejeita sem timezone
  const hasTimezone = /Z$|[+-]\d{2}:\d{2}$/.test(scheduledAt);
  const scheduledAtUtc = hasTimezone ? scheduledAt : `${scheduledAt}Z`;

  const clinicId = options.clinicId ?? (await getClinicId());

  const payload: Record<string, any> = {
    professional: professionalId,
    scheduled_at: scheduledAtUtc,
    duration_minutes: durationMinutes,
  };

  if (options.patientId) {
    payload.patient = options.patientId;
  }

  if (options.roomId) {
    payload.room = options.roomId;
  }

  if (clinicId) {
    payload.clinic = clinicId;
  }

  // Agendamento excepcional ignorando a disponibilidade do profissional.
  if (options.ignoreAvailability) {
    payload.ignore_availability = true;
  }

  if (__DEV__) {
    console.log(" POST /api/appointments/", payload);
  }

  const { response, data } = await fetchJson(`${API_BASE_URL}/appointments/`, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    if (__DEV__) {
      console.error("Erro ao criar agendamento:", normalizeError(data));
    }
    if (__DEV__) {
      console.error("Body completo:", JSON.stringify(data));
    }
    return { ok: false, error: normalizeError(data), data };
  }

  if (__DEV__) {
    console.log("âœ… Agendamento criado com sucesso");
  }
  return { ok: true, data };
};

// POST /api/appointments/<id>/cancel/  — motivo é opcional (staff pode cancelar sem justificar).
export const cancelAppointment = async (
  appointmentId: string,
  reason?: string,
): Promise<ApiResult> => {
  const headers = await createAuthHeaders();
  if (!headers) return { ok: false, error: "UsuÃ¡rio nÃ£o autenticado." };
  const { response, data } = await fetchJson(
    `${API_BASE_URL}/appointments/${encodeURIComponent(appointmentId)}/cancel/`,
    {
      method: "POST",
      headers,
      body: JSON.stringify({ cancel_reason: reason ?? "" }),
    },
  );
  if (!response.ok) return { ok: false, error: normalizeError(data), data };
  return { ok: true, data };
};

// PATCH /api/appointments/<id>/   { status, completed_at?, scheduled_at? }
// - completed_at: data real de realização (obrigatória p/ concluir consulta futura; não pode ser no futuro)
// - scheduled_at: nova data (obrigatória ao remarcar — status 'rescheduled')
export const updateAppointmentStatus = async (
  appointmentId: string,
  status: "completed" | "rescheduled" | "scheduled" | "no_show",
  extra?: { completed_at?: string; scheduled_at?: string },
): Promise<ApiResult> => {
  const headers = await createAuthHeaders();
  if (!headers) return { ok: false, error: "UsuÃ¡rio nÃ£o autenticado." };

  const url = `${API_BASE_URL}/appointments/${encodeURIComponent(appointmentId)}/`;
  const payload: Record<string, any> = { status };
  if (extra?.completed_at) payload.completed_at = extra.completed_at;
  if (extra?.scheduled_at) payload.scheduled_at = extra.scheduled_at;
  const body = JSON.stringify(payload);

  if (__DEV__) {
    console.log(`ðŸ“¤ API PATCH ${url}`, { status });
  }

  const { response, data } = await fetchJson(url, {
    method: "PATCH",
    headers,
    body,
  });

  if (__DEV__) {
    console.log(`ðŸ“¥ Response status: ${response.status}`, { data });
  }

  if (!response.ok) {
    const error = normalizeError(data);
    if (__DEV__) {
      console.error(`âŒ Error: ${error}`, data);
    }
    return { ok: false, error, data };
  }

  if (__DEV__) {
    console.log(`âœ… Appointment updated successfully =---------`);
    console.log(body);
  }
  return { ok: true, data };
};

export const getPsychologistAvailability = async (
  psychologistId: string,
): Promise<ApiResult<AppointmentAvailabilityApiItem[]>> => {
  const headers = await createAuthHeaders();
  if (!headers) return { ok: false, error: "UsuÃ¡rio nÃ£o autenticado." };
  const query = `?professional=${encodeURIComponent(psychologistId)}`;
  const { response, data } = await fetchJson(
    `${API_BASE_URL}/appointments/availability/${query}`,
    { method: "GET", headers },
  );
  const availability = extractList<AppointmentAvailabilityApiItem>(data);
  if (!response.ok)
    return { ok: false, error: normalizeError(data), data: availability };
  return { ok: true, data: availability };
};

// GET /api/appointments/availability/?professional=<uuid> â€” alias para getPsychologistAvailability
export const getAvailability = async (
  professionalId: string,
): Promise<ApiResult<AppointmentAvailabilityApiItem[]>> => {
  return getPsychologistAvailability(professionalId);
};

// POST /api/appointments/availability/  { weekday, start_time, end_time, blocked: true }
export const createAvailabilityBlock = async (payload: {
  professional: string;
  weekday: number;
  start_time: string;
  end_time: string;
  blocked: boolean;
}): Promise<ApiResult> => {
  const headers = await createAuthHeaders();
  if (!headers) return { ok: false, error: "UsuÃ¡rio nÃ£o autenticado." };
  const { response, data } = await fetchJson(
    `${API_BASE_URL}/appointments/availability/`,
    {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    },
  );
  if (!response.ok) return { ok: false, error: normalizeError(data), data };
  return { ok: true, data };
};

// â”€â”€â”€ Chat â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export const getConversations = async (): Promise<
  ApiResult<ConversationApiItem[]>
> => {
  const headers = await createAuthHeaders();
  if (!headers) return { ok: false, error: "UsuÃ¡rio nÃ£o autenticado." };
  const { response, data } = await fetchJson(
    `${API_BASE_URL}/chat/conversations/`,
    { method: "GET", headers },
  );
  const results = extractList<ConversationApiItem>(data);
  if (!response.ok)
    return { ok: false, error: normalizeError(data), data: results };
  return { ok: true, data: results };
};

export const getMessagesWithPsychologist = async (
  psychologistId: string,
): Promise<ApiResult<ChatMessageApiItem[]>> => {
  const headers = await createAuthHeaders();
  if (!headers) return { ok: false, error: "UsuÃ¡rio nÃ£o autenticado." };
  const { response, data } = await fetchJson(
    `${API_BASE_URL}/chat/messages/?with=${encodeURIComponent(psychologistId)}`,
    { method: "GET", headers },
  );
  const results = extractList<ChatMessageApiItem>(data);
  if (!response.ok)
    return { ok: false, error: normalizeError(data), data: results };
  return { ok: true, data: results };
};

export const sendChatMessage = async (
  receiverId: string, // user.id do profissional
  content: string,
  appointmentId?: string,
): Promise<ApiResult<ChatMessageApiItem>> => {
  const headers = await createAuthHeaders();
  if (!headers) return { ok: false, error: "UsuÃ¡rio nÃ£o autenticado." };
  const { response, data } = await fetchJson(`${API_BASE_URL}/chat/messages/`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      receiver: receiverId,
      content_encrypted: content,
      message_type: "text",
      ...(appointmentId ? { appointment: appointmentId } : {}),
    }),
  });
  if (!response.ok) return { ok: false, error: normalizeError(data), data };
  return { ok: true, data };
};

// POST /api/chat/messages/ (multipart) â€” enviar anexo de imagem, Ã¡udio ou
// documento (PDF/DOC/DOCX, os mesmos tipos aceitos no mÃ³dulo de documentos).
// NÃ£o enviamos message_type: o backend infere pela extensÃ£o do arquivo.
export const sendChatAttachment = async (
  receiverId: string, // user.id do outro lado
  file: { uri: string; name: string; type: string },
  appointmentId?: string,
  durationMs?: number, // duraÃ§Ã£o real do Ã¡udio medida na gravaÃ§Ã£o
): Promise<ApiResult<ChatMessageApiItem>> => {
  try {
    const token = await getAccessToken();
    if (!token) return { ok: false, error: "UsuÃ¡rio nÃ£o autenticado." };

    const formData = new FormData();
    formData.append("receiver", receiverId);
    if (appointmentId) formData.append("appointment", appointmentId);
    if (durationMs != null && durationMs > 0) {
      formData.append("media_duration_ms", String(Math.round(durationMs)));
    }

    // No Expo Web o objeto { uri, name, type } do RN nÃ£o Ã© entendido pelo browser:
    // Ã© preciso buscar o URI como Blob real antes de anexar (mesmo padrÃ£o do uploadDocument).
    if (Platform.OS === "web") {
      const blobRes = await fetch(file.uri);
      const blob = await blobRes.blob();
      const fileObj = new File([blob], file.name, {
        type: blob.type || file.type || "application/octet-stream",
      });
      formData.append("attachment", fileObj);
    } else {
      formData.append("attachment", file as any);
    }

    const res = await fetchWithRefresh(`${API_BASE_URL}/chat/messages/`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        // âš ï¸ NÃ£o definir Content-Type manualmente com FormData â€” o boundary
        // do multipart precisa ser gerado automaticamente.
      },
      body: formData,
    });

    const data = await res.json().catch(() => null);
    if (!res.ok) return { ok: false, error: normalizeError(data), data };
    return { ok: true, data };
  } catch {
    return { ok: false, error: "NÃ£o foi possÃ­vel enviar o anexo." };
  }
};

// GET /api/chat/contacts/ â€” listar contatos disponÃ­veis para nova conversa
export const getChatContacts = async (): Promise<ApiResult> => {
  const headers = await createAuthHeaders();
  if (!headers) return { ok: false, error: "UsuÃ¡rio nÃ£o autenticado." };
  const { response, data } = await fetchJson(`${API_BASE_URL}/chat/contacts/`, {
    method: "GET",
    headers,
  });
  if (!response.ok) return { ok: false, error: normalizeError(data), data };
  return { ok: true, data };
};

// GET /api/chat/presence/?with=<user_id> â€” saber se o outro usuÃ¡rio estÃ¡ online.
// Fonte confiÃ¡vel (modelo Presence no banco): funciona mesmo quando o handshake
// de presenÃ§a em tempo real do WebSocket nÃ£o chega.
export const getContactPresence = async (
  userId: string,
): Promise<ApiResult<{ online: boolean }>> => {
  const headers = await createAuthHeaders();
  if (!headers) return { ok: false, error: "UsuÃ¡rio nÃ£o autenticado." };
  const { response, data } = await fetchJson(
    `${API_BASE_URL}/chat/presence/?with=${encodeURIComponent(userId)}`,
    { method: "GET", headers },
  );
  if (!response.ok) return { ok: false, error: normalizeError(data), data };
  return { ok: true, data };
};

// PATCH /api/chat/messages/read/?with=<user_id> â€” marcar mensagens como lidas
export const markMessagesRead = async (userId: string): Promise<ApiResult> => {
  const headers = await createAuthHeaders();
  if (!headers) return { ok: false, error: "UsuÃ¡rio nÃ£o autenticado." };
  const { response, data } = await fetchJson(
    `${API_BASE_URL}/chat/messages/read/?with=${encodeURIComponent(userId)}`,
    { method: "PATCH", headers },
  );
  if (!response.ok) return { ok: false, error: normalizeError(data), data };
  return { ok: true, data };
};

// DELETE /api/chat/messages/<id>/?for_everyone=<bool> â€” apagar uma mensagem.
// forEveryone=true: sÃ³ o remetente e sÃ³ enquanto nÃ£o lida (apaga dos dois lados).
// forEveryone=false: oculta apenas para o usuÃ¡rio logado.
export const deleteChatMessage = async (
  messageId: string,
  forEveryone: boolean,
): Promise<ApiResult> => {
  const headers = await createAuthHeaders();
  if (!headers) return { ok: false, error: "UsuÃ¡rio nÃ£o autenticado." };
  const { response, data } = await fetchJson(
    `${API_BASE_URL}/chat/messages/${encodeURIComponent(messageId)}/?for_everyone=${forEveryone ? "true" : "false"}`,
    { method: "DELETE", headers },
  );
  if (!response.ok) return { ok: false, error: normalizeError(data), data };
  return { ok: true, data };
};

// DELETE /api/chat/messages/clear/?with=<user_id> â€” apagar a conversa apenas
// para o usuÃ¡rio logado (o outro lado mantÃ©m as mensagens).
export const clearChatConversation = async (
  userId: string,
): Promise<ApiResult> => {
  const headers = await createAuthHeaders();
  if (!headers) return { ok: false, error: "UsuÃ¡rio nÃ£o autenticado." };
  const { response, data } = await fetchJson(
    `${API_BASE_URL}/chat/messages/clear/?with=${encodeURIComponent(userId)}`,
    { method: "DELETE", headers },
  );
  if (!response.ok) return { ok: false, error: normalizeError(data), data };
  return { ok: true, data };
};

// DELETE /api/chat/messages/clear-all/ â€” apagar todas as mensagens de todas as
// conversas apenas para o usuÃ¡rio logado.
export const clearAllChatMessages = async (): Promise<ApiResult> => {
  const headers = await createAuthHeaders();
  if (!headers) return { ok: false, error: "UsuÃ¡rio nÃ£o autenticado." };
  const { response, data } = await fetchJson(
    `${API_BASE_URL}/chat/messages/clear-all/`,
    { method: "DELETE", headers },
  );
  if (!response.ok) return { ok: false, error: normalizeError(data), data };
  return { ok: true, data };
};

// DELETE /api/notifications/ â€” apagar todas as notificaÃ§Ãµes in-app do usuÃ¡rio.
export const deleteAllNotifications = async (): Promise<ApiResult> => {
  const headers = await createAuthHeaders();
  if (!headers) return { ok: false, error: "UsuÃ¡rio nÃ£o autenticado." };
  const { response, data } = await fetchJson(`${API_BASE_URL}/notifications/`, {
    method: "DELETE",
    headers,
  });
  if (!response.ok) return { ok: false, error: normalizeError(data), data };
  return { ok: true, data };
};

// GET /api/notifications/unread/ â€” obter contagem de notificaÃ§Ãµes nÃ£o lidas
export const getUnreadNotifications = async (): Promise<
  ApiResult<{ unread_count: number }>
> => {
  const headers = await createAuthHeaders();
  if (!headers) return { ok: false, error: "UsuÃ¡rio nÃ£o autenticado." };
  const { response, data } = await fetchJson(
    `${API_BASE_URL}/notifications/unread/`,
    { method: "GET", headers },
  );
  if (!response.ok) return { ok: false, error: normalizeError(data), data };
  return { ok: true, data };
};

export const getNotifications = async (): Promise<
  ApiResult<NotificationApiItem[]>
> => {
  const headers = await createAuthHeaders();
  if (!headers) return { ok: false, error: "UsuÃ¡rio nÃ£o autenticado." };

  // A lista de notificacoes e paginada (DRF PageNumberPagination, PAGE_SIZE=20).
  // Buscar apenas a primeira pagina deixava avisos antigos nao lidos invisiveis:
  // eles nao apareciam na tela, o "marcar todas" nao os alcancava e o contador
  // do sino (que conta TODOS os nao lidos no servidor) ficava travado. Por isso
  // seguimos o campo `next` ate esgotar as paginas e montamos a lista completa.
  const all: NotificationApiItem[] = [];
  let url: string | null = `${API_BASE_URL}/notifications/`;
  let guard = 0;
  while (url && guard < 50) {
    guard += 1;
    const { response, data } = await fetchJson(url, { method: "GET", headers });
    if (!response.ok)
      return { ok: false, error: normalizeError(data), data: all };
    all.push(...extractList<NotificationApiItem>(data));
    url =
      data && typeof data === "object" && typeof data.next === "string"
        ? data.next
        : null;
  }
  return { ok: true, data: all };
};

export const markNotificationRead = async (
  notificationId: string,
): Promise<ApiResult<NotificationApiItem>> => {
  const headers = await createAuthHeaders();
  if (!headers) return { ok: false, error: "UsuÃ¡rio nÃ£o autenticado." };
  const { response, data } = await fetchJson(
    `${API_BASE_URL}/notifications/${encodeURIComponent(notificationId)}/read/`,
    { method: "PATCH", headers },
  );
  if (!response.ok) return { ok: false, error: normalizeError(data), data };
  return { ok: true, data };
};

// POST /api/notifications/devices/ — registra (upsert) o ExpoPushToken deste
// aparelho para o usuario logado. Guarda o token localmente para desativa-lo no
// logout (unregisterDeviceToken).
export const registerDeviceToken = async (
  token: string,
  platform: "android" | "ios" | "web",
): Promise<ApiResult> => {
  const headers = await createAuthHeaders();
  if (!headers) return { ok: false, error: "Usuario nao autenticado." };
  const { response, data } = await fetchJson(
    `${API_BASE_URL}/notifications/devices/`,
    { method: "POST", headers, body: JSON.stringify({ token, platform }) },
  );
  if (!response.ok) return { ok: false, error: normalizeError(data), data };
  await AsyncStorage.setItem(STORAGE_KEYS.pushToken, token);
  return { ok: true, data };
};

// DELETE /api/notifications/devices/<token>/ — desativa o token deste aparelho.
// Usa o token guardado no registro; silencioso se nao houver token salvo.
export const unregisterDeviceToken = async (): Promise<ApiResult> => {
  const token = await AsyncStorage.getItem(STORAGE_KEYS.pushToken);
  if (!token) return { ok: true };
  const headers = await createAuthHeaders();
  if (!headers) {
    await AsyncStorage.removeItem(STORAGE_KEYS.pushToken);
    return { ok: true };
  }
  try {
    await fetchWithRefresh(
      `${API_BASE_URL}/notifications/devices/${encodeURIComponent(token)}/`,
      { method: "DELETE", headers },
    );
  } catch {
    // Sem conexao: removemos o token local mesmo assim.
  }
  await AsyncStorage.removeItem(STORAGE_KEYS.pushToken);
  return { ok: true };
};

// Estado atual do push neste aparelho: ha um token registrado guardado?
// Usado pela tela de Configuracoes para refletir o toggle de notificacoes.
export const isPushEnabled = async (): Promise<boolean> => {
  const token = await AsyncStorage.getItem(STORAGE_KEYS.pushToken);
  return !!token;
};

const createQueryString = (params: ReportPeriodQuery = {}): string => {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value) query.append(key, value);
  });
  const serialized = query.toString();
  return serialized ? `?${serialized}` : "";
};

const getReport = async <T>(
  path: string,
  params: ReportPeriodQuery = {},
): Promise<ApiResult<T>> => {
  const headers = await createAuthHeaders();
  if (!headers) return { ok: false, error: "UsuÃ¡rio nÃ£o autenticado." };
  const { response, data } = await fetchJson(
    `${API_BASE_URL}${path}${createQueryString(params)}`,
    { method: "GET", headers },
  );
  if (!response.ok) return { ok: false, error: normalizeError(data), data };
  return { ok: true, data };
};

export const getPatientReport = async (
  patientId: string,
  params: ReportPeriodQuery = {},
): Promise<ApiResult<PatientReportApi>> =>
  getReport<PatientReportApi>(
    `/reports/patients/${encodeURIComponent(patientId)}/`,
    params,
  );

export const getProfessionalSummaryReport = async (
  params: ReportPeriodQuery = {},
): Promise<ApiResult<ProfessionalSummaryReportApi>> =>
  getReport<ProfessionalSummaryReportApi>(
    "/reports/professionals/summary/",
    params,
  );

export const getProfessionalPatientReport = async (
  patientId: string,
  params: ReportPeriodQuery = {},
): Promise<ApiResult<PatientReportApi>> =>
  getReport<PatientReportApi>(
    `/reports/professionals/patients/${encodeURIComponent(patientId)}/`,
    params,
  );

export const getAdminAppointmentsReport = async (
  params: ReportPeriodQuery = {},
): Promise<ApiResult<AdminAppointmentsReportApi>> =>
  getReport<AdminAppointmentsReportApi>("/reports/admin/appointments/", params);

export const downloadReportFile = async (
  path: string,
  params: ReportPeriodQuery = {},
  filename: string,
): Promise<ApiResult> => {
  const headers = await createAuthHeaders();
  if (!headers) return { ok: false, error: "UsuÃ¡rio nÃ£o autenticado." };
  if (Platform.OS !== "web") {
    return {
      ok: false,
      error: "ExportaÃ§Ã£o de arquivos disponÃ­vel no navegador.",
    };
  }

  const response = await fetchWithRefresh(
    `${API_BASE_URL}${path}${createQueryString(params)}`,
    { method: "GET", headers },
  );
  if (!response.ok) {
    const data = await response.json().catch(() => null);
    return { ok: false, error: normalizeError(data), data };
  }

  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
  return { ok: true };
};

export const markMessageRead = async (
  messageId: string,
): Promise<ApiResult> => {
  const headers = await createAuthHeaders();
  if (!headers) return { ok: false, error: "UsuÃ¡rio nÃ£o autenticado." };
  const { response, data } = await fetchJson(
    `${API_BASE_URL}/chat/messages/${encodeURIComponent(messageId)}/read/`,
    { method: "PATCH", headers },
  );
  if (!response.ok) return { ok: false, error: normalizeError(data), data };
  return { ok: true, data };
};

export const getUnreadCount = async (): Promise<
  ApiResult<{ unread_count: number }>
> => {
  const headers = await createAuthHeaders();
  if (!headers) return { ok: false, error: "UsuÃ¡rio nÃ£o autenticado." };
  const { response, data } = await fetchJson(`${API_BASE_URL}/chat/unread/`, {
    method: "GET",
    headers,
  });
  if (!response.ok) return { ok: false, error: normalizeError(data), data };
  return { ok: true, data };
};

// â”€â”€â”€ Documentos â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

// GET /api/records/documents/  (opcional: scope=avulsos|com_paciente|arquivados, search, patient)
// Retorna a lista já desempacotada (aceita array puro ou paginado { results }).
export const getDocuments = async (params?: {
  scope?: "avulsos" | "com_paciente" | "arquivados";
  search?: string;
  patient?: string;
}) => {
  try {
    const token = await getAccessToken();

    const query = new URLSearchParams();
    if (params?.scope) query.set("scope", params.scope);
    if (params?.search) query.set("search", params.search);
    if (params?.patient) query.set("patient", params.patient);
    const qs = query.toString();

    const res = await fetchWithRefresh(
      `${API_BASE_URL}/records/documents/${qs ? `?${qs}` : ""}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
    );

    const data = await res.json();

    if (!res.ok) {
      return { ok: false, error: normalizeError(data) };
    }

    return { ok: true, data: extractList<any>(data) };
  } catch (e) {
    return { ok: false, error: "Erro ao buscar documentos" };
  }
};

export const getDocumentsByPatient = async (patientUserId: string) => {
  try {
    const token = await getAccessToken();

    const res = await fetchWithRefresh(
      `${API_BASE_URL}/records/documents/?patient=${encodeURIComponent(patientUserId)}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
    );

    const data = await res.json();

    if (!res.ok) {
      return { ok: false, error: normalizeError(data) };
    }

    const list = Array.isArray(data)
      ? data
      : Array.isArray(data?.results)
        ? data.results
        : [];

    return { ok: true, data: list };
  } catch (e) {
    return { ok: false, error: "Erro ao buscar documentos do paciente" };
  }
};

export const uploadDocument = async (
  title: string,
  fileType: string,
  file: { uri: string; name: string; type: string },
  patientProfileId?: string, // profile.id â€” obrigatÃ³rio quando enviado pelo psicÃ³logo
) => {
  try {
    const token = await getAccessToken();

    const formData = new FormData();
    formData.append("title", title);
    formData.append("file_type", fileType);

    // PsicÃ³logo/admin precisa informar o PatientProfile â€” backend exige o campo 'patient'
    if (patientProfileId) {
      formData.append("patient", patientProfileId);
    }

    // No Expo Web, o browser nÃ£o entende o objeto { uri, name, type } do RN.
    // Ã‰ necessÃ¡rio fazer fetch do URI para obter um Blob real antes de anexar.
    if (Platform.OS === "web") {
      const blobRes = await fetch(file.uri);
      const blob = await blobRes.blob();
      // File estende Blob e adiciona o nome â€” necessÃ¡rio para o Django ler o filename
      const fileObj = new File([blob], file.name, {
        type: blob.type || file.type || "application/octet-stream",
      });
      formData.append("file", fileObj);
    } else {
      // React Native nativo: o objeto { uri, name, type } Ã© reconhecido pelo fetch nativo
      formData.append("file", file as any);
    }

    const res = await fetchWithRefresh(`${API_BASE_URL}/records/documents/`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        // âš ï¸ NÃƒO definir Content-Type manualmente com FormData â€”
        // o browser precisa gerar o boundary do multipart/form-data automaticamente
      },
      body: formData,
    });

    const data = await res.json();

    if (!res.ok) {
      return { ok: false, error: normalizeError(data) };
    }

    return { ok: true, data };
  } catch (e) {
    return { ok: false, error: "Erro ao enviar documento" };
  }
};

export const deleteDocument = async (id: string) => {
  try {
    const token = await getAccessToken();

    const res = await fetchWithRefresh(`${API_BASE_URL}/records/documents/${id}/`, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      return { ok: false, error: normalizeError(data) };
    }

    return { ok: true };
  } catch (e) {
    return { ok: false, error: "Erro ao excluir documento" };
  }
};

// â”€â”€â”€ JWT Utils â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

// POST /api/auth/password/reset/ â€” solicitar recuperaÃ§Ã£o de senha (rota pÃºblica)
export const requestPasswordReset = async (
  email: string,
): Promise<ApiResult> => {
  const { response, data } = await fetchJson(
    `${API_BASE_URL}/auth/password/reset/`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    },
  );

  if (!response.ok) return { ok: false, error: normalizeError(data), data };
  return { ok: true, data };
};

// POST /api/auth/password/reset/confirm/ â€” confirmar nova senha (rota pÃºblica)
export const confirmPasswordReset = async (payload: {
  uid: string;
  token: string;
  password: string;
}): Promise<ApiResult> => {
  const { response, data } = await fetchJson(
    `${API_BASE_URL}/auth/password/reset/confirm/`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    },
  );

  if (!response.ok) return { ok: false, error: normalizeError(data), data };
  return { ok: true, data };
};

// POST /api/auth/password/change/ â€” troca a senha do usuario logado (autenticado).
// Recebe a senha atual + a nova; sem e-mail. A sessao atual continua valida.
export const changePassword = async (payload: {
  current_password: string;
  new_password: string;
}): Promise<ApiResult> => {
  const headers = await createAuthHeaders();
  if (!headers) return { ok: false, error: "Usuario nao autenticado." };
  const { response, data } = await fetchJson(
    `${API_BASE_URL}/auth/password/change/`,
    { method: "POST", headers, body: JSON.stringify(payload) },
  );
  if (!response.ok) return { ok: false, error: normalizeError(data), data };
  return { ok: true, data };
};

// POST /api/auth/password/invite/confirm/ â€” primeiro acesso via convite (rota pÃºblica)
export const confirmInvite = async (payload: {
  uid: string;
  token: string;
  password: string;
}): Promise<ApiResult> => {
  const { response, data } = await fetchJson(
    `${API_BASE_URL}/auth/password/invite/confirm/`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    },
  );

  if (!response.ok) return { ok: false, error: normalizeError(data), data };
  return { ok: true, data };
};

export const getRoleFromToken = (token: string): string => {
  const payload = parseJwt(token);
  return payload?.role?.toLowerCase() ?? "";
};

export const getClinicIdFromToken = (token: string): string | null => {
  const payload = parseJwt(token);
  return payload?.clinic_id ?? null;
};

// ─── Tipos de arquivo aceitos ────────────────────────────────────────────────
// Espelham apps/uploads.py no backend, que revalida extensão E conteúdo
// (assinatura do arquivo). Usados para filtrar o seletor de arquivos, de modo
// que o usuário não escolha algo que o servidor vai recusar depois.
export const DOCUMENT_MIME_TYPES = [
  "application/pdf",
  "image/png",
  "image/jpeg",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
];

export const DOCUMENT_EXTENSIONS_LABEL = "PDF, PNG, JPG, DOC ou DOCX";

// ─── Consulta com o dia ultrapassado ─────────────────────────────────────────
// Estado DERIVADO (espelha Appointment.is_overdue do backend): consulta ainda
// em aberto cujo DIA já passou. Regras:
//   - comparação por DIA local, não por horário — não aparece antes do dia da
//     consulta nem durante o dia dela, só a partir do dia seguinte;
//   - só vale para consultas em aberto (agendada/remarcada); realizada,
//     cancelada e não compareceu nunca ficam ultrapassadas;
//   - nunca é gravado e não há ação de usuário que o force.
// Calculado no cliente para o rótulo reagir na hora a mudanças locais de
// status (ex.: concluir a consulta) sem precisar recarregar da API.
export const OVERDUE_STATUS_LABEL = "Dia Ultrapassado";

// Aceita tanto os status do backend quanto os rótulos normalizados em pt-br
// usados nas telas do paciente.
const OPEN_STATUSES = ["scheduled", "rescheduled", "agendada", "remarcada"];

export const isAppointmentOverdue = (
  status?: string,
  scheduledAt?: string,
): boolean => {
  if (!status || !scheduledAt) return false;
  if (!OPEN_STATUSES.includes(status.toLowerCase())) return false;

  const scheduled = new Date(scheduledAt);
  if (Number.isNaN(scheduled.getTime())) return false;

  const day = new Date(
    scheduled.getFullYear(),
    scheduled.getMonth(),
    scheduled.getDate(),
  );
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  return day.getTime() < today.getTime();
};

export const getRouteForRole = (
  role: string,
): "/homep" | "/dashboardP" | "/(admin)" => {
  switch (role?.toLowerCase()) {
    case "admin":
      return "/(admin)";
    case "professional":
    case "psychologist":
      return "/dashboardP";
    case "patient":
    default:
      return "/homep";
  }
};