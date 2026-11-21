import {
  bitFromPosition,
  createRoleId,
  createTenantId,
  type DatabasePort,
  type TenantContext,
  type UserId,
} from "@plinth/core";
import type { Role, ScopeOverwrite } from "@plinth/modules-rbac/domain/role.js";
import { DbRoleRepository } from "@plinth/modules-rbac/infrastructure/db-role-repository.js";
import { beforeEach, describe, expect, it } from "vitest";

interface RoleDbRow {
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

interface MemberRoleDbRow {
  id: string;
  tenant_id: string;
  member_id: string;
  role_id: string;
  assigned_at: string;
}

interface ScopeOverwriteDbRow {
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

class MockDatabasePort implements DatabasePort {
  readonly roles = new Map<string, RoleDbRow>();
  readonly memberRoles: MemberRoleDbRow[] = [];
  readonly overwrites = new Map<string, ScopeOverwriteDbRow>();

  async query<T = unknown>(sql: string, params: unknown[] = []): Promise<T[]> {
    if (sql.includes("CREATE TABLE")) {
      return [] as T[];
    }
    if (sql.includes("INSERT INTO rbac_roles")) {
      const [
        id,
        tenant_id,
        name,
        permissions_hex,
        position,
        is_system,
        metadata_json,
        created_at,
        updated_at,
      ] = params as [string, string, string, string, number, number, string | null, string, string];
      this.roles.set(id, {
        id,
        tenant_id,
        name,
        permissions_hex,
        position,
        is_system,
        metadata_json,
        created_at,
        updated_at,
      });
      return [] as T[];
    }
    if (sql.includes("SELECT * FROM rbac_roles WHERE id = ?")) {
      const id = params[0] as string;
      const found = this.roles.get(id);
      return (found ? [found] : []) as T[];
    }
    if (sql.includes("SELECT permissions_hex FROM rbac_roles WHERE id = ?")) {
      const id = params[0] as string;
      const found = this.roles.get(id);
      return (found ? [{ permissions_hex: found.permissions_hex }] : []) as T[];
    }
    if (sql.includes("INSERT OR IGNORE INTO rbac_member_roles")) {
      const [id, tenant_id, member_id, role_id, assigned_at] = params as [
        string,
        string,
        string,
        string,
        string,
      ];
      const exists = this.memberRoles.some(
        (mr) => mr.tenant_id === tenant_id && mr.member_id === member_id && mr.role_id === role_id,
      );
      if (!exists) {
        this.memberRoles.push({ id, tenant_id, member_id, role_id, assigned_at });
      }
      return [] as T[];
    }
    if (sql.includes("rbac_member_roles mr")) {
      const [tenant_id, member_id] = params as [string, string];
      const assignedRoleIds = this.memberRoles
        .filter((mr) => mr.tenant_id === tenant_id && mr.member_id === member_id)
        .map((mr) => mr.role_id);
      const rows: RoleDbRow[] = [];
      for (const rid of assignedRoleIds) {
        const r = this.roles.get(rid);
        if (r) rows.push(r);
      }
      return rows.sort((a, b) => b.position - a.position) as T[];
    }
    if (
      sql.includes(
        "DELETE FROM rbac_member_roles WHERE tenant_id = ? AND member_id = ? AND role_id = ?",
      )
    ) {
      const [tenant_id, member_id, role_id] = params as [string, string, string];
      const idx = this.memberRoles.findIndex(
        (mr) => mr.tenant_id === tenant_id && mr.member_id === member_id && mr.role_id === role_id,
      );
      if (idx !== -1) {
        this.memberRoles.splice(idx, 1);
      }
      return [] as T[];
    }
    if (sql.includes("INSERT INTO rbac_scope_overwrites")) {
      const [
        id,
        tenant_id,
        scope_id,
        scope_type,
        target_id,
        target_type,
        allow_hex,
        deny_hex,
        created_at,
        updated_at,
      ] = params as [
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
      ];
      const key = `${tenant_id}:${scope_id}:${target_id}`;
      this.overwrites.set(key, {
        id,
        tenant_id,
        scope_id,
        scope_type,
        target_id,
        target_type,
        allow_hex,
        deny_hex,
        created_at,
        updated_at,
      });
      return [] as T[];
    }
    if (sql.includes("SELECT * FROM rbac_scope_overwrites")) {
      const [tenant_id] = params as [string];
      const targetScopeIds = params.slice(1) as string[];
      const scopeSet = new Set(targetScopeIds);
      const found: ScopeOverwriteDbRow[] = [];
      for (const ow of this.overwrites.values()) {
        if (ow.tenant_id === tenant_id && scopeSet.has(ow.scope_id)) {
          found.push(ow);
        }
      }
      return found as T[];
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

  getUnderlyingClient(): unknown {
    return null;
  }
}

describe("RBAC / DbRoleRepository SQLite Integration", () => {
  let db: MockDatabasePort;
  let repo: DbRoleRepository;

  const tenantId = createTenantId("tenant_db_test");
  const ctx: TenantContext = {
    tenantId,
    slug: "db-test",
    mode: "multi",
    isDefault: false,
  };

  beforeEach(async () => {
    db = new MockDatabasePort();
    repo = new DbRoleRepository(db);
    await repo.initSchema();
  });

  it("should persist and retrieve roles with canonical hex permissions in SQL", async () => {
    const wideBit = 1n << 70n;
    const roleId = createRoleId("role_sql_1");
    const role: Role = {
      id: roleId,
      tenantId,
      name: "Database Administrator",
      permissions: wideBit | bitFromPosition(1),
      position: 75,
      isSystem: false,
      metadata: {
        colorHex: "#10b981",
        badgeLabel: "DBA",
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await repo.createRole(role, ctx);

    const fetched = await repo.getRoleById(roleId, ctx);
    expect(fetched).not.toBeNull();
    expect(fetched?.id).toBe(roleId);
    expect(fetched?.permissions).toBe(role.permissions);
    expect(fetched?.metadata?.colorHex).toBe("#10b981");

    // Verify row directly in SQL table
    const rows = await db.query<{ permissions_hex: string }>(
      "SELECT permissions_hex FROM rbac_roles WHERE id = ?",
      [roleId],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.permissions_hex.startsWith("0x")).toBe(true);
  });

  it("should persist member assignments and retrieve member roles", async () => {
    const roleId = createRoleId("role_assign_test");
    await repo.createRole(
      {
        id: roleId,
        tenantId,
        name: "Developer",
        permissions: bitFromPosition(2),
        position: 40,
        isSystem: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      ctx,
    );

    const memberId = "user_dev" as UserId;
    await repo.assignRoleToMember(tenantId, memberId, roleId, ctx);

    const roles = await repo.getMemberRoles(tenantId, memberId, ctx);
    expect(roles).toHaveLength(1);
    expect(roles[0]?.id).toBe(roleId);

    // Remove role
    await repo.removeRoleFromMember(tenantId, memberId, roleId, ctx);
    const rolesAfter = await repo.getMemberRoles(tenantId, memberId, ctx);
    expect(rolesAfter).toHaveLength(0);
  });

  it("should persist scope overwrites with allow/deny canonical hex masks", async () => {
    const overwrite: ScopeOverwrite = {
      id: "ow_123",
      tenantId,
      scopeId: "channel_sql",
      scopeType: "channel",
      targetId: "role_sql_1",
      targetType: "role",
      allow: bitFromPosition(4),
      deny: bitFromPosition(1),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await repo.setScopeOverwrite(overwrite, ctx);

    const fetched = await repo.getScopeOverwrites(tenantId, ["channel_sql"], ctx);
    expect(fetched).toHaveLength(1);
    expect(fetched[0]?.allow).toBe(bitFromPosition(4));
    expect(fetched[0]?.deny).toBe(bitFromPosition(1));
  });
});
