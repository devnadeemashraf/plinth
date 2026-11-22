import { assertTenantContext, type TenantContext } from "@plinth/core";
import type { ConsentCategory, ConsentRecord } from "../domain/compliance.js";
import type { ComplianceRepositoryPort } from "../ports/repository.js";

export class InMemoryComplianceRepository implements ComplianceRepositoryPort {
  private readonly records: ConsentRecord[] = [];

  async recordConsent(ctx: TenantContext, consent: ConsentRecord): Promise<ConsentRecord> {
    assertTenantContext(ctx);
    this.records.push(consent);
    return consent;
  }

  async getConsents(ctx: TenantContext, userId: string): Promise<ConsentRecord[]> {
    assertTenantContext(ctx);
    return this.records.filter((r) => r.tenantId === ctx.tenantId && r.userId === userId);
  }

  async getLatestConsentMap(
    ctx: TenantContext,
    userId: string,
  ): Promise<Record<ConsentCategory, boolean>> {
    assertTenantContext(ctx);
    const userRecords = await this.getConsents(ctx, userId);

    const result: Record<ConsentCategory, boolean> = {
      essential: true, // Essential is always true
      functional: false,
      analytics: false,
      marketing: false,
    };

    // Sort ascending by recordedAt so latest updates take precedence
    const sorted = [...userRecords].sort((a, b) => a.recordedAt.getTime() - b.recordedAt.getTime());

    for (const record of sorted) {
      if (record.category !== "essential") {
        result[record.category] = record.status === "granted";
      }
    }

    return result;
  }

  clear(): void {
    this.records.length = 0;
  }
}
