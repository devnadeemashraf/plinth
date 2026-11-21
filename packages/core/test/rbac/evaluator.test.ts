import { describe, expect, it } from "vitest";
import { createRoleId, type UserId } from "@/primitives/brand-types.js";
import { bitFromPosition } from "@/rbac/bitmask.js";
import {
  evaluateEffectivePermissions,
  hasAnyPermission,
  hasPermission,
  type RoleInput,
  type ScopeLevel,
} from "@/rbac/evaluator.js";
import { ADMINISTRATOR_BIT } from "@/rbac/registry.js";

describe("RBAC / Discord-Style Evaluator & Overwrites (5-Category TDD)", () => {
  const memberId = "user_123" as UserId;
  const roleA: RoleInput = {
    id: createRoleId("role_a"),
    permissions: bitFromPosition(1) | bitFromPosition(2),
  };
  const roleB: RoleInput = {
    id: createRoleId("role_b"),
    permissions: bitFromPosition(2) | bitFromPosition(3),
  };

  // Category 1: Happy Path
  describe("Category 1: Happy Path", () => {
    it("should compute base permissions as the union (OR) of all assigned roles", () => {
      const result = evaluateEffectivePermissions({
        memberId,
        roles: [roleA, roleB],
      });

      const expected = bitFromPosition(1) | bitFromPosition(2) | bitFromPosition(3);
      expect(result).toBe(expected);
      expect(hasPermission(result, bitFromPosition(1))).toBe(true);
      expect(hasPermission(result, bitFromPosition(2))).toBe(true);
      expect(hasPermission(result, bitFromPosition(3))).toBe(true);
      expect(hasPermission(result, bitFromPosition(4))).toBe(false);
    });

    it("should apply Discord overwrite precedence: @everyone -> role -> member", () => {
      // Base: bit 1, bit 2
      // Scope overwrite 1: @everyone denies bit 1, allows bit 4
      // Scope overwrite 2: roleA denies bit 2, allows bit 5
      // Scope overwrite 3: member allows bit 1 (overriding @everyone deny)
      const scopes: ScopeLevel[] = [
        {
          scopeId: "channel_1",
          overwrites: [
            {
              targetId: "@everyone",
              type: "everyone",
              deny: bitFromPosition(1),
              allow: bitFromPosition(4),
            },
            {
              targetId: "role_a",
              type: "role",
              deny: bitFromPosition(2),
              allow: bitFromPosition(5),
            },
            {
              targetId: memberId,
              type: "member",
              deny: 0n,
              allow: bitFromPosition(1), // member explicitly restores bit 1
            },
          ],
        },
      ];

      const effective = evaluateEffectivePermissions({
        memberId,
        roles: [roleA],
        scopes,
      });

      // Bit 1: denied by @everyone, but allowed by member -> TRUE
      expect(hasPermission(effective, bitFromPosition(1))).toBe(true);
      // Bit 2: denied by roleA -> FALSE
      expect(hasPermission(effective, bitFromPosition(2))).toBe(false);
      // Bit 4: allowed by @everyone -> TRUE
      expect(hasPermission(effective, bitFromPosition(4))).toBe(true);
      // Bit 5: allowed by roleA -> TRUE
      expect(hasPermission(effective, bitFromPosition(5))).toBe(true);
    });

    it("should short-circuit everything when base mask has ADMINISTRATOR", () => {
      const adminRole: RoleInput = {
        id: createRoleId("role_admin"),
        permissions: ADMINISTRATOR_BIT,
      };

      const scopes: ScopeLevel[] = [
        {
          scopeId: "secret_channel",
          overwrites: [
            {
              targetId: "@everyone",
              type: "everyone",
              deny: bitFromPosition(1) | bitFromPosition(2),
              allow: 0n,
            },
            {
              targetId: memberId,
              type: "member",
              deny: bitFromPosition(1) | bitFromPosition(3),
              allow: 0n,
            },
          ],
        },
      ];

      const effective = evaluateEffectivePermissions({
        memberId,
        roles: [adminRole],
        scopes,
      });

      // Administrator bypasses all denies unconditionally
      expect(hasPermission(effective, bitFromPosition(1))).toBe(true);
      expect(hasPermission(effective, bitFromPosition(2))).toBe(true);
      expect(hasPermission(effective, bitFromPosition(999))).toBe(true);
      expect(hasAnyPermission(effective, bitFromPosition(100))).toBe(true);
    });

    it("should short-circuit subsequent scopes if an intermediate scope overwrite grants ADMINISTRATOR", () => {
      const regularRole: RoleInput = {
        id: createRoleId("role_normal"),
        permissions: bitFromPosition(1),
      };

      const scopes: ScopeLevel[] = [
        {
          scopeId: "scope_grants_admin",
          overwrites: [
            {
              targetId: memberId,
              type: "member",
              deny: 0n,
              allow: ADMINISTRATOR_BIT,
            },
          ],
        },
        {
          scopeId: "subsequent_scope_denies_all",
          overwrites: [
            {
              targetId: memberId,
              type: "member",
              deny: bitFromPosition(1),
              allow: 0n,
            },
          ],
        },
      ];

      const effective = evaluateEffectivePermissions({
        memberId,
        roles: [regularRole],
        scopes,
      });

      expect(hasPermission(effective, bitFromPosition(1))).toBe(true);
      expect(hasAnyPermission(effective, bitFromPosition(50))).toBe(true);
    });

    it("should evaluate hasAnyPermission correctly when ADMINISTRATOR is not held", () => {
      const nonAdminMask = bitFromPosition(2) | bitFromPosition(3);
      expect(hasAnyPermission(nonAdminMask, bitFromPosition(2))).toBe(true);
      expect(hasAnyPermission(nonAdminMask, bitFromPosition(10))).toBe(false);
    });
  });

  // Category 2: Boundary & Input Fuzzing
  describe("Category 2: Boundary & Input Fuzzing", () => {
    it("should handle member with no roles returning 0n", () => {
      const effective = evaluateEffectivePermissions({
        memberId,
        roles: [],
      });
      expect(effective).toBe(0n);
    });

    it("should evaluate a maximum hierarchy depth of 4 scopes cleanly", () => {
      const scopes: ScopeLevel[] = [
        { scopeId: "org", overwrites: [] },
        { scopeId: "workspace", overwrites: [] },
        { scopeId: "project", overwrites: [] },
        {
          scopeId: "channel",
          overwrites: [
            {
              targetId: memberId,
              type: "member",
              allow: bitFromPosition(10),
              deny: 0n,
            },
          ],
        },
      ];

      const effective = evaluateEffectivePermissions({
        memberId,
        roles: [roleA],
        scopes,
      });

      expect(hasPermission(effective, bitFromPosition(10))).toBe(true);
    });

    it("should combine denies and allows across multiple roles held by member in same scope", () => {
      // User holds roleA and roleB
      const scopes: ScopeLevel[] = [
        {
          scopeId: "channel_multi_role",
          overwrites: [
            {
              targetId: "role_a",
              type: "role",
              deny: bitFromPosition(1),
              allow: bitFromPosition(4),
            },
            {
              targetId: "role_b",
              type: "role",
              deny: bitFromPosition(2),
              allow: bitFromPosition(5),
            },
          ],
        },
      ];

      const effective = evaluateEffectivePermissions({
        memberId,
        roles: [roleA, roleB],
        scopes,
      });

      expect(hasPermission(effective, bitFromPosition(1))).toBe(false); // denied by roleA
      expect(hasPermission(effective, bitFromPosition(2))).toBe(false); // denied by roleB
      expect(hasPermission(effective, bitFromPosition(3))).toBe(true); // untouched from roleB
      expect(hasPermission(effective, bitFromPosition(4))).toBe(true); // allowed by roleA
      expect(hasPermission(effective, bitFromPosition(5))).toBe(true); // allowed by roleB
    });
  });

  // Category 3: Concurrency, Ordering & Idempotency
  describe("Category 3: Concurrency, Ordering & Idempotency", () => {
    it("should produce identical effective permissions regardless of role order", () => {
      const effective1 = evaluateEffectivePermissions({
        memberId,
        roles: [roleA, roleB],
      });
      const effective2 = evaluateEffectivePermissions({
        memberId,
        roles: [roleB, roleA],
      });

      expect(effective1).toBe(effective2);
    });

    it("should be a pure function with zero mutations", () => {
      const rolesCopy = [{ ...roleA }, { ...roleB }];
      evaluateEffectivePermissions({ memberId, roles: rolesCopy });
      expect(rolesCopy[0]?.permissions).toBe(roleA.permissions);
    });
  });

  // Category 4: Failure & Fault Injection
  describe("Category 4: Failure & Fault Injection", () => {
    it("should throw BadRequestError when scope hierarchy depth exceeds 4 levels", () => {
      const fiveScopes: ScopeLevel[] = [
        { scopeId: "s1", overwrites: [] },
        { scopeId: "s2", overwrites: [] },
        { scopeId: "s3", overwrites: [] },
        { scopeId: "s4", overwrites: [] },
        { scopeId: "s5", overwrites: [] },
      ];

      expect(() =>
        evaluateEffectivePermissions({
          memberId,
          roles: [roleA],
          scopes: fiveScopes,
        }),
      ).toThrowError(/scope depth cannot exceed 4/i);
    });
  });

  // Category 5: Security & Abuse Cases
  describe("Category 5: Security & Abuse Cases", () => {
    it("should ignore overwrites targeting roles the user does not hold", () => {
      const foreignRoleOverwrite: ScopeLevel = {
        scopeId: "restricted",
        overwrites: [
          {
            targetId: "role_unheld",
            type: "role",
            deny: 0n,
            allow: bitFromPosition(50), // Trying to grant bit 50 through an unheld role!
          },
        ],
      };

      const effective = evaluateEffectivePermissions({
        memberId,
        roles: [roleA],
        scopes: [foreignRoleOverwrite],
      });

      expect(hasPermission(effective, bitFromPosition(50))).toBe(false);
    });

    it("should ignore overwrites targeting other members", () => {
      const otherMemberOverwrite: ScopeLevel = {
        scopeId: "restricted",
        overwrites: [
          {
            targetId: "other_user_456",
            type: "member",
            deny: 0n,
            allow: bitFromPosition(60),
          },
        ],
      };

      const effective = evaluateEffectivePermissions({
        memberId,
        roles: [roleA],
        scopes: [otherMemberOverwrite],
      });

      expect(hasPermission(effective, bitFromPosition(60))).toBe(false);
    });
  });
});
