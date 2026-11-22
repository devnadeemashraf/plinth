import {
  type EmailAddress,
  type EmailPort,
  generateUuidV7,
  normalizeEmailAddress,
  type SendEmailInput,
  type SendEmailResult,
  validateEmailSubject,
} from "@plinth/core";

export interface CaughtEmail {
  readonly id: string;
  readonly from?: EmailAddress | undefined;
  readonly to: readonly EmailAddress[];
  readonly cc?: readonly EmailAddress[] | undefined;
  readonly bcc?: readonly EmailAddress[] | undefined;
  readonly replyTo?: EmailAddress | undefined;
  readonly subject: string;
  readonly text?: string | undefined;
  readonly html?: string | undefined;
  readonly headers?: Record<string, string> | undefined;
  readonly sentAt: Date;
}

export interface StubEmailAdapterOptions {
  /**
   * Maximum emails preserved in the in-memory catcher buffer.
   * @default 1000
   */
  readonly maxEmails?: number | undefined;
}

export class StubEmailAdapter implements EmailPort {
  private readonly emails: CaughtEmail[] = [];
  private readonly maxEmails: number;

  constructor(options: StubEmailAdapterOptions = {}) {
    this.maxEmails = options.maxEmails ?? 1000;
  }

  public async sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
    const validatedSubject = validateEmailSubject(input.subject);

    // Normalize and validate all recipient addresses
    const rawTo = Array.isArray(input.to) ? input.to : [input.to];
    const acceptedAddresses: string[] = [];

    for (const addr of rawTo) {
      const normalized = normalizeEmailAddress(addr);
      acceptedAddresses.push(normalized.email);
    }

    if (input.from) {
      normalizeEmailAddress(input.from);
    }

    if (input.cc) {
      const rawCc = Array.isArray(input.cc) ? input.cc : [input.cc];
      for (const addr of rawCc) {
        normalizeEmailAddress(addr);
      }
    }

    if (input.bcc) {
      const rawBcc = Array.isArray(input.bcc) ? input.bcc : [input.bcc];
      for (const addr of rawBcc) {
        normalizeEmailAddress(addr);
      }
    }

    if (input.replyTo) {
      normalizeEmailAddress(input.replyTo);
    }

    const messageId = `stub-${generateUuidV7()}`;
    const caught: CaughtEmail = {
      id: messageId,
      from: input.from,
      to: rawTo,
      cc: input.cc ? (Array.isArray(input.cc) ? input.cc : [input.cc]) : undefined,
      bcc: input.bcc ? (Array.isArray(input.bcc) ? input.bcc : [input.bcc]) : undefined,
      replyTo: input.replyTo,
      subject: validatedSubject,
      text: input.text,
      html: input.html,
      headers: input.headers,
      sentAt: new Date(),
    };

    // Buffer bounding: evict oldest if maxEmails reached
    if (this.emails.length >= this.maxEmails) {
      this.emails.shift();
    }
    this.emails.push(caught);

    return {
      messageId,
      accepted: acceptedAddresses,
      rejected: [],
    };
  }

  public getSentEmails(): readonly CaughtEmail[] {
    return [...this.emails];
  }

  public getLatestEmail(): CaughtEmail | undefined {
    return this.emails[this.emails.length - 1];
  }

  public getEmailById(id: string): CaughtEmail | undefined {
    return this.emails.find((e) => e.id === id);
  }

  public clear(): void {
    this.emails.length = 0;
  }

  public count(): number {
    return this.emails.length;
  }
}
