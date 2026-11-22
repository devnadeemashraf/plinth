# Render & Railway Deployment Blueprint

This blueprint packages `plinth` for zero-configuration, containerized deployment on Render or Railway.

## Files
- `Dockerfile`: Multi-stage production container running Node 24 on Alpine as unprivileged `node` user with baked healthcheck.
- `render.yaml`: Infrastructure-as-Code Blueprint for Render deploying the web service with attached PostgreSQL.
- `railway.toml`: Deployment and healthcheck configuration for Railway.

## Quickstart

### Deploying to Render
1. Push your repository to GitHub or GitLab.
2. Log in to [Render Dashboard](https://dashboard.render.com).
3. Click **New** -> **Blueprint** and select your repository.
4. Render automatically detects `render.yaml` and provisions the Web Service and PostgreSQL database.

### Deploying to Railway
1. Install Railway CLI: `npm i -g @railway/cli` or link via [Railway Dashboard](https://railway.app).
2. Run `railway init` and link your repo.
3. Run `railway up` to trigger a build using the root `railway.toml` and Dockerfile.
4. Set required environment variables: `MASTER_ENCRYPTION_KEY` (32 hex bytes) and `DATABASE_URL`.
