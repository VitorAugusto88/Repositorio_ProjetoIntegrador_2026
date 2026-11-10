import { expect, test } from "@playwright/test";
import { entrar, textoVisivel, USUARIOS } from "./apoio";

// RN05: o papel vem dentro do token e o app roteia por perfil sem chamada
// extra. Cada perfil precisa cair na própria tela inicial.
test.describe("Login e roteamento por perfil", () => {
  test("CT05 - administrador entra e vê o painel da clínica", async ({ page }) => {
    await entrar(page, USUARIOS.adminA);
    await expect(page).toHaveURL(/localhost:8091\/$/);
    await expect(textoVisivel(page, "Admin Alfa")).toBeVisible();
    await expect(textoVisivel(page, "Agendar")).toBeVisible();
  });

  test("CT06 - psicólogo entra e vê o próprio painel", async ({ page }) => {
    await entrar(page, USUARIOS.psicologoA);
    await expect(page).toHaveURL(/\/dashboardP$/);
    await expect(textoVisivel(page, "Dra. Ana Alfa")).toBeVisible();
  });

  test("CT07 - paciente entra e vê a própria tela inicial", async ({ page }) => {
    await entrar(page, USUARIOS.pacienteA1);
    await expect(page).toHaveURL(/\/homep$/);
    await expect(textoVisivel(page, /Paulo Alfa/)).toBeVisible();
  });

  test("CT08 - senha errada mostra o erro e não entra", async ({ page }) => {
    await entrar(page, USUARIOS.adminA, "SenhaErrada123");
    await expect(textoVisivel(page, /incorret|inválid|credenciais/i)).toBeVisible();
    await expect(page).toHaveURL(/\/login$/);
  });
});
