import { createLogger, loadConfig } from "@plinth/core";
import { buildApp } from "@plinth/reference-api/app.js";

async function main(): Promise<void> {
  const config = loadConfig();
  const logger = createLogger({
    level: config.NODE_ENV === "production" ? "info" : "debug",
  });

  const sqliteFilename = config.DATABASE_URL.startsWith("file:")
    ? config.DATABASE_URL.slice(5)
    : ":memory:";

  const masterKey = /^[0-9a-fA-F]{64}$/.test(config.MASTER_ENCRYPTION_KEY)
    ? Buffer.from(config.MASTER_ENCRYPTION_KEY, "hex")
    : Buffer.from(config.MASTER_ENCRYPTION_KEY, "base64");

  const app = await buildApp({
    isProduction: config.NODE_ENV === "production",
    port: config.PORT,
    host: "0.0.0.0",
    sqliteFilename,
    masterKey,
    adminAllowedCidrs: config.ADMIN_ALLOWED_CIDRS,
  });

  const shutdown = async (signal: string) => {
    logger.info("Received termination signal, draining connections", { signal });
    await app.close();
    process.exit(0);
  };

  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));

  const info = await app.start();
  logger.info("Server listening", { port: info.port, host: info.host });
}

main().catch((err) => {
  // biome-ignore lint/suspicious/noConsole: Fatal startup error fallback
  console.error("Fatal startup error:", err);
  process.exit(1);
});
