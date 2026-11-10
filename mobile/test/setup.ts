import { vi } from "vitest";

vi.stubGlobal("__DEV__", false);

vi.mock("react-native", () => ({
  Platform: {
    select: (values: Record<string, string>) => values.web ?? values.default,
  },
}));

const storage = new Map<string, string>();

vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem: vi.fn(async (key: string) => storage.get(key) ?? null),
    setItem: vi.fn(async (key: string, value: string) => {
      storage.set(key, value);
    }),
    removeItem: vi.fn(async (key: string) => {
      storage.delete(key);
    }),
    // Usados por saveTokens/clearTokens em services/api.ts.
    multiSet: vi.fn(async (pairs: [string, string][]) => {
      pairs.forEach(([key, value]) => storage.set(key, value));
    }),
    multiRemove: vi.fn(async (keys: string[]) => {
      keys.forEach((key) => storage.delete(key));
    }),
  },
}));