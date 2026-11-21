import { describe, expect, it } from "vitest";
import { isErr, isOk } from "@/primitives/result.js";
import { bitFromPosition } from "@/rbac/bitmask.js";
import { assertCanManageRole, canManageRole } from "@/rbac/hierarchy.js";
import { ADMINISTRATOR_BIT } from "@/rbac/registry.js";

describe("RBAC / Rank Hierarchy & Anti-Escalation Invariant (5-Category TDD)", () => {
  const actor = {
    userId: "actor_1",
    highestPosition: 80, // e.g. Admin rank
    effectivePermissions: bitFromPosition(1) | bitFromPosition(2) | bitFromPosition(3),
  };

  const targetRole = {
    id: "role_member",
    position: 40,
    permissions: bitFromPosition(1) | bitFromPosition(2),
  };

  // Category 1: Happy Path
  describe("Category 1: Happy Path", () => {
    it("should allow actor with higher position to manage lower position role when permissions are a subset", () => {
      const result = canManageRole(actor, targetRole);
      expect(isOk(result)).toBe(true);
      expect(() => assertCanManageRole(actor, targetRole)).not.toThrow();
    });

    it("should allow updating target role if new position is still strictly lower and new permissions are held", () => {
      const result = canManageRole(actor, targetRole, {
        position: 50, // strictly < 80
        permissions: bitFromPosition(1) | bitFromPosition(3), // held by actor
      });
      expect(isOk(result)).toBe(true);
    });

    it("should allow actor with ADMINISTRATOR to grant any permission as long as position is strictly lower", () => {
      const adminActor = {
        userId: "admin_super",
        highestPosition: 90,
        effectivePermissions: ADMINISTRATOR_BIT,
      };

      const result = canManageRole(adminActor, targetRole, {
        permissions: bitFromPosition(120), // Arbitrary high permission
      });
      expect(isOk(result)).toBe(true);
    });
  });

  // Category 2: Boundary & Input Fuzzing
  describe("Category 2: Boundary & Input Fuzzing", () => {
    it("should handle actor and target with 0n permissions cleanly", () => {
      const zeroActor = {
        userId: "zero_actor",
        highestPosition: 10,
        effectivePermissions: 0n,
      };
      const zeroTarget = {
        id: "role_empty",
        position: 5,
        permissions: 0n,
      };

      expect(isOk(canManageRole(zeroActor, zeroTarget))).toBe(true);
    });

    it("should reject when actor position is exactly equal to target role position", () => {
      const peerTarget = {
        id: "peer_role",
        position: 80, // equal to actor position 80!
        permissions: bitFromPosition(1),
      };

      const result = canManageRole(actor, peerTarget);
      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        expect(result.error.message).toMatch(/equal or higher position/i);
      }
    });
  });

  // Category 3: Concurrency, Ordering & Idempotency
  describe("Category 3: Concurrency, Ordering & Idempotency", () => {
    it("should evaluate identically across multiple calls (pure function)", () => {
      const res1 = canManageRole(actor, targetRole);
      const res2 = canManageRole(actor, targetRole);
      expect(res1).toEqual(res2);
    });
  });

  // Category 4: Failure & Fault Injection
  describe("Category 4: Failure & Fault Injection", () => {
    it("should throw ForbiddenError when assertCanManageRole fails", () => {
      const higherTarget = {
        id: "owner_role",
        position: 100, // higher than actor position 80!
        permissions: bitFromPosition(1),
      };

      expect(() => assertCanManageRole(actor, higherTarget)).toThrowError(
        /equal or higher position/i,
      );
    });
  });

  // Category 5: Security & Abuse Cases (Anti-Escalation Checks)
  describe("Category 5: Security & Abuse Cases", () => {
    it("should BLOCK privilege escalation when target role contains even a single unheld permission bit", () => {
      const unheldBitTarget = {
        id: "escalated_role",
        position: 20,
        // Bit 1 is held, but Bit 10 is NOT held by actor!
        permissions: bitFromPosition(1) | bitFromPosition(10),
      };

      const result = canManageRole(actor, unheldBitTarget);
      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        expect(result.error.message).toMatch(/cannot (?:grant|manage).*permissions not held/i);
      }
    });

    it("should BLOCK updating role position to equal or higher than actor position", () => {
      const updateResult = canManageRole(actor, targetRole, {
        position: 80, // Actor is 80 -> trying to elevate role to 80!
      });

      expect(isErr(updateResult)).toBe(true);
      if (isErr(updateResult)) {
        expect(updateResult.error.message).toMatch(/cannot elevate role position/i);
      }

      const updateResultHigher = canManageRole(actor, targetRole, {
        position: 85, // Actor is 80 -> trying to elevate role to 85!
      });
      expect(isErr(updateResultHigher)).toBe(true);
    });

    it("should BLOCK actor from managing a role with higher position even if actor has ADMINISTRATOR", () => {
      const adminActor = {
        userId: "admin_user",
        highestPosition: 80,
        effectivePermissions: ADMINISTRATOR_BIT,
      };

      const ownerRole = {
        id: "owner_role",
        position: 100, // higher than 80!
        permissions: bitFromPosition(1),
      };

      // Rank check is non-negotiable, even for an Administrator!
      const result = canManageRole(adminActor, ownerRole);
      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        expect(result.error.message).toMatch(/equal or higher position/i);
      }
    });

    it("should BLOCK actor without ADMINISTRATOR from granting ADMINISTRATOR bit", () => {
      const escalateAdmin = canManageRole(actor, targetRole, {
        permissions: ADMINISTRATOR_BIT,
      });

      expect(isErr(escalateAdmin)).toBe(true);
      if (isErr(escalateAdmin)) {
        expect(escalateAdmin.error.message).toMatch(/cannot grant permissions not held/i);
      }
    });
  });
});
