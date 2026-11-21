import { buildApp } from "@plinth/reference-api/app.js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

describe("apps/reference-api / RBAC HTTP API End-to-End", () => {
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

  it("should create, read, update, list, assign, evaluate, and delete a role via HTTP", async () => {
    // 1. Create Role
    const createRes = await fetch(`${baseUrl}/api/v1/roles`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-actor-position": "100",
      },
      body: JSON.stringify({
        name: "Content Strategist",
        permissionsHex: "0x6", // bits 1 & 2
        position: 45,
        metadata: {
          colorHex: "#6366f1",
          badgeLabel: "Strategist",
          description: "Content strategy lead",
        },
      }),
    });

    expect(createRes.status).toBe(201);
    const created = (await createRes.json()) as {
      id: string;
      name: string;
      permissionsHex: string;
      position: number;
    };
    expect(created.id).toBeDefined();
    expect(created.name).toBe("Content Strategist");
    expect(created.permissionsHex).toBe("0x6");
    expect(created.position).toBe(45);

    // 2. Get Role
    const getRes = await fetch(`${baseUrl}/api/v1/roles/${created.id}`);
    expect(getRes.status).toBe(200);
    const fetched = (await getRes.json()) as typeof created;
    expect(fetched.id).toBe(created.id);

    // 3. Update Role
    const updateRes = await fetch(`${baseUrl}/api/v1/roles/${created.id}`, {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
        "x-actor-position": "100",
      },
      body: JSON.stringify({
        name: "Lead Content Strategist",
        position: 48,
      }),
    });
    expect(updateRes.status).toBe(200);
    const updated = (await updateRes.json()) as typeof created;
    expect(updated.name).toBe("Lead Content Strategist");
    expect(updated.position).toBe(48);

    // 4. List Roles
    const listRes = await fetch(`${baseUrl}/api/v1/roles`);
    expect(listRes.status).toBe(200);
    const list = (await listRes.json()) as (typeof created)[];
    expect(list.some((r) => r.id === created.id)).toBe(true);

    // 5. Assign Role to Member
    const assignRes = await fetch(`${baseUrl}/api/v1/members/user_http_test/roles`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-actor-position": "100",
      },
      body: JSON.stringify({
        roleId: created.id,
      }),
    });
    expect(assignRes.status).toBe(200);

    // 6. Evaluate Permissions
    const evalRes = await fetch(`${baseUrl}/api/v1/rbac/evaluate`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        memberId: "user_http_test",
      }),
    });
    expect(evalRes.status).toBe(200);
    const evalData = (await evalRes.json()) as {
      memberId: string;
      effectiveMaskHex: string;
      permissions: string[];
    };
    expect(evalData.effectiveMaskHex).toBe("0x6");
    expect(evalData.permissions).toContain("VIEW_AUDIT_LOGS");
    expect(evalData.permissions).toContain("MANAGE_TENANT");

    // 7. Remove Role from Member
    const removeRes = await fetch(`${baseUrl}/api/v1/members/user_http_test/roles/${created.id}`, {
      method: "DELETE",
      headers: {
        "x-actor-position": "100",
      },
    });
    expect(removeRes.status).toBe(204);

    // 8. Delete Role
    const deleteRes = await fetch(`${baseUrl}/api/v1/roles/${created.id}`, {
      method: "DELETE",
      headers: {
        "x-actor-position": "100",
      },
    });
    expect(deleteRes.status).toBe(204);

    // 9. Confirm Role is Deleted
    const checkDeleted = await fetch(`${baseUrl}/api/v1/roles/${created.id}`);
    expect(checkDeleted.status).toBe(404);
  });

  it("should return 403 Forbidden RFC 9457 Problem Details on privilege escalation attempt", async () => {
    // Actor with position 30 tries to create role with position 50
    const res = await fetch(`${baseUrl}/api/v1/roles`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-actor-position": "30",
        "x-actor-permissions": "0x2",
      },
      body: JSON.stringify({
        name: "Unauthorized Super Role",
        permissionsHex: "0x2",
        position: 50,
      }),
    });

    expect(res.status).toBe(403);
    const problem = (await res.json()) as {
      type: string;
      title: string;
      status: number;
      detail: string;
    };
    expect(problem.status).toBe(403);
    expect(problem.detail).toMatch(/equal or higher position/i);
  });
});
