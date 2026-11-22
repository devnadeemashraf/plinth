# Adapter Swap Handbook: HTTP Fastify vs Express 5

This 1-page guide explains how to swap between `@plinth/adapter-http-fastify` and `@plinth/adapter-http-express`.

---

## 1. Architectural Comparison

| Dimension | Fastify 5 (`adapter-http-fastify`) | Express 5 (`adapter-http-express`) |
|---|---|---|
| **Primary Strength** | Raw throughput (40k+ req/s), built-in schema serialization | Broadest ecosystem compatibility, familiar Node middleware |
| **Error Handling** | Native Fastify error hooks | Native Promise error propagation (new in Express 5) |
| **OpenAPI / Docs** | `@scalar/fastify-api-reference` at `/docs` | Custom Express Scalar HTML handler at `/docs` |
| **Raw Body Webhook** | Preserved via `addContentTypeParser` buffer | Preserved via `express.json({ verify })` callback |

---

## 2. Swap Steps

### Step 1: Update Dependency
In your application package (`apps/<service>/package.json`):
```bash
# To switch to Express 5:
pnpm remove @plinth/adapter-http-fastify
pnpm add @plinth/adapter-http-express
```

### Step 2: Swap Adapter in Server Initialization
In `src/server.ts`:
```typescript
// Replace:
// import { FastifyHttpAdapter } from "@plinth/adapter-http-fastify";
// const http = new FastifyHttpAdapter({ port: 3000, host: "0.0.0.0" });

// With:
import { ExpressHttpAdapter } from "@plinth/adapter-http-express";
const http = new ExpressHttpAdapter({ port: 3000, host: "0.0.0.0" });
```

### Step 3: Verify with Contract Tests
```bash
pnpm test:http
```
Both adapters pass 100% of the shared `HttpServerPort` contract tests (GET, POST, PUT, DELETE, path/query parsing, Problem Details errors, and 1MB body limit).
