import { buildSocialApp } from "./app.js";

async function main(): Promise<void> {
  const port = Number(process.env["PORT"] ?? 3001);
  const host = process.env["HOST"] ?? "0.0.0.0";
  const sqliteFilename = process.env["DATABASE_URL"]?.startsWith("file:")
    ? process.env["DATABASE_URL"].slice(5)
    : "social_media.db";

  const app = await buildSocialApp({
    isProduction: process.env["NODE_ENV"] === "production",
    port,
    host,
    sqliteFilename,
  });

  const shutdown = async (signal: string) => {
    process.stdout.write(`\nReceived ${signal}, draining social media service...\n`);
    await app.close();
    process.exit(0);
  };

  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));

  const info = await app.start();
  process.stdout.write(`
=====================================================
  Plinth Social Media Backend API
  Listening on http://${info.host}:${info.port}
  Interactive Scalar Docs: http://localhost:${info.port}/docs
  OpenAPI Specification:  http://localhost:${info.port}/openapi.json
=====================================================
`);
}

main().catch((err) => {
  process.stderr.write(`Fatal startup error: ${err}\n`);
  process.exit(1);
});
