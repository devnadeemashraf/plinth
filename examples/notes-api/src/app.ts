import { FastifyHttpAdapter } from "@plinth/adapter-http-fastify";
import { AppError } from "@plinth/core";
import {
  createNoteRoute,
  deleteNoteRoute,
  getNoteRoute,
  listNotesRoute,
  updateNoteRoute,
} from "./contracts/notes-routes.js";
import type { NotesRepositoryPort } from "./domain/repository.js";
import type {
  CreateNoteInput,
  ListNotesQuery,
  UpdateNoteInput,
} from "./domain/types.js";
import { StubNotesRepository } from "./infrastructure/stub-notes-repository.js";
import { NotesService } from "./services/notes-service.js";

export interface BuildNotesAppOptions {
  port?: number;
  host?: string;
  repo?: NotesRepositoryPort;
}

export function buildNotesApp(options: BuildNotesAppOptions = {}) {
  const repo = options.repo ?? new StubNotesRepository();
  const service = new NotesService(repo);

  const http = new FastifyHttpAdapter({
    openApiInfo: {
      title: "Plinth Notes API",
      version: "1.0.0",
      description: "Functional Notes API demonstrating Hexagonal Ports & Adapters",
    },
  });

  // Health check probes
  http.registerRoute(
    {
      method: "GET",
      path: "/health/live",
      summary: "Process liveness probe",
    },
    async () => ({
      statusCode: 200,
      body: { status: "live", uptime: process.uptime() },
    }),
  );

  http.registerRoute(
    {
      method: "GET",
      path: "/health/ready",
      summary: "Service readiness probe",
    },
    async () => {
      const count = await repo.count();
      return {
        statusCode: 200,
        body: { status: "ready", notesCount: count },
      };
    },
  );

  // 1. Create Note
  http.registerRoute(createNoteRoute, async (req) => {
    try {
      const note = await service.createNote(req.body as CreateNoteInput);
      return { statusCode: 201, body: note };
    } catch (err) {
      return handleError(err);
    }
  });

  // 2. List Notes
  http.registerRoute(listNotesRoute, async (req) => {
    try {
      const q = req.query as Record<string, string | undefined>;
      const query: ListNotesQuery = {
        search: q["search"],
        isPinned:
          q["isPinned"] !== undefined ? q["isPinned"] === "true" : undefined,
        limit: q["limit"] !== undefined ? Number(q["limit"]) : undefined,
        offset: q["offset"] !== undefined ? Number(q["offset"]) : undefined,
      };
      const result = await service.listNotes(query);
      return { statusCode: 200, body: result };
    } catch (err) {
      return handleError(err);
    }
  });

  // 3. Get Note by ID
  http.registerRoute(getNoteRoute, async (req) => {
    try {
      const note = await service.getNote(req.params["id"]!);
      return { statusCode: 200, body: note };
    } catch (err) {
      return handleError(err);
    }
  });

  // 4. Update Note
  http.registerRoute(updateNoteRoute, async (req) => {
    try {
      const note = await service.updateNote(
        req.params["id"]!,
        req.body as UpdateNoteInput,
      );
      return { statusCode: 200, body: note };
    } catch (err) {
      return handleError(err);
    }
  });

  // 5. Delete Note
  http.registerRoute(deleteNoteRoute, async (req) => {
    try {
      await service.deleteNote(req.params["id"]!);
      return { statusCode: 204, body: undefined };
    } catch (err) {
      return handleError(err);
    }
  });

  return { http, service, repo };
}

function handleError(err: unknown) {
  if (err instanceof AppError) {
    return {
      statusCode: err.statusCode,
      body: {
        type: `https://plinth.dev/errors/${err.code.toLowerCase().replace(/_/g, "-")}`,
        title: err.name,
        status: err.statusCode,
        detail: err.message,
      },
    };
  }
  return {
    statusCode: 500,
    body: {
      type: "https://plinth.dev/errors/internal-server-error",
      title: "InternalServerError",
      status: 500,
      detail: err instanceof Error ? err.message : "An unexpected error occurred",
    },
  };
}
