import type { EmailPort } from "@plinth/core";
import { describe, expect, it } from "vitest";

export interface EmailContractSuiteOptions {
  readonly adapterName: string;
  readonly createAdapter: () => Promise<EmailPort> | EmailPort;
  readonly cleanup?: () => Promise<void> | void;
}

export function runEmailContractTests(suiteOptions: EmailContractSuiteOptions): void {
  const { adapterName, createAdapter, cleanup } = suiteOptions;

  describe(`${adapterName} - Email Adapter Contract Tests`, () => {
    it("should send email to single string recipient and return messageId and accepted list", async () => {
      const emailAdapter = await createAdapter();

      const result = await emailAdapter.sendEmail({
        from: "noreply@plinth.dev",
        to: "user@example.com",
        subject: "Welcome to Plinth",
        text: "Thanks for joining us!",
        html: "<p>Thanks for joining us!</p>",
      });

      expect(result.messageId).toBeDefined();
      expect(result.messageId.length).toBeGreaterThan(0);
      expect(result.accepted).toContain("user@example.com");
      expect(result.rejected).toHaveLength(0);

      if (cleanup) await cleanup();
    });

    it("should send email to recipient objects and multiple recipients", async () => {
      const emailAdapter = await createAdapter();

      const result = await emailAdapter.sendEmail({
        from: { email: "team@plinth.dev", name: "Plinth Team" },
        to: [
          { email: "alice@example.com", name: "Alice" },
          { email: "bob@example.com", name: "Bob" },
        ],
        subject: "Team Announcement",
        text: "Release v1 is out!",
      });

      expect(result.messageId).toBeDefined();
      expect(result.accepted).toContain("alice@example.com");
      expect(result.accepted).toContain("bob@example.com");

      if (cleanup) await cleanup();
    });

    it("should reject emails with CRLF injection in subject or recipient", async () => {
      const emailAdapter = await createAdapter();

      await expect(
        emailAdapter.sendEmail({
          from: "noreply@plinth.dev",
          to: "user@example.com\r\nBcc: evil@attacker.com",
          subject: "Test",
          text: "Body",
        }),
      ).rejects.toThrow("CRLF injection detected");

      await expect(
        emailAdapter.sendEmail({
          from: "noreply@plinth.dev",
          to: "user@example.com",
          subject: "Injected\nSubject",
          text: "Body",
        }),
      ).rejects.toThrow("CRLF injection detected");

      if (cleanup) await cleanup();
    });
  });
}
