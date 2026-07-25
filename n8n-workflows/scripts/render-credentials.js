/**
 * Render n8n credentials JSON from environment variables (.env via compose).
 *
 * Runs inside the n8n-import container before `n8n import:credentials`.
 * Credential IDs are FIXED so the workflow JSONs can reference them and
 * re-imports stay idempotent (same id = overwrite, no duplicates).
 */
const env = process.env;

const credentials = [
  {
    id: "HrSmtpFromEnv001",
    name: "HR SMTP (.env)",
    type: "smtp",
    data: {
      user: env.SMTP_USER || "",
      password: env.SMTP_PASSWORD || "",
      host: env.SMTP_HOST || "smtp.gmail.com",
      port: parseInt(env.SMTP_PORT || "587", 10),
      secure: false,
      disableStartTls: false,
    },
  },
  {
    id: "HrTelegramEnv01",
    name: "HR Telegram Bot (.env)",
    type: "telegramApi",
    data: {
      accessToken: env.TELEGRAM_BOT_TOKEN || "",
      baseUrl: "https://api.telegram.org",
    },
  },
  {
    id: "HrPostgresEnv001",
    name: "HR Postgres (.env)",
    type: "postgres",
    data: {
      host: env.DB_POSTGRESDB_HOST || "db",
      port: parseInt(env.DB_POSTGRESDB_PORT || "5432", 10),
      database: env.DB_POSTGRESDB_DATABASE || "hrdb",
      user: env.DB_POSTGRESDB_USER || "hruser",
      password: env.DB_POSTGRESDB_PASSWORD || "hrpassword",
      ssl: "disable",
      sshTunnel: false,
    },
  },
];

process.stdout.write(JSON.stringify(credentials, null, 2));
