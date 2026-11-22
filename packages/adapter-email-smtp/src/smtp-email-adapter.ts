import {
  type EmailAddress,
  type EmailPort,
  normalizeEmailAddress,
  type SendEmailInput,
  type SendEmailResult,
  validateEmailSubject,
} from "@plinth/core";
import nodemailer, { type Transporter } from "nodemailer";

export interface SmtpEmailAdapterOptions {
  /**
   * Existing nodemailer Transporter instance (e.g. for testing with stream / json transport).
   */
  readonly transporter?: Transporter | undefined;

  /**
   * SMTP server hostname.
   */
  readonly host?: string | undefined;

  /**
   * SMTP port (typically 587 for STARTTLS, 465 for SSL/TLS, 25 for local).
   * @default 587
   */
  readonly port?: number | undefined;

  /**
   * Whether to enforce SSL/TLS connection immediately.
   * @default false (for port 587)
   */
  readonly secure?: boolean | undefined;

  /**
   * SMTP authentication credentials.
   */
  readonly auth?:
    | {
        readonly user: string;
        readonly pass: string;
      }
    | undefined;

  /**
   * Default sender address if not specified per email.
   */
  readonly defaultFrom?: EmailAddress | undefined;

  /**
   * Connection timeout in milliseconds.
   * @default 10000
   */
  readonly timeoutMs?: number | undefined;
}

export class SmtpEmailAdapter implements EmailPort {
  private readonly transporter: Transporter;
  private readonly defaultFrom?: EmailAddress | undefined;

  constructor(options: SmtpEmailAdapterOptions = {}) {
    this.defaultFrom = options.defaultFrom;

    if (options.transporter) {
      this.transporter = options.transporter;
    } else {
      const port = options.port ?? 587;
      const secure = options.secure ?? port === 465;

      this.transporter = nodemailer.createTransport({
        host: options.host ?? "127.0.0.1",
        port,
        secure,
        auth: options.auth,
        connectionTimeout: options.timeoutMs ?? 10_000,
        greetingTimeout: options.timeoutMs ?? 10_000,
        socketTimeout: options.timeoutMs ?? 10_000,
      });
    }
  }

  public getTransporter(): Transporter {
    return this.transporter;
  }

  private formatAddress(address: EmailAddress): string {
    const normalized = normalizeEmailAddress(address);
    if (normalized.name) {
      return `"${normalized.name}" <${normalized.email}>`;
    }
    return normalized.email;
  }

  public async sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
    const validatedSubject = validateEmailSubject(input.subject);

    const fromAddress = input.from ?? this.defaultFrom;
    if (!fromAddress) {
      throw new Error("Missing email sender: neither 'from' nor 'defaultFrom' was provided");
    }

    const formattedFrom = this.formatAddress(fromAddress);

    const rawTo = Array.isArray(input.to) ? input.to : [input.to];
    const formattedTo = rawTo.map((addr) => this.formatAddress(addr));

    const formattedCc = input.cc
      ? (Array.isArray(input.cc) ? input.cc : [input.cc]).map((a) => this.formatAddress(a))
      : undefined;

    const formattedBcc = input.bcc
      ? (Array.isArray(input.bcc) ? input.bcc : [input.bcc]).map((a) => this.formatAddress(a))
      : undefined;

    const formattedReplyTo = input.replyTo ? this.formatAddress(input.replyTo) : undefined;

    const info = await this.transporter.sendMail({
      from: formattedFrom,
      to: formattedTo,
      cc: formattedCc,
      bcc: formattedBcc,
      replyTo: formattedReplyTo,
      subject: validatedSubject,
      text: input.text,
      html: input.html,
      headers: input.headers,
    });

    const accepted: string[] = Array.isArray(info.accepted)
      ? info.accepted.map(String)
      : rawTo.map((a) => normalizeEmailAddress(a).email);

    const rejected: string[] = Array.isArray(info.rejected) ? info.rejected.map(String) : [];

    return {
      messageId: info.messageId ?? `smtp-${Date.now()}`,
      accepted,
      rejected,
    };
  }

  public async verify(): Promise<boolean> {
    try {
      await this.transporter.verify();
      return true;
    } catch {
      return false;
    }
  }
}
