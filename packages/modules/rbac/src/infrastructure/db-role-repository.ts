import {
  createRoleId,
  createTenantId,
  type DatabasePort,
  ForbiddenError,
  fromCanonicalHex,
  generateUuidV7,
  type RoleId,
  type RoleMetadata,
  type TenantContext,
  type TenantId,
  toCanonicalHex,
  type UserId,
} from "@plinth/core";
import type { Role, ScopeOverwrite, ScopeOverwriteType } from "@plinth/modules-rbac/domain/role.js";
import type { RoleRepositoryPort } from "@plinth/modules-rbac/ports/repository.js";

interface RoleRow {
  id: string;
  tenant_id: string;
  name: string;
  permissions_hex: string;
  position: number;
  is_system: number;
  metadata_json: string | null;
  created_at: string;
  updated_at: string;
}

interface ScopeOverwriteRow {
  id: string;
  tenant_id: string;
  scope_id: string;
  scope_type: string;
  target_id: string;
  target_type: string;
  allow_hex: string;
  deny_hex: string;
  created_at: string;
  updated_at: string;
}

function mapRowToRole(row: RoleRow): Role {
  const parsedPermissions = fromCanonicalHex(row.permissions_hex);
  const permissions = parsedPermissions.ok ? parsedPermissions.value : 0n;

  let metadata: RoleMetadata | undefined;
  if (row.metadata_json) {
    try {
      metadata = JSON.parse(row.metadata_json) as RoleMetadata;
    } catch {
      metadata = undefined;
    }
  }

  return {
    id: createRoleId(row.id),
    tenantId: createTenantId(row.tenant_id),
    name: row.name,
    permissions,
    position: row.position,
    isSystem: row.is_system === 1,
    ...(metadata ? { metadata } : {}),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapRowToOverwrite(row: ScopeOverwriteRow): ScopeOverwrite {
  const allowRes = fromCanonicalHex(row.allow_hex);
  const denyRes = fromCanonicalHex(row.deny_hex);

  return {
    id: row.id,
    tenantId: createTenantId(row.tenant_id),
    scopeId: row.scope_id,
    scopeType: row.scope_type,
    targetId: row.target_id,
    targetType: row.target_type as ScopeOverwriteType,
    allow: allowRes.ok ? allowRes.value : 0n,
    deny: denyRes.ok ? denyRes.value : 0n,
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

export class DbRoleRepository implements RoleRepositoryPort {
  readonly #db: DatabasePort;

  constructor(db: DatabasePort) {
    this.#db = db;
  }

  async initSchema(): Promise<void> {
    await this.#db.query(`
      CREATE TABLE IF NOT EXISTS rbac_roles (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        name TEXT NOT NULL,
        permissions_hex TEXT NOT NULL,
        position INTEGER NOT NULL,
        is_system INTEGER NOT NULL DEFAULT 0,
        metadata_json TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `);

    await this.#db.query(`
      CREATE TABLE IF NOT EXISTS rbac_member_roles (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        member_id TEXT NOT NULL,
        role_id TEXT NOT NULL,
        assigned_at TEXT NOT NULL,
        UNIQUE(tenant_id, member_id, role_id)
      );
    `);

    await this.#db.query(`
      CREATE TABLE IF NOT EXISTS rbac_scope_overwrites (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        scope_id TEXT NOT NULL,
        scope_type TEXT NOT NULL,
        target_id TEXT NOT NULL,
        target_type TEXT NOT NULL,
        allow_hex TEXT NOT NULL,
        deny_hex TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE(tenant_id, scope_id, target_id)
      );
    `);
  }

  async createRole(role: Role, ctx: TenantContext): Promise<Role> {
    assertTenantAuthorization(role.tenantId, ctx);
    const hex = toCanonicalHex(role.permissions);
    const metadataJson = role.metadata ? JSON.stringify(role.metadata) : null;

    await this.#db.query(
      `INSERT INTO rbac_roles (
        id, tenant_id, name, permissions_hex, position, is_system, metadata_json, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        role.id,
        role.tenantId,
        role.name,
        hex,
        role.position,
        role.isSystem ? 1 : 0,
        metadataJson,
        role.createdAt,
        role.updatedAt,
      ],
    );

    return role;
  }

  async getRoleById(roleId: RoleId, ctx: TenantContext): Promise<Role | null> {
    const rows = await this.#db.query<RoleRow>("SELECT * FROM rbac_roles WHERE id = ? LIMIT 1;", [
      roleId,
    ]);
    const row = rows[0];
    if (!row) {
      return null;
    }
    const role = mapRowToRole(row);
    assertTenantAuthorization(role.tenantId, ctx);
    return role;
  }

  async getRoleByName(tenantId: TenantId, name: string, ctx: TenantContext): Promise<Role | null> {
    assertTenantAuthorization(tenantId, ctx);
    const rows = await this.#db.query<RoleRow>(
      "SELECT * FROM rbac_roles WHERE tenant_id = ? AND LOWER(name) = LOWER(?) LIMIT 1;",
      [tenantId, name.trim()],
    );
    const row = rows[0];
    return row ? mapRowToRole(row) : null;
  }

  async updateRole(roleId: RoleId, updates: Partial<Role>, ctx: TenantContext): Promise<Role> {
    const existing = await this.getRoleById(roleId, ctx);
    if (!existing) {
      throw new Error(`Role '${roleId}' not found`);
    }

    const updatedPermissions = updates.permissions ?? existing.permissions;
    const permissionsHex = toCanonicalHex(updatedPermissions);
    const updatedName = updates.name ?? existing.name;
    const updatedPosition = updates.position ?? existing.position;
    const updatedMetadata = updates.metadata !== undefined ? updates.metadata : existing.metadata;
    const metadataJson = updatedMetadata ? JSON.stringify(updatedMetadata) : null;
    const now = new Date().toISOString();

    await this.#db.query(
      `UPDATE rbac_roles SET
        name = ?,
        permissions_hex = ?,
        position = ?,
        metadata_json = ?,
        updated_at = ?
      WHERE id = ?`,
      [updatedName, permissionsHex, updatedPosition, metadataJson, now, roleId],
    );

    return {
      ...existing,
      name: updatedName,
      permissions: updatedPermissions,
      position: updatedPosition,
      ...(updatedMetadata ? { metadata: updatedMetadata } : {}),
      updatedAt: now,
    };
  }

  async deleteRole(roleId: RoleId, ctx: TenantContext): Promise<void> {
    const existing = await this.getRoleById(roleId, ctx);
    if (!existing) {
      return;
    }

    await this.#db.query("DELETE FROM rbac_roles WHERE id = ?;", [roleId]);
    await this.#db.query("DELETE FROM rbac_member_roles WHERE role_id = ?;", [roleId]);
    await this.#db.query("DELETE FROM rbac_scope_overwrites WHERE target_id = ?;", [roleId]);
  }

  async listRoles(ctx: TenantContext): Promise<Role[]> {
    let query = "SELECT * FROM rbac_roles ORDER BY position DESC;";
    let params: unknown[] = [];

    if (ctx.mode !== "single") {
      query = "SELECT * FROM rbac_roles WHERE tenant_id = ? ORDER BY position DESC;";
      params = [ctx.tenantId];
    }

    const rows = await this.#db.query<RoleRow>(query, params);
    return rows.map(mapRowToRole);
  }

  async assignRoleToMember(
    tenantId: TenantId,
    memberId: UserId,
    roleId: RoleId,
    ctx: TenantContext,
  ): Promise<void> {
    assertTenantAuthorization(tenantId, ctx);
    const now = new Date().toISOString();
    const id = generateUuidV7();

    await this.#db.query(
      `INSERT OR IGNORE INTO rbac_member_roles (
        id, tenant_id, member_id, role_id, assigned_at
      ) VALUES (?, ?, ?, ?, ?);`,
      [id, tenantId, memberId, roleId, now],
    );
  }

  async removeRoleFromMember(
    tenantId: TenantId,
    memberId: UserId,
    roleId: RoleId,
    ctx: TenantContext,
  ): Promise<void> {
    assertTenantAuthorization(tenantId, ctx);
    await this.#db.query(
      "DELETE FROM rbac_member_roles WHERE tenant_id = ? AND member_id = ? AND role_id = ?;",
      [tenantId, memberId, roleId],
    );
  }

  async getMemberRoles(tenantId: TenantId, memberId: UserId, ctx: TenantContext): Promise<Role[]> {
    assertTenantAuthorization(tenantId, ctx);
    const rows = await this.#db.query<RoleRow>(
      `SELECT r.* FROM rbac_roles r
       INNER JOIN rbac_member_roles mr ON r.id = mr.role_id
       WHERE mr.tenant_id = ? AND mr.member_id = ?
       ORDER BY r.position DESC;`,
      [tenantId, memberId],
    );
    return rows.map(mapRowToRole);
  }

  async setScopeOverwrite(overwrite: ScopeOverwrite, ctx: TenantContext): Promise<void> {
    assertTenantAuthorization(overwrite.tenantId, ctx);
    const allowHex = toCanonicalHex(overwrite.allow);
    const denyHex = toCanonicalHex(overwrite.deny);

    await this.#db.query(
      `INSERT INTO rbac_scope_overwrites (
        id, tenant_id, scope_id, scope_type, target_id, target_type, allow_hex, deny_hex, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(tenant_id, scope_id, target_id) DO UPDATE SET
        allow_hex = excluded.allow_hex,
        deny_hex = excluded.deny_hex,
        updated_at = excluded.updated_at;`,
      [
        overwrite.id,
        overwrite.tenantId,
        overwrite.scopeId,
        overwrite.scopeType,
        overwrite.targetId,
        overwrite.targetType,
        allowHex,
        denyHex,
        overwrite.createdAt,
        overwrite.updatedAt,
      ],
    );
  }

  async getScopeOverwrites(
    tenantId: TenantId,
    scopeIds: string[],
    ctx: TenantContext,
  ): Promise<ScopeOverwrite[]> {
    assertTenantAuthorization(tenantId, ctx);
    if (scopeIds.length === 0) {
      return [];
    }

    const placeholders = scopeIds.map(() => "?").join(", ");
    const rows = await this.#db.query<ScopeOverwriteRow>(
      `SELECT * FROM rbac_scope_overwrites
       WHERE tenant_id = ? AND scope_id IN (${placeholders});`,
      [tenantId, ...scopeIds],
    );
    return rows.map(mapRowToOverwrite);
  }
}
