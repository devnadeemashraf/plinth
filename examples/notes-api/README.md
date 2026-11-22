# Notes API Example (Pure Hexagonal Architecture)

A clean, minimalist Notes API demonstrating how to build scalable APIs with **Plinth** without framework coupling, ORM lock-in, or boilerplate code.

---

## Why This Architecture?

In traditional frameworks, routes directly import ORM models, SQL queries leak into controllers, and swapping out an HTTP engine or database requires refactoring every file.

In Plinth:
- **Domain First:** Pure TypeScript types and business invariants live in `src/domain/`.
- **Ports Decoupled:** `NotesRepositoryPort` defines data operations as a pure TypeScript interface.
- **Pluggable Adapters:** `StubNotesRepository` implements storage in memory for zero-setup execution. Swap it for SQLite or PostgreSQL in one line.
- **Contract-Driven:** Route contracts generate request validation, client types, and OpenAPI 3.1 documentation automatically.

---

## Project Structure

```
examples/notes-api/
├── src/
│   ├── domain/
│   │   ├── types.ts          # Note, CreateNoteInput, UpdateNoteInput
│   │   └── repository.ts     # NotesRepositoryPort (pure interface)
│   ├── infrastructure/
│   │   └── stub-notes-repository.ts # In-memory implementation
│   ├── services/
│   │   └── notes-service.ts  # Business rules & RFC 9457 Problem Details
│   ├── contracts/
│   │   └── notes-routes.ts   # Type-safe Zod route contracts (OpenAPI 3.1)
│   ├── app.ts                # Composition root (Fastify + Routes + Probes)
│   ├── server.ts             # Runnable development server
│   └── index.ts              # Public package exports
└── test/
    └── notes-api.test.ts     # 15 end-to-end tests across 5 categories
```

---

## Step-by-Step: How to Build an API with Plinth

### 1. Define Domain Entities and Ports

Define the data shape and the port interface in `src/domain/`:

```typescript
// src/domain/types.ts
export interface Note {
  id: string;
  title: string;
  content: string;
  isPinned: boolean;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

// src/domain/repository.ts
export interface NotesRepositoryPort {
  create(input: CreateNoteInput): Promise<Note>;
  findById(id: string): Promise<Note | null>;
  findMany(query: ListNotesQuery): Promise<ListNotesResult>;
  update(id: string, input: UpdateNoteInput): Promise<Note | null>;
  delete(id: string): Promise<boolean>;
  count(): Promise<number>;
}
```

### 2. Implement the Business Service

Write business logic in `src/services/notes-service.ts` using standard error primitives:

```typescript
import { BadRequestError, NotFoundError } from "@plinth/core";

export class NotesService {
  constructor(private readonly repo: NotesRepositoryPort) {}

  async createNote(input: CreateNoteInput): Promise<Note> {
    if (!input.title.trim()) {
      throw new BadRequestError("Note title cannot be blank");
    }
    return this.repo.create(input);
  }
}
```

### 3. Declare Type-Safe Route Contracts

Use `defineRoute` and `z` from `@plinth/core` to declare validation schemas:

```typescript
// src/contracts/notes-routes.ts
import { defineRoute, z } from "@plinth/core";

export const createNoteRoute = defineRoute({
  method: "POST",
  path: "/api/v1/notes",
  summary: "Create a new note",
  tags: ["Notes"],
  bodySchema: z.object({
    title: z.string().min(1).max(200),
    content: z.string().max(20000).default(""),
    isPinned: z.boolean().default(false),
    tags: z.array(z.string().max(50)).default([]),
  }),
  responseSchema: {
    201: noteSchema,
  },
});
```

### 4. Wire the Composition Root

Connect the HTTP adapter to your service in `src/app.ts`:

```typescript
import { FastifyHttpAdapter } from "@plinth/adapter-http-fastify";

export function buildNotesApp(options = {}) {
  const repo = options.repo ?? new StubNotesRepository();
  const service = new NotesService(repo);

  const http = new FastifyHttpAdapter({
    port: options.port ?? 3000,
    enableDocs: true, // Enables Scalar UI at /docs
  });

  http.registerRoute(createNoteRoute, async (req) => {
    const note = await service.createNote(req.body);
    return { status: 201, body: note };
  });

  return { http, service, repo };
}
```

---

## Running the API Locally

```bash
# Start development server
pnpm --filter @plinth/example-notes-api dev
```

Interactive documentation is live at:
`http://127.0.0.1:3000/docs`

---

## Testing via curl

```bash
# 1. Check readiness probe
curl http://127.0.0.1:3000/health/ready

# 2. Create a note
curl -X POST http://127.0.0.1:3000/api/v1/notes \
  -H "Content-Type: application/json" \
  -d '{"title": "Ship MVP", "content": "Built with Plinth hexagonal core", "isPinned": true, "tags": ["mvp"]}'

# 3. List notes
curl http://127.0.0.1:3000/api/v1/notes

# 4. Search notes
curl http://127.0.0.1:3000/api/v1/notes?search=Plinth
```

---

## Running Automated Tests

```bash
pnpm --filter @plinth/example-notes-api test
```
All 15 tests pass across happy path, boundary validation, ordering, not-found handling, and health probes.
