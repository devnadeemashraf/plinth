import type { TenantContext } from "@plinth/core";
import type { ConsentCategory, ConsentRecord } from "../domain/compliance.js";

export interface ComplianceRepositoryPort {
  recordConsent(ctx: TenantContext, consent: ConsentRecord): Promise<ConsentRecord>;
  getConsents(ctx: TenantContext, userId: string): Promise<ConsentRecord[]>;
  getLatestConsentMap(
    ctx: TenantContext,
    userId: string,
  ): Promise<Record<ConsentCategory, boolean>>;
}
