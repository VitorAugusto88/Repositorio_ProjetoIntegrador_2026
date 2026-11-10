import { APIRequestContext, expect, Page } from "@playwright/test";

// Massa criada por `manage.py popular_e2e` (ClinicSystem). Clínica Alfa é a
// "Clínica A" do Plano de Teste; Clínica Beta é a "Clínica B" dos testes de
// isolamento (RN01).
export const API_URL = "http://127.0.0.1:8010/api";
export const SENHA = "SenhaE2e@2026";

export const USUARIOS = {
  adminA: "admin.a@e2e.local",
  psicologoA: "psi.a@e2e.local",
  pacienteA1: "paciente.a1@e2e.local",
  pacienteA2: "paciente.a2@e2e.local",
  adminB: "admin.b@e2e.local",
  psicologoB: "psi.b@e2e.local",
} as const;

// ─── Interface ───────────────────────────────────────────────────────────────

export async function entrar(page: Page, email: string, senha = SENHA) {
  await page.goto("/login");
  const campos = page.locator("input");
  await expect(page.getByText("Entrar", { exact: true })).toBeVisible();

  // Logo após o carregamento, a tela de login ainda re-renderiza uma vez e
  // descarta o que foi digitado no primeiro instante. Um usuário real nunca
  // digita tão rápido; o teste repete até o valor ficar.
  await expect(async () => {
    await campos.nth(0).fill(email);
    await campos.nth(1).fill(senha);
    await expect(campos.nth(0)).toHaveValue(email, { timeout: 500 });
  }).toPass({ timeout: 15_000 });

  await page.getByText("Entrar", { exact: true }).click();
}

// Elementos de telas anteriores continuam no DOM (ocultos) por causa da
// navegação em pilha; só interessam os visíveis.
export function textoVisivel(page: Page, texto: string | RegExp) {
  return page
    .getByText(texto, typeof texto === "string" ? { exact: true } : undefined)
    .locator("visible=true")
    .first();
}

export async function clicar(page: Page, texto: string | RegExp) {
  await textoVisivel(page, texto).click();
}

// ─── Datas ───────────────────────────────────────────────────────────────────

const pad = (n: number) => String(n).padStart(2, "0");
export const dataISO = (d: Date) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

// Próximo dia de segunda a sexta (dentro da disponibilidade da massa),
// pulando `pular` dias úteis a partir de amanhã.
export function proximoDiaUtil(pular = 0): Date {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  let restantes = pular;
  for (;;) {
    const util = d.getDay() !== 0 && d.getDay() !== 6;
    if (util && restantes === 0) return d;
    if (util) restantes -= 1;
    d.setDate(d.getDate() + 1);
  }
}

export function proximoSabado(): Date {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  while (d.getDay() !== 6) d.setDate(d.getDate() + 1);
  return d;
}

// ─── API ─────────────────────────────────────────────────────────────────────

export async function tokens(request: APIRequestContext, email: string) {
  const resposta = await request.post(`${API_URL}/auth/login/`, {
    data: { email, password: SENHA },
  });
  expect(resposta.status(), `login de ${email}`).toBe(200);
  return (await resposta.json()) as { access: string; refresh: string };
}

export async function autenticado(request: APIRequestContext, email: string) {
  const { access } = await tokens(request, email);
  return { Authorization: `Bearer ${access}` };
}

export function lista<T>(corpo: T[] | { results: T[] }): T[] {
  return Array.isArray(corpo) ? corpo : corpo.results;
}
