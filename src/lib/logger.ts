import { pino } from "pino";
import { env } from "../config/env.js";

export const logger = pino({
  level: env.LOG_LEVEL,
  redact: {
    paths: [
      "req.headers.authorization",
      "*.authorization",
      "*.apiKey",
      "*.password",
      "*.Authorization",
    ],
    censor: "[REDACTED]",
  },
  base: { app: "nexgate" },
});
