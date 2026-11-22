import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildSocialApp } from "../src/app.js";

describe("Social Media Backend API — Plinth Example (End-to-End)", () => {
  let app: Awaited<ReturnType<typeof buildSocialApp>>;
  let baseUrl: string;

  let aliceId: string;
  let bobId: string;
  let moderatorId: string;
  let alicePostId: string;

  beforeAll(async () => {
    app = await buildSocialApp({
      isProduction: false,
      sqliteFilename: ":memory:",
      port: 0,
      host: "127.0.0.1",
    });

    const info = await app.start();
    baseUrl = `http://127.0.0.1:${info.port}`;
  });

  afterAll(async () => {
    await app.close();
  });

  // Category 1: Health & Docs
  describe("Health & Documentation", () => {
    it("should return 200 OK on zero-I/O liveness probe", async () => {
      const res = await fetch(`${baseUrl}/health/live`);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toEqual({ status: "ok" });
    });

    it("should return 200 OK on database readiness probe", async () => {
      const res = await fetch(`${baseUrl}/health/ready`);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toEqual({ status: "ready" });
    });

    it("should serve OpenAPI 3.1 specification at /openapi.json", async () => {
      const res = await fetch(`${baseUrl}/openapi.json`);
      expect(res.status).toBe(200);
      const spec = (await res.json()) as Record<string, unknown>;
      expect(spec["openapi"]).toBe("3.1.0");
      expect((spec["info"] as Record<string, unknown>)["title"]).toContain("Social Media");
    });

    it("should serve interactive Scalar documentation UI at /docs", async () => {
      const res = await fetch(`${baseUrl}/docs`);
      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toContain("text/html");
      const html = await res.text();
      expect(html).toContain("Scalar API Reference");
    });
  });

  // Category 2: User Profiles & Follow Graph
  describe("Users & Follows", () => {
    it("should register new users alice, bob, and mod_charlie", async () => {
      // 1. Register Alice
      const res1 = await fetch(`${baseUrl}/api/v1/users`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          handle: "alice",
          displayName: "Alice Wonderland",
          bio: "Software builder & coffee lover",
        }),
      });
      expect(res1.status).toBe(201);
      const alice = (await res1.json()) as Record<string, unknown>;
      aliceId = alice["id"] as string;
      expect(alice["handle"]).toBe("alice");
      expect(alice["followersCount"]).toBe(0);

      // 2. Register Bob
      const res2 = await fetch(`${baseUrl}/api/v1/users`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          handle: "bob",
          displayName: "Bob The Builder",
          bio: "Testing distributed systems",
        }),
      });
      expect(res2.status).toBe(201);
      const bob = (await res2.json()) as Record<string, unknown>;
      bobId = bob["id"] as string;

      // 3. Register Moderator Charlie
      const res3 = await fetch(`${baseUrl}/api/v1/users`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          handle: "mod_charlie",
          displayName: "Charlie Moderator",
          isModerator: true,
        }),
      });
      expect(res3.status).toBe(201);
      const charlie = (await res3.json()) as Record<string, unknown>;
      moderatorId = charlie["id"] as string;
    });

    it("should reject duplicate handle with 409 Conflict", async () => {
      const res = await fetch(`${baseUrl}/api/v1/users`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          handle: "alice",
          displayName: "Alice Imposter",
        }),
      });
      expect(res.status).toBe(409);
    });

    it("should fetch user profile by handle", async () => {
      const res = await fetch(`${baseUrl}/api/v1/users/alice`);
      expect(res.status).toBe(200);
      const user = (await res.json()) as Record<string, unknown>;
      expect(user["handle"]).toBe("alice");
      expect(user["displayName"]).toBe("Alice Wonderland");
    });

    it("should allow Bob to follow Alice", async () => {
      const res = await fetch(`${baseUrl}/api/v1/users/${aliceId}/follow`, {
        method: "POST",
        headers: { "x-user-id": bobId },
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toEqual({ following: true });

      // Verify follower count updated
      const aliceProfile = (await (await fetch(`${baseUrl}/api/v1/users/alice`)).json()) as Record<
        string,
        unknown
      >;
      expect(aliceProfile["followersCount"]).toBe(1);
    });
  });

  // Category 3: Posts & Feed
  describe("Posts, Likes & Timeline Feed", () => {
    it("should allow Alice to create a post with hashtags", async () => {
      const res = await fetch(`${baseUrl}/api/v1/posts`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-user-id": aliceId,
        },
        body: JSON.stringify({
          content: "Hello world from Plinth! Building scalable backends is awesome. #typescript #backend",
        }),
      });
      expect(res.status).toBe(201);
      const post = (await res.json()) as Record<string, unknown>;
      alicePostId = post["id"] as string;
      expect(post["authorHandle"]).toBe("alice");
      expect(post["tags"]).toContain("typescript");
      expect(post["tags"]).toContain("backend");
      expect(post["likeCount"]).toBe(0);
    });

    it("should allow Bob to view his timeline feed and see Alice's post", async () => {
      const res = await fetch(`${baseUrl}/api/v1/feed?limit=10`, {
        headers: { "x-user-id": bobId },
      });
      expect(res.status).toBe(200);
      const feed = (await res.json()) as { posts: Array<Record<string, unknown>> };
      expect(feed.posts.length).toBeGreaterThanOrEqual(1);
      expect(feed.posts[0]?.["id"]).toBe(alicePostId);
      expect(feed.posts[0]?.["authorHandle"]).toBe("alice");
    });

    it("should allow Bob to like Alice's post", async () => {
      const res = await fetch(`${baseUrl}/api/v1/posts/${alicePostId}/like`, {
        method: "POST",
        headers: { "x-user-id": bobId },
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toEqual({ liked: true, likeCount: 1 });

      // Fetch post to verify likeCount
      const postRes = await fetch(`${baseUrl}/api/v1/posts/${alicePostId}`);
      expect(postRes.status).toBe(200);
      const post = (await postRes.json()) as Record<string, unknown>;
      expect(post["likeCount"]).toBe(1);
    });

    it("should allow Bob to add a comment to Alice's post", async () => {
      const res = await fetch(`${baseUrl}/api/v1/posts/${alicePostId}/comments`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-user-id": bobId,
        },
        body: JSON.stringify({
          content: "Great post Alice! Fully agree.",
        }),
      });
      expect(res.status).toBe(201);
      const comment = (await res.json()) as Record<string, unknown>;
      expect(comment["postId"]).toBe(alicePostId);
      expect(comment["authorHandle"]).toBe("bob");
      expect(comment["content"]).toBe("Great post Alice! Fully agree.");

      // Verify comment listing
      const listRes = await fetch(`${baseUrl}/api/v1/posts/${alicePostId}/comments`);
      expect(listRes.status).toBe(200);
      const comments = (await listRes.json()) as Array<Record<string, unknown>>;
      expect(comments.length).toBe(1);
      expect(comments[0]?.["content"]).toBe("Great post Alice! Fully agree.");
    });
  });

  // Category 4: Permissions & Moderation
  describe("Permissions & Moderation", () => {
    let secondPostId: string;

    beforeAll(async () => {
      // Alice creates a second post
      const res = await fetch(`${baseUrl}/api/v1/posts`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-user-id": aliceId,
        },
        body: JSON.stringify({
          content: "This is a test post that will be moderated.",
        }),
      });
      const post = (await res.json()) as Record<string, unknown>;
      secondPostId = post["id"] as string;
    });

    it("should reject unauthorized user Bob trying to delete Alice's post with 403 Forbidden", async () => {
      const res = await fetch(`${baseUrl}/api/v1/posts/${secondPostId}`, {
        method: "DELETE",
        headers: { "x-user-id": bobId },
      });
      expect(res.status).toBe(403);
    });

    it("should allow Moderator Charlie to delete Alice's post using MODERATE_POSTS bit", async () => {
      const res = await fetch(`${baseUrl}/api/v1/posts/${secondPostId}`, {
        method: "DELETE",
        headers: { "x-user-id": moderatorId },
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toEqual({ deleted: true });

      // Verify post is now deleted (404)
      const checkRes = await fetch(`${baseUrl}/api/v1/posts/${secondPostId}`);
      expect(checkRes.status).toBe(404);
    });

    it("should allow Author Alice to delete her own post", async () => {
      const res = await fetch(`${baseUrl}/api/v1/posts/${alicePostId}`, {
        method: "DELETE",
        headers: { "x-user-id": aliceId },
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toEqual({ deleted: true });
    });
  });
});
