// RN05 no app: login, roteamento por perfil, logout e tratamento de erros da
// API. O fetch é falso — estes testes verificam o que o app faz com cada
// resposta do backend, não o backend.
import AsyncStorage from "@react-native-async-storage/async-storage";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  createAppointment,
  getAccessToken,
  getClinicId,
  getRefreshToken,
  getRouteForRole,
  login,
  logout,
  normalizeError,
} from "./api";

const b64url = (obj: object) =>
  Buffer.from(JSON.stringify(obj)).toString("base64url");
const fakeJwt = (payload: object) =>
  `${b64url({ alg: "HS256", typ: "JWT" })}.${b64url(payload)}.assinatura`;

const jsonResponse = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

beforeEach(async () => {
  await AsyncStorage.multiRemove([
    "@clinica:accessToken",
    "@clinica:refreshToken",
    "@clinica:clinicId",
  ]);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.stubGlobal("__DEV__", false);
});

describe("login", () => {
  it("guarda os tokens e a clínica e devolve o papel lido do JWT", async () => {
    const access = fakeJwt({ role: "professional", clinic_id: "clinica-1" });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse(200, { access, refresh: "refresh-1" })),
    );

    const result = await login({ email: "psi@x.com", password: "Senha123" });

    expect(result.ok).toBe(true);
    expect(result.role).toBe("professional");
    expect(await getAccessToken()).toBe(access);
    expect(await getRefreshToken()).toBe("refresh-1");
    expect(await getClinicId()).toBe("clinica-1");
  });

  it("lê o papel mesmo com nome acentuado no token (UTF-8)", async () => {
    // Regressão do decoder base64url: acentos e padding corrompiam o role.
    const access = fakeJwt({
      role: "admin",
      full_name: "Conceição Araújo",
      clinic_id: "c",
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse(200, { access, refresh: "r" })),
    );

    const result = await login({ email: "a@x.com", password: "x" });

    expect(result.role).toBe("admin");
  });

  it("senha errada: não entra, não guarda token e mostra a mensagem da API", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse(401, { detail: "Usuário e/ou senha incorreto(s)" }),
      ),
    );

    const result = await login({ email: "a@x.com", password: "errada" });

    expect(result.ok).toBe(false);
    expect(result.error).toBe("Usuário e/ou senha incorreto(s)");
    expect(await getAccessToken()).toBeNull();
  });

  it("resposta 200 sem tokens não é tratada como login", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse(200, {})));

    const result = await login({ email: "a@x.com", password: "x" });

    expect(result.ok).toBe(false);
    expect(await getAccessToken()).toBeNull();
  });
});

describe("getRouteForRole", () => {
  it.each([
    ["admin", "/(admin)"],
    ["ADMIN", "/(admin)"],
    ["professional", "/dashboardP"],
    ["psychologist", "/dashboardP"],
    ["patient", "/homep"],
  ])("papel %s vai para %s", (role, rota) => {
    expect(getRouteForRole(role)).toBe(rota);
  });

  it("papel desconhecido cai na área com menos permissão (paciente)", () => {
    expect(getRouteForRole("hacker")).toBe("/homep");
    expect(getRouteForRole(undefined as unknown as string)).toBe("/homep");
  });
});

describe("normalizeError", () => {
  it.each([
    [null, "Ocorreu um erro inesperado."],
    ["Texto simples", "Texto simples"],
    [{ detail: "Não encontrado." }, "Não encontrado."],
    [{ erro: "Sem permissão" }, "Sem permissão"],
    [{ scheduled_at: ["Data inválida."] }, "Data inválida."],
    [{ non_field_errors: ["Horário ocupado."] }, "Horário ocupado."],
  ])("%j vira %j", (entrada, esperado) => {
    expect(normalizeError(entrada)).toBe(esperado);
  });
});

describe("createAppointment", () => {
  let corpoEnviado: Record<string, unknown>;

  beforeEach(async () => {
    await AsyncStorage.setItem("@clinica:accessToken", fakeJwt({ role: "admin" }));
    await AsyncStorage.setItem("@clinica:clinicId", "clinica-1");
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: RequestInit = {}) => {
        corpoEnviado = JSON.parse(String(init.body));
        return jsonResponse(201, { id: "consulta-1" });
      }),
    );
  });

  it("acrescenta Z quando a data vem sem fuso (backend recusa data ingênua)", async () => {
    await createAppointment("psi-1", "2026-11-20T14:00:00");
    expect(corpoEnviado.scheduled_at).toBe("2026-11-20T14:00:00Z");
  });

  it("mantém o fuso quando ele já foi informado", async () => {
    await createAppointment("psi-1", "2026-11-20T14:00:00-03:00");
    expect(corpoEnviado.scheduled_at).toBe("2026-11-20T14:00:00-03:00");
  });

  it("envia paciente, sala, clínica e duração nos campos que a API espera", async () => {
    const result = await createAppointment("psi-1", "2026-11-20T14:00:00Z", 30, {
      patientId: "pac-1",
      roomId: "sala-1",
    });

    expect(result.ok).toBe(true);
    expect(corpoEnviado).toMatchObject({
      professional: "psi-1",
      patient: "pac-1",
      room: "sala-1",
      clinic: "clinica-1",
      duration_minutes: 30,
    });
    expect(corpoEnviado).not.toHaveProperty("ignore_availability");
  });

  it("devolve a mensagem de conflito do backend", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse(400, {
          non_field_errors: [
            "Este psicólogo já tem uma consulta agendada nesse horário.",
          ],
        }),
      ),
    );

    const result = await createAppointment("psi-1", "2026-11-20T14:00:00Z");

    expect(result.ok).toBe(false);
    expect(result.error).toBe(
      "Este psicólogo já tem uma consulta agendada nesse horário.",
    );
  });

  it("sem login não chama a API", async () => {
    await AsyncStorage.removeItem("@clinica:accessToken");
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const result = await createAppointment("psi-1", "2026-11-20T14:00:00Z");

    expect(result.ok).toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe("logout", () => {
  it("avisa o backend (blacklist) e limpa a sessão local", async () => {
    await AsyncStorage.setItem("@clinica:accessToken", fakeJwt({ role: "patient" }));
    await AsyncStorage.setItem("@clinica:refreshToken", "refresh-1");
    const chamadas: { url: string; body?: string }[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init: RequestInit = {}) => {
        chamadas.push({ url, body: init.body as string | undefined });
        return new Response(null, { status: 205 });
      }),
    );

    await logout();

    const chamadaLogout = chamadas.find((c) => c.url.endsWith("/auth/logout/"));
    expect(chamadaLogout).toBeDefined();
    expect(JSON.parse(String(chamadaLogout!.body))).toEqual({ refresh: "refresh-1" });
    expect(await getAccessToken()).toBeNull();
    expect(await getRefreshToken()).toBeNull();
  });

  it("sem internet ainda assim desloga o aparelho", async () => {
    await AsyncStorage.setItem("@clinica:accessToken", fakeJwt({ role: "patient" }));
    await AsyncStorage.setItem("@clinica:refreshToken", "refresh-1");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("Network request failed");
      }),
    );

    const result = await logout();

    expect(result.ok).toBe(true);
    expect(await getAccessToken()).toBeNull();
  });
});
