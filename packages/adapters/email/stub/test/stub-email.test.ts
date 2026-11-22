import { StubEmailAdapter } from "@plinth/adapter-email-stub";
import { describe, expect, it } from "vitest";

describe("StubEmailAdapter - Local Email Catcher Capabilities", () => {
  it("should capture sent emails with rich metadata and retrieve by ID", async () => {
    const stub = new StubEmailAdapter();
    expect(stub.getLatestEmail()).toBeUndefined();
    expect(stub.getEmailById("none")).toBeUndefined();

    const res = await stub.sendEmail({
      from: { email: "sender@example.com", name: "Sender" },
      to: "recipient@example.com",
      cc: "cc1@example.com",
      bcc: ["bcc1@example.com", "bcc2@example.com"],
      replyTo: "support@example.com",
      subject: "Verification Code: 123456",
      html: "<p>Your code is <b>123456</b></p>",
      text: "Your code is 123456",
    });

    expect(stub.count()).toBe(1);

    const caught = stub.getLatestEmail();
    expect(caught?.id).toBe(res.messageId);
    expect(caught?.subject).toBe("Verification Code: 123456");
    expect(caught?.html).toContain("<b>123456</b>");

    const byId = stub.getEmailById(res.messageId);
    expect(byId).toEqual(caught);
  });

  it("should bound in-memory buffer to maxEmails", async () => {
    const stub = new StubEmailAdapter({ maxEmails: 3 });

    for (let i = 1; i <= 5; i++) {
      await stub.sendEmail({
        to: `user${i}@example.com`,
        subject: `Message ${i}`,
        text: `Content ${i}`,
      });
    }

    expect(stub.count()).toBe(3);
    const emails = stub.getSentEmails();
    // Oldest 2 evicted: messages 3, 4, 5 remain
    expect(emails[0]?.subject).toBe("Message 3");
    expect(emails[1]?.subject).toBe("Message 4");
    expect(emails[2]?.subject).toBe("Message 5");

    stub.clear();
    expect(stub.count()).toBe(0);
  });
});
