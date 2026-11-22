import * as fs from "node:fs/promises";
import * as path from "node:path";
import { z } from "zod";

export const deployAddOptionsSchema = z.strictObject({
  target: z.enum(["render-railway", "vps-caddy", "aws-terraform", "gcp-terraform"], {
    error:
      "Unknown deploy target. Supported: render-railway, vps-caddy, aws-terraform, gcp-terraform",
  }),
  projectDir: z.string().optional(),
});

export type DeployAddOptions = z.infer<typeof deployAddOptionsSchema>;

export interface DeployAddResult {
  readonly success: boolean;
  readonly target: string;
  readonly filesCreated: readonly string[];
}

export async function deployAddCommand(rawOptions: DeployAddOptions): Promise<DeployAddResult> {
  const options = deployAddOptionsSchema.parse(rawOptions);
  const projectDir = path.resolve(options.projectDir ?? process.cwd());
  const deployDir = path.join(projectDir, "deploy");

  await fs.mkdir(deployDir, { recursive: true });

  const filesCreated: string[] = [];

  if (options.target === "render-railway") {
    const renderPath = path.join(deployDir, "render.yaml");
    const railwayPath = path.join(deployDir, "railway.toml");
    const dockerfilePath = path.join(deployDir, "Dockerfile");

    await fs.writeFile(
      renderPath,
      `services:
  - type: web
    name: plinth-service
    runtime: docker
    dockerfilePath: ./deploy/Dockerfile
    plan: free
    healthCheckPath: /health/live
`,
      "utf-8",
    );
    await fs.writeFile(
      railwayPath,
      `[build]
builder = "DOCKERFILE"
dockerfilePath = "deploy/Dockerfile"

[deploy]
healthcheckPath = "/health/live"
`,
      "utf-8",
    );
    await fs.writeFile(
      dockerfilePath,
      `FROM node:24-alpine AS runner
WORKDIR /app
COPY . .
EXPOSE 3000
CMD ["node", "dist/server.js"]
`,
      "utf-8",
    );

    filesCreated.push(renderPath, railwayPath, dockerfilePath);
  } else if (options.target === "vps-caddy") {
    const composePath = path.join(deployDir, "docker-compose.prod.yml");
    const caddyfilePath = path.join(deployDir, "Caddyfile");
    const backupPath = path.join(deployDir, "backup.sh");
    const restorePath = path.join(deployDir, "restore.sh");

    await fs.writeFile(
      composePath,
      `services:
  caddy:
    image: caddy:2.9-alpine
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile:ro
  app:
    build: ..
    ports:
      - "3000"
`,
      "utf-8",
    );
    await fs.writeFile(
      caddyfilePath,
      `:80 {
    reverse_proxy app:3000
}
`,
      "utf-8",
    );
    await fs.writeFile(
      backupPath,
      `#!/usr/bin/env bash
set -euo pipefail
echo "Starting Plinth database backup..."
`,
      "utf-8",
    );
    await fs.writeFile(
      restorePath,
      `#!/usr/bin/env bash
set -euo pipefail
echo "Starting Plinth database restore..."
`,
      "utf-8",
    );

    filesCreated.push(composePath, caddyfilePath, backupPath, restorePath);
  } else if (options.target === "aws-terraform") {
    const awsDir = path.join(deployDir, "aws");
    await fs.mkdir(awsDir, { recursive: true });

    const mainTf = path.join(awsDir, "main.tf");
    const varsTf = path.join(awsDir, "variables.tf");
    const outTf = path.join(awsDir, "outputs.tf");

    await fs.writeFile(
      mainTf,
      `# AWS Terraform blueprint for Plinth\nprovider "aws" {\n  region = var.region\n}\n`,
      "utf-8",
    );
    await fs.writeFile(
      varsTf,
      `variable "region" {\n  type = string\n  default = "us-east-1"\n}\n`,
      "utf-8",
    );
    await fs.writeFile(outTf, `# Outputs for AWS\n`, "utf-8");

    filesCreated.push(mainTf, varsTf, outTf);
  } else if (options.target === "gcp-terraform") {
    const gcpDir = path.join(deployDir, "gcp");
    await fs.mkdir(gcpDir, { recursive: true });

    const mainTf = path.join(gcpDir, "main.tf");
    const varsTf = path.join(gcpDir, "variables.tf");
    const outTf = path.join(gcpDir, "outputs.tf");

    await fs.writeFile(
      mainTf,
      `# GCP Terraform blueprint for Plinth\nprovider "google" {\n  region = var.region\n}\n`,
      "utf-8",
    );
    await fs.writeFile(
      varsTf,
      `variable "region" {\n  type = string\n  default = "us-central1"\n}\n`,
      "utf-8",
    );
    await fs.writeFile(outTf, `# Outputs for GCP\n`, "utf-8");

    filesCreated.push(mainTf, varsTf, outTf);
  }

  return {
    success: true,
    target: options.target,
    filesCreated,
  };
}
