import { createHash } from "node:crypto";
import {
  BadRequestError,
  generateUuidV7,
  type StoragePort,
  type TenantContext,
} from "@plinth/core";
import type { UserRepositoryPort } from "@plinth/modules-users";
import type {
  CompliancePackType,
  ConsentCategory,
  ConsentRecord,
  ErasureResult,
  RecordConsentInput,
  UserDataExport,
} from "../domain/compliance.js";
import type { ComplianceRepositoryPort } from "../ports/repository.js";

export interface AuditLogReader {
  query(
    ctx: TenantContext,
    params: { actorId?: string },
  ): Promise<
    Array<{
      action: string;
      timestamp: Date;
      ipAddress?: string | undefined;
    }>
  >;
}

export interface ComplianceServiceDependencies {
  readonly repository: ComplianceRepositoryPort;
  readonly userRepository: UserRepositoryPort;
  readonly storage?: StoragePort | undefined;
  readonly auditReader?: AuditLogReader | undefined;
  readonly packType?: CompliancePackType | undefined;
}

export class ComplianceService {
  private readonly repository: ComplianceRepositoryPort;
  private readonly userRepository: UserRepositoryPort;
  private readonly storage?: StoragePort | undefined;
  private readonly auditReader?: AuditLogReader | undefined;
  private readonly packType: CompliancePackType;

  constructor(deps: ComplianceServiceDependencies) {
    this.repository = deps.repository;
    this.userRepository = deps.userRepository;
    this.storage = deps.storage;
    this.auditReader = deps.auditReader;
    this.packType = deps.packType ?? "both";
  }

  getPackType(): CompliancePackType {
    return this.packType;
  }

  async recordConsents(
    ctx: TenantContext,
    userId: string,
    inputs: RecordConsentInput[],
    meta?: { ip?: string; userAgent?: string },
  ): Promise<ConsentRecord[]> {
    const recorded: ConsentRecord[] = [];

    for (const input of inputs) {
      if (input.category === "essential" && input.status === "revoked") {
        throw new BadRequestError("Essential consent cannot be revoked");
      }

      const record: ConsentRecord = {
        id: generateUuidV7(),
        tenantId: ctx.tenantId,
        userId,
        category: input.category,
        status: input.status,
        version: input.version,
        ipAddress: meta?.ip,
        userAgent: meta?.userAgent,
        recordedAt: new Date(),
      };

      await this.repository.recordConsent(ctx, record);
      recorded.push(record);
    }

    return recorded;
  }

  async getConsents(ctx: TenantContext, userId: string): Promise<ConsentRecord[]> {
    return this.repository.getConsents(ctx, userId);
  }

  async getLatestConsentMap(
    ctx: TenantContext,
    userId: string,
  ): Promise<Record<ConsentCategory, boolean>> {
    return this.repository.getLatestConsentMap(ctx, userId);
  }

  async exportUserData(ctx: TenantContext, userId: string): Promise<UserDataExport> {
    const profile = await this.userRepository.getById(ctx, userId);
    const consents = await this.repository.getConsents(ctx, userId);

    const auditEvents: Array<{ action: string; timestamp: string; ipAddress?: string }> = [];
    if (this.auditReader) {
      const rawEvents = await this.auditReader.query(ctx, { actorId: userId });
      for (const e of rawEvents) {
        auditEvents.push({
          action: e.action,
          timestamp: e.timestamp.toISOString(),
          ...(e.ipAddress !== undefined ? { ipAddress: e.ipAddress } : {}),
        });
      }
    }

    const regulation =
      this.packType === "gdpr"
        ? "GDPR Article 20 (Right to data portability)"
        : this.packType === "india-dpdp"
          ? "India DPDP Act 2023 Section 12 (Right to access information about personal data)"
          : "GDPR Article 20 & India DPDP Act 2023 Section 12";

    return {
      exportId: generateUuidV7(),
      exportedAt: new Date().toISOString(),
      regulation,
      tenantId: ctx.tenantId,
      userId,
      profile: profile ? (profile as unknown as Record<string, unknown>) : {},
      consents,
      auditEvents,
    };
  }

  async requestErasure(ctx: TenantContext, userId: string): Promise<ErasureResult> {
    const profile = await this.userRepository.getById(ctx, userId);

    // 1. Delete stored avatar if managed locally
    if (profile?.avatarUrl && this.storage) {
      if (profile.avatarUrl.startsWith("storage://")) {
        const key = profile.avatarUrl.replace("storage://", "");
        try {
          await this.storage.deleteObject({ key });
        } catch {
          // Ignore
        }
      }
    }

    // 2. Anonymize user personal data in UserRepository
    const hash = createHash("sha256")
      .update(`${userId}-${ctx.tenantId}-${Date.now()}`)
      .digest("hex")
      .slice(0, 16);
    const surrogateEmail = `erased-${hash}@erased.plinth.internal`;

    await this.userRepository.anonymize(ctx, userId, surrogateEmail);

    // 3. Revoke optional consents in consent ledger
    const revocations: RecordConsentInput[] = [
      { category: "functional", status: "revoked", version: "erasure-v1" },
      { category: "analytics", status: "revoked", version: "erasure-v1" },
      { category: "marketing", status: "revoked", version: "erasure-v1" },
    ];
    await this.recordConsents(ctx, userId, revocations);

    // 4. Return statutory completion statement
    const exemptionsApplied = [
      "GDPR Article 17(3)(b) (Compliance with statutory legal and tax audit obligations)",
      "India DPDP Act 2023 Section 17(2) (Prevention, detection and investigation of financial offences)",
    ];

    return {
      userId,
      anonymizedAt: new Date().toISOString(),
      financialRecordsPreserved: true,
      exemptionsApplied,
    };
  }
}
