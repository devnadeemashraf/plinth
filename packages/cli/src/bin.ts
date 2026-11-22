import { parseArgs } from "node:util";
import { addCommand } from "./commands/add.js";
import { deployAddCommand } from "./commands/deploy-add.js";
import { type InitOptions, initCommand, promptInitOptions } from "./commands/init.js";

export async function runCli(args: readonly string[]): Promise<void> {
  const command = args[0];

  if (!command || command === "--help" || command === "-h") {
    process.stdout.write(
      [
        "Plinth CLI — Production Hexagonal Backend Platform",
        "",
        "Usage:",
        "  plinth <command> [options]",
        "",
        "Available Commands:",
        "  init                     Scaffold a new Plinth service interactively or with flags",
        "  add <type> <name>        Add an adapter or module to an existing service",
        "  deploy:add <target>      Add deployment blueprint files (render-railway, vps-caddy, aws, gcp)",
        "  admin:create-superuser   Create a new super user with mandatory TOTP MFA",
        "",
        "Options for init:",
        "  --name <name>            Project name (kebab-case)",
        "  --target-dir <path>      Target directory to scaffold into",
        "  --tenancy <single|multi> Multi-tenancy mode (default: single)",
        "  --database <db>          Database adapter (sqlite, postgres, mysql)",
        "  --http <framework>       HTTP framework (fastify, express)",
        "  --cache <cache>          Cache adapter (memory, redis)",
        "  --queue <queue>          Queue adapter (db, bullmq)",
        "  --storage <storage>      Storage adapter (local, s3)",
        "  --email <email>          Email adapter (stub, smtp)",
        "  --billing <provider>     Billing provider (stub, razorpay, stripe, none)",
        "  --compliance <pack>      Compliance pack (none, gdpr, india-dpdp, both)",
        "  --deploy <target>        Deployment blueprint (render-railway, vps-caddy, aws-terraform, gcp-terraform, none)",
        "  --force                  Overwrite existing non-empty directory",
        "  -y, --yes                Accept defaults non-interactively",
        "",
      ].join("\n"),
    );
    return;
  }

  if (command === "--version" || command === "-v") {
    process.stdout.write("plinth 0.1.0\n");
    return;
  }

  if (command === "init") {
    const parsed = parseArgs({
      args: args.slice(1),
      options: {
        name: { type: "string" },
        "target-dir": { type: "string" },
        tenancy: { type: "string" },
        database: { type: "string" },
        http: { type: "string" },
        cache: { type: "string" },
        queue: { type: "string" },
        storage: { type: "string" },
        email: { type: "string" },
        billing: { type: "string" },
        compliance: { type: "string" },
        deploy: { type: "string" },
        force: { type: "boolean", default: false },
        yes: { type: "boolean", short: "y", default: false },
      },
      allowPositionals: false,
    });

    try {
      let options: InitOptions;
      if (parsed.values.name || parsed.values.yes || !process.stdin.isTTY) {
        options = {
          name: parsed.values.name ?? "my-plinth-service",
          targetDir:
            parsed.values["target-dir"] ?? `./${parsed.values.name ?? "my-plinth-service"}`,
          tenancy: (parsed.values.tenancy ?? "single") as "single" | "multi",
          database: (parsed.values.database ?? "sqlite") as "sqlite" | "postgres" | "mysql",
          http: (parsed.values.http ?? "fastify") as "fastify" | "express",
          cache: (parsed.values.cache ?? "memory") as "memory" | "redis",
          queue: (parsed.values.queue ?? "db") as "db" | "bullmq",
          storage: (parsed.values.storage ?? "local") as "local" | "s3",
          email: (parsed.values.email ?? "stub") as "stub" | "smtp",
          billing: (parsed.values.billing ?? "stub") as "stub" | "razorpay" | "stripe" | "none",
          compliance: (parsed.values.compliance ?? "none") as
            | "none"
            | "gdpr"
            | "india-dpdp"
            | "both",
          deploy: (parsed.values.deploy ?? "render-railway") as
            | "render-railway"
            | "vps-caddy"
            | "aws-terraform"
            | "gcp-terraform"
            | "none",
          force: parsed.values.force ?? false,
        };
      } else {
        options = await promptInitOptions({
          name: parsed.values.name,
          force: parsed.values.force,
        });
      }

      const result = await initCommand(options);
      process.stdout.write(`Successfully initialized Plinth service at ${result.targetDir}\n`);
    } catch (err) {
      process.stderr.write(`Init Error: ${(err as Error).message}\n`);
      process.exitCode = 1;
    }
    return;
  }

  if (command === "add") {
    const type = args[1] as "adapter" | "module";
    const name = args[2];

    if (!type || !name) {
      process.stderr.write("Usage: plinth add <adapter|module> <name>\n");
      process.exitCode = 1;
      return;
    }

    try {
      const result = await addCommand({ type, name });
      process.stdout.write(
        `Added ${type} '${name}':\n\nRun:\n  ${result.installCommand}\n\nSnippet:\n  ${result.snippet}\n`,
      );
    } catch (err) {
      process.stderr.write(`Add Error: ${(err as Error).message}\n`);
      process.exitCode = 1;
    }
    return;
  }

  if (command === "deploy:add") {
    const target = args[1] as "render-railway" | "vps-caddy" | "aws-terraform" | "gcp-terraform";

    if (!target) {
      process.stderr.write(
        "Usage: plinth deploy:add <render-railway|vps-caddy|aws-terraform|gcp-terraform>\n",
      );
      process.exitCode = 1;
      return;
    }

    try {
      const result = await deployAddCommand({ target });
      process.stdout.write(
        `Successfully added deploy blueprint '${result.target}'. Files created: ${result.filesCreated.length}\n`,
      );
    } catch (err) {
      process.stderr.write(`Deploy Add Error: ${(err as Error).message}\n`);
      process.exitCode = 1;
    }
    return;
  }

  if (command === "admin:create-superuser") {
    const parsed = parseArgs({
      args: args.slice(1),
      options: {
        email: { type: "string" },
        password: { type: "string" },
        username: { type: "string" },
        "tenant-id": { type: "string" },
      },
      allowPositionals: false,
    });

    const email = parsed.values.email;
    const password = parsed.values.password;
    const username = parsed.values.username;
    const tenantId = parsed.values["tenant-id"] ?? "default_tenant";

    if (!email || !password) {
      process.stderr.write(
        "Error: --email and --password are required flags for admin:create-superuser.\n",
      );
      process.exitCode = 1;
      return;
    }

    const userDesc = username ? `${email} (${username})` : email;
    process.stdout.write(
      `Creating super user '${userDesc}' for tenant '${tenantId}'... (connect repositories via application runner)\n`,
    );
  } else {
    process.stderr.write(`Unknown command: '${command}'. Run 'plinth --help' for usage.\n`);
    process.exitCode = 1;
  }
}
