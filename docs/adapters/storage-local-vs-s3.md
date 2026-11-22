# Adapter Swap Handbook: Local Storage vs Amazon S3 / Cloudflare R2

This 1-page guide explains how to swap between `@plinth/adapter-storage-local` and `@plinth/adapter-storage-s3`.

---

## 1. Architectural Comparison

| Dimension | Local Storage (`adapter-storage-local`) | S3 / Cloudflare R2 (`adapter-storage-s3`) |
|---|---|---|
| **Backing Engine** | Node `node:fs/promises` filesystem | `@aws-sdk/client-s3` (AWS SDK v3) |
| **Path Traversal Protection** | Strict base-directory containment (`startsWith`) | Managed cloud object hierarchy |
| **Signed URLs** | HMAC-SHA256 URL token emulation | AWS SigV4 offline signed URLs (`s3-request-presigner`) |
| **Cost** | Free (uses local disk) | Pay-per-GB + egress (or zero-egress R2) |

---

## 2. Hardened Avatar Invariants (Applies to Both Adapters)
Regardless of the active storage adapter, all avatar uploads pass through `packages/core/src/security/avatar-guard.ts`:
1. Magic-byte inspection: PNG (`89 50 4E 47`), JPEG (`FF D8 FF`), WebP (`RIFF...WEBP`).
2. Hard rejection of SVG, HTML, XML, scripts, and executable binaries.
3. Lossless EXIF / GPS / camera metadata stripping.
4. Maximum 5 MB payload bound and 4096 x 4096 pixel dimension cap.

---

## 3. Swap Steps

### To Switch to S3 / Cloudflare R2:
```bash
pnpm add @plinth/adapter-storage-s3
```
In `src/server.ts`:
```typescript
import { S3StorageAdapter } from "@plinth/adapter-storage-s3";

const storage = new S3StorageAdapter({
  bucket: process.env.S3_BUCKET!,
  region: process.env.S3_REGION ?? "us-east-1",
  endpoint: process.env.S3_ENDPOINT, // Optional custom endpoint for Cloudflare R2 / MinIO
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
});
```

### Verification:
```bash
pnpm test:storage
```
Both adapters pass 100% of the shared `StoragePort` contract tests.
