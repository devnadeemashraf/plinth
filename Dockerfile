# Stage 1: Base image with pnpm
FROM node:24-bookworm-slim AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable && corepack prepare pnpm@12.21.0 --activate
WORKDIR /app

# Stage 2: Dependencies and build
FROM base AS builder
# Install native compilation dependencies for better-sqlite3
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    make \
    g++ \
  && rm -rf /var/lib/apt/lists/*

# Copy monorepo manifests
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY packages/core/package.json ./packages/core/
COPY packages/modules/brand/package.json ./packages/modules/brand/
COPY packages/modules/tenants/package.json ./packages/modules/tenants/
COPY packages/modules/rbac/package.json ./packages/modules/rbac/
COPY packages/modules/config-store/package.json ./packages/modules/config-store/
COPY packages/modules/audit/package.json ./packages/modules/audit/
COPY packages/modules/auth/package.json ./packages/modules/auth/
COPY packages/modules/billing/package.json ./packages/modules/billing/
COPY packages/modules/admin/package.json ./packages/modules/admin/
COPY packages/adapters/http/fastify/package.json ./packages/adapters/http/fastify/
COPY packages/adapters/db/sqlite/package.json ./packages/adapters/db/sqlite/
COPY packages/adapters/billing/stub/package.json ./packages/adapters/billing/stub/
COPY packages/cli/package.json ./packages/cli/
COPY apps/reference-api/package.json ./apps/reference-api/

# Install dependencies with frozen lockfile
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile

# Copy source code and build configs
COPY tsconfig.base.json tsconfig.json biome.json vitest.config.ts ./
COPY packages ./packages
COPY apps ./apps

# Build TypeScript packages and app
RUN pnpm typecheck

# Prune devDependencies for a lean production release
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm --filter @plinth/reference-api deploy --prod /prod/app

# Stage 3: Production minimal runtime
FROM node:24-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
ENV HOST=0.0.0.0

# Run as non-root user
RUN groupadd -g 10001 plinth && \
    useradd -u 10001 -g plinth -s /bin/sh plinth

# Copy built application and production dependencies
COPY --from=builder --chown=plinth:plinth /prod/app ./

USER plinth
EXPOSE 3000

HEALTHCHECK --interval=10s --timeout=2s --start-period=5s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:' + (process.env.PORT || 3000) + '/health/live').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

CMD ["node", "dist/src/server.js"]
