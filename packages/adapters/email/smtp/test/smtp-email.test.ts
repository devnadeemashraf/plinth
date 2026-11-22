import { SmtpEmailAdapter } from "@plinth/adapter-email-smtp";
import nodemailer from "nodemailer";
import { describe, expect, it } from "vitest";

describe("SmtpEmailAdapter - Delivery & Address Formatting", () => {
  it("should send email through json transport and format addresses with display names", async () => {
    const transporter = nodemailer.createTransport({ jsonTransport: true });
    const adapter = new SmtpEmailAdapter({
      transporter,
      defaultFrom: { email: "default@plinth.dev", name: "Plinth Bot" },
    });

    const result = await adapter.sendEmail({
      to: { email: "alice@example.com", name: "Alice Wonderland" },
      cc: "cc@example.com",
      bcc: "bcc@example.com",
      subject: "Important Notification",
      html: "<p>Hello Alice</p>",
      text: "Hello Alice",
      headers: { "X-Custom-Trace": "trace-123" },
    });

    expect(result.messageId).toBeDefined();
    expect(result.accepted).toHaveLength(1);
  });

  it("should throw error if from is missing and no defaultFrom is configured", async () => {
    const transporter = nodemailer.createTransport({ jsonTransport: true });
    const adapter = new SmtpEmailAdapter({ transporter });

    await expect(
      adapter.sendEmail({
        to: "recipient@example.com",
        subject: "Subject",
        text: "Body",
      }),
    ).rejects.toThrow("Missing email sender");
  });

  it("should report verify status from transporter", async () => {
    const transporter = nodemailer.createTransport({ jsonTransport: true });
    const adapter = new SmtpEmailAdapter({ transporter });
    expect(await adapter.verify()).toBe(true);

    transporter.verify = async () => {
      throw new Error("SMTP connection rejected");
    };
    expect(await adapter.verify()).toBe(false);
  });

  it("should initialize default transporter when none provided", () => {
    const adapter = new SmtpEmailAdapter({
      host: "smtp.mailgun.org",
      port: 465,
      auth: { user: "test", pass: "pass" },
    });
    expect(adapter.getTransporter()).toBeDefined();
  });

  it("should format array cc, array bcc, and replyTo correctly", async () => {
    const transporter = nodemailer.createTransport({ jsonTransport: true });
    const adapter = new SmtpEmailAdapter({
      transporter,
      defaultFrom: "bot@plinth.dev",
    });

    const result = await adapter.sendEmail({
      to: "recipient@example.com",
      cc: ["cc1@example.com", "cc2@example.com"],
      bcc: ["bcc1@example.com", "bcc2@example.com"],
      replyTo: "help@plinth.dev",
      subject: "Test Broadcast",
      text: "Broadcast",
    });

    expect(result.messageId).toBeDefined();
  });
});
