import { Hono } from "hono";
import { adminAuth } from "./auth.js";
import { adminProviders } from "./providers.js";
import { adminModels } from "./models.js";
import { adminKeys } from "./keys.js";
import { adminUsage } from "./usage.js";
import { adminSettings } from "./settings.js";
import { adminAudit } from "./audit.js";

export const admin = new Hono();

admin.route("/auth", adminAuth);
admin.route("/providers", adminProviders);
admin.route("/models", adminModels);
admin.route("/keys", adminKeys);
admin.route("/usage", adminUsage);
admin.route("/settings", adminSettings);
admin.route("/audit", adminAudit);
