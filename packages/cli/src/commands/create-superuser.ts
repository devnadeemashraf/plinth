import {
  ADMINISTRATOR_BIT,
  BadRequestError,
  ConflictError,
  createRoleId,
  createTenantContext,
  createTenantId,
  createUserId,
  encryptEnvelope,
  generateRecoveryCodes,
  generateTotpSecret,
  generateUuidV7,
  hasBit,
  hashPassword,
  normalizeEmail,
  normalizeUsername,
  validateMasterKeyEntropy,
  validatePasswordStrength,
} from "@plinth/core";
import type { AuthRepositoryPort, User } from "@plinth/modules-auth";
import type { Role, RoleRepositoryPort } from "@plinth/modules-rbac";
import { z } from "zod";

export interface CreateSuperuserOptions {
  readonly email: string;
  readonly password: string;
  readonly username?: string | undefined;
  readonly tenantId?: string | undefined;
  readonly authRepo: AuthRepositoryPort;
  readonly roleRepo: RoleRepositoryPort;
  readonly masterKey: Buffer | Uint8Array;
}

export interface CreateSuperuserResult {
  readonly userId: string;
  readonly email: string;
  readonly tenantId: string;
  readonly totpSecret: string;
  readonly otpauthUri: string;
  readonly recoveryCodes: readonly string[];
}

const emailValidator = z.string().email();

export async function createSuperuser(
  options: CreateSuperuserOptions,
): Promise<CreateSuperuserResult> {
  const { authRepo, roleRepo, masterKey } = options;

  // Validate master encryption key entropy
  validateMasterKeyEntropy(masterKey);

  // Validate and normalize email
  const emailParse = emailValidator.safeParse(options.email?.trim());
  if (!emailParse.success) {
    throw new BadRequestError("Invalid email format provided for super user.", {
      code: "INVALID_EMAIL",
    });
  }
  const normalizedEmail = normalizeEmail(emailParse.data);

  // Validate and normalize username if provided
  let normalizedUsername: string | undefined;
  if (options.username && options.username.trim().length > 0) {
    normalizedUsername = normalizeUsername(options.username);
  }

  // Validate password strength (throws BadRequestError if invalid)
  validatePasswordStrength(options.password);

  const tenantIdStr = options.tenantId?.trim() || "default_tenant";
  const tenantCtx = createTenantContext(createTenantId(tenantIdStr));

  // Check for duplicate email
  const existingByEmail = await authRepo.findUserByEmail(tenantCtx, normalizedEmail);
  if (existingByEmail) {
    throw new ConflictError(
      `A user with email '${normalizedEmail}' already exists in tenant '${tenantIdStr}'.`,
      { code: "USER_ALREADY_EXISTS" },
    );
  }

  // Check for duplicate username if provided
  if (normalizedUsername) {
    const existingByUsername = await authRepo.findUserByUsername(tenantCtx, normalizedUsername);
    if (existingByUsername) {
      throw new ConflictError(
        `A user with username '${normalizedUsername}' already exists in tenant '${tenantIdStr}'.`,
        { code: "USERNAME_ALREADY_EXISTS" },
      );
    }
  }

  // Hash password with Argon2id
  const passwordHash = await hashPassword(options.password);

  // Generate TOTP Secret and Recovery Codes
  const { secret, uri } = generateTotpSecret("Plinth Superuser", normalizedEmail);
  const encryptedSecret = encryptEnvelope(secret, masterKey);
  const { plaintextCodes } = generateRecoveryCodes(8);

  const userId = createUserId(generateUuidV7());
  const now = new Date().toISOString();

  const user: User = {
    id: userId,
    tenantId: tenantCtx.tenantId,
    email: normalizedEmail,
    ...(normalizedUsername ? { username: normalizedUsername } : {}),
    emailVerified: true,
    passwordHash,
    totpSecretEncrypted: encryptedSecret,
    totpEnabled: true,
    status: "active",
    createdAt: now,
    updatedAt: now,
  };

  await authRepo.createUser(tenantCtx, user);

  // Ensure Administrator role exists and assign to super user
  const roles = await roleRepo.listRoles(tenantCtx);
  let adminRole = roles.find((r) => {
    const mask = typeof r.permissions === "bigint" ? r.permissions : BigInt(r.permissions);
    return hasBit(mask, ADMINISTRATOR_BIT);
  });

  if (!adminRole) {
    const newRole: Role = {
      id: createRoleId(generateUuidV7()),
      tenantId: tenantCtx.tenantId,
      name: "Administrator",
      permissions: ADMINISTRATOR_BIT,
      position: 100,
      isSystem: true,
      metadata: {
        badgeLabel: "Super Admin",
        colorHex: "#dc2626",
        description: "Universal administrative bypass",
      },
      createdAt: now,
      updatedAt: now,
    };
    await roleRepo.createRole(newRole, tenantCtx);
    adminRole = newRole;
  }

  await roleRepo.assignRoleToMember(tenantCtx.tenantId, user.id, adminRole.id, tenantCtx);

  return {
    userId: user.id,
    email: normalizedEmail,
    tenantId: tenantIdStr,
    totpSecret: secret,
    otpauthUri: uri,
    recoveryCodes: plaintextCodes,
  };
}
