import { enabledModules } from "#modules/index.ts";
import { loadConfig } from "#platform/config/load.ts";
import { createRootContainer, registerModules } from "#platform/di/container.ts";
import { createExpressHttpServer } from "#platform/http/express/express-server.ts";
import { createPipeline } from "#platform/http/pipeline.ts";
import { createLogger } from "#platform/logger/create-logger.ts";

const config = loadConfig();
const logger = createLogger(config);
const container = createRootContainer(config, logger);
const routes = registerModules(container, config, enabledModules);
const pipeline = createPipeline({
  config,
  logger,
  idGenerator: container.cradle.idGenerator,
  container,
});
const server = createExpressHttpServer({ config, pipeline });
server.register(routes);
await server.listen(config.PORT);
logger.info({ port: config.PORT, routes: routes.length }, "api listening");

let stopping = false;
async function shutdown(reason: string): Promise<void> {
  if (stopping) {
    return;
  }
  stopping = true;
  logger.info({ reason }, "api shutting down");
  await server.close();
  logger.info({ reason }, "api stopped");
  process.exit(0);
}

process.once("SIGTERM", () => void shutdown("SIGTERM"));
process.once("SIGINT", () => void shutdown("SIGINT"));
// Windows has no catchable SIGTERM; process managers send a "shutdown" message over IPC instead.
process.on("message", (message) => {
  if (message === "shutdown") {
    void shutdown("shutdown message");
  }
});
