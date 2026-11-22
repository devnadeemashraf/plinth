import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { buildNotesApp } from "../src/app.js";
import { StubNotesRepository } from "../src/infrastructure/stub-notes-repository.js";

describe("Notes API (Pure Hexagonal Architecture with Plinth)", () => {
  let app: ReturnType<typeof buildNotesApp>;
  let repo: StubNotesRepository;
  let fastify: FastifyInstance;

  beforeAll(async () => {
    repo = new StubNotesRepository();
    app = buildNotesApp({ repo });
    fastify = app.http.getUnderlyingApp() as FastifyInstance;
    await fastify.ready();
  });

  afterAll(async () => {
    await app.http.close();
  });

  beforeEach(() => {
    repo.clear();
  });

  describe("1. Happy Path", () => {
    it("should create a note with 201 status", async () => {
      const res = await fastify.inject({
        method: "POST",
        url: "/api/v1/notes",
        payload: {
          title: "Architecture Decisions",
          content: "Use Hexagonal Ports & Adapters for complete independence.",
          isPinned: true,
          tags: ["architecture", "backend"],
        },
      });

      expect(res.statusCode).toBe(201);
      const body = JSON.parse(res.payload);
      expect(body.id).toBeDefined();
      expect(body.title).toBe("Architecture Decisions");
      expect(body.isPinned).toBe(true);
      expect(body.tags).toEqual(["architecture", "backend"]);
      expect(body.createdAt).toBeDefined();
    });

    it("should retrieve a note by ID", async () => {
      const created = await repo.create({
        title: "Test Note",
        content: "Some content",
      });

      const res = await fastify.inject({
        method: "GET",
        url: `/api/v1/notes/${created.id}`,
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.id).toBe(created.id);
      expect(body.title).toBe("Test Note");
    });

    it("should list notes with total count", async () => {
      await repo.create({ title: "Note 1", content: "Content 1" });
      await repo.create({ title: "Note 2", content: "Content 2" });

      const res = await fastify.inject({
        method: "GET",
        url: "/api/v1/notes",
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.total).toBe(2);
      expect(body.notes).toHaveLength(2);
    });

    it("should update a note with PATCH", async () => {
      const created = await repo.create({
        title: "Initial Title",
        content: "Initial Content",
      });

      const res = await fastify.inject({
        method: "PATCH",
        url: `/api/v1/notes/${created.id}`,
        payload: {
          title: "Updated Title",
          isPinned: true,
        },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.title).toBe("Updated Title");
      expect(body.isPinned).toBe(true);
      expect(body.content).toBe("Initial Content");
    });

    it("should delete a note with 204 No Content", async () => {
      const created = await repo.create({
        title: "To Be Deleted",
        content: "...",
      });

      const res = await fastify.inject({
        method: "DELETE",
        url: `/api/v1/notes/${created.id}`,
      });

      expect(res.statusCode).toBe(204);
      expect(await repo.findById(created.id)).toBeNull();
    });
  });

  describe("2. Boundary & Validation", () => {
    it("should reject creation when title is empty with 422 Unprocessable Content", async () => {
      const res = await fastify.inject({
        method: "POST",
        url: "/api/v1/notes",
        payload: {
          title: "",
          content: "Valid content",
        },
      });

      expect(res.statusCode).toBe(422);
    });

    it("should filter notes by search query across title, content, and tags", async () => {
      await repo.create({
        title: "TypeScript Tips",
        content: "Use erasableSyntaxOnly",
        tags: ["typescript"],
      });
      await repo.create({
        title: "Shopping List",
        content: "Milk, eggs, coffee",
        tags: ["personal"],
      });

      const res = await fastify.inject({
        method: "GET",
        url: "/api/v1/notes?search=typescript",
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.total).toBe(1);
      expect(body.notes[0].title).toBe("TypeScript Tips");
    });

    it("should filter notes by isPinned query parameter", async () => {
      await repo.create({ title: "Unpinned", content: "...", isPinned: false });
      await repo.create({ title: "Pinned", content: "...", isPinned: true });

      const res = await fastify.inject({
        method: "GET",
        url: "/api/v1/notes?isPinned=true",
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.total).toBe(1);
      expect(body.notes[0].title).toBe("Pinned");
    });

    it("should respect pagination limit and offset", async () => {
      for (let i = 1; i <= 5; i++) {
        await repo.create({ title: `Note ${i}`, content: `Content ${i}` });
      }

      const res = await fastify.inject({
        method: "GET",
        url: "/api/v1/notes?limit=2&offset=2",
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.total).toBe(5);
      expect(body.notes).toHaveLength(2);
    });
  });

  describe("3. Concurrency & Ordering", () => {
    it("should prioritize pinned notes at the top of the list", async () => {
      await repo.create({ title: "Regular Note 1", content: "...", isPinned: false });
      await repo.create({ title: "Urgent Pinned Note", content: "...", isPinned: true });
      await repo.create({ title: "Regular Note 2", content: "...", isPinned: false });

      const res = await fastify.inject({
        method: "GET",
        url: "/api/v1/notes",
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.notes[0].title).toBe("Urgent Pinned Note");
    });
  });

  describe("4. Error Handling & Not Found", () => {
    it("should return 404 Problem Details when getting non-existent note", async () => {
      const res = await fastify.inject({
        method: "GET",
        url: "/api/v1/notes/non-existent-uuid",
      });

      expect(res.statusCode).toBe(404);
      const body = JSON.parse(res.payload);
      expect(body.status).toBe(404);
      expect(body.title).toBe("NotFoundError");
    });

    it("should return 404 Problem Details when updating non-existent note", async () => {
      const res = await fastify.inject({
        method: "PATCH",
        url: "/api/v1/notes/non-existent-uuid",
        payload: { title: "Updated" },
      });

      expect(res.statusCode).toBe(404);
      const body = JSON.parse(res.payload);
      expect(body.status).toBe(404);
    });

    it("should return 404 Problem Details when deleting non-existent note", async () => {
      const res = await fastify.inject({
        method: "DELETE",
        url: "/api/v1/notes/non-existent-uuid",
      });

      expect(res.statusCode).toBe(404);
      const body = JSON.parse(res.payload);
      expect(body.status).toBe(404);
    });
  });

  describe("5. Health Probes & OpenAPI Documentation", () => {
    it("should return 200 on liveness probe /health/live", async () => {
      const res = await fastify.inject({
        method: "GET",
        url: "/health/live",
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.status).toBe("live");
    });

    it("should return 200 on readiness probe /health/ready with note count", async () => {
      await repo.create({ title: "Note 1", content: "..." });

      const res = await fastify.inject({
        method: "GET",
        url: "/health/ready",
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.status).toBe("ready");
      expect(body.notesCount).toBe(1);
    });

    it("should generate valid OpenAPI 3.1 specification at /openapi.json", async () => {
      const res = await fastify.inject({
        method: "GET",
        url: "/openapi.json",
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.openapi).toBe("3.1.0");
      expect(body.paths["/api/v1/notes"]).toBeDefined();
      expect(body.paths["/api/v1/notes/{id}"]).toBeDefined();
    });
  });
});
