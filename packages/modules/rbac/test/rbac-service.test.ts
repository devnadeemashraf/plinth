import {
  ADMINISTRATOR_BIT,
  bitFromPosition,
  createRoleId,
  createTenantId,
  type TenantContext,
  type UserId,
} from "@plinth/core";
import type {
  CreateRoleDto,
  SetScopeOverwriteDto,
  UpdateRoleDto,
} from "@plinth/modules-rbac/domain/role.js";
import { InMemoryRoleRepository } from "@plinth/modules-rbac/infrastructure/in-memory-role-repository.js";
import { RbacService } from "@plinth/modules-rbac/services/rbac-service.js";
import { beforeEach, describe, expect, it } from "vitest";

describe("RBAC / RbacService (5-Category TDD)", () => {
  let repo: InMemoryRoleRepository;
  let service: RbacService;

  const tenantA = createTenantId("tenant_alpha");
  const tenantB = createTenantId("tenant_beta");

  const ctxA: TenantContext = {
    tenantId: tenantA,
    slug: "alpha",
    mode: "multi",
    isDefault: false,
  };

  const ctxB: TenantContext = {
    tenantId: tenantB,
    slug: "beta",
    mode: "multi",
    isDefault: false,
  };

  const adminActor = {
    userId: "admin_1",
    highestPosition: 100,
    effectivePermissions: ADMINISTRATOR_BIT,
  };

  const staffActor = {
    userId: "staff_1",
    highestPosition: 50,
    effectivePermissions: bitFromPosition(1) | bitFromPosition(2) | bitFromPosition(3),
  };

  beforeEach(() => {
    repo = new InMemoryRoleRepository();
    service = new RbacService(repo, {
      allowCustomRoles: true,
      roleScopeMode: "tenant_isolated",
    });
  });

  // Category 1: Happy Path
  describe("Category 1: Happy Path", () => {
    it("should create a custom role and retrieve it by ID", async () => {
      const dto: CreateRoleDto = {
        name: "Editor",
        permissionsHex: "0x6", // bits 1 & 2
        position: 30,
        metadata: {
          colorHex: "#3b82f6",
          badgeLabel: "Editor",
          description: "Content editor role",
        },
      };

      const role = await service.createRole(dto, staffActor, ctxA);
      expect(role.id).toBeDefined();
      expect(role.name).toBe("Editor");
      expect(role.position).toBe(30);
      expect(role.permissions).toBe(6n);
      expect(role.isSystem).toBe(false);

      const fetched = await service.getRole(role.id, ctxA);
      expect(fetched.id).toBe(role.id);
      expect(fetched.name).toBe("Editor");
    });

    it("should update role details within actor rank bounds", async () => {
      const role = await service.createRole(
        {
          name: "Contributor",
          permissionsHex: "0x2", // bit 1
          position: 20,
        },
        staffActor,
        ctxA,
      );

      const updateDto: UpdateRoleDto = {
        name: "Senior Contributor",
        permissionsHex: "0x6", // bits 1 & 2 (held by staffActor)
        position: 25, // < 50
      };

      const updated = await service.updateRole(role.id, updateDto, staffActor, ctxA);
      expect(updated.name).toBe("Senior Contributor");
      expect(updated.position).toBe(25);
      expect(updated.permissions).toBe(6n);
    });

    it("should assign roles to members and evaluate effective permissions", async () => {
      const role = await service.createRole(
        {
          name: "Viewer",
          permissionsHex: "0x2", // bit 1
          position: 10,
        },
        staffActor,
        ctxA,
      );

      const memberId = "user_42" as UserId;
      await service.assignRoleToMember(memberId, role.id, staffActor, ctxA);

      const roles = await service.getMemberRoles(memberId, ctxA);
      expect(roles).toHaveLength(1);
      expect(roles[0]?.id).toBe(role.id);

      const evalResult = await service.evaluateMemberPermissions(memberId, [], ctxA);
      expect(evalResult.effectiveMask).toBe(2n);
      expect(evalResult.effectiveMaskHex).toBe("0x2");
    });

    it("should apply scope overwrites during permission evaluation", async () => {
      const role = await service.createRole(
        {
          name: "Manager",
          permissionsHex: "0x6", // bits 1 & 2
          position: 30,
        },
        staffActor,
        ctxA,
      );

      const memberId = "user_42" as UserId;
      await service.assignRoleToMember(memberId, role.id, staffActor, ctxA);

      // Add channel overwrite denying bit 1 and allowing bit 3
      const overwriteDto: SetScopeOverwriteDto = {
        scopeId: "channel_secret",
        scopeType: "channel",
        targetId: role.id,
        targetType: "role",
        allowHex: "0x8", // bit 3
        denyHex: "0x2", // bit 1
      };

      await service.setScopeOverwrite(overwriteDto, staffActor, ctxA);

      const evalResult = await service.evaluateMemberPermissions(
        memberId,
        ["channel_secret"],
        ctxA,
      );

      // Bit 1 denied (0), Bit 2 kept (1), Bit 3 allowed (1) -> 0b1100 = 12 = 0xc
      expect(evalResult.effectiveMask).toBe(12n);
      expect(evalResult.effectiveMaskHex).toBe("0xc");
    });
  });

  // Category 2: Boundary & Input Fuzzing
  describe("Category 2: Boundary & Input Fuzzing", () => {
    it("should support permissions > 64 bits (e.g. 1n << 128n)", async () => {
      const bit128 = 1n << 128n;
      const hex128 = `0x${bit128.toString(16)}`;

      const role = await service.createRole(
        {
          name: "HyperAdmin",
          permissionsHex: hex128,
          position: 90,
        },
        adminActor,
        ctxA,
      );

      expect(role.permissions).toBe(bit128);

      const memberId = "user_hyper" as UserId;
      await service.assignRoleToMember(memberId, role.id, adminActor, ctxA);

      const evalResult = await service.evaluateMemberPermissions(memberId, [], ctxA);
      expect(evalResult.effectiveMask).toBe(bit128);
    });

    it("should return 0n for members with zero assigned roles", async () => {
      const evalResult = await service.evaluateMemberPermissions(
        "user_no_roles" as UserId,
        [],
        ctxA,
      );
      expect(evalResult.effectiveMask).toBe(0n);
      expect(evalResult.effectiveMaskHex).toBe("0x0");
    });
  });

  // Category 3: Concurrency, Ordering & Idempotency
  describe("Category 3: Concurrency, Ordering & Idempotency", () => {
    it("should idempotently handle duplicate role assignment", async () => {
      const role = await service.createRole(
        {
          name: "Auditor",
          permissionsHex: "0x2",
          position: 10,
        },
        staffActor,
        ctxA,
      );

      const memberId = "user_auditor" as UserId;
      await service.assignRoleToMember(memberId, role.id, staffActor, ctxA);
      await service.assignRoleToMember(memberId, role.id, staffActor, ctxA);

      const roles = await service.getMemberRoles(memberId, ctxA);
      expect(roles).toHaveLength(1);
    });

    it("should handle removing an unassigned role gracefully without failure", async () => {
      const role = await service.createRole(
        {
          name: "Unassigned Role",
          permissionsHex: "0x2",
          position: 10,
        },
        staffActor,
        ctxA,
      );

      await expect(
        service.removeRoleFromMember("user_x" as UserId, role.id, staffActor, ctxA),
      ).resolves.not.toThrow();
    });
  });

  // Category 4: Failure & Fault Injection
  describe("Category 4: Failure & Fault Injection", () => {
    it("should reject deleting system roles", async () => {
      const systemRole = await repo.createRole(
        {
          id: createRoleId("role_system_admin"),
          tenantId: tenantA,
          name: "System Admin",
          permissions: ADMINISTRATOR_BIT,
          position: 99,
          isSystem: true,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        ctxA,
      );

      await expect(service.deleteRole(systemRole.id, adminActor, ctxA)).rejects.toThrowError(
        /cannot delete system role/i,
      );
    });

    it("should reject creating custom roles when allowCustomRoles is disabled", async () => {
      const restrictedService = new RbacService(repo, {
        allowCustomRoles: false,
        roleScopeMode: "tenant_isolated",
      });

      await expect(
        restrictedService.createRole(
          {
            name: "Custom Role",
            permissionsHex: "0x2",
            position: 10,
          },
          staffActor,
          ctxA,
        ),
      ).rejects.toThrowError(/custom roles are disabled/i);
    });

    it("should throw NotFoundError when querying non-existent role", async () => {
      await expect(service.getRole(createRoleId("role_ghost"), ctxA)).rejects.toThrowError(
        /not found/i,
      );
    });

    it("should reject updating a role with invalid hex permissions", async () => {
      const role = await service.createRole(
        {
          name: "Valid Role",
          permissionsHex: "0x2",
          position: 10,
        },
        staffActor,
        ctxA,
      );

      await expect(
        service.updateRole(role.id, { permissionsHex: "invalid_hex" }, staffActor, ctxA),
      ).rejects.toThrowError(/invalid canonical bitmask hex/i);
    });

    it("should reject updating a role name to an already existing name in same tenant", async () => {
      await service.createRole(
        {
          name: "Role One",
          permissionsHex: "0x2",
          position: 10,
        },
        staffActor,
        ctxA,
      );

      const roleTwo = await service.createRole(
        {
          name: "Role Two",
          permissionsHex: "0x2",
          position: 15,
        },
        staffActor,
        ctxA,
      );

      await expect(
        service.updateRole(roleTwo.id, { name: "Role One" }, staffActor, ctxA),
      ).rejects.toThrowError(/already in use/i);
    });

    it("should reject setting scope overwrite with invalid allowHex or denyHex", async () => {
      await expect(
        service.setScopeOverwrite(
          {
            scopeId: "c1",
            scopeType: "channel",
            targetId: "t1",
            targetType: "role",
            allowHex: "bad",
            denyHex: "0x0",
          },
          adminActor,
          ctxA,
        ),
      ).rejects.toThrowError(/invalid canonical bitmask hex/i);

      await expect(
        service.setScopeOverwrite(
          {
            scopeId: "c1",
            scopeType: "channel",
            targetId: "t1",
            targetType: "role",
            allowHex: "0x0",
            denyHex: "bad",
          },
          adminActor,
          ctxA,
        ),
      ).rejects.toThrowError(/invalid canonical bitmask hex/i);
    });

    it("should expose configuration getters correctly", () => {
      expect(service.allowCustomRoles).toBe(true);
      expect(service.roleScopeMode).toBe("tenant_isolated");
    });

    it("should delete a custom role successfully", async () => {
      const role = await service.createRole(
        {
          name: "Temporary Role",
          permissionsHex: "0x2",
          position: 10,
        },
        staffActor,
        ctxA,
      );

      await expect(service.deleteRole(role.id, staffActor, ctxA)).resolves.not.toThrow();
      await expect(service.getRole(role.id, ctxA)).rejects.toThrowError(/not found/i);
    });

    it("should list roles in single tenant mode without filtering by tenantId", async () => {
      const singleCtx: TenantContext = {
        tenantId: tenantA,
        slug: "default",
        mode: "single",
        isDefault: true,
      };

      const roles = await service.listRoles(singleCtx);
      expect(Array.isArray(roles)).toBe(true);
    });

    it("should exercise in-memory repository edge cases (missing delete, missing update)", async () => {
      await expect(repo.deleteRole(createRoleId("missing_role"), ctxA)).resolves.not.toThrow();
      await expect(repo.updateRole(createRoleId("missing_role"), {}, ctxA)).rejects.toThrowError(
        /not found/i,
      );
      expect(await repo.getRoleByName(tenantA, "completely_non_existent", ctxA)).toBeNull();
    });

    it("should reject creating a role with invalid hex permissions", async () => {
      await expect(
        service.createRole(
          {
            name: "Invalid Hex Role",
            permissionsHex: "not-a-hex",
            position: 10,
          },
          staffActor,
          ctxA,
        ),
      ).rejects.toThrowError(/invalid canonical bitmask hex/i);
    });

    it("should reject creating a role with invalid metadata", async () => {
      await expect(
        service.createRole(
          {
            name: "Bad Meta Role",
            permissionsHex: "0x2",
            position: 10,
            metadata: {
              colorHex: "invalid-color-format",
            },
          },
          staffActor,
          ctxA,
        ),
      ).rejects.toThrowError(/invalid (?:colorhex|role metadata)/i);
    });

    it("should reject creating duplicate role names within the same tenant", async () => {
      await service.createRole(
        {
          name: "Original Name",
          permissionsHex: "0x2",
          position: 10,
        },
        staffActor,
        ctxA,
      );

      await expect(
        service.createRole(
          {
            name: "Original Name",
            permissionsHex: "0x2",
            position: 15,
          },
          staffActor,
          ctxA,
        ),
      ).rejects.toThrowError(/already exists/i);
    });

    it("should update role metadata cleanly", async () => {
      const role = await service.createRole(
        {
          name: "Meta Role",
          permissionsHex: "0x2",
          position: 10,
        },
        staffActor,
        ctxA,
      );

      const updated = await service.updateRole(
        role.id,
        {
          metadata: {
            colorHex: "#123456",
            badgeLabel: "Updated Badge",
          },
        },
        staffActor,
        ctxA,
      );

      expect(updated.metadata?.colorHex).toBe("#123456");
      expect(updated.metadata?.badgeLabel).toBe("Updated Badge");
    });
  });

  // Category 5: Security & Abuse Cases (Privilege Escalation & Cross-Tenant Attacks)
  describe("Category 5: Security & Abuse Cases", () => {
    it("should BLOCK creating a role with rank equal to or higher than actor", async () => {
      await expect(
        service.createRole(
          {
            name: "Escalated Role",
            permissionsHex: "0x2",
            position: 50, // staffActor is 50!
          },
          staffActor,
          ctxA,
        ),
      ).rejects.toThrowError(/equal or higher position/i);
    });

    it("should BLOCK creating a role granting permissions the actor does not hold", async () => {
      await expect(
        service.createRole(
          {
            name: "Sneaky Role",
            permissionsHex: "0x20", // bit 5 is NOT held by staffActor!
            position: 20,
          },
          staffActor,
          ctxA,
        ),
      ).rejects.toThrowError(/permissions not held/i);
    });

    it("should BLOCK cross-tenant role operations (IDOR defense)", async () => {
      const roleInTenantA = await service.createRole(
        {
          name: "Tenant A Role",
          permissionsHex: "0x2",
          position: 10,
        },
        adminActor,
        ctxA,
      );

      // Attempting to access Tenant A's role from Tenant B's context
      await expect(service.getRole(roleInTenantA.id, ctxB)).rejects.toThrowError(
        /not found|forbidden/i,
      );

      // Attempting to assign Tenant A's role to a member in Tenant B
      await expect(
        service.assignRoleToMember("user_b" as UserId, roleInTenantA.id, adminActor, ctxB),
      ).rejects.toThrowError(/not found|forbidden/i);
    });

    it("should BLOCK lower-rank actor from modifying scope overwrites of higher-rank role [P1 Finding 1]", async () => {
      const highRankRole = await service.createRole(
        {
          name: "High Rank Role",
          permissionsHex: "0x2",
          position: 80,
        },
        adminActor,
        ctxA,
      );

      // staffActor is rank 50 -> tries to set overwrite on rank 80 role
      await expect(
        service.setScopeOverwrite(
          {
            scopeId: "ch_audit",
            scopeType: "channel",
            targetId: highRankRole.id,
            targetType: "role",
            allowHex: "0x2",
            denyHex: "0x0",
          },
          staffActor,
          ctxA,
        ),
      ).rejects.toThrowError(/equal or higher position/i);
    });

    it("should BLOCK lower-rank actor from modifying scope overwrites of higher-rank member [P1 Finding 1]", async () => {
      const highRankRole = await service.createRole(
        {
          name: "Lead Executive",
          permissionsHex: "0x2",
          position: 90,
        },
        adminActor,
        ctxA,
      );

      const execUser = "user_exec" as UserId;
      await service.assignRoleToMember(execUser, highRankRole.id, adminActor, ctxA);

      // staffActor (rank 50) tries to set scope overwrite targeting execUser (rank 90)
      await expect(
        service.setScopeOverwrite(
          {
            scopeId: "ch_exec_audit",
            scopeType: "channel",
            targetId: execUser,
            targetType: "member",
            allowHex: "0x2",
            denyHex: "0x0",
          },
          staffActor,
          ctxA,
        ),
      ).rejects.toThrowError(/equal or higher rank/i);
    });

    it("should clean up scope overwrites when target role is deleted [P1 Finding 2]", async () => {
      const tempRole = await service.createRole(
        {
          name: "Temp Target Role",
          permissionsHex: "0x2",
          position: 20,
        },
        staffActor,
        ctxA,
      );

      await service.setScopeOverwrite(
        {
          scopeId: "ch_cleanup",
          scopeType: "channel",
          targetId: tempRole.id,
          targetType: "role",
          allowHex: "0x2",
          denyHex: "0x0",
        },
        staffActor,
        ctxA,
      );

      const beforeDelete = await repo.getScopeOverwrites(tenantA, ["ch_cleanup"], ctxA);
      expect(beforeDelete.some((ow) => ow.targetId === tempRole.id)).toBe(true);

      await service.deleteRole(tempRole.id, staffActor, ctxA);

      const afterDelete = await repo.getScopeOverwrites(tenantA, ["ch_cleanup"], ctxA);
      expect(afterDelete.some((ow) => ow.targetId === tempRole.id)).toBe(false);
    });

    it("should reject adding more than 100 overwrites to a single scope [P2 Finding 3]", async () => {
      // Create 100 roles and assign overwrites
      for (let i = 0; i < 100; i++) {
        await repo.setScopeOverwrite(
          {
            id: `ow_mock_${i}`,
            tenantId: tenantA,
            scopeId: "ch_capped",
            scopeType: "channel",
            targetId: `target_${i}`,
            targetType: "role",
            allow: 0n,
            deny: 0n,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
          ctxA,
        );
      }

      // 101st overwrite should be rejected
      await expect(
        service.setScopeOverwrite(
          {
            scopeId: "ch_capped",
            scopeType: "channel",
            targetId: "target_overflow",
            targetType: "member",
            allowHex: "0x0",
            denyHex: "0x0",
          },
          adminActor,
          ctxA,
        ),
      ).rejects.toThrowError(/limit reached/i);
    });
  });
});
