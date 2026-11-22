import { z } from "zod";

export type CompliancePackType = "none" | "gdpr" | "india-dpdp" | "both";

export type ConsentCategory = "essential" | "functional" | "analytics" | "marketing";

export type ConsentStatus = "granted" | "revoked";

export interface ConsentRecord {
  readonly id: string;
  readonly tenantId: string;
  readonly userId: string;
  readonly category: ConsentCategory;
  readonly status: ConsentStatus;
  readonly version: string;
  readonly ipAddress?: string | undefined;
  readonly userAgent?: string | undefined;
  readonly recordedAt: Date;
}

export const recordConsentSchema = z.strictObject({
  category: z.enum(["essential", "functional", "analytics", "marketing"]),
  status: z.enum(["granted", "revoked"]),
  version: z.string().trim().min(1).max(20),
});

export const recordConsentsBatchSchema = z.strictObject({
  consents: z.array(recordConsentSchema).min(1).max(10),
});

export type RecordConsentInput = z.infer<typeof recordConsentSchema>;
export type RecordConsentsBatchInput = z.infer<typeof recordConsentsBatchSchema>;

export interface UserDataExport {
  readonly exportId: string;
  readonly exportedAt: string;
  readonly regulation: string;
  readonly tenantId: string;
  readonly userId: string;
  readonly profile: Record<string, unknown>;
  readonly consents: readonly ConsentRecord[];
  readonly auditEvents: ReadonlyArray<{
    readonly action: string;
    readonly timestamp: string;
    readonly ipAddress?: string | undefined;
  }>;
}

export interface ErasureResult {
  readonly userId: string;
  readonly anonymizedAt: string;
  readonly financialRecordsPreserved: boolean;
  readonly exemptionsApplied: readonly string[];
}
