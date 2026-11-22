import { SqliteDatabaseAdapter } from "@plinth/adapter-db-sqlite";
import { FastifyHttpAdapter } from "@plinth/adapter-http-fastify";
import { defineRoute, type RouteContract } from "@plinth/core";
import { z } from "zod";
import {
  addCommentContract,
  createPostContract,
  deletePostContract,
  followUserContract,
  getFeedContract,
  getPostContract,
  getUserContract,
  likePostContract,
  listCommentsContract,
  registerUserContract,
} from "./contracts/social-routes.js";
import { SqliteSocialRepository } from "./infrastructure/sqlite-social-repository.js";
import { SocialService } from "./services/social-service.js";

export const livenessContract: RouteContract = defineRoute({
  method: "GET",
  path: "/health/live",
  summary: "Liveness probe",
  isPublic: true,
  responseSchemas: {
    200: z.object({ status: z.literal("ok") }),
  },
});

export const readinessContract: RouteContract = defineRoute({
  method: "GET",
  path: "/health/ready",
  summary: "Readiness probe",
  isPublic: true,
  responseSchemas: {
    200: z.object({ status: z.literal("ready") }),
  },
});

export interface BuildSocialAppOptions {
  readonly isProduction?: boolean | undefined;
  readonly sqliteFilename?: string | undefined;
  readonly port?: number | undefined;
  readonly host?: string | undefined;
}

export async function buildSocialApp(options: BuildSocialAppOptions = {}) {
  const isProduction = options.isProduction ?? false;
  const port = options.port ?? 3001;
  const host = options.host ?? "0.0.0.0";
  const sqliteFilename = options.sqliteFilename ?? ":memory:";

  // 1. Initialize SQLite Database Adapter
  const db = new SqliteDatabaseAdapter({
    filename: sqliteFilename,
  });

  // 2. Initialize Social Repository & Schema
  const repo = new SqliteSocialRepository(db);
  await repo.initSchema();

  // 3. Initialize Social Service
  const service = new SocialService(repo);

  // 4. Initialize Fastify HTTP Adapter with OpenAPI Info
  const http = new FastifyHttpAdapter({
    isProduction,
    openApiInfo: {
      title: "Plinth Social Media Backend API",
      version: "1.0.0",
      description:
        "Production-grade social media backend API built with Plinth hexagonal architecture, BigInt bitmask permissions, and SQLite/Fastify adapters.",
    },
  });

  // Health Probes
  http.registerRoute(livenessContract, () => ({
    statusCode: 200,
    body: { status: "ok" },
  }));

  http.registerRoute(readinessContract, async () => {
    const isHealthy = await db.ping();
    return {
      statusCode: isHealthy ? 200 : 503,
      body: { status: isHealthy ? "ready" : "unhealthy" },
    };
  });

  // --- Route Handlers ---

  // POST /api/v1/users
  http.registerRoute(registerUserContract, async (req) => {
    const body = req.body as {
      handle: string;
      displayName: string;
      bio?: string;
      isModerator?: boolean;
    };
    const user = await service.registerUser(body);
    return {
      statusCode: 201,
      body: {
        id: user.id,
        handle: user.handle,
        displayName: user.displayName,
        bio: user.bio,
        followersCount: user.followersCount,
        followingCount: user.followingCount,
        createdAt: user.createdAt,
      },
    };
  });

  // GET /api/v1/users/:handle
  http.registerRoute(getUserContract, async (req) => {
    const handle = req.params["handle"] ?? "";
    const user = await service.getUser(handle);
    return {
      statusCode: 200,
      body: {
        id: user.id,
        handle: user.handle,
        displayName: user.displayName,
        bio: user.bio,
        followersCount: user.followersCount,
        followingCount: user.followingCount,
        createdAt: user.createdAt,
      },
    };
  });

  // POST /api/v1/users/:id/follow
  http.registerRoute(followUserContract, async (req) => {
    const userId = (req.headers["x-user-id"] as string) ?? "";
    const targetId = req.params["id"] ?? "";
    const result = await service.toggleFollow(userId, targetId);
    return { statusCode: 200, body: result };
  });

  // POST /api/v1/posts
  http.registerRoute(createPostContract, async (req) => {
    const userId = (req.headers["x-user-id"] as string) ?? "";
    const body = req.body as { content: string; mediaUrl?: string; tags?: string[] };
    const post = await service.createPost({
      authorId: userId,
      content: body.content,
      mediaUrl: body.mediaUrl,
      tags: body.tags,
    });
    return { statusCode: 201, body: post };
  });

  // GET /api/v1/posts/:id
  http.registerRoute(getPostContract, async (req) => {
    const postId = req.params["id"] ?? "";
    const post = await service.getPost(postId);
    return { statusCode: 200, body: post };
  });

  // DELETE /api/v1/posts/:id
  http.registerRoute(deletePostContract, async (req) => {
    const userId = (req.headers["x-user-id"] as string) ?? "";
    const postId = req.params["id"] ?? "";
    await service.deletePost(userId, postId);
    return { statusCode: 200, body: { deleted: true } };
  });

  // POST /api/v1/posts/:id/like
  http.registerRoute(likePostContract, async (req) => {
    const userId = (req.headers["x-user-id"] as string) ?? "";
    const postId = req.params["id"] ?? "";
    const result = await service.toggleLike(userId, postId);
    return { statusCode: 200, body: result };
  });

  // POST /api/v1/posts/:id/comments
  http.registerRoute(addCommentContract, async (req) => {
    const userId = (req.headers["x-user-id"] as string) ?? "";
    const postId = req.params["id"] ?? "";
    const body = req.body as { content: string };
    const comment = await service.addComment(userId, postId, body.content);
    return { statusCode: 201, body: comment };
  });

  // GET /api/v1/posts/:id/comments
  http.registerRoute(listCommentsContract, async (req) => {
    const postId = req.params["id"] ?? "";
    const comments = await service.listComments(postId);
    return { statusCode: 200, body: comments };
  });

  // GET /api/v1/feed
  http.registerRoute(getFeedContract, async (req) => {
    const userId = (req.headers["x-user-id"] as string) ?? "";
    const limit = typeof req.query["limit"] === "number" ? req.query["limit"] : 20;
    const cursor = typeof req.query["cursor"] === "string" ? req.query["cursor"] : undefined;
    const posts = await service.getTimelineFeed(userId, limit, cursor);
    const nextCursor = posts.length >= limit ? posts[posts.length - 1]?.createdAt ?? null : null;
    return {
      statusCode: 200,
      body: {
        posts,
        nextCursor,
      },
    };
  });

  return {
    http,
    db,
    repo,
    service,
    start: async () => http.listen(port, host),
    close: async () => {
      await http.close();
      await db.close();
    },
  };
}
