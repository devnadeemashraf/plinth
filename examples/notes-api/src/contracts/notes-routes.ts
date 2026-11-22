import { defineRoute, type RouteContract } from "@plinth/core";
import { z } from "zod";

const noteSchema = z.object({
  id: z.string(),
  title: z.string(),
  content: z.string(),
  isPinned: z.boolean(),
  tags: z.array(z.string()),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const createNoteRoute: RouteContract = defineRoute({
  method: "POST",
  path: "/api/v1/notes",
  summary: "Create a new note",
  tags: ["Notes"],
  bodySchema: z.object({
    title: z.string().min(1).max(200),
    content: z.string().max(20000).default(""),
    isPinned: z.boolean().default(false),
    tags: z.array(z.string().max(50)).max(10).default([]),
  }),
  responseSchemas: {
    201: noteSchema,
  },
});

export const listNotesRoute: RouteContract = defineRoute({
  method: "GET",
  path: "/api/v1/notes",
  summary: "List notes with pagination and search",
  tags: ["Notes"],
  querySchema: z.object({
    search: z.string().optional(),
    isPinned: z.enum(["true", "false"]).optional(),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    offset: z.coerce.number().int().min(0).default(0),
  }),
  responseSchemas: {
    200: z.object({
      notes: z.array(noteSchema),
      total: z.number().int(),
    }),
  },
});

export const getNoteRoute: RouteContract = defineRoute({
  method: "GET",
  path: "/api/v1/notes/:id",
  summary: "Get note by ID",
  tags: ["Notes"],
  paramsSchema: z.object({
    id: z.string().min(1),
  }),
  responseSchemas: {
    200: noteSchema,
  },
});

export const updateNoteRoute: RouteContract = defineRoute({
  method: "PATCH",
  path: "/api/v1/notes/:id",
  summary: "Update note properties",
  tags: ["Notes"],
  paramsSchema: z.object({
    id: z.string().min(1),
  }),
  bodySchema: z.object({
    title: z.string().min(1).max(200).optional(),
    content: z.string().max(20000).optional(),
    isPinned: z.boolean().optional(),
    tags: z.array(z.string().max(50)).max(10).optional(),
  }),
  responseSchemas: {
    200: noteSchema,
  },
});

export const deleteNoteRoute: RouteContract = defineRoute({
  method: "DELETE",
  path: "/api/v1/notes/:id",
  summary: "Delete note by ID",
  tags: ["Notes"],
  paramsSchema: z.object({
    id: z.string().min(1),
  }),
  responseSchemas: {
    204: z.undefined(),
  },
});
