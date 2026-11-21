import { buildApp } from "@plinth/reference-api/app.js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

describe("Reference API: Auth HTTP Endpoints & OpenAPI Documentation", () => {
  let app: Awaited<ReturnType<typeof buildApp>>;
  let baseUrl: string;

  beforeAll(async () => {
    app = await buildApp({
      isProduction: true,
      sqliteFilename: ":memory:",
      port: 0,
      host: "127.0.0.1",
      tenantMode: "single",
    });

    const info = await app.start();
    baseUrl = `http://127.0.0.1:${info.port}`;
  });

  afterAll(async () => {
    await app.close();
  });

  it("POST /api/v1/auth/register creates user and returns dual session tokens (201)", async () => {
    const res = await fetch(`${baseUrl}/api/v1/auth/register`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        email: "alice.api@example.com",
        password: "secure-api-password-123",
      }),
    });

    expect(res.status).toBe(201);
    const body = (await res.json()) as {
      user: { email: string; status: string };
      accessToken: string;
      refreshToken: string;
      sessionToken: string;
      csrfToken: string;
    };
    expect(body.user.email).toBe("alice.api@example.com");
    expect(body.user.status).toBe("active");
    expect(body.accessToken).toBeTypeOf("string");
    expect(body.refreshToken).toBeTypeOf("string");
    expect(body.sessionToken).toBeTypeOf("string");
    expect(body.csrfToken).toBeTypeOf("string");
  });

  it("POST /api/v1/auth/login authenticates with email and password (200)", async () => {
    const res = await fetch(`${baseUrl}/api/v1/auth/login`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        identifier: "alice.api@example.com",
        password: "secure-api-password-123",
      }),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      user: { email: string };
      accessToken: string;
      refreshToken: string;
    };
    expect(body.user.email).toBe("alice.api@example.com");
    expect(body.accessToken).toBeTypeOf("string");
    expect(body.refreshToken).toBeTypeOf("string");
  });

  it("POST /api/v1/auth/refresh rotates refresh token and returns new tokens (200)", async () => {
    // 1. Log in to get tokens
    const loginRes = await fetch(`${baseUrl}/api/v1/auth/login`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        identifier: "alice.api@example.com",
        password: "secure-api-password-123",
      }),
    });
    const { refreshToken: originalRefreshToken } = (await loginRes.json()) as {
      refreshToken: string;
    };

    // 2. Refresh
    const refreshRes = await fetch(`${baseUrl}/api/v1/auth/refresh`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        refreshToken: originalRefreshToken,
      }),
    });

    expect(refreshRes.status).toBe(200);
    const refreshBody = (await refreshRes.json()) as {
      accessToken: string;
      refreshToken: string;
      expiresIn: number;
    };
    expect(refreshBody.accessToken).toBeTypeOf("string");
    expect(refreshBody.refreshToken).toBeTypeOf("string");
    expect(refreshBody.refreshToken).not.toBe(originalRefreshToken);
    expect(refreshBody.expiresIn).toBe(900);
  });

  it("POST /api/v1/auth/logout revokes tokens (204)", async () => {
    const res = await fetch(`${baseUrl}/api/v1/auth/logout`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        sessionToken: "dummy-session-token",
        refreshToken: "dummy-refresh-token",
      }),
    });

    expect(res.status).toBe(204);
  });

  it("GET /api/v1/auth/me returns authenticated user details", async () => {
    // 1. Register a user
    const regRes = await fetch(`${baseUrl}/api/v1/auth/register`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email: "me.user@example.com",
        password: "secure-me-pass-123",
      }),
    });
    const regBody = (await regRes.json()) as { user: { id: string; email: string } };

    // 2. Query /me with x-user-id header
    const meRes = await fetch(`${baseUrl}/api/v1/auth/me`, {
      headers: { "x-user-id": regBody.user.id },
    });
    expect(meRes.status).toBe(200);
    const meBody = (await meRes.json()) as { id: string; email: string };
    expect(meBody.id).toBe(regBody.user.id);
    expect(meBody.email).toBe("me.user@example.com");

    // 3. Query /me without x-user-id header fails
    const failRes = await fetch(`${baseUrl}/api/v1/auth/me`);
    expect(failRes.status).toBe(503);
  });

  it("GET /openapi.json documents Auth endpoints in OpenAPI 3.1 specification", async () => {
    const res = await fetch(`${baseUrl}/openapi.json`);
    expect(res.status).toBe(200);
    const spec = (await res.json()) as { paths: Record<string, unknown> };
    expect(spec.paths["/api/v1/auth/register"]).toBeDefined();
    expect(spec.paths["/api/v1/auth/login"]).toBeDefined();
    expect(spec.paths["/api/v1/auth/refresh"]).toBeDefined();
    expect(spec.paths["/api/v1/auth/logout"]).toBeDefined();
  });
});
