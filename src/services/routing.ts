import { eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { models, providers } from "../db/schema.js";
import { getProviderDecrypted } from "./providers.js";

export interface ResolvedRoute {
  model: import("../db/schema.js").Model;
  provider: { id: string; name: string; baseUrl: string; enabled: boolean; createdAt: number; updatedAt: number };
  upstreamBaseUrl: string;
  upstreamModelId: string;
  upstreamApiKey: string;
}

export function resolveRoute(exposedId: string): ResolvedRoute | null {
  const model = db.select().from(models).where(eq(models.exposedId, exposedId)).get();
  if (!model || !model.enabled) return null;

  const p = getProviderDecrypted(model.providerId);
  if (!p || !p.enabled) return null;

  return {
    model,
    provider: {
      id: p.id,
      name: p.name,
      baseUrl: p.baseUrl,
      enabled: p.enabled,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
    },
    upstreamBaseUrl: p.baseUrl.replace(/\/+$/, ""),
    upstreamModelId: model.upstreamModelId || model.exposedId,
    upstreamApiKey: p.apiKey,
  };
}
