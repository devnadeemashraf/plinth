import { type ChildProcess, spawn } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:net";

export interface SpawnedApi {
  readonly url: string;
  readonly child: ChildProcess;
  /** Resolves with the exit code once the process ends. */
  readonly exited: Promise<number | null>;
  /** SIGTERM on POSIX; the IPC "shutdown" message on Windows, which has no catchable SIGTERM. */
  terminate(): void;
}

export interface ProcessResult {
  readonly code: number | null;
  /** stdout and stderr together. */
  readonly output: string;
}

/** Runs `node src/main/migrate.ts [migrationsFolder]` against `databaseUrl` and waits for it to exit. */
export async function runMigrate(
  databaseUrl: string,
  migrationsFolder?: string,
): Promise<ProcessResult> {
  const args = ["src/main/migrate.ts", ...(migrationsFolder ? [migrationsFolder] : [])];
  const child = spawn(process.execPath, args, {
    env: { NODE_ENV: "test", LOG_LEVEL: "info", DATABASE_URL: databaseUrl },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  child.stdout.on("data", (chunk: Buffer) => {
    output += String(chunk);
  });
  child.stderr.on("data", (chunk: Buffer) => {
    output += String(chunk);
  });
  const [code] = (await once(child, "close")) as [number | null];
  return { code, output };
}

export async function freePort(): Promise<number> {
  const probe = createServer();
  probe.listen(0, "127.0.0.1");
  await once(probe, "listening");
  const address = probe.address();
  probe.close();
  return typeof address === "object" && address !== null ? address.port : 0;
}

/** Nothing listens here; the API only connects when a request needs the database. */
const UNUSED_DATABASE_URL = "postgres://plinth@127.0.0.1:1/plinth";

/** Spawns `node src/main/api.ts` with only the given env and resolves once it logs "api listening". */
export async function spawnApi(env: Readonly<Record<string, string>> = {}): Promise<SpawnedApi> {
  const port = await freePort();
  const child = spawn(process.execPath, ["src/main/api.ts"], {
    env: {
      NODE_ENV: "test",
      LOG_LEVEL: "info",
      PORT: String(port),
      DATABASE_URL: UNUSED_DATABASE_URL,
      ...env,
    },
    stdio: ["ignore", "pipe", "pipe", "ipc"],
  });
  const exited = once(child, "exit").then(([code]) => code as number | null);
  let output = "";
  await new Promise<void>((resolve, reject) => {
    child.stdout?.on("data", (chunk: Buffer) => {
      output += String(chunk);
      if (output.includes('"api listening"')) {
        resolve();
      }
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      output += String(chunk);
    });
    void exited.then((code) =>
      reject(new Error(`api exited with ${code} before listening:\n${output}`)),
    );
  });
  return {
    url: `http://127.0.0.1:${port}`,
    child,
    exited,
    terminate: () => {
      if (process.platform === "win32") {
        child.send("shutdown");
      } else {
        child.kill("SIGTERM");
      }
    },
  };
}
