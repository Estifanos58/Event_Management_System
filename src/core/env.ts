import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  REDIS_URL: z.string().min(1, "REDIS_URL is required"),
  BETTER_AUTH_SECRET: z.string().min(1, "BETTER_AUTH_SECRET is required"),
  CHECKIN_QR_SECRET: z.string().min(1).optional(),
  BETTER_AUTH_URL: z.string().url("BETTER_AUTH_URL must be a valid URL"),
  NEXT_PUBLIC_APP_URL: z.string().url("NEXT_PUBLIC_APP_URL must be a valid URL"),
  CHAPA_SECRET_KEY: z.string().min(1, "CHAPA_SECRET_KEY is required"),
  CHAPA_WEBHOOK_SECRET: z.string().min(1, "CHAPA_WEBHOOK_SECRET is required"),
  CHAPA_BASE_URL: z.string().url("CHAPA_BASE_URL must be a valid URL"),
  SECURITY_RATE_LIMIT_WINDOW_SECONDS: z.coerce.number().int().positive().default(60),
  SECURITY_RATE_LIMIT_MAX_REQUESTS: z.coerce.number().int().positive().default(25),
  SECURITY_HIGH_RISK_RATE_LIMIT_MAX_REQUESTS: z.coerce
    .number()
    .int()
    .positive()
    .default(12),
  SECURITY_WEBHOOK_REPLAY_WINDOW_SECONDS: z.coerce
    .number()
    .int()
    .positive()
    .default(900),
  SECURITY_WEBHOOK_MAX_CLOCK_SKEW_SECONDS: z.coerce
    .number()
    .int()
    .positive()
    .default(300),
  DATA_EXPORT_TTL_HOURS: z.coerce.number().int().positive().default(24),
  DATA_EXPORT_RETENTION_DAYS: z.coerce.number().int().positive().default(30),
  INBOUND_PAYLOAD_RETENTION_DAYS: z.coerce.number().int().positive().default(30),
  NOTIFICATION_RETENTION_DAYS: z.coerce.number().int().positive().default(120),
  OPS_LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
  OPS_METRICS_WINDOW_MINUTES: z.coerce.number().int().positive().default(15),
  OPS_ALERT_SUPPRESSION_SECONDS: z.coerce.number().int().positive().default(900),
  OPS_ALERT_PAYMENT_CAPTURE_NO_TICKET_MINUTES: z.coerce
    .number()
    .int()
    .positive()
    .default(10),
  OPS_ALERT_INVENTORY_DRIFT_THRESHOLD: z.coerce.number().int().min(0).default(0),
  OPS_ALERT_CHECKIN_API_P95_MS_THRESHOLD: z.coerce
    .number()
    .positive()
    .default(250),
  OPS_ALERT_CHECKIN_ERROR_RATE_THRESHOLD: z.coerce
    .number()
    .min(0)
    .max(1)
    .default(0.05),
  OPS_ALERT_WEBHOOK_BACKLOG_THRESHOLD: z.coerce
    .number()
    .int()
    .positive()
    .default(500),
  OPS_ALERT_WEBHOOK_DEAD_LETTER_THRESHOLD: z.coerce
    .number()
    .int()
    .positive()
    .default(25),
  OPS_ALERT_DEPENDENCY_FAILURE_COUNT_THRESHOLD: z.coerce
    .number()
    .int()
    .positive()
    .default(50),
  WS_PORT: z.coerce.number().int().positive(),
  WS_ALLOWED_ORIGIN: z.string().url("WS_ALLOWED_ORIGIN must be a valid URL"),
});

const parsed = envSchema.safeParse({
  NODE_ENV: process.env.NODE_ENV,
  DATABASE_URL: process.env.DATABASE_URL,
  REDIS_URL: process.env.REDIS_URL,
  BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET,
  CHECKIN_QR_SECRET: process.env.CHECKIN_QR_SECRET,
  BETTER_AUTH_URL: process.env.BETTER_AUTH_URL,
  NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
  CHAPA_SECRET_KEY: process.env.CHAPA_SECRET_KEY,
  CHAPA_WEBHOOK_SECRET: process.env.CHAPA_WEBHOOK_SECRET,
  CHAPA_BASE_URL: process.env.CHAPA_BASE_URL,
  SECURITY_RATE_LIMIT_WINDOW_SECONDS: process.env.SECURITY_RATE_LIMIT_WINDOW_SECONDS,
  SECURITY_RATE_LIMIT_MAX_REQUESTS: process.env.SECURITY_RATE_LIMIT_MAX_REQUESTS,
  SECURITY_HIGH_RISK_RATE_LIMIT_MAX_REQUESTS:
    process.env.SECURITY_HIGH_RISK_RATE_LIMIT_MAX_REQUESTS,
  SECURITY_WEBHOOK_REPLAY_WINDOW_SECONDS:
    process.env.SECURITY_WEBHOOK_REPLAY_WINDOW_SECONDS,
  SECURITY_WEBHOOK_MAX_CLOCK_SKEW_SECONDS:
    process.env.SECURITY_WEBHOOK_MAX_CLOCK_SKEW_SECONDS,
  DATA_EXPORT_TTL_HOURS: process.env.DATA_EXPORT_TTL_HOURS,
  DATA_EXPORT_RETENTION_DAYS: process.env.DATA_EXPORT_RETENTION_DAYS,
  INBOUND_PAYLOAD_RETENTION_DAYS: process.env.INBOUND_PAYLOAD_RETENTION_DAYS,
  NOTIFICATION_RETENTION_DAYS: process.env.NOTIFICATION_RETENTION_DAYS,
  OPS_LOG_LEVEL: process.env.OPS_LOG_LEVEL,
  OPS_METRICS_WINDOW_MINUTES: process.env.OPS_METRICS_WINDOW_MINUTES,
  OPS_ALERT_SUPPRESSION_SECONDS: process.env.OPS_ALERT_SUPPRESSION_SECONDS,
  OPS_ALERT_PAYMENT_CAPTURE_NO_TICKET_MINUTES:
    process.env.OPS_ALERT_PAYMENT_CAPTURE_NO_TICKET_MINUTES,
  OPS_ALERT_INVENTORY_DRIFT_THRESHOLD:
    process.env.OPS_ALERT_INVENTORY_DRIFT_THRESHOLD,
  OPS_ALERT_CHECKIN_API_P95_MS_THRESHOLD:
    process.env.OPS_ALERT_CHECKIN_API_P95_MS_THRESHOLD,
  OPS_ALERT_CHECKIN_ERROR_RATE_THRESHOLD:
    process.env.OPS_ALERT_CHECKIN_ERROR_RATE_THRESHOLD,
  OPS_ALERT_WEBHOOK_BACKLOG_THRESHOLD:
    process.env.OPS_ALERT_WEBHOOK_BACKLOG_THRESHOLD,
  OPS_ALERT_WEBHOOK_DEAD_LETTER_THRESHOLD:
    process.env.OPS_ALERT_WEBHOOK_DEAD_LETTER_THRESHOLD,
  OPS_ALERT_DEPENDENCY_FAILURE_COUNT_THRESHOLD:
    process.env.OPS_ALERT_DEPENDENCY_FAILURE_COUNT_THRESHOLD,
  WS_PORT: process.env.WS_PORT,
  WS_ALLOWED_ORIGIN: process.env.WS_ALLOWED_ORIGIN,
});

if (!parsed.success) {
  console.error("Invalid environment variables", parsed.error.flatten().fieldErrors);
  throw new Error("Environment variable validation failed");
}

export const env = parsed.data;
