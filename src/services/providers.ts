import { eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { providers } from "../db/schema.js";
import { decryptSecret } from "../security/crypto.js";
import { nanoid } from "nanoid";
import type { Provider, NewProvider } from "../db/schema.js";

export function listProviders(enabledOnly = false): Provider[] {
  return db
    .select()
    .from(providers)
    .where(enabledOnly ? eq(providers.enabled, true) : undefined)
    .all();
}

export function getProvider(id: string): Provider | null {
  return db.select().from(providers).where(eq(providers.id, id)).get() ?? null;
}

export function createProvider(data: Omit<NewProvider, "id" | "createdAt" | "updatedAt">): Provider {
  const now = Date.now();
  const id = nanoid(16);
  db.insert(providers).values({ ...data, id, createdAt: now, updatedAt: now }).run();
  return getProvider(id)!;
}

export function updateProvider(id: string, data: Partial<Omit<NewProvider, "id">>): Provider | null {
  const existing = getProvider(id);
  if (!existing) return null;
  db.update(providers).set({ ...data, updatedAt: Date.now() }).where(eq(providers.id, id)).run();
  return getProvider(id);
}

export function deleteProvider(id: string): boolean {
  const result = db.delete(providers).where(eq(providers.id, id)).run();
  return result.changes > 0;
}

export function getProviderDecrypted(id: string): (Omit<Provider, "apiKeyEnc"> & { apiKey: string }) | null {
  const p = getProvider(id);
  if (!p) return null;
  const { apiKeyEnc: _enc, ...rest } = p;
  if (!p.apiKeyEnc) return { ...rest, apiKey: "" }; // provider không dùng key (local AI)
  const apiKey = decryptSecret(p.apiKeyEnc);
  if (!apiKey) return null;
  return { ...rest, apiKey };
}
