import { createSuperuser } from "@plinth/cli";
import { generateTotp } from "@plinth/core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";

interface InjectableServer {
  inject(options: {
    method: string;
    url: string;
    headers?: Record<string, string>;
    payload?: Record<string, unknown>;
  }): Promise<{
    statusCode: number;
    headers: Record<string, string | string[] | undefined>;
    body: string;
  }>;
}

const VALID_MASTER_KEY = Buffer.from(
  "000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f",
  "hex",
);

describe("Reference API - Zero-Build SSR Admin Panel & Dev Inspector (C11 Integration)", () => {
  let app: Awaited<ReturnType<typeof buildApp>>;
  let superUserSecret: string;
  let sessionCookie: string;
  let csrfToken: string;

  beforeAll(async () => {
    app = await buildApp({
      sqliteFilename: ":memory:",
      masterKey: VALID_MASTER_KEY,
    });

    // Create super user using CLI programmatic command
    const su = await createSuperuser({
      email: "admin@plinth.internal",
      password: "SuperSecretPassword2026#",
      authRepo: app.authRepo,
      roleRepo: app.roleRepo,
      masterKey: VALID_MASTER_KEY,
    });

    superUserSecret = su.totpSecret;
  });

  afterAll(async () => {
    await app.close();
  });

  it("should render SSR admin login page on GET /_admin/login", async () => {
    const fastify = app.server.getUnderlyingApp() as unknown as InjectableServer;
    const res = await fastify.inject({
      method: "GET",
      url: "/_admin/login",
    });

    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toContain("text/html");
    expect(res.headers["content-security-policy"]).toContain("default-src 'self'");
    expect(res.headers["content-security-policy"]).toContain("script-src 'none'");
    expect(res.body).toContain("Super User Control Plane");
  });

  it("should authenticate super user with password and redirect to MFA verification", async () => {
    const fastify = app.server.getUnderlyingApp() as unknown as InjectableServer;
    const res = await fastify.inject({
      method: "POST",
      url: "/_admin/login",
      payload: {
        email: "admin@plinth.internal",
        password: "SuperSecretPassword2026#",
      },
    });

    expect(res.statusCode).toBe(303);
    const locationVal = String(res.headers["location"] ?? "");
    expect(locationVal).toContain("/_admin/mfa?ticket=");

    const ticket = locationVal.split("ticket=")[1] ?? "";

    // Verify TOTP code and obtain session cookie
    const code = generateTotp(superUserSecret);
    const mfaRes = await fastify.inject({
      method: "POST",
      url: "/_admin/mfa",
      payload: {
        mfaTicket: ticket,
        totpCode: code,
      },
    });

    expect(mfaRes.statusCode).toBe(303);
    expect(mfaRes.headers["location"]).toBe("/_admin");
    expect(mfaRes.headers["set-cookie"]).toBeDefined();

    const rawCookie = mfaRes.headers["set-cookie"];
    sessionCookie = Array.isArray(rawCookie) ? (rawCookie[0] ?? "") : String(rawCookie ?? "");
    expect(sessionCookie).toContain("plinth_admin_session=");
  });

  it("should render Dashboard on GET /_admin with valid session cookie", async () => {
    const fastify = app.server.getUnderlyingApp() as unknown as InjectableServer;
    const res = await fastify.inject({
      method: "GET",
      url: "/_admin",
      headers: {
        cookie: sessionCookie,
      },
    });

    expect(res.statusCode).toBe(200);
    expect(res.body).toContain("System &amp; Runtime Overview");
    expect(res.body).toContain("admin@plinth.internal");

    // Extract CSRF token from logout form in dashboard
    const match = res.body.match(/name="_csrf" value="([^"]+)"/);
    expect(match).not.toBeNull();
    if (!match?.[1]) {
      throw new Error("Expected CSRF token in dashboard form");
    }
    csrfToken = match[1];
  });

  it("should update brand settings on POST /_admin/brand and reflect on GET /api/v1/brand", async () => {
    const fastify = app.server.getUnderlyingApp() as unknown as InjectableServer;
    const res = await fastify.inject({
      method: "POST",
      url: "/_admin/brand",
      headers: {
        cookie: sessionCookie,
      },
      payload: {
        _csrf: csrfToken,
        name: "Plinth Supercharged",
        tagline: "Hexagonal Powerhouse",
        primaryColorHex: "#7c3aed",
        secondaryColorHex: "#6d28d9",
        accentColorHex: "#8b5cf6",
      },
    });

    expect(res.statusCode).toBe(303);
    expect(res.headers["location"]).toContain("/_admin/brand");

    // Verify change is visible via public brand API
    const apiRes = await fastify.inject({
      method: "GET",
      url: "/api/v1/brand",
    });

    expect(apiRes.statusCode).toBe(200);
    const apiJson = JSON.parse(apiRes.body) as { name: string; primaryColorHex: string };
    expect(apiJson.name).toBe("Plinth Supercharged");
    expect(apiJson.primaryColorHex).toBe("#7c3aed");
  });

  it("should invalidate session on POST /_admin/logout and redirect to login", async () => {
    const fastify = app.server.getUnderlyingApp() as unknown as InjectableServer;
    const res = await fastify.inject({
      method: "POST",
      url: "/_admin/logout",
      headers: {
        cookie: sessionCookie,
      },
      payload: {
        _csrf: csrfToken,
      },
    });

    expect(res.statusCode).toBe(303);
    expect(res.headers["location"]).toBe("/_admin/login");

    // Attempting to access dashboard now should redirect to login
    const dashRes = await fastify.inject({
      method: "GET",
      url: "/_admin",
      headers: {
        cookie: sessionCookie,
      },
    });

    expect(dashRes.statusCode).toBe(303);
    expect(dashRes.headers["location"]).toBe("/_admin/login");
  });
});
