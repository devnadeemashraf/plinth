import { BadRequestError } from "@/errors/app-error.js";
import { bitFromPosition, hasBit } from "@/rbac/bitmask.js";

export interface PermissionDefinition {
  readonly name: string;
  readonly bit: bigint;
  readonly position: number;
  readonly description: string;
  readonly isSystem: boolean;
}

export const ADMINISTRATOR_BIT = bitFromPosition(0);

export type CorePermissionName =
  | "ADMINISTRATOR"
  | "VIEW_AUDIT_LOGS"
  | "MANAGE_TENANT"
  | "MANAGE_ROLES"
  | "MANAGE_MEMBERS"
  | "MANAGE_SETTINGS"
  | "MANAGE_WEBHOOKS"
  | "MANAGE_INTEGRATIONS"
  | "VIEW_ANALYTICS"
  | "MANAGE_BILLING";

export const CORE_PERMISSIONS: Readonly<Record<CorePermissionName, PermissionDefinition>> =
  Object.freeze({
    ADMINISTRATOR: {
      name: "ADMINISTRATOR",
      bit: ADMINISTRATOR_BIT,
      position: 0,
      description: "Universal administrative bypass; grants all permissions across all resources",
      isSystem: true,
    },
    VIEW_AUDIT_LOGS: {
      name: "VIEW_AUDIT_LOGS",
      bit: bitFromPosition(1),
      position: 1,
      description: "View tenant audit logs and security traces",
      isSystem: true,
    },
    MANAGE_TENANT: {
      name: "MANAGE_TENANT",
      bit: bitFromPosition(2),
      position: 2,
      description: "Update tenant profile, quotas, and configuration",
      isSystem: true,
    },
    MANAGE_ROLES: {
      name: "MANAGE_ROLES",
      bit: bitFromPosition(3),
      position: 3,
      description: "Create, edit, assign, and delete roles within rank hierarchy bounds",
      isSystem: true,
    },
    MANAGE_MEMBERS: {
      name: "MANAGE_MEMBERS",
      bit: bitFromPosition(4),
      position: 4,
      description: "Invite, update, and remove members from the tenant",
      isSystem: true,
    },
    MANAGE_SETTINGS: {
      name: "MANAGE_SETTINGS",
      bit: bitFromPosition(5),
      position: 5,
      description: "Modify tenant domain settings and preferences",
      isSystem: true,
    },
    MANAGE_WEBHOOKS: {
      name: "MANAGE_WEBHOOKS",
      bit: bitFromPosition(6),
      position: 6,
      description: "Create and manage outbound webhook subscriptions",
      isSystem: true,
    },
    MANAGE_INTEGRATIONS: {
      name: "MANAGE_INTEGRATIONS",
      bit: bitFromPosition(7),
      position: 7,
      description: "Connect and configure third-party platform integrations",
      isSystem: true,
    },
    VIEW_ANALYTICS: {
      name: "VIEW_ANALYTICS",
      bit: bitFromPosition(8),
      position: 8,
      description: "Access usage metrics and reporting dashboards",
      isSystem: true,
    },
    MANAGE_BILLING: {
      name: "MANAGE_BILLING",
      bit: bitFromPosition(9),
      position: 9,
      description: "View and modify subscriptions, payment methods, and invoices",
      isSystem: true,
    },
  });

export class PermissionRegistry {
  readonly #byName = new Map<string, PermissionDefinition>();
  readonly #byPosition = new Map<number, PermissionDefinition>();

  constructor() {
    for (const perm of Object.values(CORE_PERMISSIONS)) {
      this.#byName.set(perm.name, perm);
      this.#byPosition.set(perm.position, perm);
    }
  }

  get(name: string): PermissionDefinition | undefined {
    return this.#byName.get(name.trim());
  }

  getByPosition(position: number): PermissionDefinition | undefined {
    return this.#byPosition.get(position);
  }

  getAll(): readonly PermissionDefinition[] {
    return Array.from(this.#byName.values());
  }

  /**
   * Registers a custom product permission.
   * Product permissions MUST use bit positions >= 64 (bits 0..63 are reserved for core system).
   */
  registerProductPermission(input: {
    name: string;
    position: number;
    description?: string | undefined;
  }): PermissionDefinition {
    const name = input.name.trim();
    if (input.position < 64) {
      throw new Error(
        `Invalid bit position ${input.position}. Bits 0..63 are reserved for core system permissions. Product permissions must start at bit 64 or higher.`,
      );
    }

    if (this.#byName.has(name)) {
      throw new Error(`Permission '${name}' already exists in registry`);
    }

    if (this.#byPosition.has(input.position)) {
      throw new Error(`Bit position ${input.position} is already assigned`);
    }

    const def: PermissionDefinition = {
      name,
      bit: bitFromPosition(input.position),
      position: input.position,
      description: input.description ?? "",
      isSystem: false,
    };

    this.#byName.set(name, def);
    this.#byPosition.set(input.position, def);
    return def;
  }

  namesToMask(names: readonly string[]): bigint {
    let mask = 0n;
    for (const raw of names) {
      const name = raw.trim();
      const def = this.#byName.get(name);
      if (!def) {
        throw new BadRequestError(`Unknown permission: '${name}'`, {
          code: "UNKNOWN_PERMISSION",
        });
      }
      mask |= def.bit;
    }
    return mask;
  }

  maskToNames(mask: bigint): string[] {
    if (mask === 0n) {
      return [];
    }
    const result: string[] = [];
    for (const perm of this.#byName.values()) {
      if (hasBit(mask, perm.bit)) {
        result.push(perm.name);
      }
    }
    return result;
  }
}

export const defaultPermissionRegistry = new PermissionRegistry();
