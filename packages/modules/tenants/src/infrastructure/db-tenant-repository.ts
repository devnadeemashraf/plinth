import {
  BadRequestError,
  ConflictError,
  createTenantId,
  type DatabasePort,
  DEFAULT_TENANT_ID,
  ForbiddenError,
  generateUuidV7,
  NotFoundError,
  type TenantContext,
  type TenantId,
} from "@plinth/core";
import type {
  CreateTenantDto,
  Tenant,
  TenantPlan,
  TenantQuota,
  TenantStatus,
  UpdateTenantDto,
} from "@plinth/modules-tenants/domain/tenant.js";
import type { TenantRepositoryPort } from "@plinth/modules-tenants/ports/repository.js";

interface TenantRow {
  id: string;
  slug: string;
  name: string;
  plan: string;
  status: string;
  quota_json: string | null;
  created_at: string;
  updated_at: string;
}

function mapRowToTenant(row: TenantRow): Tenant {
  const quota: TenantQuota | undefined = row.quota_json
    ? (JSON.parse(row.quota_json) as TenantQuota)
    : undefined;

  return {
    id: createTenantId(row.id),
    slug: row.slug,
    name: row.name,
    plan: row.plan as TenantPlan,
    status: row.status as TenantStatus,
    ...(quota !== undefined ? { quota } : {}),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function assertTenantAuthorization(targetTenantId: TenantId, ctx: TenantContext): void {
  if (ctx.mode === "single") {
    return;
  }
  if (ctx.tenantId !== targetTenantId) {
    throw new ForbiddenError(
      `Cross-tenant access forbidden: active tenant '${ctx.tenantId}' cannot access '${targetTenantId}'`,
      { code: "CROSS_TENANT_FORBIDDEN" },
    );
  }
}

export class DbTenantRepository implements TenantRepositoryPort {
  readonly #db: DatabasePort;

  constructor(db: DatabasePort) {
    this.#db = db;
  }

  async initSchema(): Promise<void> {
    await this.#db.query(
      `CREATE TABLE IF NOT EXISTS tenants (
        id TEXT PRIMARY KEY,
        slug TEXT UNIQUE NOT NULL,
        name TEXT NOT NULL,
        plan TEXT NOT NULL,
        status TEXT NOT NULL,
        quota_json TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );`,
    );

    const existing = await this.#db.query<TenantRow>(
      "SELECT id FROM tenants WHERE id = ? LIMIT 1;",
      [DEFAULT_TENANT_ID],
    );

    if (existing.length === 0) {
      const now = new Date().toISOString();
      await this.#db.query(
        `INSERT INTO tenants (id, slug, name, plan, status, quota_json, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?);`,
        [
          DEFAULT_TENANT_ID,
          "default",
          "Default Organization",
          "enterprise",
          "active",
          null,
          now,
          now,
        ],
      );
    }
  }

  async findById(id: TenantId, ctx: TenantContext): Promise<Tenant | null> {
    assertTenantAuthorization(id, ctx);

    const rows = await this.#db.query<TenantRow>("SELECT * FROM tenants WHERE id = ? LIMIT 1;", [
      id,
    ]);

    return rows[0] ? mapRowToTenant(rows[0]) : null;
  }

  async findBySlug(slug: string, ctx: TenantContext): Promise<Tenant | null> {
    const rows = await this.#db.query<TenantRow>(
      "SELECT * FROM tenants WHERE LOWER(slug) = LOWER(?) LIMIT 1;",
      [slug],
    );

    if (!rows[0]) {
      return null;
    }

    const tenant = mapRowToTenant(rows[0]);
    assertTenantAuthorization(tenant.id, ctx);
    return tenant;
  }

  async create(data: CreateTenantDto, _ctx: TenantContext): Promise<Tenant> {
    const normalizedSlug = data.slug.toLowerCase();

    const existing = await this.#db.query<TenantRow>(
      "SELECT id FROM tenants WHERE LOWER(slug) = LOWER(?) LIMIT 1;",
      [normalizedSlug],
    );

    if (existing.length > 0) {
      throw new ConflictError(`Tenant with slug '${data.slug}' already exists`, {
        code: "TENANT_SLUG_CONFLICT",
      });
    }

    const id = createTenantId(`t_${generateUuidV7().replace(/-/g, "").slice(0, 16)}`);
    const now = new Date().toISOString();
    const plan = data.plan ?? "free";
    const status = "active";
    const quotaJson = data.quota ? JSON.stringify(data.quota) : null;

    await this.#db.query(
      `INSERT INTO tenants (id, slug, name, plan, status, quota_json, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?);`,
      [id, normalizedSlug, data.name, plan, status, quotaJson, now, now],
    );

    return {
      id,
      slug: normalizedSlug,
      name: data.name,
      plan,
      status,
      ...(data.quota !== undefined ? { quota: data.quota } : {}),
      createdAt: now,
      updatedAt: now,
    };
  }

  async update(id: TenantId, patch: UpdateTenantDto, ctx: TenantContext): Promise<Tenant> {
    assertTenantAuthorization(id, ctx);

    const rows = await this.#db.query<TenantRow>("SELECT * FROM tenants WHERE id = ? LIMIT 1;", [
      id,
    ]);

    if (!rows[0]) {
      throw new NotFoundError(`Tenant '${id}' not found`, {
        code: "TENANT_NOT_FOUND",
      });
    }

    const current = mapRowToTenant(rows[0]);
    const updatedName = patch.name ?? current.name;
    const updatedPlan = patch.plan ?? current.plan;
    const updatedStatus = patch.status ?? current.status;
    const updatedQuota = patch.quota !== undefined ? patch.quota : current.quota;
    const quotaJson = updatedQuota ? JSON.stringify(updatedQuota) : null;
    const now = new Date().toISOString();

    await this.#db.query(
      `UPDATE tenants
       SET name = ?, plan = ?, status = ?, quota_json = ?, updated_at = ?
       WHERE id = ?;`,
      [updatedName, updatedPlan, updatedStatus, quotaJson, now, id],
    );

    return {
      id: current.id,
      slug: current.slug,
      name: updatedName,
      plan: updatedPlan,
      status: updatedStatus,
      ...(updatedQuota !== undefined ? { quota: updatedQuota } : {}),
      createdAt: current.createdAt,
      updatedAt: now,
    };
  }

  async delete(id: TenantId, ctx: TenantContext): Promise<boolean> {
    assertTenantAuthorization(id, ctx);

    if (id === DEFAULT_TENANT_ID) {
      throw new BadRequestError("Cannot delete default tenant", {
        code: "CANNOT_DELETE_DEFAULT_TENANT",
      });
    }

    await this.#db.query("DELETE FROM tenants WHERE id = ?;", [id]);
    return true;
  }
}
