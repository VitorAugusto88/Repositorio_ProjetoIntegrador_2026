import { expect, Page, test } from "@playwright/test";
import {
  API_URL,
  autenticado,
  clicar,
  dataISO,
  entrar,
  lista,
  proximoDiaUtil,
  proximoSabado,
  textoVisivel,
  USUARIOS,
} from "./apoio";

// RN03: agenda sem conflito, sem passado e dentro da disponibilidade.
// Os três testes usam o mesmo horário: o CT02 depende da consulta do CT01.
test.describe.configure({ mode: "serial" });

const DIA = proximoDiaUtil(1);
const HORA = "14:00";

async function preencherAgendamento(
  page: Page,
  dados: { paciente: string; data: string; hora: string; sala?: string },
) {
  await entrar(page, USUARIOS.adminA);
  await clicar(page, "Agendar");
  await expect(textoVisivel(page, "Novo agendamento")).toBeVisible();

  await clicar(page, "Selecione...");
  await clicar(page, dados.paciente);
  await clicar(page, "Selecione...");
  await clicar(page, "Dra. Ana Alfa");

  await page.locator('input[type="date"]').fill(dados.data);
  await page.locator('input[type="time"]').fill(dados.hora);

  if (dados.sala) {
    await clicar(page, "Sem sala definida");
    await clicar(page, dados.sala);
  }

  await clicar(page, "Confirmar agendamento");
}

test.describe("Agendamento de consulta", () => {
  test("CT01 - administrador agenda consulta válida e o psicólogo a vê", async ({ page }) => {
    await preencherAgendamento(page, {
      paciente: "Paulo Alfa",
      data: dataISO(DIA),
      hora: HORA,
      sala: "Sala Azul",
    });
    await expect(textoVisivel(page, /Consulta agendada/)).toBeVisible();

    // Sem deslocamento de fuso: o psicólogo vê 14:00, e não 11:00 ou 17:00.
    await page.context().clearCookies();
    await page.evaluate(() => localStorage.clear());
    await entrar(page, USUARIOS.psicologoA);
    await expect(page).toHaveURL(/\/dashboardP$/);
    await expect(textoVisivel(page, /Paulo Alfa/)).toBeVisible();
    await expect(textoVisivel(page, new RegExp(HORA))).toBeVisible();
  });

  test("CT02 - segundo paciente no mesmo horário do psicólogo é recusado", async ({ page }) => {
    await preencherAgendamento(page, {
      paciente: "Patricia Alfa",
      data: dataISO(DIA),
      hora: HORA,
    });
    await expect(
      textoVisivel(page, /Este psicólogo já tem uma consulta agendada nesse horário\./),
    ).toBeVisible();

    // Nenhuma segunda consulta foi gravada naquele horário.
    const resposta = await page.request.get(`${API_URL}/appointments/`, {
      headers: await autenticado(page.request, USUARIOS.adminA),
    });
    const consultas = lista<{ scheduled_at: string }>(await resposta.json());
    const noHorario = consultas.filter((c) =>
      c.scheduled_at.startsWith(`${dataISO(DIA)}T${HORA}`),
    );
    expect(noHorario).toHaveLength(1);
  });

  test("CT09 - horário fora da disponibilidade do psicólogo é recusado", async ({ page }) => {
    // A massa só cadastra disponibilidade de segunda a sexta.
    await preencherAgendamento(page, {
      paciente: "Patricia Alfa",
      data: dataISO(proximoSabado()),
      hora: "10:00",
    });
    await expect(
      textoVisivel(page, /Erro ao agendar.*fora da disponibilidade/),
    ).toBeVisible();
    await expect(textoVisivel(page, /Consulta agendada/)).toHaveCount(0);
  });
});
