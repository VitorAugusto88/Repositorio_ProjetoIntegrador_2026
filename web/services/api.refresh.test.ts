// R03: cinco chamadas simultâneas com token vencido devem gerar UMA única
// renovação e cinco respostas corretas. O backend usa ROTATE_REFRESH_TOKENS +
// BLACKLIST_AFTER_ROTATION: o fetch falso abaixo recusa qualquer reuso do
// refresh antigo, como o servidor real.
import AsyncStorage from "@react-native-async-storage/async-storage";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { getMe, getRefreshToken } from "./api";

const b64url = (obj: object) =>
  Buffer.from(JSON.stringify(obj)).toString("base64url");
const fakeJwt = (payload: object) =>
  `${b64url({ alg: "HS256", typ: "JWT" })}.${b64url(payload)}.assinatura`;

const ACCESS_VENCIDO = fakeJwt({ role: "admin", clinic_id: "c1", v: 0 });
const ACCESS_NOVO = fakeJwt({ role: "admin", clinic_id: "c1", v: 1 });

const jsonResponse = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

describe("renovação de token com chamadas simultâneas (R03)", () => {
  let refreshCalls: number;
  let refreshValido: string;

  beforeEach(async () => {
    refreshCalls = 0;
    refreshValido = "refresh-0";
    await AsyncStorage.setItem("@clinica:accessToken", ACCESS_VENCIDO);
    await AsyncStorage.setItem("@clinica:refreshToken", "refresh-0");

    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init: RequestInit = {}) => {
        if (url.endsWith("/auth/refresh/")) {
          refreshCalls += 1;
          const { refresh } = JSON.parse(String(init.body));
          // Atraso para que as cinco requisições cheguem enquanto a renovação corre.
          await new Promise((resolve) => setTimeout(resolve, 20));
          if (refresh !== refreshValido) {
            return jsonResponse(401, { detail: "Token is blacklisted" });
          }
          refreshValido = `refresh-${refreshCalls}`;
          return jsonResponse(200, { access: ACCESS_NOVO, refresh: refreshValido });
        }
        if (url.endsWith("/auth/me/")) {
          const auth = (init.headers as Record<string, string>).Authorization;
          if (auth === `Bearer ${ACCESS_NOVO}`) {
            return jsonResponse(200, { email: "admin@example.com" });
          }
          return jsonResponse(401, { detail: "Token expirado" });
        }
        return jsonResponse(404, {});
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("faz uma única renovação e as cinco chamadas respondem com sucesso", async () => {
    const resultados = await Promise.all(Array.from({ length: 5 }, () => getMe()));

    expect(resultados.map((r) => r.ok)).toEqual([true, true, true, true, true]);
    expect(refreshCalls).toBe(1);
    expect(await getRefreshToken()).toBe("refresh-1");
  });

  it("com o refresh já invalidado, renova uma vez só e limpa a sessão", async () => {
    refreshValido = "outro-refresh";

    const resultados = await Promise.all(Array.from({ length: 5 }, () => getMe()));

    expect(resultados.every((r) => !r.ok)).toBe(true);
    expect(refreshCalls).toBe(1);
    expect(await getRefreshToken()).toBeNull();
  });
});
