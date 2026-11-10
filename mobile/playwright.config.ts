import { defineConfig, devices } from "@playwright/test";
import path from "node:path";

// Testes ponta a ponta (Plano de Teste, topo da pirâmide).
//
// O Playwright sobe dois servidores só para a bateria:
//   - API em 127.0.0.1:8010 com config.settings_e2e (SQLite local, banco
//     recriado e populado a cada execução — nunca o banco da nuvem do .env);
//   - app web do Expo em localhost:8091 apontando para essa API.
// As portas são diferentes das de desenvolvimento (8000/8081) de propósito:
// assim a bateria nunca reaproveita um servidor ligado no banco real.
//
// Uso: npm run test:e2e          (relatório: npx playwright show-report)
//
// E2E_REUSE=1 reaproveita servidores já ligados nas portas 8010/8091 (útil ao
// escrever testes). Só use se eles foram iniciados com config.settings_e2e.

const BACKEND_DIR = path.resolve(
  __dirname,
  process.env.E2E_BACKEND_DIR ?? "../Back",
);
const PYTHON =
  process.env.E2E_PYTHON ??
  (process.platform === "win32"
    ? path.join(BACKEND_DIR, "venv", "Scripts", "python.exe")
    : "python");

const API_URL = "http://127.0.0.1:8010/api";
const APP_URL = "http://localhost:8091";

const REUSE = process.env.E2E_REUSE === "1";

const manage = (args: string) =>
  `"${PYTHON}" manage.py ${args} --settings=config.settings_e2e`;

export default defineConfig({
  testDir: "./e2e",
  // A massa de teste é compartilhada; os testes que gravam dependem da ordem.
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: APP_URL,
    locale: "pt-BR",
    timezoneId: "America/Sao_Paulo",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
    {
      command: [
        manage("migrate --noinput -v 0"),
        manage("popular_e2e"),
        manage("runserver 127.0.0.1:8010 --noreload"),
      ].join(" && "),
      cwd: BACKEND_DIR,
      url: "http://127.0.0.1:8010/admin/login/",
      reuseExistingServer: REUSE,
      timeout: 180_000,
      stdout: "ignore",
    },
    {
      command: "npx expo start --web --port 8091",
      url: APP_URL,
      env: {
        EXPO_PUBLIC_API_URL: API_URL,
        EXPO_PUBLIC_WS_URL: "ws://127.0.0.1:8010/ws/chat",
        CI: "1",
        BROWSER: "none",
      },
      reuseExistingServer: REUSE,
      timeout: 300_000,
      stdout: "ignore",
    },
  ],
});
