import { expect, Page, test } from "@playwright/test";
import { clicar, entrar, textoVisivel, USUARIOS } from "./apoio";

// RN04: upload validado pelo conteúdo do arquivo, não pela extensão.
// Os envios são feitos pela tela "Documentos" do administrador, como avulsos.
test.describe.configure({ mode: "serial" });

const PDF_VALIDO = Buffer.from("%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF");
// Executável do Windows: começa com "MZ", não com "%PDF".
const EXECUTAVEL = Buffer.concat([Buffer.from("MZ"), Buffer.alloc(3 * 1024, 0x90)]);
// Acima do limite de 10 MB do prontuário, mas com assinatura de PDF.
const PDF_GRANDE = Buffer.concat([PDF_VALIDO, Buffer.alloc(11 * 1024 * 1024, 0x20)]);

async function enviarDocumento(page: Page, titulo: string, arquivo: Buffer) {
  await entrar(page, USUARIOS.adminA);
  await clicar(page, "Documentos");
  await clicar(page, "Adicionar documento");

  await page.getByPlaceholder("Ex: Termo de consentimento").fill(titulo);

  const seletor = page.waitForEvent("filechooser");
  await clicar(page, "Toque para selecionar o arquivo");
  await (await seletor).setFiles({
    name: "laudo.pdf",
    mimeType: "application/pdf",
    buffer: arquivo,
  });
  await expect(textoVisivel(page, "laudo.pdf")).toBeVisible();

  await clicar(page, "Enviar");
}

test.describe("Upload de documentos do prontuário", () => {
  test("CT04a - executável renomeado para .pdf é recusado", async ({ page }) => {
    await enviarDocumento(page, "Laudo falso", EXECUTAVEL);
    await expect(
      textoVisivel(page, /conteúdo do arquivo não corresponde à extensão/),
    ).toBeVisible();
  });

  test("CT04b - PDF legítimo é aceito e aparece na lista", async ({ page }) => {
    await enviarDocumento(page, "Laudo legitimo", PDF_VALIDO);
    await expect(textoVisivel(page, "Laudo legitimo")).toBeVisible();
    // O executável do CT04a não foi gravado.
    await expect(textoVisivel(page, "Laudo falso")).toHaveCount(0);
  });

  test("CT04c - PDF acima de 10 MB é recusado com a mensagem de limite", async ({ page }) => {
    await enviarDocumento(page, "Laudo grande", PDF_GRANDE);
    await expect(textoVisivel(page, /não pode ser maior que 10MB/)).toBeVisible();
  });
});
