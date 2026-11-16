import type { AddressInfo } from "node:net";
import { Writable } from "node:stream";
import { loadConfig } from "#platform/config/load.ts";
import { createRootContainer } from "#platform/di/container.ts";
import { createExpressHttpServer } from "#platform/http/express/express-server.ts";
import { createPipeline } from "#platform/http/pipeline.ts";
import type { HttpServerPort, RouteDefinition } from "#platform/kernel/http.ts";
import { uuidV7Generator } from "#platform/kernel/ports/id-generator.ts";
import { createLogger } from "#platform/logger/create-logger.ts";

export type LogLine = Record<string, unknown> & { level: number; msg?: string };

export interface TestServer {
  readonly url: string;
  readonly server: HttpServerPort;
  /** Every log line written so far, parsed. */
  logs(): LogLine[];
  close(): Promise<void>;
}

/** Starts the real pipeline and Express adapter on a free port, capturing logs in memory. */
export async function startTestServer(
  routes: RouteDefinition[],
  configOverrides: Readonly<Record<string, string>> = {},
): Promise<TestServer> {
  // Routes under test here never touch the database; the URL only satisfies the schema.
  const config = loadConfig({
    NODE_ENV: "test",
    DATABASE_URL: "postgres://plinth@127.0.0.1:1/plinth",
    ...configOverrides,
  });
  const chunks: string[] = [];
  const destination = new Writable({
    write(chunk, _encoding, done) {
      chunks.push(String(chunk));
      done();
    },
  });
  const logger = createLogger(config, destination);
  const container = createRootContainer(config, logger);
  const pipeline = createPipeline({ config, logger, idGenerator: uuidV7Generator, container });
  const server = createExpressHttpServer({ config, pipeline });
  server.register(routes);
  await server.listen(0);
  const { port } = server.nodeServer().address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${port}`,
    server,
    logs: () =>
      chunks
        .join("")
        .split("\n")
        .filter((line) => line.length > 0)
        .map((line) => JSON.parse(line) as LogLine),
    close: () => server.close(),
  };
}
