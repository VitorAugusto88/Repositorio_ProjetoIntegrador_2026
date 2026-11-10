import { expect, test } from "@playwright/test";
import {
  API_URL,
  autenticado,
  clicar,
  entrar,
  lista,
  textoVisivel,
  USUARIOS,
} from "./apoio";

// RN01 — caso mais crítico do Plano de Teste: um usuário da Clínica Alfa não
// pode ler nem alterar nada da Clínica Beta. Uma única resposta 200 aqui
// bloqueia a entrega.

interface Registro {
  id: string;
  title?: string;
}

test.describe("Isolamento entre clínicas", () => {
  test("CT03 - administrador da Clínica A não alcança dados da Clínica B", async ({ request }) => {
    // Ids reais da Clínica B. Os documentos vêm do psicólogo dela, porque o
    // admin só enxerga os avulsos (documento clínico é exclusivo do psicólogo).
    const adminB = await autenticado(request, USUARIOS.adminB);
    const psicologoB = await autenticado(request, USUARIOS.psicologoB);
    const docsB = lista<Registro>(
      await (await request.get(`${API_URL}/records/documents/`, { headers: psicologoB })).json(),
    );
    const consultasB = lista<Registro>(
      await (await request.get(`${API_URL}/appointments/`, { headers: adminB })).json(),
    );
    const laudoB = docsB.find((d) => d.title === "Laudo Beta");
    const avulsoB = docsB.find((d) => d.title === "Avulso Beta");
    const consultaB = consultasB[0];
    expect(laudoB && avulsoB && consultaB, "massa da Clínica B").toBeTruthy();

    const adminA = await autenticado(request, USUARIOS.adminA);

    // Passo 1: a lista de documentos da Clínica A não traz nada da B.
    const listaA = await request.get(`${API_URL}/records/documents/`, { headers: adminA });
    expect(listaA.status()).toBe(200);
    const corpoLista = await listaA.text();
    expect(corpoLista).not.toContain(laudoB!.id);
    expect(corpoLista).not.toContain(avulsoB!.id);

    // Passos 2 a 5: acesso direto pelo id é sempre recusado.
    const tentativas = [
      { passo: "2 - GET documento D-B", r: () => request.get(`${API_URL}/records/documents/${laudoB!.id}/`, { headers: adminA }) },
      { passo: "3 - GET consulta C-B", r: () => request.get(`${API_URL}/appointments/${consultaB.id}/`, { headers: adminA }) },
      {
        passo: "4 - PATCH consulta C-B",
        r: () =>
          request.patch(`${API_URL}/appointments/${consultaB.id}/`, {
            headers: adminA,
            data: { scheduled_at: "2030-01-07T09:00:00-03:00" },
          }),
      },
      { passo: "5 - GET documento avulso da B", r: () => request.get(`${API_URL}/records/documents/${avulsoB!.id}/`, { headers: adminA }) },
    ];

    for (const { passo, r } of tentativas) {
      const resposta = await r();
      expect([403, 404], `passo ${passo}`).toContain(resposta.status());
      const corpo = await resposta.text();
      expect(corpo, `passo ${passo} vazou dado`).not.toMatch(/Beta/);
    }

    // A consulta da B continua com o horário original.
    const depois = await request.get(`${API_URL}/appointments/${consultaB.id}/`, { headers: adminB });
    expect((await depois.json()).scheduled_at).not.toContain("2030-01-07");
  });

  test("CT03b - lista de pacientes na tela só mostra a própria clínica", async ({ page }) => {
    await entrar(page, USUARIOS.adminA);
    await clicar(page, "Pacientes");
    await expect(textoVisivel(page, "Lista de pacientes")).toBeVisible();
    await expect(textoVisivel(page, "Paulo Alfa")).toBeVisible();
    await expect(textoVisivel(page, "Patricia Alfa")).toBeVisible();
    await expect(textoVisivel(page, "Pedro Beta")).toHaveCount(0);
  });
});
