import { defineRoute } from "@plinth/core";
import { z } from "zod";
import { recordConsentsBatchSchema } from "../domain/compliance.js";

const consentRecordSchema = z.strictObject({
  id: z.string(),
  tenantId: z.string(),
  userId: z.string(),
  category: z.enum(["essential", "functional", "analytics", "marketing"]),
  status: z.enum(["granted", "revoked"]),
  version: z.string(),
  recordedAt: z.string(),
});

export const getConsentsRoute = defineRoute({
  method: "GET",
  path: "/api/v1/compliance/consents",
  summary: "Get current user consent ledger entries",
  description: "Returns all versioned consent records for the authenticated user",
  responseSchemas: {
    200: z.strictObject({
      consents: z.array(consentRecordSchema),
      preferences: z.strictObject({
        essential: z.boolean(),
        functional: z.boolean(),
        analytics: z.boolean(),
        marketing: z.boolean(),
      }),
    }),
  },
});

export const recordConsentsRoute = defineRoute({
  method: "POST",
  path: "/api/v1/compliance/consents",
  summary: "Record or update consent preferences",
  description: "Appends versioned consent choices to the immutable consent ledger",
  bodySchema: recordConsentsBatchSchema,
  responseSchemas: {
    200: z.strictObject({
      recorded: z.array(consentRecordSchema),
    }),
  },
});

export const exportUserDataRoute = defineRoute({
  method: "POST",
  path: "/api/v1/compliance/export",
  summary: "Self-service user data export (GDPR Art. 20 / India DPDP Sec. 12)",
  description: "Generates and returns structured JSON export of all personal data held for user",
  responseSchemas: {
    200: z.strictObject({
      exportId: z.string(),
      exportedAt: z.string(),
      regulation: z.string(),
      data: z.record(z.string(), z.unknown()),
    }),
  },
});

export const requestErasureRoute = defineRoute({
  method: "POST",
  path: "/api/v1/compliance/erasure",
  summary: "Right to erasure / PII anonymization (GDPR Art. 17 / India DPDP Sec. 12)",
  description:
    "Anonymizes user personal data while preserving financial and tax audit records under statutory exemptions",
  responseSchemas: {
    200: z.strictObject({
      userId: z.string(),
      anonymizedAt: z.string(),
      financialRecordsPreserved: z.boolean(),
      exemptionsApplied: z.array(z.string()),
    }),
  },
});
