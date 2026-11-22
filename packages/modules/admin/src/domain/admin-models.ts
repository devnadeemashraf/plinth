import type { TenantId, UserId } from "@plinth/core";
import type { AuditLogEntry } from "@plinth/modules-audit";
import type { Role } from "@plinth/modules-rbac";
import type { Tenant } from "@plinth/modules-tenants";

export interface AdminSession {
  readonly id: string;
  readonly userId: UserId;
  readonly email: string;
  readonly tenantId: TenantId;
  readonly csrfToken: string;
  readonly expiresAt: string;
  readonly createdAt: string;
}

export interface DashboardViewModel {
  readonly uptimeSec: number;
  readonly nodeVersion: string;
  readonly memoryMb: number;
  readonly tenantCount: number;
  readonly userCount: number;
  readonly roleCount: number;
  readonly auditEventCount: number;
  readonly dbHealthy: boolean;
}

export interface AuthFlagItem {
  readonly key: string;
  readonly enabled: boolean;
  readonly description?: string | undefined;
}

export interface AuthSecretItem {
  readonly key: string;
  readonly maskedValue: string;
  readonly description?: string | undefined;
}

export interface AuthConfigViewModel {
  readonly flags: readonly AuthFlagItem[];
  readonly secrets: readonly AuthSecretItem[];
}

export interface RbacViewModel {
  readonly roles: readonly Role[];
  readonly allowCustomRoles: boolean;
}

export interface TenantsViewModel {
  readonly tenants: readonly Tenant[];
}

export interface BillingInvoiceItem {
  readonly id: string;
  readonly customerId: string;
  readonly amount: number;
  readonly currency: string;
  readonly status: string;
  readonly createdAt: string;
}

export interface BillingSubscriptionItem {
  readonly id: string;
  readonly customerId: string;
  readonly planId: string;
  readonly status: string;
  readonly currentPeriodEnd: string;
}

export interface BillingViewModel {
  readonly isStub: boolean;
  readonly subscriptions: readonly BillingSubscriptionItem[];
  readonly invoices: readonly BillingInvoiceItem[];
}

export interface OutboxJobItem {
  readonly id: string;
  readonly eventType: string;
  readonly status: "pending" | "processing" | "completed" | "failed";
  readonly retryCount: number;
  readonly lastError?: string | undefined;
  readonly createdAt: string;
}

export interface CaughtEmailItem {
  readonly id: string;
  readonly to: string;
  readonly subject: string;
  readonly sentAt: string;
  readonly html?: string | undefined;
}

export interface DevInspectorViewModel {
  readonly auditLogs: readonly AuditLogEntry[];
  readonly outboxJobs: readonly OutboxJobItem[];
  readonly caughtEmails: readonly CaughtEmailItem[];
}
