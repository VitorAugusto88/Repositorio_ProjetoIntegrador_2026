import { expect, Page, test } from "@playwright/test";
import {
  API_URL,
  clicar,
  entrar,
  SENHA,
  textoVisivel,
  tokens,
  USUARIOS,
} from "./apoio";

// RN02: não existe autocadastro; usuários nascem de um convite do admin.
test.describe("Cadastro por convite", () => {
  test("CT10 - cadastro público está desativado", async ({ request }) => {
    const email = "intruso@e2e.local";
    const resposta = await request.post(`${API_URL}/auth/register/`, {
      data: { email, password: SENHA, full_name: "Intruso", role: "patient" },
    });
    expect(resposta.status()).toBeGreaterThanOrEqual(400);

    // E nenhum usuário foi criado: o login continua recusado.
    const login = await request.post(`${API_URL}/auth/login/`, {
      data: { email, password: SENHA },
    });
    expect(login.status()).toBe(401);
  });

  async function cadastrarPaciente(page: Page, nome: string, email: string) {
    await entrar(page, USUARIOS.adminA);
    await clicar(page, "Pacientes");
    await clicar(page, "Cadastrar novo paciente");

    await page.getByPlaceholder("Nome do paciente").fill(nome);
    await page.getByPlaceholder("email@exemplo.com").fill(email);
    await clicar(page, "Dra. Ana Alfa");
    await clicar(page, "Cadastrar paciente");

    await expect(textoVisivel(page, /Paciente cadastrado!.*convite/)).toBeVisible();
  }

  test("CT11 - administrador cadastra paciente por convite", async ({ page, request }) => {
    const email = "nina.nova@e2e.local";
    await cadastrarPaciente(page, "Nina Nova", email);

    // O convidado ainda não tem senha: só entra depois de aceitar o convite.
    const login = await request.post(`${API_URL}/auth/login/`, {
      data: { email, password: SENHA },
    });
    expect(login.status()).toBe(401);

    // Reabrindo a lista, o paciente novo está lá.
    await entrar(page, USUARIOS.adminA);
    await clicar(page, "Pacientes");
    await expect(textoVisivel(page, "Nina Nova")).toBeVisible();
  });

  test("CT11b - lista de pacientes se atualiza ao voltar do cadastro", async ({ page }) => {
    // Regressão do D02: a lista só carregava ao montar a tela.
    await cadastrarPaciente(page, "Otavio Outro", "otavio.outro@e2e.local");
    await expect(textoVisivel(page, "Lista de pacientes")).toBeVisible();
    await expect(textoVisivel(page, "Otavio Outro")).toBeVisible({ timeout: 5_000 });
  });
});

// RN05: token de acesso de 15 minutos e rotação do refresh.
test.describe("Sessão", () => {
  test("CT12 - token de acesso vale 15 minutos e leva o papel do usuário", async ({ request }) => {
    const { access } = await tokens(request, USUARIOS.psicologoA);
    const carga = JSON.parse(
      Buffer.from(access.split(".")[1], "base64url").toString("utf8"),
    );
    expect(carga.exp - carga.iat).toBe(15 * 60);
    expect(carga.role).toBe("professional");
    expect(carga.clinic_id).toBeTruthy();
  });

  test("CT13 - refresh antigo é invalidado depois da renovação", async ({ request }) => {
    const { refresh } = await tokens(request, USUARIOS.pacienteA1);

    const renovacao = await request.post(`${API_URL}/auth/refresh/`, {
      data: { refresh },
    });
    expect(renovacao.status()).toBe(200);
    expect((await renovacao.json()).refresh).not.toBe(refresh);

    const reuso = await request.post(`${API_URL}/auth/refresh/`, {
      data: { refresh },
    });
    expect(reuso.status()).toBe(401);
  });
});
