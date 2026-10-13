import type { CampaignStorage } from "../core/campaign-persistent";

/** Narrow Durable Object storage surface, scoped to an EMP-003 object. */
export interface EMP003DurableStorage {
  get<T = unknown>(key: string): Promise<T | undefined>;
  put<T>(key: string, value: T): Promise<void>;
  list<T = unknown>(options: { prefix: string }): Promise<Map<string, T>>;
}

/** Reuses the existing campaign storage contract without touching shared objects. */
export function createEMP003DurableStorageAdapter(storage: EMP003DurableStorage): CampaignStorage {
  return {
    async get(key) {
      const value = await storage.get<string>(key);
      if (value === undefined) return undefined;
      if (typeof value !== "string") throw new Error("EMP003_STORAGE_VALUE_INVALID");
      return value;
    },
    async put(key, value) {
      await storage.put(key, value);
    },
    async list(prefix) {
      const entries = await storage.list<string>({ prefix });
      return [...entries].map(([key, value]) => {
        if (!key.startsWith(prefix) || typeof value !== "string") throw new Error("EMP003_STORAGE_VALUE_INVALID");
        return { key, value };
      });
    }
  };
}
