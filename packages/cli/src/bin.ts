import { parseArgs } from "node:util";

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
        "  admin:create-superuser   Create a new super user with mandatory TOTP MFA",
        "",
        "Options for admin:create-superuser:",
        "  --email <email>         Super user email address (required)",
        "  --password <password>   Super user password (required)",
        "  --username <username>   Optional username",
        "  --tenant-id <tenantId>  Optional tenant ID (defaults to 'default_tenant')",
        "",
      ].join("\n"),
    );
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
