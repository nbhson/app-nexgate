import { eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { models } from "../db/schema.js";
import type { Model, NewModel } from "../db/schema.js";

export function listModels(enabledOnly = false): Model[] {
  return db.select().from(models).where(enabledOnly ? eq(models.enabled, true) : undefined).all();
}

export function getModelByExposedId(exposedId: string): Model | null {
  return db.select().from(models).where(eq(models.exposedId, exposedId)).get() ?? null;
}

export function createModel(data: Omit<NewModel, "id" | "createdAt">): Model {
  db.insert(models).values({ ...data, createdAt: Date.now() }).run();
  return getModelByExposedId(data.exposedId)!;
}

export function updateModel(exposedId: string, data: Partial<NewModel>): Model | null {
  db.update(models).set(data).where(eq(models.exposedId, exposedId)).run();
  return getModelByExposedId(exposedId);
}

export function deleteModel(exposedId: string): boolean {
  const result = db.delete(models).where(eq(models.exposedId, exposedId)).run();
  return result.changes > 0;
}
