# Adapter Swap Handbook: Local Email Catcher vs Production SMTP

This 1-page guide explains how to swap between `@plinth/adapter-email-stub` and `@plinth/adapter-email-smtp`.

---

## 1. Architectural Comparison

| Dimension | Dev Email Catcher (`adapter-email-stub`) | Production SMTP (`adapter-email-smtp`) |
|---|---|---|
| **Backing Engine** | Bounded in-memory circular buffer (FIFO) | `nodemailer` with STARTTLS / SSL |
| **Outbound Network** | Zero network traffic | Connects to SMTP server (SendGrid, Postmark, AWS SES, Resend) |
| **Admin Inspection** | Viewable directly inside `/_admin` panel | Real recipient mailbox delivery |
| **Security Guard** | CRLF & null-byte injection rejection | Full address validation & header injection sanitization |

---

## 2. Header Injection Defenses
Both adapters enforce strict RFC 5322 validation:
- Email addresses and subjects cannot contain `\r`, `\n`, or null bytes (`\0`).
- Attempted header injection throws `BadRequestError("INVALID_EMAIL_SUBJECT")`.

---

## 3. Swap Steps

### To Switch to Production SMTP:
```bash
pnpm add @plinth/adapter-email-smtp
```
In `src/server.ts`:
```typescript
import { SmtpEmailAdapter } from "@plinth/adapter-email-smtp";

const email = new SmtpEmailAdapter({
  host: process.env.SMTP_HOST!,
  port: Number(process.env.SMTP_PORT ?? 587),
  secure: process.env.SMTP_SECURE === "true",
  auth: {
    user: process.env.SMTP_USER!,
    pass: process.env.SMTP_PASS!,
  },
  defaultFrom: process.env.EMAIL_FROM ?? "noreply@example.com",
});

await email.verify(); // Verifies SMTP handshake on startup
```

### Verification:
```bash
pnpm test:email
```
Both adapters pass 100% of the shared `EmailPort` contract tests.
