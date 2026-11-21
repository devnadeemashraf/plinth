import { describe, expect, it } from "vitest";
import { RedactionEngine } from "@/redaction/engine.js";
import {
  maskAadhaar,
  maskCreditCard,
  maskEmail,
  maskPan,
  maskPhone,
  maskToken,
} from "@/redaction/maskers.js";
import { redacted } from "@/redaction/redacted.js";

describe("redaction / RedactionEngine & maskers (5-category TDD)", () => {
  const engine = new RedactionEngine();

  // Category 1: Happy Path
  describe("Category 1: Happy Path", () => {
    it("should mask sensitive object properties by key name", () => {
      const input = {
        id: "usr_123",
        username: "alice",
        password: "SuperSecretPassword123!",
        apiKey: "pk_live_1234567890",
        nested: {
          clientSecret: "sk_live_987654321",
          sessionToken: "sess_abcdef",
          safeField: "keep-me",
        },
      };

      const redacted = engine.redact(input);

      expect(redacted.id).toBe("usr_123");
      expect(redacted.username).toBe("alice");
      expect(redacted.password).toBe("[REDACTED]");
      expect(redacted.apiKey).toBe("[REDACTED]");
      expect(redacted.nested.clientSecret).toBe("[REDACTED]");
      expect(redacted.nested.sessionToken).toBe("[REDACTED]");
      expect(redacted.nested.safeField).toBe("keep-me");
    });

    it("should mask sensitive headers with mixed casing", () => {
      const headers = {
        "content-type": "application/json",
        authorization: "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.xyz",
        "X-Api-Key": "secret-api-key-here",
        Cookie: "session=abc12345; remember_me=true",
        "Set-Cookie": "id=xyz; Secure; HttpOnly",
      };

      const redacted = engine.redact(headers);
      expect(redacted["content-type"]).toBe("application/json");
      expect(redacted.authorization).toBe("[REDACTED]");
      expect(redacted["X-Api-Key"]).toBe("[REDACTED]");
      expect(redacted.Cookie).toBe("[REDACTED]");
      expect(redacted["Set-Cookie"]).toBe("[REDACTED]");
    });

    it("should correctly mask PII formats using dedicated maskers", () => {
      expect(maskEmail("john.doe@example.com")).toBe("j***e@example.com");
      expect(maskEmail("alice@company.org")).toBe("a***e@company.org");

      expect(maskPhone("+91 9876543210")).toBe("+91 ***** 43210");
      expect(maskPhone("+1 (555) 123-4567")).toBe("+1 (***) ***-4567");

      expect(maskCreditCard("4111 2222 3333 4444")).toBe("**** **** **** 4444");
      expect(maskCreditCard("4111222233334444")).toBe("************4444");

      expect(maskPan("ABCDE1234F")).toBe("[REDACTED_PAN]");
      expect(maskAadhaar("1234 5678 9012")).toBe("[REDACTED_AADHAAR]");
      expect(maskAadhaar("123456789012")).toBe("[REDACTED_AADHAAR]");

      expect(maskToken("Bearer eyJhbGciOiJIUzI1NiJ9.abc.xyz")).toBe("Bearer [REDACTED_TOKEN]");
    });
  });

  // Category 2: Boundary & Input Fuzzing
  describe("Category 2: Boundary & Input Fuzzing", () => {
    it("should safely handle primitive types, null, and undefined without error", () => {
      expect(engine.redact(null)).toBe(null);
      expect(engine.redact(undefined)).toBe(undefined);
      expect(engine.redact(12345)).toBe(12345);
      expect(engine.redact("plain text")).toBe("plain text");
      expect(engine.redact(true)).toBe(true);
      expect(engine.redact([])).toEqual([]);
      expect(engine.redact({})).toEqual({});
      expect(engine.scrubText("")).toBe("");
    });

    it("should handle edge case strings in PII maskers gracefully", () => {
      expect(maskEmail("")).toBe("");
      expect(maskEmail("not-an-email")).toBe("[REDACTED_EMAIL]");
      expect(maskEmail("ab@example.com")).toBe("[REDACTED_EMAIL]");
      expect(maskPhone("")).toBe("");
      expect(maskPhone("123")).toBe("[REDACTED_PHONE]");
      expect(maskPhone("+44 20 7946 0958")).toBe("+** ** **** 0958");
      expect(maskCreditCard("1234")).toBe("1234");
      expect(maskCreditCard("1234-5678")).toBe("1234-5678");
      expect(maskPan("not-a-pan")).toBe("not-a-pan");
      expect(maskAadhaar("not-an-aadhaar")).toBe("not-an-aadhaar");
      expect(maskToken("raw-token-without-bearer")).toBe("[REDACTED_TOKEN]");
    });
  });

  // Category 3: Concurrency, Ordering & Idempotency
  describe("Category 3: Concurrency, Ordering & Idempotency", () => {
    it("should handle Error objects with cause and Redacted values in redact()", () => {
      const errWithCause = new Error("Outer failure", {
        cause: new Error("Root cause DB failure"),
      });
      const res = engine.redact({
        error: errWithCause,
        customSecret: redacted("wrapped-val"),
      }) as Record<string, unknown>;

      expect(res["customSecret"]).toBe("[REDACTED]");
      const errObj = res["error"] as Record<string, unknown>;
      expect(errObj["name"]).toBe("Error");
      expect(errObj["cause"]).toBeDefined();
    });

    it("should produce deterministic output and never mutate the original object", () => {
      const original = {
        password: "secret-password",
        list: [{ token: "tok-1" }, { token: "tok-2" }],
      };

      const copyBefore = JSON.stringify(original);
      const res1 = engine.redact(original);
      const res2 = engine.redact(original);

      expect(res1).toEqual(res2);
      expect(JSON.stringify(original)).toBe(copyBefore);
      expect(original.password).toBe("secret-password");
    });
  });

  // Category 4: Failure & Fault Injection
  describe("Category 4: Failure & Fault Injection", () => {
    it("should prevent infinite recursion on circular object graphs", () => {
      interface CyclicNode {
        name: string;
        secretKey?: string;
        next?: CyclicNode;
      }

      const nodeA: CyclicNode = { name: "Node A", secretKey: "secret-a" };
      const nodeB: CyclicNode = { name: "Node B", secretKey: "secret-b" };
      nodeA.next = nodeB;
      nodeB.next = nodeA; // Circular reference

      const result = engine.redact(nodeA);

      expect(result.name).toBe("Node A");
      expect(result.secretKey).toBe("[REDACTED]");
      expect(result.next?.name).toBe("Node B");
      expect(result.next?.secretKey).toBe("[REDACTED]");
      // The back-reference to nodeA must be safely replaced with "[Circular]"
      expect(result.next?.next).toBe("[Circular]");
    });

    it("should safely bound deep object trees beyond max depth", () => {
      let current: Record<string, unknown> = { level: 0 };
      const root = current;

      for (let i = 1; i <= 25; i++) {
        const next = { level: i, token: `tok-${i}` };
        current["child"] = next;
        current = next;
      }

      // Default engine max depth is 15
      const bounded = engine.redact(root, { maxDepth: 10 }) as Record<string, unknown>;
      expect(bounded["level"]).toBe(0);

      // Traversal terminates cleanly without CallStackOverflow
      let depth = 0;
      let walker: unknown = bounded;
      while (walker && typeof walker === "object" && "child" in walker) {
        depth++;
        walker = (walker as Record<string, unknown>)["child"];
      }
      expect(depth).toBeLessThanOrEqual(10);
    });
  });

  // Category 5: Security & Abuse Cases
  describe("Category 5: Security & Abuse Cases", () => {
    it("should mask extended sensitive keys like authtoken, id_token, jwt, and credential", () => {
      const payload = {
        authToken: "tok-123",
        id_token: "id-456",
        jwt: "eyJhbGciOi...",
        credential: "cred-xyz",
        safeId: "id-safe",
      };

      const redacted = engine.redact(payload) as Record<string, unknown>;
      expect(redacted["authToken"]).toBe("[REDACTED]");
      expect(redacted["id_token"]).toBe("[REDACTED]");
      expect(redacted["jwt"]).toBe("[REDACTED]");
      expect(redacted["credential"]).toBe("[REDACTED]");
      expect(redacted["safeId"]).toBe("id-safe");
    });

    it("should eliminate ReDoS in email scrubbing on 100,000 character hostile string", () => {
      const malicious = `a@${"a.".repeat(50000)}`;
      const start = performance.now();
      const result = engine.scrubText(malicious);
      const durationMs = performance.now() - start;

      expect(durationMs).toBeLessThan(100);
      expect(result).toBeDefined();
    });

    it("should scrub embedded PII patterns inside freeform text and error messages", () => {
      const freeText = `
        Error occurred for user john.doe@example.com!
        PAN card: ABCDE1234F provided for verification.
        Aadhaar: 1234 5678 9012 was queried.
        Card number: 4111 2222 3333 4444 charged.
        Auth token: Bearer eyJhbGciOiJIUzI1NiJ9.payload.sig leaked.
      `;

      const scrubbed = engine.scrubText(freeText);

      expect(scrubbed).not.toContain("john.doe@example.com");
      expect(scrubbed).toContain("j***e@example.com");

      expect(scrubbed).not.toContain("ABCDE1234F");
      expect(scrubbed).toContain("[REDACTED_PAN]");

      expect(scrubbed).not.toContain("1234 5678 9012");
      expect(scrubbed).toContain("[REDACTED_AADHAAR]");

      expect(scrubbed).not.toContain("4111 2222 3333 4444");
      expect(scrubbed).toContain("**** **** **** 4444");

      expect(scrubbed).not.toContain("eyJhbGciOiJIUzI1NiJ9.payload.sig");
      expect(scrubbed).toContain("Bearer [REDACTED_TOKEN]");
    });
  });
});
