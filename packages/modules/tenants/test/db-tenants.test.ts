import {
  type DatabasePort,
  DEFAULT_TENANT_CONTEXT,
  DEFAULT_TENANT_ID,
  ForbiddenError,
  type TenantContext,
} from "@plinth/core";
import { DbTenantRepository, TenantService } from "@plinth/modules-tenants/index.js";
import { beforeAll, describe, expect, it } from "vitest";

interface TenantDbRow {
  id: string;
  slug: string;
  name: string;
  plan: string;
  status: string;
  quota_json: string | null;
  created_at: string;
  updated_at: string;
}

class MockDatabasePort implements DatabasePort {
  readonly rows = new Map<string, TenantDbRow>();

  async query<T = unknown>(sql: string, params: unknown[] = []): Promise<T[]> {
    if (sql.includes("CREATE TABLE")) {
      return [] as T[];
    }
    if (sql.includes("SELECT id FROM tenants WHERE id = ?")) {
      const id = params[0] as string;
      const found = this.rows.get(id);
      return (found ? [{ id: found.id }] : []) as T[];
    }
    if (sql.includes("SELECT * FROM tenants WHERE id = ?")) {
      const id = params[0] as string;
      const found = this.rows.get(id);
      return (found ? [found] : []) as T[];
    }
    if (sql.includes("SELECT * FROM tenants WHERE LOWER(slug) = LOWER(?)")) {
      const slug = (params[0] as string).toLowerCase();
      const found = Array.from(this.rows.values()).find((r) => r.slug.toLowerCase() === slug);
      return (found ? [found] : []) as T[];
    }
    if (sql.includes("SELECT id FROM tenants WHERE LOWER(slug) = LOWER(?)")) {
      const slug = (params[0] as string).toLowerCase();
      const found = Array.from(this.rows.values()).find((r) => r.slug.toLowerCase() === slug);
      return (found ? [{ id: found.id }] : []) as T[];
    }
    if (sql.includes("INSERT INTO tenants")) {
      const [id, slug, name, plan, status, quota_json, created_at, updated_at] = params as [
        string,
        string,
        string,
        string,
        string,
        string | null,
        string,
        string,
      ];
      this.rows.set(id, { id, slug, name, plan, status, quota_json, created_at, updated_at });
      return [] as T[];
    }
    if (sql.includes("UPDATE tenants")) {
      const [name, plan, status, quota_json, updated_at, id] = params as [
        string,
        string,
        string,
        string | null,
        string,
        string,
      ];
      const existing = this.rows.get(id);
      if (existing) {
        this.rows.set(id, { ...existing, name, plan, status, quota_json, updated_at });
      }
      return [] as T[];
    }
    if (sql.includes("DELETE FROM tenants")) {
      const id = params[0] as string;
      this.rows.delete(id);
      return [] as T[];
    }
    return [] as T[];
  }

  async transaction<T>(fn: (tx: DatabasePort) => Promise<T>): Promise<T> {
    return fn(this);
  }

  async ping(): Promise<boolean> {
    return true;
  }

  async close(): Promise<void> {}

  getUnderlyingClient<T = unknown>(): T {
    return this as unknown as T;
  }
}

describe("modules / tenants / DbTenantRepository (DatabasePort integration)", () => {
  let db: MockDatabasePort;
  let repo: DbTenantRepository;
  let service: TenantService;

  beforeAll(async () => {
    db = new MockDatabasePort();
    repo = new DbTenantRepository(db);
    await repo.initSchema();
    service = new TenantService(repo);
  });

  it("should initialize schema and query default tenant", async () => {
    const defaultTenant = await service.getTenantBySlug("default", DEFAULT_TENANT_CONTEXT);
    expect(defaultTenant.id).toBe(DEFAULT_TENANT_ID);
    expect(defaultTenant.slug).toBe("default");
    expect(defaultTenant.name).toBe("Default Organization");
    expect(defaultTenant.plan).toBe("enterprise");
  });

  it("should persist new tenant to database and retrieve it", async () => {
    const created = await service.createTenant(
      {
        slug: "mock-tenant",
        name: "Mock Tenant Inc",
        plan: "pro",
        quota: { maxUsers: 25 },
      },
      DEFAULT_TENANT_CONTEXT,
    );

    const ctx: TenantContext = {
      tenantId: created.id,
      slug: "mock-tenant",
      mode: "multi",
      isDefault: false,
    };

    const fetched = await service.getTenantBySlug("mock-tenant", ctx);
    expect(fetched.id).toBe(created.id);
    expect(fetched.name).toBe("Mock Tenant Inc");
    expect(fetched.quota?.maxUsers).toBe(25);
  });

  it("should update persisted tenant in database", async () => {
    const created = await service.createTenant(
      { slug: "updatable", name: "Before Update" },
      DEFAULT_TENANT_CONTEXT,
    );

    const ctx: TenantContext = {
      tenantId: created.id,
      slug: "updatable",
      mode: "multi",
      isDefault: false,
    };

    const updated = await service.updateTenant(
      "updatable",
      { name: "After Update", plan: "enterprise" },
      ctx,
    );

    expect(updated.name).toBe("After Update");
    expect(updated.plan).toBe("enterprise");
  });

  it("should block cross-tenant IDOR access on repository", async () => {
    const t1 = await service.createTenant(
      { slug: "db-t1", name: "Tenant 1" },
      DEFAULT_TENANT_CONTEXT,
    );
    const t2 = await service.createTenant(
      { slug: "db-t2", name: "Tenant 2" },
      DEFAULT_TENANT_CONTEXT,
    );

    const t1Ctx: TenantContext = {
      tenantId: t1.id,
      slug: "db-t1",
      mode: "multi",
      isDefault: false,
    };

    await expect(repo.findById(t2.id, t1Ctx)).rejects.toThrow(ForbiddenError);
    await expect(service.getTenantBySlug("db-t2", t1Ctx)).rejects.toThrow(ForbiddenError);
  });
});
