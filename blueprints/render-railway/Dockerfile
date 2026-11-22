# Multi-Stage Lean Production Dockerfile for Plinth
# Stage 1: Build & Prune
FROM node:24-alpine AS builder

WORKDIR /app

# Enable pnpm via corepack
RUN corepack enable && corepack prepare pnpm@12.21.0 --activate

# Copy dependency manifests
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* ./
COPY tsconfig.base.json tsconfig.json ./
COPY biome.json ./

# Copy source trees
COPY packages/ ./packages/
COPY apps/ ./apps/

# Install exact production dependencies and build TypeScript
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @plinth/core build
RUN pnpm --filter reference-api build

# Prune dev dependencies for lean runtime image
RUN pnpm prune --prod

# Stage 2: Minimal Runtime Image
FROM node:24-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV HOST=0.0.0.0

# Non-root unprivileged container user
USER node

# Copy built artifacts and production dependencies
COPY --chown=node:node --from=builder /app/package.json ./
COPY --chown=node:node --from=builder /app/node_modules ./node_modules
COPY --chown=node:node --from=builder /app/packages ./packages
COPY --chown=node:node --from=builder /app/apps ./apps

EXPOSE 3000

# Healthcheck targeting liveness probe
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:3000/health/live || exit 1

# Start reference API
CMD ["node", "apps/reference-api/dist/src/server.js"]
