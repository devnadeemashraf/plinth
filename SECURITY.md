# Security Policy

The Plinth project prioritizes defense-in-depth, zero-trust multi-tenancy, and robust data protection across every layer of the architecture. This document outlines our vulnerability disclosure process, supported versions, and operational security expectations.

---

## Supported Versions

We provide security updates and patches for the current release series:

| Version | Supported | Status |
| :--- | :--- | :--- |
| **1.0.x** | :white_check_mark: Yes | Active LTS and maintenance release |
| **< 1.0.0** | :x: No | Pre-release and development builds |

---

## Reporting a Vulnerability

If you discover or suspect a security vulnerability in Plinth, please **do not open a public GitHub issue**. Instead, report it privately using one of the following methods:

1. **GitHub Private Vulnerability Reporting:**
   Open a confidential advisory draft through [GitHub Security Advisories](https://github.com/plinth-ts/plinth/security/advisories/new).
2. **Email Disclosure:**
   Send an encrypted or signed report directly to **`security@plinth.dev`**.

### What to Include in Your Report

To help us investigate and remediate quickly, please include:
- A descriptive summary of the potential issue.
- The specific package, module, or adapter affected (e.g., `@plinth/core`, `@plinth/modules-rbac`, `@plinth/adapter-http-fastify`).
- Step-by-step reproduction instructions or a minimal test script.
- Any observed exploitability, privilege escalation, or data boundary bypass.
- Recommended mitigation or remediation if known.

---

## Response Timeline & SLA

Our maintainer team adheres to the following response timeline:

- **Initial Acknowledgement:** Within **24 hours** of receiving your report.
- **Triage & Assessment:** Within **72 hours**, confirming validity and assigned severity (P0 Blocker, P1 High, P2 Medium).
- **Remediation & Patch:** Target release within **7 days** for verified P0/P1 security advisories.
- **Public Disclosure:** Coordinated release with CVE issuance and changelog publication once downstream users have had reasonable opportunity to update.

---

## In-Scope Architectural Security Controls

Plinth enforces several non-negotiable security invariants that are always in scope for security evaluations:

- **Dual-Layer PII Redaction:** Sensitive user data encapsulated in `Redacted<T>` and processed by `RedactionEngine` must never leak into log streams, JSON payloads, or error outputs.
- **BigInt Bitmask Authorization:** The Discord-style $O(1)$ RBAC engine must strictly enforce rank and subset anti-escalation rules, blocking privilege elevation.
- **Tenant Isolation:** Tenant-scoped operations must enforce compile-time branded `TenantContext` to prevent cross-tenant data access (IDOR).
- **SSRF BlockList Guard:** Private IPv4/IPv6 ranges, loopbacks, link-local addresses (`169.254.169.254`), and DNS rebinding vectors must be blocked unconditionally.
- **Cryptographic Kernel:** AES-256-GCM envelope encryption, Ed25519 asymmetric tokens, and Argon2id password hashing must strictly use cryptographically secure entropy and timing-safe comparisons.

---

## Out of Scope

The following items are generally excluded from vulnerability rewards or priority triage:
- Theoretical attacks requiring physical device access or pre-existing root shell access to the host machine.
- Social engineering attacks against maintainers or contributors.
- Denial-of-service vectors resulting from unauthenticated excessive volume when rate limiting has been explicitly disabled by the operator.
